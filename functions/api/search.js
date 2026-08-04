import { json, cleanText } from '../_utils.js';

function buildFtsQuery(raw) {
  const tokens = raw
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8)
    .map((t) => `"${t.replace(/"/g, '""')}"`);

  return tokens.join(' OR ');
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

  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const ftsQuery = buildFtsQuery(q);

  const baseSelect = `
    SELECT DISTINCT
      t.id,
      t.title,
      t.updated_at,
      t.is_locked,
      t.is_pinned,
      c.slug AS category_slug,
      c.name AS category_name,
      u.username AS author,
      (SELECT COUNT(*) FROM posts p2 WHERE p2.thread_id = t.id AND p2.deleted = 0) AS post_count
    FROM threads t
    JOIN categories c ON c.id = t.category_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN posts p ON p.thread_id = t.id AND p.deleted = 0
  `;

  try {
    let result;

    if (ftsQuery) {
      try {
        result = await env.DB.prepare(
          `${baseSelect}
           WHERE t.deleted = 0
             AND (
               t.title LIKE ? ESCAPE '\\'
               OR p.id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)
             )
           ORDER BY t.updated_at DESC
           LIMIT 30`
        )
          .bind(like, ftsQuery)
          .all();
      } catch {
        result = null;
      }
    }

    if (!result) {
      result = await env.DB.prepare(
        `${baseSelect}
         WHERE t.deleted = 0 AND t.title LIKE ? ESCAPE '\\'
         ORDER BY t.updated_at DESC
         LIMIT 30`
      )
        .bind(like)
        .all();
    }

    return json({ results: result.results || [], q });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
