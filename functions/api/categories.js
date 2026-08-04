import { json } from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const result = await env.DB.prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.section, c.sort_order,
              COUNT(t.id) AS thread_count
       FROM categories c
       LEFT JOIN threads t ON t.category_id = c.id AND t.deleted = 0
       GROUP BY c.id
       ORDER BY c.section ASC, c.sort_order ASC`
    ).all();

    const sections = {};

    for (const c of result.results || []) {
      const s = c.section || 'Other';
      (sections[s] ||= []).push(c);
    }

    return json({ categories: result.results || [], sections });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
