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
  if (request.method === 'GET') return getProfile(request, env);
  if (request.method === 'POST') return updateBio(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function getProfile(request, env) {
  const url = new URL(request.url);
  const username = (url.searchParams.get('username') || '').trim();

  if (!username || username.length > 32) {
    return json({ error: 'Invalid username' }, 400);
  }

  try {
    const user = await env.DB.prepare(
      `
        SELECT
          u.id,
          u.username,
          u.created_at,
          u.bio,
          u.is_admin,
          u.is_moderator,
          (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id AND t.deleted = 0) AS thread_count,
          (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted = 0) AS post_count
        FROM users u
        WHERE u.username = ? COLLATE NOCASE AND u.banned = 0
        LIMIT 1
      `
    )
      .bind(username)
      .first();

    if (!user) {
      return json({ error: 'User not found' }, 404);
    }

    const [threads, posts, mentions] = await Promise.all([
      env.DB.prepare(
        `
          SELECT t.id, t.title, t.updated_at, c.name AS category_name
          FROM threads t
          JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = ? AND t.deleted = 0
          ORDER BY t.updated_at DESC
          LIMIT 5
        `
      )
        .bind(user.id)
        .all(),
      env.DB.prepare(
        `
          SELECT p.id, p.body, p.created_at, t.id AS thread_id, t.title AS thread_title
          FROM posts p
          JOIN threads t ON t.id = p.thread_id
          WHERE p.user_id = ? AND p.deleted = 0 AND t.deleted = 0
          ORDER BY p.created_at DESC
          LIMIT 5
        `
      )
        .bind(user.id)
        .all(),
      env.DB.prepare(
        `
          SELECT m.created_at, p.id AS post_id, p.body, t.id AS thread_id, t.title AS thread_title, u.username AS author
          FROM mentions m
          JOIN posts p ON p.id = m.post_id
          JOIN threads t ON t.id = p.thread_id
          JOIN users u ON u.id = p.user_id
          WHERE m.user_id = ? AND p.deleted = 0 AND t.deleted = 0
          ORDER BY m.created_at DESC
          LIMIT 5
        `
      )
        .bind(user.id)
        .all()
    ]);

    return json({
      profile: {
        user: {
          ...user,
          is_admin: Boolean(user.is_admin),
          is_moderator: Boolean(user.is_moderator)
        },
        threads: threads.results || [],
        posts: posts.results || [],
        mentions: mentions.results || []
      }
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function updateBio(request, env) {
  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `bio:user:${user.id}`, 10, 3600))) {
    return json({ error: 'Too many bio updates' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const bio = cleanText(body.bio, 500, true) || '';

  try {
    await env.DB.prepare('UPDATE users SET bio = ? WHERE id = ?')
      .bind(bio, user.id)
      .run();

    await audit(env, { userId: user.id, action: 'update_bio', request });

    return json({ ok: true });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
