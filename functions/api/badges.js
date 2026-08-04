import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  audit,
  isStaff
} from '../_utils.js';

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#f778ba', '#79c0ff', '#7ee787'];

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function handleGet(request, env) {
  const user = await getSessionUser(env, request);

  if (!user || !user.isAdmin) {
    return json({ error: 'Admin only' }, 403);
  }

  try {
    const badges = await env.DB.prepare('SELECT id, name, label, color, icon, created_at FROM badges ORDER BY created_at ASC').all();

    return json({ badges: badges.results || [] });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);

  if (!user || !user.isAdmin) return json({ error: 'Admin only' }, 403);

  if (!(await rateLimit(env, `badges:user:${user.id}`, 60, 3600))) {
    return json({ error: 'Too many actions' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = body.action;

  try {
    if (action === 'create') {
      const name = (cleanText(body.name, 24, false) || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const label = cleanText(body.label, 24, false);
      const icon = cleanText(body.icon, 2, false) || '★';
      const color = COLORS.includes(body.color) ? body.color : '#58a6ff';

      if (!name || name.length < 2) return json({ error: 'Badge name: 2-24 latin/digits/dashes' }, 400);
      if (!label) return json({ error: 'Label is required' }, 400);

      const exists = await env.DB.prepare('SELECT id FROM badges WHERE name = ?').bind(name).first();

      if (exists) return json({ error: 'Badge name exists' }, 409);

      const inserted = await env.DB.prepare(
        'INSERT INTO badges (name, label, color, icon, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id'
      )
        .bind(name, label, color, icon, Date.now())
        .first();

      await audit(env, { userId: user.id, action: 'badge_create', request, details: name });

      return json({ ok: true, id: inserted?.id });
    }

    if (action === 'delete') {
      const id = Number.parseInt(body.id, 10);

      if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, 400);

      await env.DB.prepare('DELETE FROM user_badges WHERE badge_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM badges WHERE id = ?').bind(id).run();
      await audit(env, { userId: user.id, action: 'badge_delete', request, details: String(id) });

      return json({ ok: true });
    }

    if (action === 'assign') {
      const userId = Number.parseInt(body.userId, 10);
      const badgeId = Number.parseInt(body.badgeId, 10);

      if (!Number.isInteger(userId) || !Number.isInteger(badgeId)) {
        return json({ error: 'Invalid ids' }, 400);
      }

      const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
      const badge = await env.DB.prepare('SELECT id FROM badges WHERE id = ?').bind(badgeId).first();

      if (!target || !badge) return json({ error: 'User or badge not found' }, 404);

      await env.DB.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)')
        .bind(userId, badgeId)
        .run();

      await audit(env, { userId: user.id, action: 'badge_assign', request, details: `${userId}:${badgeId}` });

      return json({ ok: true });
    }

    if (action === 'revoke') {
      const userId = Number.parseInt(body.userId, 10);
      const badgeId = Number.parseInt(body.badgeId, 10);

      if (!Number.isInteger(userId) || !Number.isInteger(badgeId)) {
        return json({ error: 'Invalid ids' }, 400);
      }

      await env.DB.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?')
        .bind(userId, badgeId)
        .run();

      await audit(env, { userId: user.id, action: 'badge_revoke', request, details: `${userId}:${badgeId}` });

      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
