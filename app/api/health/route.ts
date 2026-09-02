export async function GET() {
  return Response.json({
    status: 'ok',
    product: 'anima',
    contracts: ['google-search-grounding', 'gemini-file-search-rag', 'visual-scene-compiler', 'browser-animation-runtime'],
  });
}
