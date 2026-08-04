import { json, audit } from '../_utils.js';

const SOURCES = [
  { name: 'Bruce', slug: 'bruce', repo: 'pr3y/bruce' }
];

export async function onRequestGet({ request, env }) {
  try {
    const result = await env.DB.prepare(
      `SELECT r.id, r.source, r.tag, r.title, r.body, r.url, r.published_at, r.thread_id,
              c.slug AS category_slug
       FROM releases r
       LEFT JOIN threads t ON t.id = r.thread_id
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY r.published_at DESC
       LIMIT 30`
    ).all();

    return json({ releases: result.results || [] });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('x-worker-secret');

  if (!env.WORKER_SECRET || auth !== env.WORKER_SECRET) {
    return json({ error: 'Forbidden' }, 403);
  }

  const results = [];

  for (const src of SOURCES) {
    try {
      const res = await fetch(`https://api.github.com/repos/${src.repo}/releases?per_page=5`, {
        headers: { 'User-Agent': 'PentHubReleaseSync/1.0', Accept: 'application/vnd.github+json' }
      });

      if (!res.ok) {
        results.push({ source: src.name, error: `github ${res.status}` });
        continue;
      }

      const data = await res.json();
      let created = 0;

      for (const release of data) {
        const tag = String(release.tag_name || '');
        const exists = await env.DB.prepare('SELECT id FROM releases WHERE source = ? AND tag = ?')
          .bind(src.name, tag)
          .first();

        if (exists) continue;

        const title = String(release.name || tag).slice(0, 160);
        const body = String(release.body || '').slice(0, 9000);
        const url = String(release.html_url || '');
        const published = new Date(release.published_at || Date.now()).getTime();

        const category = await env.DB.prepare(
          "SELECT id FROM categories WHERE slug = ? OR LOWER(name) LIKE ? LIMIT 1"
        )
          .bind(src.slug.toLowerCase(), `%${src.name.toLowerCase()}%`)
          .first();

        if (!category) {
          results.push({ source: src.name, tag, error: 'no-category' });
          continue;
        }

        const systemUser = await env.DB.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').first();

        if (!systemUser) {
          results.push({ source: src.name, error: 'no-system-user' });
          break;
        }

        const now = Date.now();

        const threadTitle = `[${src.name} Release] ${title}`;
        const threadBody = `New ${src.name} release **${tag}** is out.\n\n${body}\n\n**Release link:** ${url}\n\n_This thread was auto-created from GitHub._`;

        const thread = await env.DB.prepare(
          'INSERT INTO threads (category_id, user_id, title, created_at, updated_at, is_locked, is_pinned, deleted) VALUES (?, ?, ?, ?, ?, 0, 0, 0) RETURNING id'
        )
          .bind(category.id, systemUser.id, threadTitle, now, now)
          .first();

        if (!thread) continue;

        const firstPost = await env.DB.prepare(
          'INSERT INTO posts (thread_id, user_id, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0) RETURNING id'
        )
          .bind(thread.id, systemUser.id, threadBody, now, now)
          .first();

        await env.DB.prepare(
          'INSERT INTO releases (source, tag, title, body, url, published_at, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(src.name, tag, title, body, url, published, thread.id, now)
          .run();

        created += 1;
      }

      results.push({ source: src.name, created });
    } catch (e) {
      results.push({ source: src.name, error: String(e?.message || e) });
    }
  }

  return json({ results });
}
