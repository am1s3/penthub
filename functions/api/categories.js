import { json } from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const result = await env.DB.prepare(
      `
        SELECT
          c.id,
          c.slug,
          c.name,
          c.description,
          c.sort_order,
          COUNT(t.id) AS thread_count
        FROM categories c
        LEFT JOIN threads t ON t.category_id = c.id AND t.deleted = 0
        GROUP BY c.id
        ORDER BY c.sort_order ASC
      `
    ).all();

    return json({ categories: result.results || [] });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
