export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['github-repository-indexing', 'groq-grounded-lesson-director', 'd1-workspace-persistence', 'react-flow-diagram-runtime'],
  });
}
