import { retrieveWorkspace } from './database';
import type { VisualEdge, VisualLesson, VisualNode, VisualScene } from './visual-schema';

const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured for this deployment.');
  return key;
}

async function groqRequest(body: Record<string, unknown>) {
  const response = await fetch(GROQ_CHAT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey()}`,
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

export async function generateVisualLesson(workspaceId: string, question: string): Promise<VisualLesson> {
  const { workspace, chunks } = await retrieveWorkspace(workspaceId, question);
  const evidenceSentences = extractEvidenceSentences(chunks.map((chunk) => chunk.content));
  const evidence = chunks.slice(0, 6).map((chunk, index) => `[E${index + 1}] ${chunk.content.slice(0, 700)}`).join('\n\n');
  const prompt = `You are Anima's visual lesson compiler. Use only the retrieved evidence to answer the learner by producing an executable visual program.\n\nTOPIC: ${workspace.topic}\nQUESTION: ${question}\n\nRETRIEVED EVIDENCE:\n${evidence}\n\nReturn one JSON object with this shape:\n{"title":"...","subtitle":"...","strategy":"flow|timeline|network|cycle|comparison|layers","sourceSummary":"...","scenes":[{"id":"scene-1","title":"...","narration":"...","durationSeconds":10,"camera":{"x":50,"y":50,"zoom":1.2},"nodes":[{"id":"node-1","label":"...","detail":"...","x":20,"y":50,"shape":"circle|rounded|pill","color":"lime|mint|blue|amber|coral|violet"}],"edges":[{"from":"node-1","to":"node-2","label":"...","animated":true}],"focusNodeIds":["node-1"]}]}\n\nPrefer 3 concise progressive scenes with 2 to 6 nodes each. Every edge endpoint must match a node ID in its scene. Reuse stable IDs for persistent entities. Coordinates are percentages. Camera movement must focus on the narrated subject. Animated edges must represent a real flow, causal influence, transfer, motion, or sequence. Keep narration under 65 words and synchronized with what is visible. Preserve uncertainty and never invent measurements. Output JSON only.`;

  try {
    const data = await groqRequest({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'Return a grounded, accurate JSON visual program. Never include markdown fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 2800,
      response_format: { type: 'json_object' },
    });
    const content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content || '';
    return normalizeVisualLesson(parseModelJson(content), workspace.topic, question, evidenceSentences);
  } catch {
    return buildGroundedFallback(workspace.topic, question, evidenceSentences);
  }
}

type JsonRecord = Record<string, unknown>;

const strategies = ['flow', 'timeline', 'network', 'cycle', 'comparison', 'layers'] as const;
const shapes = ['circle', 'rounded', 'pill'] as const;
const colors = ['lime', 'mint', 'blue', 'amber', 'coral', 'violet'] as const;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 700) : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && options.includes(value) ? value as T[number] : fallback;
}

function cleanSentence(value: string) {
  return value.replace(/https?:\/\/\S+/g, '').replace(/[#*_`>|\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractEvidenceSentences(contents: string[]) {
  const seen = new Set<string>();
  const sentences: string[] = [];
  for (const content of contents) {
    for (const raw of content.split(/(?<=[.!?])\s+|\n+/)) {
      const sentence = cleanSentence(raw);
      if (sentence.length < 35 || sentence.length > 320) continue;
      const key = sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sentences.push(sentence);
      if (sentences.length === 24) return sentences;
    }
  }
  return sentences;
}

function shortLabel(value: string, fallback: string) {
  const cleaned = cleanSentence(value).replace(/^Source:\s*/i, '');
  if (!cleaned) return fallback;
  return cleaned.split(/\s+/).slice(0, 6).join(' ').replace(/[,:;.!?]+$/, '').slice(0, 54);
}

function parseModelJson(content: string): unknown {
  if (!content.trim()) return {};
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    const first = content.indexOf('{');
    const last = content.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(content.slice(first, last + 1)); } catch { return {}; }
    }
    return {};
  }
}

function groundedSentence(sentences: string[], index: number, fallback: string) {
  return sentences.length ? sentences[index % sentences.length] : fallback;
}

function fallbackNodes(sceneIndex: number, sentences: string[]): VisualNode[] {
  return [0, 1, 2].map((offset) => {
    const detail = groundedSentence(sentences, sceneIndex * 3 + offset, 'This point follows from the retrieved material for the learner’s question.');
    return {
      id: `scene-${sceneIndex + 1}-node-${offset + 1}`,
      label: shortLabel(detail, `Evidence point ${offset + 1}`),
      detail,
      x: [18, 50, 82][offset],
      y: [42, 58, 42][offset],
      shape: shapes[offset % shapes.length],
      color: colors[(sceneIndex * 2 + offset) % colors.length],
    };
  });
}

