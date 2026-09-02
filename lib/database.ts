import { env } from 'cloudflare:workers';

type AnimaBindings = { DB: D1Database };

export function database() {
  const db = (env as unknown as AnimaBindings).DB;
  if (!db) throw new Error('The Anima knowledge database is not available.');
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
  await db.batch(statements);
}

function searchTerms(question: string) {
  const stop = new Set(['about', 'after', 'again', 'also', 'because', 'before', 'being', 'between', 'could', 'does', 'from', 'have', 'into', 'more', 'most', 'that', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'while', 'with', 'would']);
  return [...new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((term) => !stop.has(term));
}

export async function retrieveWorkspace(workspaceId: string, question: string) {
  const db = database();
  const workspace = await db.prepare('SELECT id, topic, brief FROM workspaces WHERE id = ?').bind(workspaceId).first<{ id: string; topic: string; brief: string }>();
  if (!workspace) throw new Error('This knowledge workspace no longer exists.');
  const result = await db.prepare('SELECT id, source_id, content FROM chunks WHERE workspace_id = ? LIMIT 180').bind(workspaceId).all<StoredChunk>();
  const terms = searchTerms(question);
  const ranked = result.results.map((chunk) => {
    const lower = chunk.content.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 2 : 0) + (lower.startsWith(term) ? 1 : 0), 0);
    return { ...chunk, score };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  return { workspace, chunks: ranked };
}
