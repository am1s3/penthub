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
  createSession
} from '../../_utils.js';

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
    return json({ error: 'Некорректный JSON' }, 400);
  }

  const username = cleanText(body.username, 32, false) || '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = getClientIp(request);

  if (!(await rateLimit(env, `login:${ip}:${username.toLowerCase()}`, 10, 3600))) {
    return json({ error: 'Слишком много попыток входа. Попробуй позже.' }, 429);
  }

  try {
    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, salt, banned FROM users WHERE username = ? COLLATE NOCASE'
    )
      .bind(username)
      .first();

    if (!user) {
      // Немного ровняем тайминг, чтобы не показывать существование аккаунта.
      await hashPassword(password || 'invalid-password', randomHex(16));

      return json({ error: 'Неверный логин или пароль' }, 401);
    }

    const candidateHash = await hashPassword(password, user.salt);

    if (candidateHash !== user.password_hash) {
      await audit(env, {
        userId: user.id,
        action: 'login_failed',
        request,
        details: user.username
      });

      return json({ error: 'Неверный логин или пароль' }, 401);
    }

    if (user.banned) {
      return json({ error: 'Аккаунт заблокирован' }, 403);
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
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
