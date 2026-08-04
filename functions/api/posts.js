import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  containsProhibited,
  audit
} from '../_utils.js';

const POSTS_PER_PAGE = 20;

export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    return getPosts(request, env);
  }

  if (request.method === 'POST') {
    return createPost(request, env);
  }

  return json({ error: 'Method not allowed' }, 405);
}

async function getPosts(request, env) {
  const url = new URL(request.url);
  const threadId = Number.parseInt(url.searchParams.get('threadId') || '', 10);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * POSTS_PER_PAGE;

  if (!Number.isInteger(threadId)) {
    return json({ error: 'Некорректный threadId' }, 400);
  }

  try {
    const thread = await env.DB.prepare(
      'SELECT id, deleted FROM threads WHERE id = ? LIMIT 1'
    )
      .bind(threadId)
      .first();

    if (!thread || thread.deleted) {
      return json({ error: 'Тред не найден' }, 404);
    }

    const result = await env.DB.prepare(
      `
        SELECT
          p.id,
          p.thread_id,
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

    return json({
      posts: posts.map((post) => ({
        ...post,
        is_admin: Boolean(post.is_admin)
      })),
      page,
      perPage: POSTS_PER_PAGE,
      hasMore: posts.length === POSTS_PER_PAGE
    });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}

async function createPost(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) {
    return json({ error: 'Требуется вход' }, 401);
  }

  if (!(await rateLimit(env, `posts:user:${user.id}`, 30, 3600))) {
    return json({ error: 'Слишком много постов за час. Попробуй позже.' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Некорректный JSON' }, 400);
  }

  const threadId = Number.parseInt(body.threadId, 10);
  const postBody = cleanText(body.body, 10000, true);

  if (!Number.isInteger(threadId)) {
    return json({ error: 'Некорректный threadId' }, 400);
  }

  if (!postBody) {
    return json({ error: 'Пост должен быть от 1 до 10000 символов' }, 400);
  }

  if (containsProhibited(postBody)) {
    return json({
      error: 'Сообщение содержит запрещённое направление. Только легальные исследования, lab, CTF и authorized pentest.'
    }, 400);
  }

  try {
    const thread = await env.DB.prepare(
      'SELECT id, is_locked, deleted FROM threads WHERE id = ? LIMIT 1'
    )
      .bind(threadId)
      .first();

    if (!thread || thread.deleted) {
      return json({ error: 'Тред не найден' }, 404);
    }

    if (thread.is_locked && !user.isAdmin) {
      return json({ error: 'Тред закрыт для ответов' }, 403);
    }

    const now = Date.now();

    const inserted = await env.DB.prepare(
      `
        INSERT INTO posts (
          thread_id,
          user_id,
          body,
          created_at,
          updated_at,
          deleted
        ) VALUES (?, ?, ?, ?, ?, 0)
        RETURNING id
      `
    )
      .bind(threadId, user.id, postBody, now, now)
      .first();

    if (!inserted) {
      return json({ error: 'Не удалось создать пост' }, 500);
    }

    await env.DB.prepare('UPDATE threads SET updated_at = ? WHERE id = ?')
      .bind(now, threadId)
      .run();

    await audit(env, {
      userId: user.id,
      action: 'create_post',
      request,
      details: `${threadId}:${inserted.id}`
    });

    return json({ id: inserted.id }, 201);
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
