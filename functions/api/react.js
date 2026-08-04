import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  audit
} from '../_utils.js';

export const REACTION_EMOJIS = ['👍', '🔥', '', '😂', '❤️', '🛡️'];

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `react:user:${user.id}`, 120, 3600))) {
    return json({ error: 'Too many reactions per hour' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const postId = Number.parseInt(body.postId, 10);
  const emoji = typeof body.emoji === 'string' ? body.emoji : '';

  if (!Number.isInteger(postId)) {
    return json({ error: 'Invalid postId' }, 400);
  }

  if (!REACTION_EMOJIS.includes(emoji)) {
    return json({ error: 'Unsupported emoji' }, 400);
  }

  try {
    const post = await env.DB.prepare('SELECT id, deleted FROM posts WHERE id = ? LIMIT 1')
      .bind(postId)
      .first();

    if (!post || post.deleted) {
      return json({ error: 'Post not found' }, 404);
    }

    const existing = await env.DB.prepare(
      'SELECT id, emoji FROM reactions WHERE post_id = ? AND user_id = ? LIMIT 1'
    )
      .bind(postId, user.id)
      .first();

    if (existing && existing.emoji === emoji) {
      await env.DB.prepare('DELETE FROM reactions WHERE id = ?').bind(existing.id).run();
    } else if (existing) {
      await env.DB.prepare('UPDATE reactions SET emoji = ?, created_at = ? WHERE id = ?')
        .bind(emoji, Date.now(), existing.id)
        .run();
    } else {
      await env.DB.prepare(
        'INSERT INTO reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)'
      )
        .bind(postId, user.id, emoji, Date.now())
        .run();
    }

    return json({ ok: true });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
