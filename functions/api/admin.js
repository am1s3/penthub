import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  audit,
  isStaff
} from '../_utils.js';

const THREAD_ACTIONS = ['lock', 'unlock', 'pin', 'unpin', 'delete', 'restore'];
const POST_ACTIONS = ['delete', 'restore'];
const REPORT_ACTIONS = ['resolve', 'dismiss'];
const USER_ACTIONS = ['ban', 'unban', 'mod_promote', 'mod_demote'];
const PER_PAGE = 25;

const THREAD_FIELD = {
  lock: 'is_locked = 1',
  unlock: 'is_locked = 0',
  pin: 'is_pinned = 1',
  unpin: 'is_pinned = 0',
  delete: 'deleted = 1',
  restore: 'deleted = 0'
};

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function handleGet(request, env) {
  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Требуется вход' }, 401);
  if (!isStaff(user)) return json({ error: 'Нет прав' }, 403);

  if (!(await rateLimit(env, `admin-get:${user.id}`, 300, 3600))) {
    return json({ error: 'Слишком много запросов' }, 429);
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'reports';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  try {
    if (type === 'reports') {
      const status = url.searchParams.get('status') || 'open';
      const statusFilter = status === 'all' ? '' : status;

      const result = await env.DB.prepare(
        `
          SELECT
            r.id,
            r.reason,
            r.status,
            r.created_at,
            rep.username AS reporter,
            p.body AS post_body,
            p.deleted AS post_deleted,
            u.username AS post_author,
            t.id AS thread_id,
            t.title AS thread_title
          FROM reports r
          JOIN users rep ON rep.id = r.reporter_id
          JOIN posts p ON p.id = r.post_id
          JOIN threads t ON t.id = p.thread_id
          JOIN users u ON u.id = p.user_id
          WHERE (? = '' OR r.status = ?)
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?
        `
      )
        .bind(statusFilter, statusFilter, PER_PAGE, offset)
        .all();

      const reports = result.results || [];

      return json({ reports, page, perPage: PER_PAGE, hasMore: reports.length === PER_PAGE });
    }

    if (type === 'users') {
      if (!user.isAdmin) {
        return json({ error: 'Пользователи — только админ' }, 403);
      }

      const q = cleanText(url.searchParams.get('q') || '', 32, false) || '';
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

      const result = await env.DB.prepare(
        `
          SELECT
            u.id,
            u.username,
            u.created_at,
            u.banned,
            u.is_admin,
            u.is_moderator,
            (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id AND t.deleted = 0) AS thread_count,
            (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted = 0) AS post_count
          FROM users u
          WHERE u.username LIKE ? ESCAPE '\\'
          ORDER BY u.created_at DESC
          LIMIT ? OFFSET ?
        `
      )
        .bind(like, PER_PAGE, offset)
        .all();

      const users = (result.results || []).map((u) => ({
        ...u,
        banned: Boolean(u.banned),
        is_admin: Boolean(u.is_admin),
        is_moderator: Boolean(u.is_moderator)
      }));

      return json({ users, page, perPage: PER_PAGE, hasMore: users.length === PER_PAGE });
    }

    return json({ error: 'Неизвестный type' }, 400);
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Требуется вход' }, 401);
  if (!isStaff(user)) return json({ error: 'Нет прав' }, 403);

  if (!(await rateLimit(env, `admin-post:${user.id}`, 300, 3600))) {
    return json({ error: 'Слишком много действий' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Некорректный JSON' }, 400);
  }

  const type = body.type;
  const id = Number.parseInt(body.id, 10);
  const action = (cleanText(body.action, 20, false) || '').toLowerCase();

  if (!type || !Number.isInteger(id) || !action) {
    return json({ error: 'Некорректный запрос' }, 400);
  }

  try {
    if (type === 'thread') {
      if (!THREAD_ACTIONS.includes(action)) {
        return json({ error: 'Неизвестное действие' }, 400);
      }

      const row = await env.DB.prepare('SELECT id FROM threads WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Тред не найден' }, 404);

      await env.DB.prepare(`UPDATE threads SET ${THREAD_FIELD[action]} WHERE id = ?`)
        .bind(id)
        .run();
    } else if (type === 'post') {
      if (!POST_ACTIONS.includes(action)) {
        return json({ error: 'Неизвестное действие' }, 400);
      }

      const row = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Пост не найден' }, 404);

      await env.DB.prepare(`UPDATE posts SET deleted = ? WHERE id = ?`)
        .bind(action === 'delete' ? 1 : 0, id)
        .run();
    } else if (type === 'report') {
      if (!REPORT_ACTIONS.includes(action)) {
        return json({ error: 'Неизвестное действие' }, 400);
      }

      const status = action === 'resolve' ? 'resolved' : 'dismissed';

      await env.DB.prepare('UPDATE reports SET status = ? WHERE id = ?')
        .bind(status, id)
        .run();
    } else if (type === 'user') {
      if (!user.isAdmin) {
        return json({ error: 'Пользователи — только админ' }, 403);
      }

      if (!USER_ACTIONS.includes(action)) {
        return json({ error: 'Неизвестное действие' }, 400);
      }

      const target = await env.DB.prepare(
        'SELECT id, username, is_admin, is_moderator, banned FROM users WHERE id = ?'
      )
        .bind(id)
        .first();

      if (!target) return json({ error: 'Пользователь не найден' }, 404);

      if (target.id === user.id && (action === 'ban' || action === 'mod_demote')) {
        return json({ error: 'Нельзя применить к себе' }, 400);
      }

      if (target.is_admin && action === 'ban') {
        return json({ error: 'Нельзя забанить админа. Сначала сними админку.' }, 400);
      }

      if (action === 'ban') {
        await env.DB.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(id).run();
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
      }

      if (action === 'unban') {
        await env.DB.prepare('UPDATE users SET banned = 0 WHERE id = ?').bind(id).run();
      }

      if (action === 'mod_promote') {
        await env.DB.prepare('UPDATE users SET is_moderator = 1 WHERE id = ?').bind(id).run();
      }

      if (action === 'mod_demote') {
        await env.DB.prepare('UPDATE users SET is_moderator = 0 WHERE id = ?').bind(id).run();
      }
    } else {
      return json({ error: 'Неизвестный type' }, 400);
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
