export async function onRequestGet({ params, env }) {
  const key = String(params.key || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!key) return new Response('Bad key', { status: 400 });

  try {
    const row = await env.DB.prepare('SELECT mime, data FROM files WHERE key = ?')
      .bind(key)
      .first();

    if (!row || row.data == null) {
      return new Response('Not found', { status: 404 });
    }

    let body;

    if (row.data instanceof ArrayBuffer) {
      body = row.data;
    } else if (ArrayBuffer.isView(row.data)) {
      body = row.data.buffer;
    } else if (typeof row.data === 'string') {
      const bin = atob(row.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      body = bytes.buffer;
    } else {
      return new Response('Unreadable format', { status: 500 });
    }

    return new Response(body, {
      headers: {
        'Content-Type': row.mime || 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return new Response('Internal error', { status: 500 });
  }
}
