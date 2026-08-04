import { json } from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const id = Number.parseInt(url.searchParams.get('id') || '', 10);

  if (!Number.isInteger(id)) {
    return json({ error: 'Некорректный id треда' }, 400);
  }

  try {
    const thread = await env.DB.prepare(
      `
        SELECT
          t.id,
          t.title,
          t.created_at,
          t.updated_at,
          t.is_locked,
          t.is_pinned,
          t.category_id,
          c.slug AS category_slug,
          c.name AS category_name,
          u.username AS author,
          COUNT(p.id) AS post_count
        FROM threads t
        JOIN categories c ON c.id = t.category_id
        JOIN users u ON u.id = t.user_id
        LEFT JOIN posts p ON p.thread_id = t.id AND p.deleted = 0
        WHERE t.id = ? AND t.deleted = 0
        GROUP BY t.id
        LIMIT 1
      `
    )
      .bind(id)
      .first();

    if (!thread) {
      return json({ error: 'Тред не найден' }, 404);
    }

    return json({
      thread: {
        ...thread,
        is_locked: Boolean(thread.is_locked),
        is_pinned: Boolean(thread.is_pinned)
      }
    });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
