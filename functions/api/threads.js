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

const THREADS_PER_PAGE = 20;

export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    return getThreads(request, env);
  }

  if (request.method === 'POST') {
    return createThread(request, env);
  }

  return json({ error: 'Method not allowed' }, 405);
}

async function getThreads(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * THREADS_PER_PAGE;

  const where = ['t.deleted = 0'];
  const params = [];

  if (category) {
    if (!/^[a-z0-9-]{3,64}$/.test(category)) {
      return json({ error: 'Некорректная категория' }, 400);
    }

    where.push('c.slug = ?');
    params.push(category);
  }

  params.push(THREADS_PER_PAGE, offset);

  try {
    const result = await env.DB.prepare(
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
        WHERE ${where.join(' AND ')}
        GROUP BY t.id
        ORDER BY t.is_pinned DESC, t.updated_at DESC
        LIMIT ? OFFSET ?
      `
    )
      .bind(...params)
      .all();

    const threads = result.results || [];

    return json({
      threads,
      page,
      perPage: THREADS_PER_PAGE,
      hasMore: threads.length === THREADS_PER_PAGE
    });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}

async function createThread(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) {
    return json({ error: 'Требуется вход' }, 401);
  }

  if (!(await rateLimit(env, `threads:user:${user.id}`, 10, 3600))) {
    return json({ error: 'Слишком много тредов за час. Попробуй позже.' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Некорректный JSON' }, 400);
  }

  const categoryId = Number.parseInt(body.categoryId, 10);
  const title = cleanText(body.title, 160, false);
  const firstPostBody = cleanText(body.body, 10000, true);

  if (!Number.isInteger(categoryId)) {
    return json({ error: 'Некорректная категория' }, 400);
  }

  if (!title || title.length < 4) {
    return json({ error: 'Заголовок должен быть от 4 до 160 символов' }, 400);
  }

  if (!firstPostBody) {
    return json({ error: 'Текст первого поста должен быть от 1 до 10000 символов' }, 400);
  }

  if (containsProhibited(`${title}\n${firstPostBody}`)) {
    return json({
      error: 'Тема содержит запрещённое направление. Только легальные исследования, lab, CTF и authorized pentest.'
    }, 400);
  }

  try {
    const category = await env.DB.prepare('SELECT id FROM categories WHERE id = ?')
      .bind(categoryId)
      .first();

    if (!category) {
      return json({ error: 'Категория не найдена' }, 404);
    }

    const now = Date.now();

    const thread = await env.DB.prepare(
      `
        INSERT INTO threads (
          category_id,
          user_id,
          title,
          created_at,
          updated_at,
          is_locked,
          is_pinned,
          deleted
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0)
        RETURNING id
      `
    )
      .bind(categoryId, user.id, title, now, now)
      .first();

    if (!thread) {
      return json({ error: 'Не удалось создать тред' }, 500);
    }

    try {
      await env.DB.prepare(
        `
          INSERT INTO posts (
            thread_id,
            user_id,
            body,
            created_at,
            updated_at,
            deleted
          ) VALUES (?, ?, ?, ?, ?, 0)
        `
      )
        .bind(thread.id, user.id, firstPostBody, now, now)
        .run();
    } catch (postError) {
      await env.DB.prepare('UPDATE threads SET deleted = 1 WHERE id = ?')
        .bind(thread.id)
        .run();

      throw postError;
    }

    await audit(env, {
      userId: user.id,
      action: 'create_thread',
      request,
      details: `${thread.id}:${title}`
    });

    return json({ id: thread.id }, 201);
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
