import { json } from '../_utils.js';

export async function onRequestGet({ env }) {
  return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
}
