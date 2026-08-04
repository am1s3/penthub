function xmlEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
  });
}

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  const where = ['t.deleted = 0'];
  const params = [];

  if (category) {
    if (!/^[a-z0-9-]{3,64}$/.test(category)) {
      return new Response('Bad category', { status: 400 });
    }
    where.push('c.slug = ?');
    params.push(category);
  }

  try {
    const result = await env.DB.prepare(
      `
        SELECT
          t.id,
          t.title,
          t.updated_at,
          u.username AS author,
          c.name AS category_name,
          (
            SELECT p.body FROM posts p
            WHERE p.thread_id = t.id AND p.deleted = 0
            ORDER BY p.created_at ASC
            LIMIT 1
          ) AS first_body
        FROM threads t
        JOIN categories c ON c.id = t.category_id
        JOIN users u ON u.id = t.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.updated_at DESC
        LIMIT 20
      `
    )
      .bind(...params)
      .all();

    const items = result.results || [];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>PentHub${category ? ' · ' + xmlEsc(category) : ''}</title>
<link>${xmlEsc(origin)}</link>
<description>Legal pentesting and hardware security forum. Authorized research only.</description>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map(
    (i) => `<item>
<title>${xmlEsc(i.title)}</title>
<link>${xmlEsc(origin)}/#/thread/${Number(i.id)}</link>
<guid isPermaLink="false">penthub-thread-${Number(i.id)}</guid>
<pubDate>${new Date(i.updated_at).toUTCString()}</pubDate>
<author>${xmlEsc(i.author)}</author>
<category>${xmlEsc(i.category_name)}</category>
<description>${xmlEsc((i.first_body || '').slice(0, 500))}</description>
</item>`
  )
  .join('\n')}
</channel>
</rss>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch {
    return new Response('Internal error', { status: 500 });
  }
}
