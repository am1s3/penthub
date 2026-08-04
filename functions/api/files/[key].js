function toBytes(data) {
  if (data == null) return null;

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (typeof data === 'string') {
    let b64 = data;

    if (b64.startsWith('data:')) {
      b64 = b64.slice(b64.indexOf(',') + 1);
    }

    try {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }

  if (typeof data === 'object') {
    const vals = Object.values(data);
    if (vals.length && vals.every((v) => typeof v === 'number')) {
      return new Uint8Array(vals);
    }
  }

  return null;
}

export async function onRequestGet({ params, env }) {
  const key = String(params.key || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!key) return new Response('Bad key', { status: 400 });

  try {
    const row = await env.DB.prepare('SELECT mime, data FROM files WHERE key = ?')
      .bind(key)
      .first();

    if (!row) return new Response('Not found', { status: 404 });

    const bytes = toBytes(row.data);

    if (!bytes || !bytes.length) {
      return new Response('Unreadable format', { status: 500 });
    }

    return new Response(bytes.buffer, {
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
