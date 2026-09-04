import { processGitHubRepo } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { topic?: unknown, documents?: unknown };
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const documents = Array.isArray(body.documents) ? body.documents : [];

    if (topic.length < 5 || !topic.includes('github.com')) {
      return Response.json({ error: 'Enter a valid GitHub repository URL.' }, { status: 400 });
    }

    // Convert documents to expected format
    const parsedDocs = documents.map((doc: any) => ({
      name: String(doc.name || 'document'),
      content: String(doc.content || '')
    })).filter(doc => doc.content.length > 0);

    return Response.json(await processGitHubRepo(topic, parsedDocs));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Research failed.' }, { status: 500 });
  }
}
