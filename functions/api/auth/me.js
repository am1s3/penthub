import {
  json,
  getSessionUser
} from '../../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const user = await getSessionUser(env, request);

    if (!user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    return json(user);
  } catch {
    return json({ error: 'Внутренняя ошибка' }, 500);
  }
}
