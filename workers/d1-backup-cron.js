export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBackup(env));
  },

  async fetch() {
    return new Response('PentHub D1 backup cron. Работает только по cron.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};

async function runBackup(env) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID}/backup`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    console.error('D1 backup failed:', res.status, JSON.stringify(data));
    return;
  }

  console.log('D1 backup created:', JSON.stringify(data.result || {}));
}
