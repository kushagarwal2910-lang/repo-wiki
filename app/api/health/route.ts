export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['tavily-web-research', 'd1-persistent-rag', 'gpt-oss-scene-compiler', 'browser-animation-runtime'],
  });
}
