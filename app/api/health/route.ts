export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['groq-compound-research', 'd1-persistent-rag', 'gpt-oss-scene-compiler', 'browser-animation-runtime'],
  });
}
