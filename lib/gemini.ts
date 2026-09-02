import type { ResearchSource, ResearchWorkspace, VisualLesson } from './visual-schema';
import { visualLessonSchema } from './visual-schema';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const UPLOAD_ROOT = 'https://generativelanguage.googleapis.com/upload/v1beta';
const MODEL = 'gemini-3.7-flash';

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured for this deployment.');
  return key;
}

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { error?: { message?: string } }).error?.message || `Gemini request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as Record<string, unknown>;
}

type GroundedResult = { text: string; sources: ResearchSource[] };

async function groundedResearch(topic: string, angle: string): Promise<GroundedResult> {
  const key = apiKey();
  const body = await jsonRequest(`${API_ROOT}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Research the topic below for a rigorous educational knowledge base.\n\nTOPIC: ${topic}\nRESEARCH ANGLE: ${angle}\n\nUse Google Search extensively. Prefer primary, official, academic, technical, museum, university, or otherwise authoritative sources. Produce a dense factual research brief, preserve disagreements and uncertainty, and cover terminology, mechanisms, history, relationships, examples, and common misconceptions where relevant. Do not write a lesson or animation yet.` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 5000 },
    }),
  });

  const candidates = body.candidates as Array<Record<string, unknown>> | undefined;
  const candidate = candidates?.[0];
  const content = candidate?.content as { parts?: Array<{ text?: string }> } | undefined;
  const text = content?.parts?.map((part) => part.text || '').join('\n') || '';
  const metadata = candidate?.groundingMetadata as { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } | undefined;
  const sources = (metadata?.groundingChunks || [])
    .map((chunk) => ({ title: chunk.web?.title || 'Web source', url: chunk.web?.uri || '' }))
    .filter((source) => source.url);
  return { text, sources };
}

async function createStore(topic: string) {
  const key = apiKey();
  const safeName = topic.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 48) || 'Anima workspace';
  const body = await jsonRequest(`${API_ROOT}/fileSearchStores?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: `${safeName} · Anima`, embeddingModel: 'models/gemini-embedding-2' }),
  });
  if (typeof body.name !== 'string') throw new Error('Gemini did not return a File Search store.');
  return body.name;
}

async function uploadCorpus(storeName: string, topic: string, corpus: string) {
  const key = apiKey();
  const bytes = new TextEncoder().encode(corpus);
  const start = await fetch(`${UPLOAD_ROOT}/${storeName}:uploadToFileSearchStore?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': 'text/plain', 'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName: `${topic.slice(0, 70)} research corpus`,
      chunkingConfig: { whiteSpaceConfig: { maxTokensPerChunk: 350, maxOverlapTokens: 45 } },
    }),
  });
  if (!start.ok) throw new Error(`Could not initialize the RAG workspace (${start.status}).`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini did not provide an upload URL.');
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.byteLength), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  });
  const operation = await upload.json() as { name?: string; done?: boolean; error?: { message?: string } };
  if (!upload.ok || operation.error) throw new Error(operation.error?.message || 'Knowledge-base indexing failed.');
  if (!operation.name || operation.done) return;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const status = await jsonRequest(`${API_ROOT}/${operation.name}?key=${encodeURIComponent(key)}`, { method: 'GET' });
    if (status.error) throw new Error('Knowledge-base indexing failed.');
    if (status.done === true) return;
  }
  throw new Error('The knowledge base is still indexing. Please try again shortly.');
}

export async function buildResearchWorkspace(topic: string): Promise<ResearchWorkspace> {
  const angles = [
    'foundations, definitions, mechanisms, and authoritative overviews',
    'primary sources, evidence, data, current research, and competing interpretations',
    'applications, examples, chronology, relationships, misconceptions, and visualizable structures',
  ];
  const reports = await Promise.all(angles.map((angle) => groundedResearch(topic, angle)));
  const sourceMap = new Map<string, ResearchSource>();
  for (const source of reports.flatMap((report) => report.sources)) sourceMap.set(source.url, source);
  const sources = [...sourceMap.values()].slice(0, 25);
  const brief = reports.map((report, index) => `RESEARCH PASS ${index + 1}\n${report.text}`).join('\n\n---\n\n');
  const corpus = `ANIMA KNOWLEDGE WORKSPACE\nTOPIC: ${topic}\nCREATED: ${new Date().toISOString()}\n\n${brief}\n\nSOURCE CATALOG\n${sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join('\n\n')}`;
  const storeName = await createStore(topic);
  await uploadCorpus(storeName, topic, corpus);
  return { topic, storeName, brief, sources, createdAt: new Date().toISOString() };
}

function interactionText(body: Record<string, unknown>) {
  if (typeof body.output_text === 'string') return body.output_text;
  if (typeof body.outputText === 'string') return body.outputText;
  const steps = body.steps as Array<{ content?: Array<{ text?: string }> }> | undefined;
  return steps?.flatMap((step) => step.content || []).map((item) => item.text || '').join('') || '';
}

export async function generateVisualLesson(storeName: string, topic: string, question: string): Promise<VisualLesson> {
  const key = apiKey();
  const prompt = `You are Anima's visual lesson director. Answer the learner's question using only evidence retrieved from the attached File Search knowledge base. Then compile the answer into a genuine animated visual program.\n\nWORKSPACE TOPIC: ${topic}\nLEARNER QUESTION: ${question}\n\nChoose the best visual strategy from flow, timeline, network, cycle, comparison, or layers. Create 3–7 progressive scenes. Reuse stable node ids across scenes when the same entity remains. Coordinates are percentages. Camera x/y target the important region and zoom must create meaningful focus changes. Animated edges should represent actual flow, influence, movement, or sequence—not decoration. Narration must precisely describe what appears. Never invent unsupported measurements. Clearly express uncertainty in narration when the evidence is uncertain.`;
  const body = await jsonRequest(`${API_ROOT}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      tools: [{ type: 'file_search', file_search_store_names: [storeName] }],
      response_format: { type: 'text', mime_type: 'application/json', schema: visualLessonSchema },
    }),
  });
  const text = interactionText(body);
  if (!text) throw new Error('Gemini returned no animation program.');
  return JSON.parse(text) as VisualLesson;
}
