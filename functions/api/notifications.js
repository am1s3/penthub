import { json, checkOrigin, getSessionUser } from '../_utils.js';

const PER_PAGE = 30;

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return listNotifications(request, env);
  if (request.method === 'POST') return markRead(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function listNotifications(request, env) {
  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  try {
    const result = await env.DB.prepare(
      `
        SELECT
          n.id,
          n.type,
          n.created_at,
          n.read_at,
          n.thread_id,
          u.username AS actor,
          t.title AS thread_title
        FROM notifications n
        LEFT JOIN users u ON u.id = n.actor_id
        LEFT JOIN threads t ON t.id = n.thread_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC
        LIMIT ? OFFSET ?
      `
    )
      .bind(user.id, PER_PAGE, offset)
      .all();

    const notifications = result.results || [];

    return json({ notifications, page, perPage: PER_PAGE, hasMore: notifications.length === PER_PAGE });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function markRead(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  try {
    await env.DB.prepare(
      'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL'
    )
      .bind(Date.now(), user.id)
      .run();

    return json({ ok: true });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
