import {
  json,
  readJson,
  checkOrigin,
  getClientIp,
  rateLimit,
  cleanText,
  validUsername,
  validPassword,
  randomHex,
  hashPassword,
  sha256Hex,
  audit,
  createSession,
  verifyTurnstile,
  generateRecoveryCode,
  normalizeRecoveryCode
} from '../../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const ip = getClientIp(request);

  if (!(await rateLimit(env, `register:${ip}`, 5, 3600))) {
    return json({ error: 'Слишком много попыток регистрации. Попробуй позже.' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Некорректный JSON' }, 400);
  }

  if (!(await verifyTurnstile(env, request, body.turnstileToken))) {
    return json({ error: 'Проверка не пройдена. Обнови страницу и попробуй снова.' }, 400);
  }

  const username = cleanText(body.username, 32, false);
  const password = typeof body.password === 'string' ? body.password : '';
  const acceptTerms = body.acceptTerms === true;

  if (!validUsername(username)) {
    return json({
      error: 'Ник: 3-32 символа, только латиница, цифры, точка, подчёркивание и дефис.'
    }, 400);
  }

  if (!validPassword(password)) {
    return json({
      error: 'Пароль должен быть 12-128 символов и содержать буквы и цифры.'
    }, 400);
  }

  if (!acceptTerms) {
    return json({ error: 'Нужно принять правила и юридическое соглашение.' }, 400);
  }

  try {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .bind(username)
      .first();

    if (existing) {
      return json({ error: 'Ник уже занят' }, 409);
    }

    const userCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
    const isAdmin = userCount?.c === 0 ? 1 : 0;

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);

    const recoveryCode = generateRecoveryCode();
    const recoveryHash = await sha256Hex(normalizeRecoveryCode(recoveryCode));

    const now = Date.now();

    const inserted = await env.DB.prepare(
      `
        INSERT INTO users (
          username,
          password_hash,
          salt,
          is_admin,
          banned,
          created_at,
          accepted_terms_at,
          bio,
          recovery_hash
        ) VALUES (?, ?, ?, ?, 0, ?, ?, '', ?)
        RETURNING id
      `
    )
      .bind(username, passwordHash, salt, isAdmin, now, now, recoveryHash)
      .first();

    if (!inserted) {
      return json({ error: 'Не удалось создать пользователя' }, 500);
    }

    await audit(env, {
      userId: inserted.id,
      action: 'register',
      request,
      details: username
    });

    const cookie = await createSession(env, inserted.id, ip);

    return json(
      {
        id: inserted.id,
        username,
        isAdmin: Boolean(isAdmin),
        recoveryCode
      },
      201,
      { 'Set-Cookie': cookie }
    );
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
