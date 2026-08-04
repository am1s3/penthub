export async function onRequestGet({ params, env }) {
  if (!env.FILES) return new Response('Not configured', { status: 500 });

  const key = String(params.key || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!key) return new Response('Bad key', { status: 400 });

  const obj = await env.FILES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=2592000');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(obj.body, { headers });
}
