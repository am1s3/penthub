export async function onRequestGet({ params, env }) {
  const key = String(params.key || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!key) return new Response('Bad key', { status: 400 });

  try {
    const row = await env.DB.prepare('SELECT mime, data FROM files WHERE key = ?')
      .bind(key)
      .first();

    if (!row) return new Response('Not found', { status: 404 });

    return new Response(row.data, {
      headers: {
        'Content-Type': row.mime || 'application/octet-stream',
        'Cache-Control': 'public, max-age=2592000',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return new Response('Internal error', { status: 500 });
  }
}
