import { json, getSessionUser } from '../../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const user = await getSessionUser(env, request);

    if (!user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const [unread, notifications] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS c FROM private_messages WHERE recipient_id = ? AND read_at IS NULL')
        .bind(user.id)
        .first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .bind(user.id)
        .first()
    ]);

    return json({
      ...user,
      unread_count: Number(unread?.c || 0),
      notifications_unread: Number(notifications?.c || 0)
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
