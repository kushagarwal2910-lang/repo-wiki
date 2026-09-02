import { generateVisualLesson } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { storeName?: unknown; topic?: unknown; question?: unknown };
    const storeName = typeof body.storeName === 'string' ? body.storeName : '';
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!storeName.startsWith('fileSearchStores/')) return Response.json({ error: 'A valid knowledge workspace is required.' }, { status: 400 });
    if (!topic || question.length < 2 || question.length > 500) return Response.json({ error: 'Enter a clear question.' }, { status: 400 });
    return Response.json(await generateVisualLesson(storeName, topic, question));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Animation generation failed.' }, { status: 500 });
  }
}
