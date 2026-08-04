import { json, readJson, checkOrigin, getSessionUser, rateLimit, randomHex } from '../_utils.js';

const MAX_BYTES = 1500000;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `upload:${user.id}`, 30, 3600))) {
    return json({ error: 'Too many uploads per hour' }, 429);
  }

  if (!env.FILES) {
    return json({ error: 'File storage not configured: add R2 binding named FILES and redeploy' }, 500);
  }

  let body;
  try {
    body = await readJson(request, 2500000);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
  if (!m) return json({ error: 'Only PNG/JPEG/WebP/GIF images are allowed' }, 400);

  let bin;
  try {
    bin = atob(m[3]);
  } catch {
    return json({ error: 'Bad image data' }, 400);
  }

  if (bin.length > MAX_BYTES) {
    return json({ error: 'Image too big (max 1.5MB)' }, 400);
  }

  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);

  const key = `${Date.now()}-${randomHex(6)}`;

  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: m[1] } });
  } catch (e) {
    return json({ error: 'Storage write failed' }, 500);
  }

  return json({ url: `/api/files/${key}` }, 201);
}
