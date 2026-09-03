function signingSecret() {
  const secret = process.env.GROQ_API_KEY;
  if (!secret) throw new Error('Visual signing secret is unavailable.');
  return secret;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function signature(value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(signingSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function createVisualProxyUrl(url: string) {
  return `/api/visual?url=${encodeURIComponent(url)}&sig=${await signature(url)}`;
}

export async function verifyVisualSignature(url: string, supplied: string) {
  const expected = await signature(url);
  if (supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return mismatch === 0;
}

export function safeRemoteImageUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || host === 'localhost' || host.endsWith('.local')) return null;
    if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return null;
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return null;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return null;
    return url;
  } catch { return null; }
}
