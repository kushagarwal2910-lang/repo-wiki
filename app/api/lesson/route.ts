import { generateVisualLesson } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { workspaceId?: unknown; question?: unknown };
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (workspaceId.length < 20) return Response.json({ error: 'A valid knowledge workspace is required.' }, { status: 400 });
    if (question.length < 2 || question.length > 500) return Response.json({ error: 'Enter a clear question.' }, { status: 400 });
    return Response.json(await generateVisualLesson(workspaceId, question));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Animation generation failed.' }, { status: 500 });
  }
}
