export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['tavily-web-research', 'd1-persistent-rag', 'multimodal-scene-compiler', 'threejs-physical-runtime', 'diagram-fallback-runtime'],
  });
}
