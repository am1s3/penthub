import { json, cleanText } from '../_utils.js';

function escapeLike(value) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get('q') || '', 64, false);

  if (!q || q.length < 3) {
    return json({ results: [], q: q || '' });
  }

  const like = escapeLike(q);

  try {
    const result = await env.DB.prepare(
      `
        SELECT DISTINCT
          t.id,
          t.title,
          t.updated_at,
          c.slug AS category_slug,
          c.name AS category_name,
          u.username AS author,
          (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id AND p.deleted = 0) AS post_count
        FROM threads t
        JOIN categories c ON c.id = t.category_id
        JOIN users u ON u.id = t.user_id
        LEFT JOIN posts p ON p.thread_id = t.id AND p.deleted = 0
        WHERE
          t.deleted = 0
          AND (
            t.title LIKE ? ESCAPE '\\'
            OR p.body LIKE ? ESCAPE '\\'
          )
        ORDER BY t.updated_at DESC
        LIMIT 30
      `
    )
      .bind(like, like)
      .all();

    return json({ results: result.results || [], q });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
