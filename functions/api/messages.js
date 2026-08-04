import {
  json, readJson, checkOrigin, getSessionUser, rateLimit, cleanText, containsProhibited, audit, isStaff
} from '../_utils.js';

import { cleanAttachments } from './posts.js';

const PER_PAGE = 30;

function parseAtt(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((u) => typeof u === 'string' && u.startsWith('/api/files/')).slice(0, 4) : [];
  } catch {
    return [];
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function handleGet(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'Login required' }, 401);

  const url = new URL(request.url);
  const withUsername = (url.searchParams.get('with') || '').trim();
  const box = url.searchParams.get('box') === 'outbox' ? 'outbox' : 'inbox';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  try {
    if (withUsername) {
      const other = await env.DB.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE LIMIT 1')
        .bind(withUsername).first();

      if (!other) return json({ error: 'User not found' }, 404);

      await env.DB.prepare(
        'UPDATE private_messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL'
      ).bind(Date.now(), user.id, other.id).run();

      const result = await env.DB.prepare(
        `SELECT pm.id, pm.body, pm.attachments, pm.created_at, pm.read_at,
                s.username AS sender_username, r.username AS recipient_username
         FROM private_messages pm
         JOIN users s ON s.id = pm.sender_id
         JOIN users r ON r.id = pm.recipient_id
         WHERE (pm.sender_id = ? AND pm.recipient_id = ?) OR (pm.sender_id = ? AND pm.recipient_id = ?)
         ORDER BY pm.created_at ASC LIMIT ? OFFSET ?`
      ).bind(user.id, other.id, other.id, user.id, PER_PAGE, offset).all();

      const messages = (result.results || []).map((m) => ({ ...m, attachments: parseAtt(m.attachments) }));

      return json({
        with: { id: other.id, username: other.username },
        messages, page, perPage: PER_PAGE, hasMore: messages.length === PER_PAGE
      });
    }

    const isOutbox = box === 'outbox';

    const result = await env.DB.prepare(
      `SELECT pm.id, pm.body, pm.attachments, pm.created_at, pm.read_at,
              s.username AS sender_username, r.username AS recipient_username
       FROM private_messages pm
       JOIN users s ON s.id = pm.sender_id
       JOIN users r ON r.id = pm.recipient_id
       WHERE ${isOutbox ? 'pm.sender_id = ?' : 'pm.recipient_id = ?'}
       ORDER BY pm.created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.id, PER_PAGE, offset).all();

    const messages = (result.results || []).map((m) => ({ ...m, attachments: parseAtt(m.attachments) }));

    return json({ box, messages, page, perPage: PER_PAGE, hasMore: messages.length === PER_PAGE });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'Login required' }, 401);

  if (!(await rateLimit(env, `pm:user:${user.id}`, 30, 3600))) {
    return json({ error: 'Too many messages per hour' }, 429);
  }

  let body;
  try { body = await readJson(request); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const toUsername = cleanText(body.toUsername, 32, false) || '';
  const messageBody = cleanText(body.body, 5000, true);
  const attachments = cleanAttachments(body.attachments);

  if (!toUsername || !messageBody) return json({ error: 'Recipient and message are required' }, 400);
  if (containsProhibited(messageBody)) return json({ error: 'Message violates platform rules' }, 400);

  try {
    const recipient = await env.DB.prepare('SELECT id, banned, pm_policy FROM users WHERE username = ? COLLATE NOCASE LIMIT 1')
      .bind(toUsername).first();

    if (!recipient) return json({ error: 'Recipient not found' }, 404);
    if (recipient.banned) return json({ error: 'Recipient is banned' }, 400);
    if (recipient.id === user.id) return json({ error: 'You cannot message yourself' }, 400);

    const policy = recipient.pm_policy || 'all';

    if (policy === 'none' && !isStaff(user)) {
      return json({ error: 'This user does not accept messages' }, 403);
    }

    if (policy === 'staff' && !isStaff(user)) {
      return json({ error: 'This user accepts messages from staff only' }, 403);
    }

    const inserted = await env.DB.prepare(
      'INSERT INTO private_messages (sender_id, recipient_id, body, attachments, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL) RETURNING id'
    ).bind(user.id, recipient.id, messageBody, JSON.stringify(attachments), Date.now()).first();

    await audit(env, { userId: user.id, action: 'pm_send', request, details: `to:${recipient.id}` });

    return json({ id: inserted?.id }, 201);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
