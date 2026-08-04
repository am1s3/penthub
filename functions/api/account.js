import {
  json, readJson, checkOrigin, getSessionUser, rateLimit, cleanText,
  validUsername, validPassword, hashPassword, sha256Hex, getCookie,
  COOKIE_NAME, clearCookie, audit
} from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function handleGet(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'Login required' }, 401);

  try {
    const currentHash = await sha256Hex(getCookie(request, COOKIE_NAME) || '');

    const [sessions, prefs] = await Promise.all([
      env.DB.prepare(
        'SELECT token_hash, ip, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
      ).bind(user.id).all(),
      env.DB.prepare(
        'SELECT pm_policy, profile_hidden, notify_reply, notify_mention, notify_reaction, username FROM users WHERE id = ?'
      ).bind(user.id).first()
    ]);

    return json({
      sessions: (sessions.results || []).map((s) => ({
        token_hash: s.token_hash,
        ip: s.ip || 'unknown',
        created_at: s.created_at,
        expires_at: s.expires_at,
        current: s.token_hash === currentHash
      })),
      prefs: {
        username: prefs?.username || user.username,
        pm_policy: prefs?.pm_policy || 'all',
        profile_hidden: Boolean(prefs?.profile_hidden),
        notify_reply: prefs?.notify_reply !== 0,
        notify_mention: prefs?.notify_mention !== 0,
        notify_reaction: prefs?.notify_reaction !== 0
      }
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `account:user:${user.id}`, 30, 3600))) {
    return json({ error: 'Too many account changes' }, 429);
  }

  let body;
  try { body = await readJson(request); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const action = body.action;

  try {
    if (action === 'prefs') {
      const pmPolicy = ['all', 'staff', 'none'].includes(body.pm_policy) ? body.pm_policy : 'all';

      await env.DB.prepare(
        `UPDATE users SET
          pm_policy = ?,
          profile_hidden = ?,
          notify_reply = ?,
          notify_mention = ?,
          notify_reaction = ?
        WHERE id = ?`
      ).bind(
        pmPolicy,
        body.profile_hidden ? 1 : 0,
        body.notify_reply ? 1 : 0,
        body.notify_mention ? 1 : 0,
        body.notify_reaction ? 1 : 0,
        user.id
      ).run();

      await audit(env, { userId: user.id, action: 'update_prefs', request });
      return json({ ok: true });
    }

    if (action === 'username') {
      const username = cleanText(body.username, 32, false);

      if (!validUsername(username)) return json({ error: 'Username: 3-32 chars, latin/digits/._-' }, 400);

      const taken = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?')
        .bind(username, user.id).first();

      if (taken) return json({ error: 'Username is already taken' }, 409);

      await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, user.id).run();
      await audit(env, { userId: user.id, action: 'change_username', request, details: username });

      return json({ ok: true, username });
    }

    if (action === 'revoke') {
      const hash = String(body.token_hash || '');
      const currentHash = await sha256Hex(getCookie(request, COOKIE_NAME) || '');

      if (hash && hash !== currentHash) {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ? AND user_id = ?')
          .bind(hash, user.id).run();
        await audit(env, { userId: user.id, action: 'revoke_session', request });
      }

      return json({ ok: true });
    }

    if (action === 'revoke_others') {
      const currentHash = await sha256Hex(getCookie(request, COOKIE_NAME) || '');

      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
        .bind(user.id, currentHash).run();

      await audit(env, { userId: user.id, action: 'revoke_other_sessions', request });
      return json({ ok: true });
    }

    if (action === 'delete') {
      const password = typeof body.password === 'string' ? body.password : '';
      const row = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(user.id).first();

      if (!row) return json({ error: 'Account not found' }, 404);

      const candidate = await hashPassword(password, row.salt);
      if (candidate !== row.password_hash) return json({ error: 'Wrong password' }, 401);

      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
      await audit(env, { userId: user.id, action: 'delete_account', request });

      return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(COOKIE_NAME) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
