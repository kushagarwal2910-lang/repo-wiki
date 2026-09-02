import { safeRemoteImageUrl, verifyVisualSignature } from '@/lib/visual-proxy';

export async function GET(request: Request) {
  try {
    const input = new URL(request.url);
    const rawUrl = input.searchParams.get('url') || '';
    const supplied = input.searchParams.get('sig') || '';
    if (!rawUrl || !supplied || !(await verifyVisualSignature(rawUrl, supplied))) return new Response('Forbidden', { status: 403 });
    let current = safeRemoteImageUrl(rawUrl);
    if (!current) return new Response('Invalid visual URL', { status: 400 });

    let response: Response | null = null;
    for (let redirect = 0; redirect < 4; redirect++) {
      response = await fetch(current, { redirect: 'manual', headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*', 'User-Agent': 'Anima Visual Reference/1.0' } });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location) break;
      current = safeRemoteImageUrl(new URL(location, current).toString());
      if (!current) return new Response('Unsafe visual redirect', { status: 400 });
    }
    if (!response?.ok) return new Response('Visual unavailable', { status: 502 });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) return new Response('Not an image', { status: 415 });
    const body = await response.arrayBuffer();
    if (body.byteLength > 12 * 1024 * 1024) return new Response('Visual too large', { status: 413 });
    return new Response(body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400, s-maxage=604800', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('Visual unavailable', { status: 502 });
  }
}
