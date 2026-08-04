import {
  json,
  checkOrigin,
  deleteSession
} from '../../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!checkOrigin(request)) {
    return json({ error: 'Bad origin' }, 403);
  }

  try {
    const cookie = await deleteSession(env, request);

    return json({ ok: true }, 200, {
      'Set-Cookie': cookie
    });
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
