export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['tavily-web-research', 'tavily-visual-retrieval', 'groq-vision-grounding', 'd1-persistent-rag', 'reference-animation-runtime', 'threejs-physical-runtime', 'diagram-fallback-runtime'],
  });
}
