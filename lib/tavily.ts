import { saveWorkspace } from './database';
import type { ResearchSource, ResearchWorkspace } from './visual-schema';

const TAVILY_SEARCH = 'https://api.tavily.com/search';
const TAVILY_EXTRACT = 'https://api.tavily.com/extract';

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
};

type DiscoveredSource = ResearchSource & { content: string; score: number };

function tavilyKey() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY is not configured for this deployment.');
  return key;
}

async function tavilyRequest(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey()}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : typeof data.error === 'string' ? data.error : `Tavily request failed (${response.status}).`;
    throw new Error(detail);
  }
  return data;
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|campaign$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function authorityBoost(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (/\.(gov|mil)(\.|$)/.test(host)) return 0.35;
    if (/\.(edu|ac)(\.|$)/.test(host)) return 0.28;
    if (/\.org$/.test(host)) return 0.1;
    return 0;
  } catch {
    return 0;
  }
}

async function search(query: string, depth: 'basic' | 'advanced' = 'advanced') {
  const data = await tavilyRequest(TAVILY_SEARCH, {
    query,
    search_depth: depth,
    max_results: 20,
    include_answer: false,
    include_images: false,
    include_raw_content: false,
  });
  return Array.isArray(data.results) ? data.results as TavilyResult[] : [];
}

function rankAndDiversify(results: TavilyResult[]) {
  const deduped = new Map<string, DiscoveredSource>();
  for (const result of results) {
    if (!result.url || !/^https?:\/\//.test(result.url)) continue;
    const url = canonicalUrl(result.url);
    const candidate: DiscoveredSource = {
      title: result.title?.trim() || new URL(url).hostname,
      url,
      content: (result.raw_content || result.content || '').trim(),
      score: (result.score || 0) + authorityBoost(url) + (/\.pdf(?:$|\?)/i.test(url) ? 0.08 : 0),
    };
    const previous = deduped.get(url);
    if (!previous || candidate.score > previous.score) deduped.set(url, candidate);
  }
  const ranked = [...deduped.values()].sort((a, b) => b.score - a.score);
  const selected: DiscoveredSource[] = [];
  const domainCount = new Map<string, number>();
  for (const source of ranked) {
    const host = new URL(source.url).hostname.replace(/^www\./, '');
    if ((domainCount.get(host) || 0) >= 2) continue;
    selected.push(source);
    domainCount.set(host, (domainCount.get(host) || 0) + 1);
    if (selected.length === 25) break;
  }
  return selected;
}

async function extractSources(sources: DiscoveredSource[], topic: string) {
  const extracted = new Map<string, string>();
  for (let index = 0; index < sources.length; index += 20) {
    const batch = sources.slice(index, index + 20);
    const data = await tavilyRequest(TAVILY_EXTRACT, {
      urls: batch.map((source) => source.url),
      extract_depth: 'basic',
      format: 'markdown',
      query: topic,
      chunks_per_source: 5,
      include_images: false,
    });
    const results = Array.isArray(data.results) ? data.results as TavilyResult[] : [];
    for (const result of results) {
      if (result.url) extracted.set(canonicalUrl(result.url), (result.raw_content || result.content || '').trim());
    }
  }
  return sources.map((source) => ({ ...source, content: (extracted.get(source.url) || source.content).slice(0, 24000) }));
}

function splitIntoChunks(text: string, size = 1800) {
  const cleaned = text.replace(/\r/g, '').trim();
  if (!cleaned) return [];
  const chunks: string[] = [];
  for (let cursor = 0; cursor < cleaned.length; cursor += size - 220) {
    chunks.push(cleaned.slice(cursor, cursor + size));
    if (cursor + size >= cleaned.length) break;
  }
  return chunks;
}

export async function buildResearchWorkspace(topic: string): Promise<ResearchWorkspace> {
  const queries = [
    `${topic} authoritative overview mechanisms primary sources`,
    `${topic} research evidence history applications limitations debates`,
  ];
  const initial = (await Promise.all(queries.map((query) => search(query)))).flat();
  let selected = rankAndDiversify(initial);
  if (selected.length < 20) selected = rankAndDiversify([...initial, ...await search(topic, 'basic')]);
  if (selected.length < 5) throw new Error('Tavily found too few reliable sources. Please make the topic more specific and retry.');

  const enriched = await extractSources(selected, topic);
  const workspaceId = crypto.randomUUID();
  const storedSources = enriched.map((source) => ({ id: crypto.randomUUID(), title: source.title, url: source.url, content: source.content }));
  const brief = storedSources.map((source, index) => `${index + 1}. ${source.title}\n${source.url}\n${source.content.slice(0, 600)}`).join('\n\n');
  const chunks = storedSources.flatMap((source) => splitIntoChunks(`${source.title}\nSource: ${source.url}\n${source.content || source.url}`).map((content) => ({
    id: crypto.randomUUID(),
    sourceId: source.id,
    content,
  })));
  await saveWorkspace({ id: workspaceId, topic, brief, sources: storedSources, chunks });
  return {
    topic,
    workspaceId,
    brief,
    sources: storedSources.map(({ title, url }) => ({ title, url })),
    createdAt: new Date().toISOString(),
  };
}
