import { retrieveWorkspace } from './database';
import type { VisualLesson } from './visual-schema';
import { visualLessonSchema } from './visual-schema';

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
  const evidence = chunks.slice(0, 6).map((chunk, index) => `[E${index + 1}] ${chunk.content.slice(0, 700)}`).join('\n\n');
  const prompt = `You are Anima's visual lesson compiler. Answer the learner using only the retrieved evidence below, then compile the explanation into an executable visual program.\n\nTOPIC: ${workspace.topic}\nQUESTION: ${question}\n\nRETRIEVED EVIDENCE:\n${evidence}\n\nChoose the best strategy: flow, timeline, network, cycle, comparison, or layers. Prefer exactly 3 concise progressive scenes, each with 2 to 6 nodes. If the retrieved evidence only supports 1 or 2 complete scenes, return those valid scenes instead of inventing or padding content. Coordinates are percentages. Reuse stable node IDs for persistent entities. Each scene must visibly develop the explanation. Camera movement must focus on the narrated subject. Animated edges must represent a real flow, causal influence, transfer, motion, or sequence—not decoration. Keep each narration under 65 words, make it exactly match the visible scene, and mention uncertainty when evidence is uncertain. Do not invent measurements. Return only the requested JSON schema.`;
  const data = await groqRequest({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'system', content: 'You convert retrieved evidence into accurate, teachable, code-executable visual scenes.' }, { role: 'user', content: prompt }],
    temperature: 0.25,
    max_completion_tokens: 2800,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'anima_visual_lesson', strict: true, schema: visualLessonSchema },
    },
  });
  const content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no animation program.');
  return JSON.parse(content) as VisualLesson;
}
