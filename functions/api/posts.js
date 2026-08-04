import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  containsProhibited,
  audit,
  isStaff
} from '../_utils.js';

const POSTS_PER_PAGE = 20;

export function extractMentions(text) {
  if (!text) return [];

  const set = new Set();
  const re = /(^|[^a-zA-Z0-9_.-])@([a-zA-Z0-9_.-]{3,32})/g;
  let m;

  while ((m = re.exec(text))) {
    set.add(m[2]);
  }

  return [...set];
}

export async function storeMentions(env, postId, text, authorId) {
  const names = extractMentions(text);

  if (!names.length) return;

  const placeholders = names.map(() => '?').join(',');

  const rows = await env.DB.prepare(`SELECT id FROM users WHERE username IN (${placeholders})`)
    .bind(...names)
    .all();

  const now = Date.now();

  for (const u of rows.results || []) {
    if (u.id === authorId) continue;

    await env.DB.prepare('INSERT OR IGNORE INTO mentions (post_id, user_id, created_at) VALUES (?, ?, ?)')
      .bind(postId, u.id, now)
      .run();
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return getPosts(request, env);
  if (request.method === 'POST') return createPost(request, env);
  if (request.method === 'PATCH') return editPost(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function getPosts(request, env) {
  const url = new URL(request.url);
  const threadId = Number.parseInt(url.searchParams.get('threadId') || '', 10);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * POSTS_PER_PAGE;

  if (!Number.isInteger(threadId)) {
    return json({ error: 'Invalid threadId' }, 400);
  }

  try {
    const thread = await env.DB.prepare('SELECT id, deleted FROM threads WHERE id = ? LIMIT 1')
      .bind(threadId)
      .first();

    if (!thread || thread.deleted) {
      return json({ error: 'Thread not found' }, 404);
    }

    const viewer = await getSessionUser(env, request);

    const result = await env.DB.prepare(
      `
        SELECT
          p.id,
          p.thread_id,
          p.user_id,
          p.body,
          p.created_at,
          p.updated_at,
          u.username,
          u.is_admin
        FROM posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.thread_id = ? AND p.deleted = 0
        ORDER BY p.created_at ASC
        LIMIT ? OFFSET ?
      `
    )
      .bind(threadId, POSTS_PER_PAGE, offset)
      .all();

    const posts = result.results || [];
    const ids = posts.map((p) => p.id);

    let reactionsMap = {};
    let myMap = {};

    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');

      const grouped = await env.DB.prepare(
        `SELECT post_id, emoji, COUNT(*) AS c FROM reactions WHERE post_id IN (${placeholders}) GROUP BY post_id, emoji`
      )
        .bind(...ids)
        .all();

      for (const row of grouped.results || []) {
        (reactionsMap[row.post_id] ||= []).push({ emoji: row.emoji, count: row.c });
      }

      if (viewer) {
        const mine = await env.DB.prepare(
          `SELECT post_id, emoji FROM reactions WHERE user_id = ? AND post_id IN (${placeholders})`
        )
          .bind(viewer.id, ...ids)
          .all();

        for (const row of mine.results || []) {
          myMap[row.post_id] = row.emoji;
        }
      }
    }

    return json({
      posts: posts.map((post) => ({
        ...post,
        is_admin: Boolean(post.is_admin),
        reactions: reactionsMap[post.id] || [],
        my_reaction: myMap[post.id] || null
      })),
      page,
      perPage: POSTS_PER_PAGE,
      hasMore: posts.length === POSTS_PER_PAGE
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function createPost(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `posts:user:${user.id}`, 30, 3600))) {
    return json({ error: 'Too many posts per hour. Try later.' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const threadId = Number.parseInt(body.threadId, 10);
  const postBody = cleanText(body.body, 10000, true);

  if (!Number.isInteger(threadId)) {
    return json({ error: 'Invalid threadId' }, 400);
  }

  if (!postBody) {
    return json({ error: 'Post must be 1-10000 characters' }, 400);
  }

  if (containsProhibited(postBody)) {
    return json({ error: 'Post violates platform rules. Legal research, labs, CTF and authorized pentest only.' }, 400);
  }

  try {
    const thread = await env.DB.prepare('SELECT id, is_locked, deleted FROM threads WHERE id = ? LIMIT 1')
      .bind(threadId)
      .first();

    if (!thread || thread.deleted) {
      return json({ error: 'Thread not found' }, 404);
    }

    if (thread.is_locked && !isStaff(user)) {
      return json({ error: 'Thread is locked' }, 403);
    }

    const now = Date.now();

    const inserted = await env.DB.prepare(
      `
        INSERT INTO posts (thread_id, user_id, body, created_at, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, 0)
        RETURNING id
      `
    )
      .bind(threadId, user.id, postBody, now, now)
      .first();

    if (!inserted) {
      return json({ error: 'Failed to create post' }, 500);
    }

    await env.DB.prepare('UPDATE threads SET updated_at = ? WHERE id = ?')
      .bind(now, threadId)
      .run();

    await storeMentions(env, inserted.id, postBody, user.id);

    await audit(env, { userId: user.id, action: 'create_post', request, details: `${threadId}:${inserted.id}` });

    return json({ id: inserted.id }, 201);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function editPost(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `edit:user:${user.id}`, 30, 3600))) {
    return json({ error: 'Too many edits per hour' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const postId = Number.parseInt(body.postId, 10);
  const newBody = cleanText(body.body, 10000, true);

  if (!Number.isInteger(postId)) {
    return json({ error: 'Invalid postId' }, 400);
  }

  if (!newBody) {
    return json({ error: 'Text cannot be empty' }, 400);
  }

  if (containsProhibited(newBody)) {
    return json({ error: 'Text violates platform rules. Legal research, labs, CTF and authorized pentest only.' }, 400);
  }

  try {
    const post = await env.DB.prepare('SELECT id, user_id, deleted FROM posts WHERE id = ? LIMIT 1')
      .bind(postId)
      .first();

    if (!post || post.deleted) {
      return json({ error: 'Post not found' }, 404);
    }

    if (post.user_id !== user.id && !isStaff(user)) {
      return json({ error: 'No permission to edit this post' }, 403);
    }

    const now = Date.now();

    await env.DB.prepare('UPDATE posts SET body = ?, updated_at = ? WHERE id = ?')
      .bind(newBody, now, postId)
      .run();

    await audit(env, { userId: user.id, action: 'edit_post', request, details: String(postId) });

    return json({ ok: true, updatedAt: now });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