function normalizeScene(value: unknown, sceneIndex: number, sentences: string[]): VisualScene {
  const raw = record(value);
  const sceneId = stringValue(raw.id, `scene-${sceneIndex + 1}`);
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes.slice(0, 10) : [];
  const usedIds = new Set<string>();
  const nodes = rawNodes.map((entry, nodeIndex): VisualNode => {
    const node = record(entry);
    let id = stringValue(node.id, `${sceneId}-node-${nodeIndex + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
    if (usedIds.has(id)) id = `${id}-${nodeIndex + 1}`;
    usedIds.add(id);
    const detail = stringValue(node.detail, groundedSentence(sentences, sceneIndex * 3 + nodeIndex, 'Grounded evidence point.'));
    return {
      id,
      label: stringValue(node.label, shortLabel(detail, `Point ${nodeIndex + 1}`)).slice(0, 80),
      detail,
      x: numberValue(node.x, 18 + nodeIndex * 26, 8, 92),
      y: numberValue(node.y, nodeIndex % 2 ? 62 : 38, 10, 90),
      shape: oneOf(node.shape, shapes, 'rounded'),
      color: oneOf(node.color, colors, colors[(sceneIndex + nodeIndex) % colors.length]),
    };
  });
  const completeNodes = nodes.length >= 2 ? nodes : fallbackNodes(sceneIndex, sentences);
  const validIds = new Set(completeNodes.map((node) => node.id));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const edges = rawEdges.flatMap((entry): VisualEdge[] => {
    const edge = record(entry);
    const from = stringValue(edge.from, '');
    const to = stringValue(edge.to, '');
    if (!validIds.has(from) || !validIds.has(to) || from === to) return [];
    return [{ from, to, label: stringValue(edge.label, 'leads to').slice(0, 80), animated: edge.animated !== false }];
  }).slice(0, 18);
  const completeEdges = edges.length ? edges : completeNodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: completeNodes[index + 1].id,
    label: 'leads to',
    animated: true,
  }));
  const fallbackNarration = [0, 1].map((offset) => groundedSentence(sentences, sceneIndex * 2 + offset, '')).filter(Boolean).join(' ');
  const narration = stringValue(raw.narration, fallbackNarration || `This scene explains ${shortLabel(groundedSentence(sentences, sceneIndex, 'the retrieved evidence'), 'the key mechanism')}.`);
  const camera = record(raw.camera);
  const firstNode = completeNodes[0];
  const requestedFocus = Array.isArray(raw.focusNodeIds) ? raw.focusNodeIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)) : [];
  return {
    id: sceneId,
    title: stringValue(raw.title, shortLabel(narration, `Scene ${sceneIndex + 1}`)).slice(0, 100),
    narration,
    durationSeconds: Math.round(numberValue(raw.durationSeconds, 10, 5, 20)),
    camera: {
      x: numberValue(camera.x, firstNode.x, 0, 100),
      y: numberValue(camera.y, firstNode.y, 0, 100),
      zoom: numberValue(camera.zoom, 1.1, 0.8, 2.2),
    },
    nodes: completeNodes,
    edges: completeEdges,
    focusNodeIds: requestedFocus.length ? requestedFocus : [firstNode.id],
  };
}

function buildGroundedFallback(topic: string, question: string, sentences: string[]): VisualLesson {
  const grounded = sentences.length ? sentences : [`The available workspace is about ${topic}.`, `The learner asked: ${question}.`];
  return {
    title: shortLabel(question, topic),
    subtitle: `A grounded visual explanation of ${topic}`,
    strategy: 'flow',
    sourceSummary: 'This fallback animation is assembled directly from retrieved evidence while the AI compiler is unavailable.',
    scenes: [0, 1, 2].map((index) => normalizeScene({}, index, grounded)),
  };
}

function normalizeVisualLesson(value: unknown, topic: string, question: string, sentences: string[]): VisualLesson {
  const raw = record(value);
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes.slice(0, 3) : [];
  if (!rawScenes.length) return buildGroundedFallback(topic, question, sentences);
  return {
    title: stringValue(raw.title, shortLabel(question, topic)).slice(0, 120),
    subtitle: stringValue(raw.subtitle, `A visual explanation of ${topic}`).slice(0, 180),
    strategy: oneOf(raw.strategy, strategies, 'flow'),
    sourceSummary: stringValue(raw.sourceSummary, 'The lesson is grounded in the retrieved workspace evidence.'),
    scenes: rawScenes.map((scene, index) => normalizeScene(scene, index, sentences)),
  };
}
