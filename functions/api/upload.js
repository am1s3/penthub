import { json, checkOrigin, getSessionUser, rateLimit, randomHex } from '../_utils.js';

const MAX_BYTES = 2000000;

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

  const text = await request.text();

  if (!text) {
    return json({ error: 'Empty body' }, 400);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: `Invalid JSON (len=${text.length})` }, 400);
  }

  const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
  if (!m) return json({ error: 'Only PNG/JPEG/WebP/GIF images are allowed' }, 400);

  const b64 = m[3];

  let size;
  try {
    size = atob(b64).length;
  } catch {
    return json({ error: 'Bad image data' }, 400);
  }

  if (size > MAX_BYTES) {
    return json({ error: 'Image too big after resize (max 2MB)' }, 400);
  }

  const key = `${Date.now()}-${randomHex(6)}`;

  try {
    await env.DB.prepare('INSERT INTO files (key, mime, data, created_at) VALUES (?, ?, ?, ?)')
      .bind(key, m[1], b64, Date.now())
      .run();
  } catch {
    return json({ error: 'Storage write failed' }, 500);
  }

  return json({ url: `/api/files/${key}` }, 201);
}
