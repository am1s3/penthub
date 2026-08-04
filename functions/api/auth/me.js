import { json, getSessionUser } from '../../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await getSessionUser(env, request);

    if (!user) return json({ error: 'Unauthorized' }, 401);

    const [unread, notifications, banRow, latestChange] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS c FROM private_messages WHERE recipient_id = ? AND read_at IS NULL')
        .bind(user.id)
        .first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .bind(user.id)
        .first(),
      env.DB.prepare(
        'SELECT banned, ban_reason, banned_at, display_name, avatar, banner FROM users WHERE id = ?'
      )
        .bind(user.id)
        .first(),
      env.DB.prepare('SELECT id, version FROM changelog ORDER BY created_at DESC LIMIT 1').first()
    ]);

    const badges = await env.DB.prepare(
      `SELECT b.id, b.name, b.label, b.color, b.icon
       FROM badges b JOIN user_badges ub ON ub.badge_id = b.id
       WHERE ub.user_id = ?`
    )
      .bind(user.id)
      .all();

    return json({
      ...user,
      display_name: banRow?.display_name || '',
      avatar: banRow?.avatar || '',
      banner: banRow?.banner || '',
      banned: Boolean(banRow?.banned),
      ban_reason: banRow?.ban_reason || '',
      banned_at: banRow?.banned_at || null,
      badges: badges.results || [],
      unread_count: Number(unread?.c || 0),
      notifications_unread: Number(notifications?.c || 0),
      changelog_latest_id: latestChange?.id ?? 0,
      changelog_latest_version: latestChange?.version ?? ''
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
