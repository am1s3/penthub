import {
  json, readJson, checkOrigin, getSessionUser, rateLimit, cleanText,
  containsProhibited, audit, getUserMetaMap
} from '../_utils.js';

import { storeMentions } from './posts.js';

const THREADS_PER_PAGE = 20;

export function parseTags(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(',');
  const out = [];

  for (const raw of list) {
    const t = String(raw).trim().toLowerCase().replace(/^#/, '')
      .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (t.length >= 2 && t.length <= 24 && !out.includes(t)) out.push(t);
    if (out.length >= 5) break;
  }

  return out;
}

export async function attachTags(env, threads) {
  const ids = threads.map((t) => t.id);
  if (!ids.length) return threads;

  const placeholders = ids.map(() => '?').join(',');

  const rows = await env.DB.prepare(
    `SELECT tt.thread_id, g.name FROM thread_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.thread_id IN (${placeholders})`
  ).bind(...ids).all();

  const map = {};
  for (const row of rows.results || []) (map[row.thread_id] ||= []).push(row.name);

  return threads.map((t) => ({ ...t, tags: map[t.id] || [] }));
}

async function storeTags(env, threadId, tags) {
  for (const name of tags) {
    await env.DB.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').bind(name).run();
    const tag = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(name).first();
    if (tag) {
      await env.DB.prepare('INSERT OR IGNORE INTO thread_tags (thread_id, tag_id) VALUES (?, ?)')
        .bind(threadId, tag.id).run();
    }
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return getThreads(request, env);
  if (request.method === 'POST') return createThread(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function getThreads(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const tag = (url.searchParams.get('tag') || '').trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * THREADS_PER_PAGE;

  const where = ['t.deleted = 0'];
  const joins = [];
  const params = [];

  if (category) {
    if (!/^[a-z0-9-]{3,64}$/.test(category)) return json({ error: 'Invalid category' }, 400);
    where.push('c.slug = ?');
    params.push(category);
  }

  if (tag) {
    if (!/^[a-z0-9-]{2,24}$/.test(tag)) return json({ error: 'Invalid tag' }, 400);
    joins.push('JOIN thread_tags tt ON tt.thread_id = t.id JOIN tags g ON g.id = tt.tag_id AND g.name = ?');
    params.push(tag);
  }

  params.push(THREADS_PER_PAGE, offset);

  try {
    const result = await env.DB.prepare(
      `SELECT
         t.id, t.title, t.created_at, t.updated_at, t.is_locked, t.is_pinned, t.category_id,
         c.slug AS category_slug, c.name AS category_name,
         u.id AS author_id, u.username AS author,
         COUNT(p.id) AS post_count
       FROM threads t
       JOIN categories c ON c.id = t.category_id
       JOIN users u ON u.id = t.user_id
       ${joins.join(' ')}
       LEFT JOIN posts p ON p.thread_id = t.id AND p.deleted = 0
       WHERE ${where.join(' AND ')}
       GROUP BY t.id
       ORDER BY t.is_pinned DESC, t.updated_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...params).all();

    let threads = await attachTags(env, result.results || []);

    const meta = await getUserMetaMap(env, threads.map((t) => t.author_id));

    threads = threads.map((t) => ({
      ...t,
      author_avatar: meta[t.author_id]?.avatar || '',
      author_display: meta[t.author_id]?.display_name || t.author,
      badges: meta[t.author_id]?.badges || []
    }));

    return json({ threads, page, perPage: THREADS_PER_PAGE, hasMore: threads.length === THREADS_PER_PAGE });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function createThread(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `threads:user:${user.id}`, 10, 3600))) {
    return json({ error: 'Too many threads per hour. Try later.' }, 429);
  }

  let body;
  try { body = await readJson(request); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const categoryId = Number.parseInt(body.categoryId, 10);
  const title = cleanText(body.title, 160, false);
  const firstPostBody = cleanText(body.body, 10000, true);
  const tags = parseTags(body.tags);

  if (!Number.isInteger(categoryId)) return json({ error: 'Invalid category' }, 400);
  if (!title || title.length < 4) return json({ error: 'Title must be 4-160 characters' }, 400);
  if (!firstPostBody) return json({ error: 'First post must be 1-10000 characters' }, 400);

  if (containsProhibited(`${title}\n${firstPostBody}`)) {
    return json({ error: 'Thread violates platform rules. Legal research, labs, CTF and authorized pentest only.' }, 400);
  }

  try {
    const category = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(categoryId).first();
    if (!category) return json({ error: 'Category not found' }, 404);

    const now = Date.now();

    const thread = await env.DB.prepare(
      `INSERT INTO threads (category_id, user_id, title, created_at, updated_at, is_locked, is_pinned, deleted)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0) RETURNING id`
    ).bind(categoryId, user.id, title, now, now).first();

    if (!thread) return json({ error: 'Failed to create thread' }, 500);

    try {
      const firstPost = await env.DB.prepare(
        'INSERT INTO posts (thread_id, user_id, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0) RETURNING id'
      ).bind(thread.id, user.id, firstPostBody, now, now).first();

      await storeMentions(env, firstPost?.id ?? thread.id, firstPostBody, user.id);
      await storeTags(env, thread.id, tags);
    } catch (postError) {
      await env.DB.prepare('UPDATE threads SET deleted = 1 WHERE id = ?').bind(thread.id).run();
      throw postError;
    }

    await audit(env, { userId: user.id, action: 'create_thread', request, details: `${thread.id}:${title}` });

    return json({ id: thread.id }, 201);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
