import { env } from 'cloudflare:workers';

type AnimaBindings = { DB: D1Database };

export function database() {
  const db = (env as unknown as AnimaBindings).DB;
  if (!db) throw new Error('The Repo-Wiki knowledge database is not available.');
  return db;
}

export type StoredChunk = { id: string; content: string; source_id: string | null };

export async function saveWorkspace(input: {
  id: string;
  topic: string;
  brief: string;
  sources: Array<{ id: string; title: string; url: string; content: string }>;
  chunks: Array<{ id: string; sourceId: string | null; content: string }>;
}) {
  const db = database();
  const now = new Date().toISOString();
  const statements = [
    db.prepare('INSERT INTO workspaces (id, topic, brief, created_at) VALUES (?, ?, ?, ?)').bind(input.id, input.topic, input.brief, now),
    ...input.sources.map((source) => db.prepare('INSERT INTO sources (id, workspace_id, title, url, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(source.id, input.id, source.title, source.url, source.content, now)),
    ...input.chunks.map((chunk) => db.prepare('INSERT INTO chunks (id, workspace_id, source_id, content, created_at) VALUES (?, ?, ?, ?, ?)').bind(chunk.id, input.id, chunk.sourceId, chunk.content, now)),
  ];
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
}

function searchTerms(question: string) {
  const stop = new Set(['about', 'after', 'again', 'also', 'because', 'before', 'being', 'between', 'calculate', 'could', 'does', 'from', 'have', 'into', 'more', 'most', 'radius', 'that', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'while', 'with', 'would']);
  return [...new Set(question.toLowerCase().match(/[a-z_$][a-z0-9_$.-]{2,}/g) || [])].filter((term) => !stop.has(term));
}

function metadataValue(content: string, key: string) {
  return content.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'))?.[1]?.trim() || '';
}

function occurrenceScore(text: string, term: string, weight: number) {
  let count = 0;
  let cursor = 0;
  while (count < 6) {
    const index = text.indexOf(term, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + term.length;
  }
  return count * weight;
}

export async function retrieveWorkspace(workspaceId: string, question: string, isBlastRadius = false, target = '') {
  const db = database();
  const workspace = await db.prepare('SELECT id, topic, brief FROM workspaces WHERE id = ?').bind(workspaceId).first<{ id: string; topic: string; brief: string }>();
  if (!workspace) throw new Error('This knowledge workspace no longer exists.');
  const result = await db.prepare('SELECT id, source_id, content FROM chunks WHERE workspace_id = ? LIMIT 800').bind(workspaceId).all<StoredChunk>();
  let fileTree: string[] = [];
  let architectureMap = '';
  const validChunks: StoredChunk[] = [];
  for (const chunk of result.results) {
    if (chunk.content.startsWith('__FILE_TREE__')) {
      try {
        const parsed = JSON.parse(chunk.content.slice('__FILE_TREE__\n'.length));
        if (Array.isArray(parsed)) fileTree = parsed.filter((path): path is string => typeof path === 'string');
      } catch {
        console.warn('Could not parse the stored repository file tree.');
      }
    } else if (chunk.content.startsWith('__ARCHITECTURE_MAP__')) {
      architectureMap = chunk.content.slice('__ARCHITECTURE_MAP__\n'.length);
    } else validChunks.push(chunk);
  }

  const terms = searchTerms(question);
  const targetTerms = searchTerms(target);
  const ranked = validChunks.map((chunk, order) => {
    const lower = chunk.content.toLowerCase();
    const path = metadataValue(chunk.content, 'Path').toLowerCase();
    const symbols = metadataValue(chunk.content, 'Symbols').toLowerCase();
    const imports = metadataValue(chunk.content, 'Imports').toLowerCase();
    let score = Math.max(0, 5 - order / 100);
    for (const term of terms) {
      score += occurrenceScore(path, term, 18) + occurrenceScore(symbols, term, 14) + occurrenceScore(imports, term, 10) + occurrenceScore(lower, term, 2);
    }
    if (isBlastRadius) {
      for (const term of targetTerms) {
        score += occurrenceScore(path, term, 55) + occurrenceScore(symbols, term, 45) + occurrenceScore(imports, term, 38) + occurrenceScore(lower, term, 5);
      }
    }
    return { ...chunk, score, path };
  }).sort((left, right) => right.score - left.score);

  const selected: typeof ranked = [];
  const perPath = new Map<string, number>();
  const limit = isBlastRadius ? 16 : 12;
  for (const chunk of ranked) {
    const key = chunk.path || chunk.source_id || chunk.id;
    if ((perPath.get(key) || 0) >= 2) continue;
    selected.push(chunk);
    perPath.set(key, (perPath.get(key) || 0) + 1);
    if (selected.length >= limit) break;
  }
  return { workspace, chunks: selected, fileTree, architectureMap };
}
