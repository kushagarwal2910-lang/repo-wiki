import { buildResearchWorkspace } from '@/lib/tavily';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { topic?: unknown };
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (topic.length < 3 || topic.length > 300) return Response.json({ error: 'Enter a clear topic between 3 and 300 characters.' }, { status: 400 });
    return Response.json(await buildResearchWorkspace(topic));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Research failed.' }, { status: 500 });
  }
}
