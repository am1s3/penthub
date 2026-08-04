import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  validPassword,
  randomHex,
  hashPassword,
  sha256Hex,
  normalizeRecoveryCode,
  generateRecoveryCode,
  audit
} from '../_utils.js';

const AVATAR_MAX_BYTES = 262144;
const BANNER_MAX_BYTES = 524288;

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;

  const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);

  if (!m) return null;

  try {
    const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
    return { mime: m[1], bytes, b64: m[3] };
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return getSettings(request, env);
  if (request.method === 'POST') return updateSettings(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function getSettings(request, env) {
  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  try {
    const row = await env.DB.prepare(
      `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.bio,
          u.avatar,
          u.banner,
          u.created_at,
          u.is_admin,
          u.is_moderator,
          u.banned,
          u.ban_reason,
          u.banned_at
        FROM users u
        WHERE u.id = ?
        LIMIT 1
      `
    )
      .bind(user.id)
      .first();

    const badges = await env.DB.prepare(
      `SELECT b.id, b.name, b.label, b.color, b.icon
       FROM badges b JOIN user_badges ub ON ub.badge_id = b.id
       WHERE ub.user_id = ?`
    )
      .bind(user.id)
      .all();

    return json({
      profile: {
        ...row,
        is_admin: Boolean(row.is_admin),
        is_moderator: Boolean(row.is_moderator),
        banned: Boolean(row.banned),
        badges: badges.results || []
      }
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function updateSettings(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `settings:user:${user.id}`, 20, 3600))) {
    return json({ error: 'Too many changes per hour' }, 429);
  }

  let body;

  try {
    body = await readJson(request, 2 * 1024 * 1024);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const field = body.field;

  try {
    if (field === 'profile') {
      const display_name = cleanText(body.display_name, 40, false) || '';
      const bio = cleanText(body.bio, 500, true) || '';

      await env.DB.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?')
        .bind(display_name, bio, user.id)
        .run();

      await audit(env, { userId: user.id, action: 'update_profile', request });

      return json({ ok: true });
    }

    if (field === 'avatar') {
      if (!body.avatar) {
        await env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind('', user.id).run();
        await audit(env, { userId: user.id, action: 'avatar_clear', request });
        return json({ ok: true });
      }

      const decoded = decodeDataUrl(body.avatar);

      if (!decoded || decoded.bytes.length > AVATAR_MAX_BYTES) {
        return json({ error: 'Avatar must be PNG/JPEG/WebP/GIF up to 256KB' }, 400);
      }

      await env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?')
        .bind(`data:${decoded.mime};base64,${decoded.b64}`, user.id)
        .run();

      await audit(env, { userId: user.id, action: 'avatar_update', request });

      return json({ ok: true });
    }

    if (field === 'banner') {
      if (!body.banner) {
        await env.DB.prepare('UPDATE users SET banner = ? WHERE id = ?').bind('', user.id).run();
        await audit(env, { userId: user.id, action: 'banner_clear', request });
        return json({ ok: true });
      }

      const decoded = decodeDataUrl(body.banner);

      if (!decoded || decoded.bytes.length > BANNER_MAX_BYTES) {
        return json({ error: 'Banner must be PNG/JPEG/WebP up to 512KB' }, 400);
      }

      await env.DB.prepare('UPDATE users SET banner = ? WHERE id = ?')
        .bind(`data:${decoded.mime};base64,${decoded.b64}`, user.id)
        .run();

      await audit(env, { userId: user.id, action: 'banner_update', request });

      return json({ ok: true });
    }

    if (field === 'password') {
      const current = typeof body.current_password === 'string' ? body.current_password : '';
      const next = typeof body.new_password === 'string' ? body.new_password : '';

      if (!validPassword(next)) {
        return json({ error: 'New password must be 12-128 characters with letters and digits' }, 400);
      }

      const row = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(user.id).first();
      const candidate = await hashPassword(current, row.salt);

      if (candidate !== row.password_hash) {
        return json({ error: 'Current password is wrong' }, 401);
      }

      const salt = randomHex(16);
      const hash = await hashPassword(next, salt);

      await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
        .bind(hash, salt, user.id)
        .run();

      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
        .bind(user.id, await sha256Hex('placeholder-invalid-' + Date.now()))
        .run()
        .catch(() => {});

      await audit(env, { userId: user.id, action: 'password_change', request });

      return json({ ok: true });
    }

    if (field === 'recovery') {
      const code = normalizeRecoveryCode(body.recoveryCode || '');

      if (!code) {
        return json({ error: 'Current recovery code is required' }, 400);
      }

      const row = await env.DB.prepare('SELECT recovery_hash FROM users WHERE id = ?').bind(user.id).first();

      if (!row || !row.recovery_hash) {
        return json({ error: 'Recovery is not set up' }, 400);
      }

      const hash = await sha256Hex(code);

      if (hash !== row.recovery_hash) {
        return json({ error: 'Recovery code is invalid' }, 401);
      }

      const newCode = generateRecoveryCode();
      const newHash = await sha256Hex(normalizeRecoveryCode(newCode));

      await env.DB.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?')
        .bind(newHash, user.id)
        .run();

      await audit(env, { userId: user.id, action: 'recovery_rotate', request });

      return json({ ok: true, recoveryCode: newCode });
    }

    return json({ error: 'Unknown field' }, 400);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
