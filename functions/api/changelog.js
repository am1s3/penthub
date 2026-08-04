import {
  json,
  readJson,
  checkOrigin,
  getSessionUser,
  rateLimit,
  cleanText,
  audit
} from '../_utils.js';

const PER_PAGE = 20;

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return listChanges(request, env);
  if (request.method === 'POST') return createChange(request, env);
  return json({ error: 'Method not allowed' }, 405);
}

async function listChanges(request, env) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
    const offset = (page - 1) * PER_PAGE;

    const result = await env.DB.prepare(
      'SELECT id, version, title, body, created_at FROM changelog ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
      .bind(PER_PAGE, offset)
      .all();

    const items = result.results || [];
    const latest = items[0] || null;

    return json({
      items,
      latest_id: latest?.id ?? 0,
      page,
      perPage: PER_PAGE,
      hasMore: items.length === PER_PAGE
    });
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}

async function createChange(request, env) {
  if (!checkOrigin(request)) return json({ error: 'Bad origin' }, 403);

  const user = await getSessionUser(env, request);

  if (!user || !user.isAdmin) return json({ error: 'Admin only' }, 403);

  if (!(await rateLimit(env, `changelog:user:${user.id}`, 20, 3600))) {
    return json({ error: 'Too many changes' }, 429);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const version = cleanText(body.version, 20, false);
  const title = cleanText(body.title, 100, false);
  const content = cleanText(body.body, 3000, true);

  if (!version) return json({ error: 'Version is required' }, 400);
  if (!title) return json({ error: 'Title is required' }, 400);
  if (!content) return json({ error: 'Body is required' }, 400);

  try {
    const inserted = await env.DB.prepare(
      'INSERT INTO changelog (version, title, body, created_at) VALUES (?, ?, ?, ?) RETURNING id'
    )
      .bind(version, title, content, Date.now())
      .first();

    await audit(env, { userId: user.id, action: 'changelog_create', request, details: version });

    return json({ id: inserted?.id }, 201);
  } catch {
    return json({ error: 'Internal error' }, 500);
  }
}
