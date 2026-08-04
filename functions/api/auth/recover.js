import {
  json,
  readJson,
  checkOrigin,
  getClientIp,
  rateLimit,
  cleanText,
  validPassword,
  randomHex,
  hashPassword,
  sha256Hex,
  normalizeRecoveryCode,
  generateRecoveryCode,
  audit
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

  const ip = getClientIp(request);

  if (!(await rateLimit(env, `recover:${ip}`, 5, 3600))) {
    return json({ error: 'Too many attempts. Try later.' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const username = cleanText(body.username, 32, false) || '';
  const code = normalizeRecoveryCode(body.recoveryCode || '');
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!username || !code || !validPassword(newPassword)) {
    return json({
      error: 'Check the fields: username, recovery code and new password (12+ chars, letters and digits).'
    }, 400);
  }

  try {
    const user = await env.DB.prepare(
      'SELECT id, recovery_hash FROM users WHERE username = ? COLLATE NOCASE'
    )
      .bind(username)
      .first();

    if (!user || !user.recovery_hash) {
      return json({ error: 'Invalid recovery data' }, 401);
    }

    const codeHash = await sha256Hex(code);

    if (!safeEqual(codeHash, user.recovery_hash)) {
      await audit(env, {
        userId: user.id,
        action: 'recover_failed',
        request
      });

      return json({ error: 'Invalid recovery data' }, 401);
    }

    const salt = randomHex(16);
    const passwordHash = await hashPassword(newPassword, salt);

    const newCode = generateRecoveryCode();
    const newCodeHash = await sha256Hex(normalizeRecoveryCode(newCode));

    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, salt = ?, recovery_hash = ? WHERE id = ?'
    )
      .bind(passwordHash, salt, newCodeHash, user.id)
      .run();

    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
      .bind(user.id)
      .run();

    await audit(env, {
      userId: user.id,
      action: 'recover_success',
      request
    });

    return json({ ok: true, recoveryCode: newCode });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
