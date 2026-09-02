export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['knowledge-rag', 'visual-strategy', 'coding-rag', 'semantic-timeline'],
  });
}
