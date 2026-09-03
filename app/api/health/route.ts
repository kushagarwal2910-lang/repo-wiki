export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['tavily-web-research', 'hidden-visual-reference', 'groq-vision-codegen', 'd1-persistent-rag', 'safe-vector-animation-runtime', 'diagram-fallback-runtime'],
  });
}
