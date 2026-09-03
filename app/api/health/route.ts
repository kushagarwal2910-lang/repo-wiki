export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['tavily-web-research', 'signed-hidden-visual-reference', 'groq-vision-codegen', 'd1-persistent-rag', 'computer-vision-trace-runtime', 'safe-vector-animation-runtime', 'diagram-fallback-runtime'],
  });
}
