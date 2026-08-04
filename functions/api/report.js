import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  audit
} from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) {
    return json({ error: 'Требуется вход' }, 401);
  }

  if (!(await rateLimit(env, `reports:user:${user.id}`, 20, 3600))) {
    return json({ error: 'Слишком много жалоб за час. Попробуй позже.' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Некорректный JSON' }, 400);
  }

  const postId = Number.parseInt(body.postId, 10);
  const reason = cleanText(body.reason, 500, false);

  if (!Number.isInteger(postId)) {
    return json({ error: 'Некорректный postId' }, 400);
  }

  if (!reason) {
    return json({ error: 'Укажи причину жалобы' }, 400);
  }

  try {
    const post = await env.DB.prepare(
      'SELECT id, user_id, deleted FROM posts WHERE id = ? LIMIT 1'
    )
      .bind(postId)
      .first();

    if (!post || post.deleted) {
      return json({ error: 'Пост не найден' }, 404);
    }

    if (post.user_id === user.id) {
      return json({ error: 'Нельзя жаловаться на свой собственный пост' }, 400);
    }

    const duplicate = await env.DB.prepare(
      "SELECT id FROM reports WHERE post_id = ? AND reporter_id = ? AND status = 'open' LIMIT 1"
    )
      .bind(postId, user.id)
      .first();

    if (duplicate) {
      return json({ error: 'Жалоба на этот пост уже на рассмотрении' }, 409);
    }

    await env.DB.prepare(
      `
        INSERT INTO reports (
          post_id,
          reporter_id,
          reason,
          status,
          created_at
        ) VALUES (?, ?, ?, 'open', ?)
      `
    )
      .bind(postId, user.id, reason, Date.now())
      .run();

    await audit(env, {
      userId: user.id,
      action: 'report_post',
      request,
      details: String(postId)
    });

    return json({ ok: true }, 201);
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
