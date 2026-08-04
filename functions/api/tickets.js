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

const PER_PAGE = 20;

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return listTickets(request, env);
  if (request.method === 'POST') return postAction(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function listTickets(request, env) {
  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  const url = new URL(request.url);
  const id = Number.parseInt(url.searchParams.get('id') || '', 10);

  if (Number.isInteger(id)) {
    const ticket = await env.DB.prepare(
      'SELECT id, user_id, subject, status, created_at, updated_at FROM tickets WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!ticket || (ticket.user_id !== user.id && !isStaff(user))) {
      return json({ error: 'Ticket not found' }, 404);
    }

    const messages = await env.DB.prepare(
      `SELECT m.id, m.user_id, m.body, m.is_staff, m.created_at, u.username, u.is_admin
       FROM ticket_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.ticket_id = ?
       ORDER BY m.created_at ASC`
    )
      .bind(id)
      .all();

    return json({ ticket, messages: messages.results || [] });
  }

  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  try {
    let result;

    if (isStaff(user)) {
      result = await env.DB.prepare(
        `SELECT t.id, t.subject, t.status, t.created_at, t.updated_at, u.username
         FROM tickets t
         JOIN users u ON u.id = t.user_id
         ORDER BY t.updated_at DESC
         LIMIT ? OFFSET ?`
      )
        .bind(PER_PAGE, offset)
        .all();
    } else {
      result = await env.DB.prepare(
        `SELECT t.id, t.subject, t.status, t.created_at, t.updated_at
         FROM tickets t
         WHERE t.user_id = ?
         ORDER BY t.updated_at DESC
         LIMIT ? OFFSET ?`
      )
        .bind(user.id, PER_PAGE, offset)
        .all();
    }

    const tickets = result.results || [];

    return json({ tickets, page, perPage: PER_PAGE, hasMore: tickets.length === PER_PAGE });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function postAction(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);

  if (!user) return json({ error: 'Login required' }, 401);

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = body.action;

  try {
    if (action === 'create') {
      if (!(await rateLimit(env, `tickets:user:${user.id}`, 5, 3600))) {
        return json({ error: 'Too many tickets per hour' }, 429);
      }

      const subject = cleanText(body.subject, 100, false);
      const msg = cleanText(body.body, 5000, true);

      if (!subject) return json({ error: 'Subject is required' }, 400);
      if (!msg) return json({ error: 'Message is required' }, 400);

      const now = Date.now();

      const ticket = await env.DB.prepare(
        'INSERT INTO tickets (user_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id'
      )
        .bind(user.id, subject, 'open', now, now)
        .first();

      if (!ticket) return json({ error: 'Failed to create ticket' }, 500);

      await env.DB.prepare(
        'INSERT INTO ticket_messages (ticket_id, user_id, body, is_staff, created_at) VALUES (?, ?, ?, 0, ?)'
      )
        .bind(ticket.id, user.id, msg, now)
        .run();

      await audit(env, { userId: user.id, action: 'ticket_create', request, details: String(ticket.id) });

      return json({ id: ticket.id }, 201);
    }

    if (action === 'reply') {
      if (!(await rateLimit(env, `ticket-reply:user:${user.id}`, 30, 3600))) {
        return json({ error: 'Too many replies' }, 429);
      }

      const ticketId = Number.parseInt(body.ticketId, 10);
      const msg = cleanText(body.body, 5000, true);

      if (!Number.isInteger(ticketId)) return json({ error: 'Invalid ticketId' }, 400);
      if (!msg) return json({ error: 'Message is required' }, 400);

      const ticket = await env.DB.prepare('SELECT id, user_id, status FROM tickets WHERE id = ?').bind(ticketId).first();

      if (!ticket) return json({ error: 'Ticket not found' }, 404);

      if (ticket.user_id !== user.id && !isStaff(user)) {
        return json({ error: 'No permission' }, 403);
      }

      if (ticket.status === 'closed' && !isStaff(user)) {
        return json({ error: 'Ticket is closed' }, 403);
      }

      const now = Date.now();
      const staff = isStaff(user) ? 1 : 0;

      await env.DB.prepare(
        'INSERT INTO ticket_messages (ticket_id, user_id, body, is_staff, created_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(ticketId, user.id, msg, staff, now)
        .run();

      await env.DB.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').bind(now, ticketId).run();

      return json({ ok: true });
    }

    if (action === 'close' || action === 'reopen') {
      if (!isStaff(user)) return json({ error: 'Staff only' }, 403);

      const ticketId = Number.parseInt(body.ticketId, 10);

      if (!Number.isInteger(ticketId)) return json({ error: 'Invalid ticketId' }, 400);

      await env.DB.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?')
        .bind(action === 'close' ? 'closed' : 'open', Date.now(), ticketId)
        .run();

      await audit(env, { userId: user.id, action: `ticket_${action}`, request, details: String(ticketId) });

      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
