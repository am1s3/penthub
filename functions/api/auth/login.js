import {
  json,
  readJson,
  checkOrigin,
  getClientIp,
  rateLimit,
  cleanText,
  hashPassword,
  randomHex,
  audit,
  createSession,
  verifyTurnstile
} from '../../_utils.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const username = cleanText(body.username, 32, false) || '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = getClientIp(request);

  if (!(await rateLimit(env, `login:${ip}:${username.toLowerCase()}`, 10, 3600))) {
    return json({ error: 'Too many login attempts. Try later.' }, 429);
  }

  if (!(await verifyTurnstile(env, request, body.turnstileToken))) {
    return json({ error: 'Verification failed. Refresh the page and try again.' }, 400);
  }

  try {
    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, salt, banned FROM users WHERE username = ? COLLATE NOCASE'
    )
      .bind(username)
      .first();

    if (!user) {
      await hashPassword(password || 'invalid-password', randomHex(16));

      return json({ error: 'Invalid username or password' }, 401);
    }

    const candidateHash = await hashPassword(password, user.salt);

    if (!safeEqual(candidateHash, user.password_hash)) {
      await audit(env, {
        userId: user.id,
        action: 'login_failed',
        request,
        details: user.username
      });

      return json({ error: 'Invalid username or password' }, 401);
    }

    if (user.banned) {
      return json({ error: 'Account is banned' }, 403);
    }

    await audit(env, {
      userId: user.id,
      action: 'login_success',
      request,
      details: user.username
    });

    const cookie = await createSession(env, user.id, ip);

    return json(
      {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin)
      },
      200,
      { 'Set-Cookie': cookie }
    );
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
