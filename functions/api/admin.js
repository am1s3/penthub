import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  audit
} from '../_utils.js';

const THREAD_ACTIONS = ['lock', 'unlock', 'pin', 'unpin', 'delete', 'restore'];
const POST_ACTIONS = ['delete', 'restore'];

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

  if (!user.isAdmin) {
    return json({ error: 'Нет прав' }, 403);
  }

  if (!(await rateLimit(env, `admin:user:${user.id}`, 200, 3600))) {
    return json({ error: 'Слишком много админ-действий' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Некорректный JSON' }, 400);
  }

  const type = body.type === 'thread' || body.type === 'post' ? body.type : null;
  const id = Number.parseInt(body.id, 10);
  const action = (cleanText(body.action, 20, false) || '').toLowerCase();

  if (!type || !Number.isInteger(id) || !action) {
    return json({ error: 'Некорректный запрос' }, 400);
  }

  try {
    if (type === 'thread') {
      if (!THREAD_ACTIONS.includes(action)) {
        return json({ error: 'Неизвестное действие для треда' }, 400);
      }

      const thread = await env.DB.prepare('SELECT id FROM threads WHERE id = ? LIMIT 1')
        .bind(id)
        .first();

      if (!thread) {
        return json({ error: 'Тред не найден' }, 404);
      }

      if (action === 'lock') {
        await env.DB.prepare('UPDATE threads SET is_locked = 1 WHERE id = ?').bind(id).run();
      }

      if (action === 'unlock') {
        await env.DB.prepare('UPDATE threads SET is_locked = 0 WHERE id = ?').bind(id).run();
      }

      if (action === 'pin') {
        await env.DB.prepare('UPDATE threads SET is_pinned = 1 WHERE id = ?').bind(id).run();
      }

      if (action === 'unpin') {
        await env.DB.prepare('UPDATE threads SET is_pinned = 0 WHERE id = ?').bind(id).run();
      }

      if (action === 'delete') {
        await env.DB.prepare('UPDATE threads SET deleted = 1 WHERE id = ?').bind(id).run();
      }

      if (action === 'restore') {
        await env.DB.prepare('UPDATE threads SET deleted = 0 WHERE id = ?').bind(id).run();
      }
    }

    if (type === 'post') {
      if (!POST_ACTIONS.includes(action)) {
        return json({ error: 'Неизвестное действие для поста' }, 400);
      }

      const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ? LIMIT 1')
        .bind(id)
        .first();

      if (!post) {
        return json({ error: 'Пост не найден' }, 404);
      }

      if (action === 'delete') {
        await env.DB.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').bind(id).run();
      }

      if (action === 'restore') {
        await env.DB.prepare('UPDATE posts SET deleted = 0 WHERE id = ?').bind(id).run();
      }
    }

    await audit(env, {
      userId: user.id,
      action: `admin_${type}_${action}`,
      request,
      details: String(id)
    });

    return json({ ok: true });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
