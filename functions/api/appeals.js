import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  audit
} from '../_utils.js';

const PER_PAGE = 25;

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return listAppeals(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function listAppeals(request, env) {
  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  const url = new URL(request.url);
  const mine = url.searchParams.get('mine') === '1';

  if (mine) {
    const result = await env.DB.prepare(
      'SELECT id, reason, status, created_at, resolved_at FROM appeals WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
    )
      .bind(user.id)
      .all();

    return json({ appeals: result.results || [] });
  }

  if (!user.isAdmin) return json({ error: 'Admin only' }, 403);

  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  const result = await env.DB.prepare(
    `SELECT a.id, a.user_id, a.reason, a.status, a.created_at, a.resolved_at, u.username
     FROM appeals a
     JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(PER_PAGE, offset)
    .all();

  return json({ appeals: result.results || [], page, perPage: PER_PAGE, hasMore: (result.results || []).length === PER_PAGE });
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = body.action;

  try {
    if (action === 'submit') {
      const target = await env.DB.prepare('SELECT id, banned FROM users WHERE id = ?').bind(user.id).first();

      if (!target || !target.banned) {
        return json({ error: 'You are not banned' }, 400);
      }

      const pending = await env.DB.prepare("SELECT id FROM appeals WHERE user_id = ? AND status = 'pending' LIMIT 1")
        .bind(user.id)
        .first();

      if (pending) return json({ error: 'An appeal is already pending' }, 409);

      if (!(await rateLimit(env, `appeal:user:${user.id}`, 3, 86400))) {
        return json({ error: 'Too many appeals' }, 429);
      }

      const reason = cleanText(body.reason, 2000, true);

      if (!reason) return json({ error: 'Reason is required' }, 400);

      await env.DB.prepare(
        'INSERT INTO appeals (user_id, reason, status, created_at) VALUES (?, ?, ?, ?)'
      )
        .bind(user.id, reason, 'pending', Date.now())
        .run();

      await audit(env, { userId: user.id, action: 'appeal_submit', request });

      return json({ ok: true });
    }

    if (action === 'approve' || action === 'reject') {
      if (!user.isAdmin) return json({ error: 'Admin only' }, 403);

      const id = Number.parseInt(body.id, 10);

      if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, 400);

      const appeal = await env.DB.prepare('SELECT id, user_id, status FROM appeals WHERE id = ?').bind(id).first();

      if (!appeal || appeal.status !== 'pending') return json({ error: 'Appeal not found or resolved' }, 404);

      if (action === 'approve') {
        await env.DB.prepare(
          'UPDATE users SET banned = 0, ban_reason = \'\', banned_by = NULL, banned_at = NULL WHERE id = ?'
        )
          .bind(appeal.user_id)
          .run();

        await env.DB.prepare(
          "UPDATE appeals SET status = 'approved', resolved_by = ?, resolved_at = ? WHERE id = ?"
        )
          .bind(user.id, Date.now(), id)
          .run();
      } else {
        await env.DB.prepare(
          "UPDATE appeals SET status = 'rejected', resolved_by = ?, resolved_at = ? WHERE id = ?"
        )
          .bind(user.id, Date.now(), id)
          .run();
      }

      await audit(env, { userId: user.id, action: `appeal_${action}`, request, details: String(id) });

      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
