import type { GeneratedMesh } from './visual-schema';

const SPACE_URL = 'https://zhengyi-llama-mesh.hf.space';
const MAX_OBJ_BYTES = 180_000;

function sanitizeObj(raw: string): Omit<GeneratedMesh, 'generator'> | null {
  const unfenced = raw.replace(/```(?:obj)?/gi, '').replace(/```/g, '');
  const vertices: string[] = [];
  const pendingFaces: string[][] = [];

  for (const sourceLine of unfenced.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (line.startsWith('v ')) {
      const values = line.split(/\s+/).slice(1).map(Number);
      if (values.length < 3 || values.slice(0, 3).some((value) => !Number.isFinite(value) || Math.abs(value) > 10_000)) return null;
      vertices.push(`v ${values.slice(0, 3).join(' ')}`);
    } else if (line.startsWith('f ')) {
      pendingFaces.push(line.split(/\s+/).slice(1));
    }
  }

  if (vertices.length < 8 || vertices.length > 4_000 || pendingFaces.length < 6 || pendingFaces.length > 8_000) return null;
  const faces: string[] = [];
  for (const tokens of pendingFaces) {
    if (tokens.length < 3 || tokens.length > 8) return null;
    const indices = tokens.map((token) => Number(token.split('/')[0]));
    if (indices.some((index) => !Number.isInteger(index) || index < 1 || index > vertices.length)) return null;
    faces.push(`f ${indices.join(' ')}`);
  }
  const obj = `${vertices.join('\n')}\n${faces.join('\n')}\n`;
  if (obj.length > MAX_OBJ_BYTES) return null;
  return { obj, vertexCount: vertices.length, faceCount: faces.length };
}

function readCompletedValue(stream: string) {
  const lines = stream.split(/\r?\n/);
  let event = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:') && event === 'complete') {
      try {
        const value = JSON.parse(line.slice(5).trim());
        return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
      } catch { return ''; }
    }
    if (event === 'error') return '';
  }
  return '';
}

export async function generateLlamaMesh(description: string): Promise<GeneratedMesh | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 52_000);
  try {
    const prompt = `Generate only a compact, coherent Wavefront OBJ mesh for: ${description.slice(0, 900)}. Use a recognizable low-poly shape centered at the origin. Include the important visible structural form, but no invented measurements. Output only v and f lines. Keep it below 3500 vertices and finish all faces.`;
    const queued = await fetch(`${SPACE_URL}/gradio_api/call/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [prompt, 0.2, 2048] }),
      signal: controller.signal,
    });
    if (!queued.ok) return null;
    const { event_id: eventId } = await queued.json() as { event_id?: string };
    if (!eventId || !/^[\w-]+$/.test(eventId)) return null;
    const result = await fetch(`${SPACE_URL}/gradio_api/call/chat/${eventId}`, { signal: controller.signal });
    if (!result.ok) return null;
    const output = readCompletedValue(await result.text());
    const mesh = sanitizeObj(output);
    return mesh ? { ...mesh, generator: 'llama-mesh-public' } : null;
  } catch (error) {
    console.warn('LLaMA-Mesh unavailable; using diagram fallback.', error instanceof Error ? error.message : 'unknown error');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
