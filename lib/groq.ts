import { retrieveWorkspace, saveWorkspace } from './database';
import type { ResearchSource, ResearchWorkspace, VisualLesson } from './visual-schema';
import { visualLessonSchema } from './visual-schema';

const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured for this deployment.');
  return key;
}

async function groqRequest(body: Record<string, unknown>, latestCompound = false) {
  const response = await fetch(GROQ_CHAT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey()}`,
      ...(latestCompound ? { 'Groq-Model-Version': 'latest' } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || `Groq request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

type DiscoveredSource = ResearchSource & { content: string };

function extractSources(message: Record<string, unknown>, report: string) {
  const found = new Map<string, DiscoveredSource>();
  function walk(value: unknown) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    const url = typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : typeof item.uri === 'string' ? item.uri : '';
    if (/^https?:\/\//.test(url)) {
      const title = typeof item.title === 'string' ? item.title : typeof item.name === 'string' ? item.name : new URL(url).hostname;
      const content = [item.content, item.snippet, item.description, item.text].filter((entry): entry is string => typeof entry === 'string').join('\n').slice(0, 5000);
      found.set(url, { title, url, content });
    }
    Object.values(item).forEach(walk);
  }
  walk(message.executed_tools);
  for (const match of report.matchAll(/\[([^\]]{2,160})\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (!found.has(match[2])) found.set(match[2], { title: match[1], url: match[2], content: '' });
  }
  return [...found.values()];
}

async function researchPass(topic: string, angle: string) {
  const data = await groqRequest({
    model: 'groq/compound',
    messages: [{
      role: 'user',
      content: `Build one evidence pass for an educational knowledge base about: ${topic}\n\nResearch angle: ${angle}\n\nUse several web searches and visit the strongest pages. Prefer primary, official, university, museum, academic, technical, standards, government, and high-quality reference sources. Avoid SEO copies. Return a dense research brief with inline citations. Preserve uncertainty, disagreement, dates, mechanisms, terminology, evidence, examples, and visualizable relationships. Aim to cite 8–10 distinct sources not redundant with other likely research angles. Do not create a lesson yet.`,
    }],
    compound_custom: { tools: { enabled_tools: ['web_search', 'visit_website'] } },
    max_completion_tokens: 3200,
  }, true);
  const choice = (data.choices as Array<{ message?: Record<string, unknown> }> | undefined)?.[0];
  const message = choice?.message || {};
  const report = typeof message.content === 'string' ? message.content : '';
  if (!report) throw new Error('Groq returned an empty research pass.');
  return { report, sources: extractSources(message, report) };
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
  const angles = [
    'definitions, foundations, mechanisms, components, and authoritative overview',
    'primary evidence, current research, quantitative facts, debates, limitations, and competing interpretations',
    'history, applications, examples, relationships, processes, misconceptions, and the best structures to visualize',
  ];
  const passes = await Promise.all(angles.map((angle) => researchPass(topic, angle)));
  const sourceMap = new Map<string, DiscoveredSource>();
  for (const source of passes.flatMap((pass) => pass.sources)) {
    const existing = sourceMap.get(source.url);
    sourceMap.set(source.url, { ...source, content: source.content || existing?.content || '' });
  }
  const selected = [...sourceMap.values()].slice(0, 25);
  if (selected.length < 5) throw new Error('Groq found too few independently cited sources. Please make the topic more specific and retry.');
  const workspaceId = crypto.randomUUID();
  const brief = passes.map((pass, index) => `RESEARCH PASS ${index + 1}\n${pass.report}`).join('\n\n---\n\n');
  const storedSources = selected.map((source) => ({ ...source, id: crypto.randomUUID() }));
  const chunks = [
    ...passes.flatMap((pass) => splitIntoChunks(pass.report).map((content) => ({ id: crypto.randomUUID(), sourceId: null, content }))),
    ...storedSources.flatMap((source) => splitIntoChunks(`${source.title}\n${source.content || source.url}`).map((content) => ({ id: crypto.randomUUID(), sourceId: source.id, content }))),
  ];
  await saveWorkspace({ id: workspaceId, topic, brief, sources: storedSources, chunks });
  return {
    topic,
    workspaceId,
    brief,
    sources: selected.map(({ title, url }) => ({ title, url })),
    createdAt: new Date().toISOString(),
  };
}

export async function generateVisualLesson(workspaceId: string, question: string): Promise<VisualLesson> {
  const { workspace, chunks } = await retrieveWorkspace(workspaceId, question);
  const evidence = chunks.map((chunk, index) => `[E${index + 1}] ${chunk.content.slice(0, 1200)}`).join('\n\n');
  const prompt = `You are Anima's visual lesson compiler. Answer the learner using only the retrieved evidence below, then compile the explanation into an executable visual program.\n\nTOPIC: ${workspace.topic}\nQUESTION: ${question}\n\nRETRIEVED EVIDENCE:\n${evidence}\n\nChoose the best strategy: flow, timeline, network, cycle, comparison, or layers. Create 3 to 6 progressive scenes. Coordinates are percentages. Keep stable node IDs for persistent entities. Each scene must visibly develop the explanation. Camera movement must focus on the narrated subject. Animated edges must represent a real flow, causal influence, transfer, motion, or sequence—not decoration. Narration must exactly match the visible scene and mention uncertainty when evidence is uncertain. Do not invent measurements. Return only the requested JSON schema.`;
  const data = await groqRequest({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'system', content: 'You convert retrieved evidence into accurate, teachable, code-executable visual scenes.' }, { role: 'user', content: prompt }],
    temperature: 0.25,
    max_completion_tokens: 5200,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'anima_visual_lesson', strict: true, schema: visualLessonSchema },
    },
  });
  const content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no animation program.');
  return JSON.parse(content) as VisualLesson;
}
