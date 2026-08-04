export const COOKIE_NAME = 'penthub_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PBKDF2_ITERATIONS = 60000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

export function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) {
    throw new Error('Invalid hex');
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

export function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const salt = hexToBytes(saltHex);

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations
    },
    keyMaterial,
    256
  );

  return toHex(bits);
}

export function cleanText(value, maxLength, preserveNewlines = true) {
  if (typeof value !== 'string') return null;

  let text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  if (!preserveNewlines) {
    text = text.replace(/\s+/g, ' ');
  }

  text = text.trim();

  if (!text || text.length > maxLength) {
    return null;
  }

  return text;
}

export function validUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

export function validPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password)
  );
}

export function containsProhibited(text) {
  if (!text) return false;

  const patterns = [
    /глушилк/i,
    /jammer/i,
    /деаутентифик/i,
    /deauth/i,
    /брутфорс/i,
    /brute\s?force/i,
    /подбор парол/i,
    /credential stuffing/i,
    /скиммер/i,
    /skimmer/i,
    /клонировани[ея] карт/i,
    /card cloning/i,
    /malware/i,
    /ransomware/i,
    /ботнет/i,
    /botnet/i,
    /ddos/i,
    /steal\s+password/i,
    /взлом аккаунта/i,
    /угон сессии/i,
    /session hijack/i
  ];

  return patterns.some((pattern) => pattern.test(text));
}

export function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function checkOrigin(request) {
  const origin = request.headers.get('origin');

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function readJson(request, maxBytes = 16384) {
  const contentLength = request.headers.get('content-length');

  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error('Body too large');
  }

  const text = await request.text();

  if (text.length > maxBytes) {
    throw new Error('Body too large');
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON');
  }
}

export function parseCookies(header) {
  const out = {};

  if (!header) return out;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;

    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();

    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }

  return out;
}

export function getCookie(request, name) {
  const cookies = parseCookies(request.headers.get('cookie'));
  return cookies[name] || null;
}

export function setCookie(name, value, maxAgeSec) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearCookie(name) {
  return `${name}==; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createSession(env, userId, ip) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(tokenHash, userId, now, expiresAt, ip)
    .run();

  return setCookie(COOKIE_NAME, token, Math.floor(SESSION_TTL_MS / 1000));
}

export async function getSessionUser(env, request) {
  const token = getCookie(request, COOKIE_NAME);

  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  const row = await env.DB.prepare(
    `
      SELECT
        s.token_hash AS session_token_hash,
        u.id AS user_id,
        u.username,
        u.is_admin,
        u.is_moderator,
        u.banned
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
      LIMIT 1
    `
  )
    .bind(tokenHash, now)
    .first();

  if (!row) return null;

  if (row.banned) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(row.session_token_hash)
      .run();

    return null;
  }

  return {
    id: row.user_id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    isModerator: Boolean(row.is_moderator)
  };
}

export function isStaff(user) {
  return Boolean(user && (user.isAdmin || user.isModerator));
}

export async function deleteSession(env, request) {
  const token = getCookie(request, COOKIE_NAME);

  if (token) {
    const tokenHash = await sha256Hex(token);

    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run();
  }

  return clearCookie(COOKIE_NAME);
}

export async function rateLimit(env, rawKey, limit, windowSec) {
  const key = String(rawKey || 'global').slice(0, 190);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);

  try {
    const row = await env.DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
      .bind(key)
      .first();

    if (!row) {
      await env.DB.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
        .bind(key, windowStart)
        .run();

      return true;
    }

    if (row.window_start !== windowStart) {
      await env.DB.prepare('UPDATE rate_limits SET window_start = ?, count = 1 WHERE key = ?')
        .bind(windowStart, key)
        .run();

      return true;
    }

    if (row.count >= limit) {
      return false;
    }

    await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
      .bind(key)
      .run();

    return true;
  } catch {
    return true;
  }
}

export async function audit(env, { userId = null, action, request = null, details = '' }) {
  try {
    const ip = request ? getClientIp(request) : null;
    const safeDetails = cleanText(details, 1000, false) || '';

    await env.DB.prepare(
      'INSERT INTO audit_logs (user_id, action, ip, details, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(userId, action, ip, safeDetails, Date.now())
      .run();
  } catch {
    // аудит не роняет основной запрос
  }
}
