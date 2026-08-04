const app = document.getElementById('app');
const topActions = document.getElementById('top-actions');
const sidebar = document.getElementById('sidebar');
const rightbar = document.getElementById('rightbar');
const modal = document.getElementById('modal');
const recoveryModal = document.getElementById('recovery-modal');
const banBar = document.getElementById('ban-bar');
const whatsnewBar = document.getElementById('whatsnew-bar');
const shareMenu = document.getElementById('share-menu');

const REACTION_EMOJIS = ['👍', '🔥', '🧠', '😂', '❤️', '🛡️'];

const ICONS = {
  home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21h4"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5 8-5s6.5 1 8 5"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h14v18H5z"/><path d="M9 3v18"/></svg>',
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  help: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/><circle cx="12" cy="17" r="0.5"/></svg>',
  grad: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5"/></svg>'
};

const state = {
  me: null,
  categories: [],
  sections: {},
  config: null,
  turnstileToken: null,
  turnstileWidget: null,
  changelogSeenId: Number(localStorage.getItem('penthub_changelog_seen') || 0),
  welcomeSeen: Boolean(localStorage.getItem('penthub_welcome_seen'))
};

let reportPostId = null;
let menuStack = [];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function mdInline(s) {
  let t = s;
  t = t.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
  t = t.replace(/\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g, (m, label, url) => {
    if (!/^https?:\/\//i.test(url)) return label;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  t = t.replace(/\*\*([^*]{1,300}?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]{1,300}?)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}

function mdToHtml(src) {
  const escaped = esc(src || '');
  const blocks = [];
  let text = escaped.replace(/```([\s\S]*?)```/g, (m, code) => {
    blocks.push(code.replace(/^\n+/, '').replace(/\n+$/, ''));
    return `\u0000B${blocks.length - 1}\u0000`;
  });

  const lines = text.split('\n');
  const out = [];
  let listType = null;
  let para = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(mdInline).join('<br>')}</p>`); para = []; }
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const line of lines) {
    const blockMatch = line.match(/^\u0000B(\d+)\u0000$/);
    if (blockMatch) { flushPara(); closeList(); out.push(`<pre class="code-block"><code>${blocks[Number(blockMatch[1])]}</code></pre>`); continue; }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) { flushPara(); closeList(); const level = h[1].length + 2; out.push(`<h${level}>${mdInline(h[2])}</h${level}>`); continue; }

    if (/^&gt;\s?/.test(line)) { flushPara(); closeList(); out.push(`<blockquote>${mdInline(line.replace(/^&gt;\s?/, ''))}</blockquote>`); continue; }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${mdInline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${mdInline(ol[1])}</li>`);
      continue;
    }

    if (line.trim() === '') { flushPara(); closeList(); continue; }
    closeList();
    para.push(line);
  }

  flushPara();
  closeList();
  return out.join('\n');
}

function time(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function toast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

function isStaff() { return Boolean(state.me && (state.me.isAdmin || state.me.isModerator)); }

const AV = ['av0', 'av1', 'av2', 'av3', 'av4', 'av5', 'av6', 'av7'];

function avatarHtml(username, extra = '', avatarData = '') {
  const n = username || '?';
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const inner = avatarData ? `<img src="${esc(avatarData)}" alt="">` : esc(n[0].toUpperCase());
  return `<span class="avatar ${AV[h % 8]} ${extra}">${inner}</span>`;
}

function displayName(user) {
  return user.display_name || user.author_display || user.username;
}

function badgesHtml(badges, user) {
  const list = [];
  if (user?.is_admin) list.push('<span class="badge-chip" style="color:var(--green);border-color:rgba(63,185,80,0.4)">★ admin</span>');
  if (user?.is_moderator) list.push('<span class="badge-chip" style="color:var(--blue);border-color:rgba(88,166,255,0.4)">⚡ moderator</span>');
  for (const b of badges || []) {
    list.push(`<span class="badge-chip" style="color:${esc(b.color)};border-color:${esc(b.color)}40">${esc(b.icon)} ${esc(b.label)}</span>`);
  }
  return list.length ? `<span class="badges">${list.join('')}</span>` : '';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Fetch', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    if (response.status === 401) state.me = null;
    throw error;
  }

  return data;
}

async function loadMe() {
  try { state.me = await api('/api/auth/me'); } catch { state.me = null; }
  syncChromeState();
}

function syncChromeState() {
  if (!state.me) {
    banBar.classList.add('hidden');
    whatsnewBar.classList.add('hidden');
    return;
  }

  if (state.me.banned) {
    banBar.classList.remove('hidden');
    banBar.innerHTML = `
      <div>
        <strong>Account suspended.</strong> Reason: ${esc(state.me.ban_reason || '—')}
        <span class="muted"> · ${state.me.banned_at ? time(state.me.banned_at) : ''}</span>
      </div>
      <div class="top-actions">
        <a class="btn small" href="#/appeal">Appeal</a>
        <button id="ban-logout" class="btn danger small">Log out</button>
      </div>
    `;
    document.getElementById('ban-logout')?.addEventListener('click', logout);
  } else {
    banBar.classList.add('hidden');
  }

  const latestId = Number(state.me.changelog_latest_id || 0);

  if (latestId > state.changelogSeenId) {
    whatsnewBar.classList.remove('hidden');
    whatsnewBar.innerHTML = `
      <div><strong>What's new</strong> · version ${esc(state.me.changelog_latest_version || '')} is out.</div>
      <div class="top-actions">
        <a class="btn small" href="#/changelog">See changes</a>
        <button id="whatsnew-dismiss" class="btn ghost small">Dismiss</button>
      </div>
    `;
    document.getElementById('whatsnew-dismiss')?.addEventListener('click', () => {
      state.changelogSeenId = latestId;
      localStorage.setItem('penthub_changelog_seen', String(latestId));
      whatsnewBar.classList.add('hidden');
    });
  } else {
    whatsnewBar.classList.add('hidden');
  }
}

async function loadConfig() {
  try { state.config = await api('/api/config'); } catch { state.config = null; }
}

async function ensureCategories(force = false) {
  if (!state.categories.length || force) {
    const data = await api('/api/categories');
    state.categories = data.categories || [];
    state.sections = data.sections || {};
  }
  return state.categories;
}

function renderTurnstile() {
  const box = document.getElementById('turnstile-box');
  if (!box) return;
  const siteKey = state.config?.turnstileSiteKey;
  if (!siteKey || !window.turnstile) { box.innerHTML = ''; return; }

  if (state.turnstileWidget !== null) {
    try { window.turnstile.remove(state.turnstileWidget); } catch { /* ignore */ }
  }

  state.turnstileToken = null;

  state.turnstileWidget = window.turnstile.render(box, {
    sitekey: siteKey,
    theme: 'dark',
    callback: (token) => { state.turnstileToken = token; },
    'expired-callback': () => { state.turnstileToken = null; },
    'error-callback': () => { state.turnstileToken = null; }
  });
}

function resetTurnstile() {
  state.turnstileToken = null;
  if (window.turnstile && state.turnstileWidget !== null) {
    try { window.turnstile.reset(state.turnstileWidget); } catch { /* ignore */ }
  }
}

function showRecoveryModal(code) {
  document.getElementById('recovery-code').textContent = code;
  recoveryModal.classList.remove('hidden');
}

function closeRecoveryModal() { recoveryModal.classList.add('hidden'); }

function userLink(user) {
  const u = typeof user === 'string' ? { username: user } : user;
  const label = u.display_name ? `${esc(u.display_name)} <span class="muted">@${esc(u.username)}</span>` : `@${esc(u.username)}`;
  return `<a href="#/user/${encodeURIComponent(u.username)}">${label}</a>`;
}

function updateTopbar() {
  if (!topActions) return;

  if (state.me) {
    const unreadPm = Number(state.me.unread_count || 0);
    const unreadNtf = Number(state.me.notifications_unread || 0);

    topActions.innerHTML = `
      <a class="icon-btn" href="#/notifications" title="Notifications">${ICONS.bell}${unreadNtf ? `<span class="icon-count">${unreadNtf}</span>` : ''}</a>
      <a class="icon-btn" href="#/messages" title="Messages">${ICONS.mail}${unreadPm ? `<span class="icon-count">${unreadPm}</span>` : ''}</a>
      <a class="btn small" href="#/new-thread">+ New</a>
    `;
  } else {
    topActions.innerHTML = `
      <a class="btn ghost small" href="#/login">Log in</a>
      <a class="btn small" href="#/register">Register</a>
    `;
  }
}

function updateSidebar() {
  if (!sidebar) return;

  const ntf = Number(state.me?.notifications_unread || 0);
  const pm = Number(state.me?.unread_count || 0);
  const active = location.hash.replace(/^#\/?/, '').split('?')[0];

  const main = [
    { href: '', label: 'Home', icon: ICONS.home },
    { href: 'categories', label: 'Categories', icon: ICONS.grid },
    { href: 'learn', label: 'Learn', icon: ICONS.grad },
    { href: 'firmware', label: 'Firmware Hub', icon: ICONS.book },
    { href: 'releases', label: 'Releases', icon: ICONS.share },
    { href: 'rules', label: 'Rules', icon: ICONS.shield },
    { href: 'support', label: 'Support', icon: ICONS.help }
  ];

  const account = [
    state.me ? { href: 'notifications', label: 'Notifications', icon: ICONS.bell, count: ntf } : null,
    state.me ? { href: 'messages', label: 'Messages', icon: ICONS.mail, count: pm } : null,
    state.me ? { href: `user/${encodeURIComponent(state.me.username)}`, label: 'Profile', icon: ICONS.user } : null,
    state.me ? { href: 'settings', label: 'Settings', icon: ICONS.settings } : null,
    isStaff() ? { href: 'admin', label: 'Admin', icon: ICONS.shield } : null,
    state.me ? { href: '__logout__', label: 'Log out', icon: '✕', danger: true } : null
  ].filter(Boolean);

  const sideItem = (item) => {
    const isActive = active === item.href || (item.href && active.startsWith(item.href + '/'));
    const cls = `side-item ${isActive ? 'active' : ''} ${item.danger ? 'danger' : ''}`;
    const count = item.count ? `<span class="side-count">${item.count}</span>` : '';

    if (item.href === '__logout__') {
      return `<button class="${cls}" data-logout="1">${item.icon}<span>${item.label}</span>${count}</button>`;
    }

    return `<a class="${cls}" href="#/${item.href}">${item.icon}<span>${item.label}</span>${count}</a>`;
  };

  sidebar.innerHTML = `
    ${main.map(sideItem).join('')}
    ${account.length ? '<div class="side-section">Account</div>' : ''}
    ${account.map(sideItem).join('')}
  `;

  sidebar.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
}

async function updateRightbar() {
  if (!rightbar) return;

  let releasesBox = '';

  try {
    const rel = await api('/api/releases');
    const items = (rel.releases || []).slice(0, 4);

    if (items.length) {
      releasesBox = `
        <div class="box">
          <h3>Latest releases</h3>
          ${items.map((r) => `
            <div class="box-row">
              <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source)} ${esc(r.tag)}</a>
            </div>
          `).join('')}
          <p class="muted" style="margin-top:8px"><a href="#/releases">All releases →</a></p>
        </div>
      `;
    }
  } catch {
    // releases are optional
  }

  const totalThreads = state.categories.reduce((a, c) => a + Number(c.thread_count || 0), 0);

  rightbar.innerHTML = `
    <div class="box">
      <h3>Community</h3>
      <div class="box-row"><span class="muted">Categories</span><span>${state.categories.length}</span></div>
      <div class="box-row"><span class="muted">Threads</span><span>${totalThreads}</span></div>
      <div class="box-row"><span class="muted">Sections</span><span>${Object.keys(state.sections).length}</span></div>
    </div>
    ${releasesBox}
    <div class="box">
      <h3>Legal & safety</h3>
      <p class="muted">Authorized research only. Your own devices, networks and accounts, or written permission.</p>
      <p><a href="#/rules">Rules</a> · <a href="#/terms">Terms</a> · <a href="#/privacy">Privacy</a></p>
      <p><a href="/api/rss">RSS feed</a> · <a href="#/changelog">What's new</a></p>
    </div>
  `;
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  state.me = null;
  updateTopbar();
  updateSidebar();
  banBar.classList.add('hidden');
  whatsnewBar.classList.add('hidden');
  location.hash = '#/';
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, queryString] = raw.split('?');
  const segments = path ? path.split('/').filter(Boolean) : [];
  const query = new URLSearchParams(queryString || '');
  return { segments, query };
}

function pageLink(base, page) { return `${base}${base.includes('?') ? '&' : '?'}page=${page}`; }

function paginationHtml(base, page, hasMore) {
  if (page <= 1 && !hasMore) return '';
  return `
    <nav class="pagination">
      ${page > 1 ? `<a class="btn ghost small" href="${pageLink(base, page - 1)}">Back</a>` : ''}
      <span class="muted">Page ${page}</span>
      ${hasMore ? `<a class="btn ghost small" href="${pageLink(base, page + 1)}">Next</a>` : ''}
    </nav>
  `;
}

function shareUrl(url, title) {
  shareMenu.classList.remove('hidden');
  shareMenu.innerHTML = `
    <strong>Share</strong>
    <button data-share-copy>Copy link</button>
    <button data-share-twitter>Twitter / X</button>
    <button data-share-reddit>Reddit</button>
    <button data-share-hn>Hacker News</button>
    <button data-share-close class="danger">Close</button>
  `;

  const encoded = encodeURIComponent(url);
  const t = encodeURIComponent(title || '');

  shareMenu.querySelector('[data-share-copy]').addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast('Link copied');
    }
    shareMenu.classList.add('hidden');
  });

  shareMenu.querySelector('[data-share-twitter]').addEventListener('click', () => {
    window.open(`https://twitter.com/intent/tweet?text=${t}&url=${encoded}`, '_blank', 'noopener');
    shareMenu.classList.add('hidden');
  });

  shareMenu.querySelector('[data-share-reddit]').addEventListener('click', () => {
    window.open(`https://www.reddit.com/submit?url=${encoded}&title=${t}`, '_blank', 'noopener');
    shareMenu.classList.add('hidden');
  });

  shareMenu.querySelector('[data-share-hn]').addEventListener('click', () => {
    window.open(`https://news.ycombinator.com/submitlink?u=${encoded}&t=${t}`, '_blank', 'noopener');
    shareMenu.classList.add('hidden');
  });

  shareMenu.querySelector('[data-share-close]').addEventListener('click', () => shareMenu.classList.add('hidden'));
}

function shareButtonHtml(url, title) {
  return `<button class="action" data-share-url="${esc(url)}" data-share-title="${esc(title)}">${ICONS.share} Share</button>`;
}

function attachShareHandlers(root = document) {
  root.querySelectorAll('[data-share-url]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const full = b.dataset.shareUrl.startsWith('http') ? b.dataset.shareUrl : `${location.origin}${b.dataset.shareUrl}`;
      shareUrl(full, b.dataset.shareTitle || '');
    });
  });
}

function threadRowHtml(t) {
  return `
    <a class="feed-row" href="#/thread/${Number(t.id)}">
      ${avatarHtml(t.author, '', t.author_avatar || '')}
      <div class="feed-main">
        <div class="feed-head">
          <span class="feed-name">${esc(t.author_display || t.author || 'unknown')}</span>
          ${badgesHtml(t.badges, t)}
          <span class="muted">· ${time(t.updated_at)}</span>
        </div>
        <h3 class="feed-title">
          ${t.is_pinned ? '<span class="chip warn">pinned</span> ' : ''}
          ${t.is_locked ? '<span class="chip">locked</span> ' : ''}
          ${esc(t.title)}
        </h3>
        <div class="feed-tags">
          ${(t.tags || []).map((tag) => `<span class="chip tag">#${esc(tag)}</span>`).join('')}
          <span class="chip">${esc(t.category_name || '')}</span>
          <span class="muted">${Number(t.post_count || 0)} replies</span>
        </div>
      </div>
    </a>
  `;
}

function renderHome() {
  return async function homeView() {
    if (!state.welcomeSeen) { location.hash = '#/welcome'; return; }

    const data = await api('/api/threads?page=1');
    const threads = data.threads || [];
    const totalThreads = state.categories.reduce((a, c) => a + Number(c.thread_count || 0), 0);

    app.innerHTML = `
      <section class="welcome-hero" style="text-align:left;padding:24px">
        <h1 style="font-size:1.4rem">Your legal security lab community</h1>
        <p style="margin:6px 0 0">${state.categories.length} categories · ${totalThreads} threads · authorized research only</p>
      </section>

      ${state.me ? `
        <div class="composer">
          ${avatarHtml(state.me.username, '', state.me.avatar || '')}
          <a class="fake" href="#/new-thread">Share a legal finding, lab report or question...</a>
          <a class="btn small" href="#/new-thread">Post</a>
        </div>
      ` : `
        <div class="notice info">
          Welcome to PentHub — a forum for legal pentesting, hardware labs, CTF and defensive security.
          <a href="#/register">Join</a> to post. <a href="#/rules">Rules</a>.
        </div>
      `}

      <section class="page-head">
        <h2>Latest threads</h2>
        ${shareButtonHtml(`${location.origin}/#/`, 'PentHub — legal pentesting forum')}
      </section>

      ${threads.length ? threads.map(threadRowHtml).join('') : '<section class="empty">No threads yet.</section>'}

      ${paginationHtml('#/', 1, Boolean(data.hasMore))}
    `;

    attachShareHandlers(app);
  };
}

function renderCategories() {
  return async function categoriesView() {
    await ensureCategories();

    const sections = Object.keys(state.sections).sort();

    app.innerHTML = `
      <section class="page-head">
        <h1>Categories</h1>
        ${state.me ? '<a class="btn small" href="#/new-thread">New thread</a>' : ''}
      </section>

      ${sections.map((s) => `
        <section class="page-head" style="margin-top:20px"><h2>${esc(s)}</h2></section>
        <div class="feature-grid">
          ${(state.sections[s] || []).map((c) => `
            <a class="feature-card" href="#/category/${encodeURIComponent(c.slug)}">
              <h3>${esc(c.name)}</h3>
              <p>${esc(c.description)}</p>
              <p class="muted" style="margin-top:8px">${Number(c.thread_count || 0)} threads</p>
            </a>
          `).join('')}
        </div>
      `).join('')}
    `;
  };
}

function renderSection(section, query) {
  return async function sectionView() {
    await ensureCategories();
    const cats = state.sections[section] || [];

    if (!cats.length) throw new Error('Section not found');

    const page = Math.max(1, Number(query.get('page') || 1) || 1);

    const responses = await Promise.all(
      cats.map((c) => api(`/api/threads?category=${encodeURIComponent(c.slug)}&page=${page}`))
    );

    const allThreads = responses.flatMap((r) => r.threads || []);

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h1>${esc(section)}</h1>
          <p class="muted">${cats.length} categories</p>
        </div>
      </section>

      <div class="feature-grid">
        ${cats.map((c) => `
          <a class="feature-card" href="#/category/${encodeURIComponent(c.slug)}">
            <h3>${esc(c.name)}</h3>
            <p>${esc(c.description)}</p>
          </a>
        `).join('')}
      </div>

      <section class="page-head"><h2>Latest in ${esc(section)}</h2></section>
      ${allThreads.length ? allThreads.map(threadRowHtml).join('') : '<section class="empty">No threads in this section.</section>'}
    `;
  };
}

function renderCategory(slug, query) {
  return async function categoryView() {
    if (!slug) return renderHome()();

    const categories = await ensureCategories();
    const category = categories.find((item) => item.slug === slug);

    if (!category) throw new Error('Category not found');

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/threads?category=${encodeURIComponent(slug)}&page=${page}`);
    const threads = data.threads || [];
    const base = `#/category/${encodeURIComponent(slug)}`;

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h1>${esc(category.name)}</h1>
          <p class="muted">${esc(category.description)} · ${esc(category.section)}</p>
        </div>
        <div class="top-actions">
          ${state.me ? `<a class="btn small" href="#/new-thread?category=${encodeURIComponent(slug)}">New thread</a>` : ''}
          ${shareButtonHtml(`${location.origin}/#/category/${encodeURIComponent(slug)}`, category.name)}
        </div>
      </section>

      ${threads.length ? threads.map(threadRowHtml).join('') : '<section class="empty">No threads yet.</section>'}

      ${paginationHtml(base, page, Boolean(data.hasMore))}
    `;

    attachShareHandlers(app);
  };
}

function renderTag(tag, query) {
  return async function tagView() {
    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/threads?tag=${encodeURIComponent(tag)}&page=${page}`);
    const threads = data.threads || [];
    const base = `#/tag/${encodeURIComponent(tag)}`;

    app.innerHTML = `
      <section class="page-head"><h1><span class="chip tag">#${esc(tag)}</span></h1></section>
      ${threads.length ? threads.map(threadRowHtml).join('') : '<section class="empty">No threads with this tag.</section>'}
      ${paginationHtml(base, page, Boolean(data.hasMore))}
    `;
  };
}

function openMenu(el) {
  closeMenus();
  el.classList.add('open');
  menuStack.push(el);
}

function closeMenus() {
  for (const m of menuStack) m.classList.remove('open');
  menuStack = [];
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) closeMenus();
  if (!e.target.closest('.share-menu') && !e.target.closest('[data-share-url]')) {
    shareMenu?.classList.add('hidden');
  }
});

// === THREAD ===

function threadAdminHtml(thread) {
  if (!isStaff()) return '';

  return `
    <div class="menu-wrap">
      <button class="icon-btn" data-menu-toggle="thread-admin">${ICONS.dots}</button>
      <div class="menu" data-menu="thread-admin">
        <button data-admin-thread="${thread.id}" data-admin-action="${thread.is_locked ? 'unlock' : 'lock'}">
          ${thread.is_locked ? 'Unlock thread' : 'Lock thread'}
        </button>
        <button data-admin-thread="${thread.id}" data-admin-action="${thread.is_pinned ? 'unpin' : 'pin'}">
          ${thread.is_pinned ? 'Unpin thread' : 'Pin thread'}
        </button>
        <button data-admin-thread="${thread.id}" data-admin-action="delete" class="danger">Delete thread</button>
      </div>
    </div>
  `;
}

function reactionsHtml(post) {
  const counts = post.reactions || [];

  const countButtons = counts
    .map((r) => `
      <button class="action ${post.my_reaction === r.emoji ? 'active' : ''}" data-react-post="${post.id}" data-react-emoji="${r.emoji}">
        ${r.emoji} ${r.count}
      </button>
    `)
    .join('');

  return `
    <div class="action-bar">
      ${countButtons}
      <div class="menu-wrap">
        <button class="action" data-menu-toggle="react-${post.id}">+ react</button>
        <div class="menu" data-menu="react-${post.id}">
          ${REACTION_EMOJIS.map((e) => `<button data-react-post="${post.id}" data-react-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function actionBarHtml(post) {
  const canEdit = state.me && (state.me.id === post.user_id || isStaff());

  return `
    <div class="action-bar">
      ${shareButtonHtml(`${location.origin}/#/thread/${post.thread_id}`, `Post by @${post.username}`)}
      ${canEdit ? `<button class="action" data-edit-post="${post.id}">Edit</button>` : ''}
      ${state.me ? `<button class="action" data-report-post="${post.id}">Report</button>` : ''}
      ${isStaff() ? `
        <div class="menu-wrap">
          <button class="action" data-menu-toggle="post-menu-${post.id}">${ICONS.dots} More</button>
          <div class="menu" data-menu="post-menu-${post.id}">
            <button data-admin-post="${post.id}" data-admin-action="delete" class="danger">Delete post</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function postHtml(post) {
  const edited = post.updated_at > post.created_at ? '<span class="edited">(edited)</span>' : '';

  return `
    <article class="post" id="post-${post.id}">
      ${avatarHtml(post.username, '', post.avatar || '')}
      <div class="post-main">
        <div class="feed-head">
          <span class="feed-name">${userLink(post)}</span>
          ${badgesHtml(post.badges, post)}
          <span class="muted">· ${time(post.created_at)} ${edited}</span>
        </div>
        <div class="post-body">${mdToHtml(post.body)}</div>
        ${state.me ? reactionsHtml(post) : ''}
        ${actionBarHtml(post)}
      </div>
    </article>
  `;
}

function replyFormHtml(thread) {
  if (!state.me) return `<p class="notice"><a href="#/login">Log in</a> to reply.</p>`;
  if (thread.is_locked && !isStaff()) return `<p class="notice warn">Thread is locked.</p>`;

  return `
    <form id="reply-form" class="form">
      <label>
        Reply
        <textarea id="reply-body" maxlength="10000" required minlength="1"></textarea>
      </label>
      <p class="muted">Markdown: **bold**, *italic*, \`code\`, \`\`\`blocks\`\`\`, lists, &gt; quotes, [link](https://...), @mentions</p>
      <button class="btn" type="submit">Reply</button>
      <div id="reply-error" class="form-error"></div>
    </form>
  `;
}

function renderThread(id, query) {
  return async function threadView() {
    const threadId = Number(id);
    if (!Number.isInteger(threadId)) throw new Error('Invalid thread');

    const page = Math.max(1, Number(query.get('page') || 1) || 1);

    const [{ thread }, postsData] = await Promise.all([
      api(`/api/thread?id=${threadId}`),
      api(`/api/posts?threadId=${threadId}&page=${page}`)
    ]);

    const posts = postsData.posts || [];
    const base = `#/thread/${threadId}`;

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h1>${esc(thread.title)}</h1>
          <div class="feed-tags">
            <a class="chip" href="#/category/${encodeURIComponent(thread.category_slug)}">${esc(thread.category_name)}</a>
            ${(thread.tags || []).map((tag) => `<a class="chip tag" href="#/tag/${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join('')}
            <span class="muted">by ${userLink(thread)} · ${time(thread.created_at)}</span>
          </div>
        </div>
        <div class="top-actions">
          ${shareButtonHtml(`${location.origin}/#/thread/${threadId}`, thread.title)}
          ${threadAdminHtml(thread)}
        </div>
      </section>

      <section>${posts.map(postHtml).join('')}</section>

      ${paginationHtml(base, page, Boolean(postsData.hasMore))}

      <section class="card">
        <h2>Reply</h2>
        ${replyFormHtml(thread)}
      </section>
    `;

    bindThreadPage(thread, posts);
    attachShareHandlers(app);
  };
}

function bindThreadPage(thread, posts) {
  const replyForm = document.getElementById('reply-form');

  if (replyForm) {
    replyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('reply-error');
      const body = document.getElementById('reply-body').value;

      try {
        await api('/api/posts', { method: 'POST', body: JSON.stringify({ threadId: thread.id, body }) });
        toast('Reply published');
        await render();
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  }

  document.querySelectorAll('[data-report-post]').forEach((button) => {
    button.addEventListener('click', () => openReportModal(Number(button.dataset.reportPost)));
  });

  document.querySelectorAll('[data-edit-post]').forEach((button) => {
    button.addEventListener('click', () => {
      const post = posts.find((p) => p.id === Number(button.dataset.editPost));
      if (post) startEditPost(post);
    });
  });

  document.querySelectorAll('[data-react-post]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api('/api/react', {
          method: 'POST',
          body: JSON.stringify({ postId: Number(button.dataset.reactPost), emoji: button.dataset.reactEmoji })
        });
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('[data-admin-thread]').forEach((button) => {
    button.addEventListener('click', () => adminAction('thread', Number(button.dataset.adminThread), button.dataset.adminAction));
  });

  document.querySelectorAll('[data-admin-post]').forEach((button) => {
    button.addEventListener('click', () => adminAction('post', Number(button.dataset.adminPost), button.dataset.adminAction));
  });

  document.querySelectorAll('[data-menu-toggle]').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = button.dataset.menuToggle;
      const menu = button.parentElement.querySelector(`[data-menu="${name}"]`);
      if (menu) openMenu(menu);
    });
  });

  attachShareHandlers(app);
}

function startEditPost(post) {
  const article = document.getElementById(`post-${post.id}`);
  if (!article) return;

  const bodyEl = article.querySelector('.post-body');

  bodyEl.innerHTML = `
    <textarea id="edit-body-${post.id}" maxlength="10000">${esc(post.body)}</textarea>
    <div class="admin-controls">
      <button class="btn small" data-edit-save="${post.id}">Save</button>
      <button class="btn ghost small" data-edit-cancel="${post.id}">Cancel</button>
    </div>
    <div class="form-error" id="edit-error-${post.id}"></div>
  `;

  document.querySelector(`[data-edit-save="${post.id}"]`).addEventListener('click', async () => {
    const newBody = document.getElementById(`edit-body-${post.id}`).value;
    const errorEl = document.getElementById(`edit-error-${post.id}`);

    try {
      await api('/api/posts', { method: 'PATCH', body: JSON.stringify({ postId: post.id, body: newBody }) });
      toast('Post updated');
      await render();
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });

  document.querySelector(`[data-edit-cancel="${post.id}"]`).addEventListener('click', () => render());
}

async function adminAction(type, id, action, extra = {}) {
  try {
    await api('/api/admin', { method: 'POST', body: JSON.stringify({ type, id, action, ...extra }) });
    toast('Done');
    await render();
  } catch (error) {
    toast(error.message, true);
  }
}

// === PROFILE (fixed layout) ===

function renderProfile(username, query) {
  return async function profileView() {
    const data = await api(`/api/profile?username=${encodeURIComponent(username)}`);
    const p = data.profile;
    const isOwn = state.me && state.me.id === p.user.id;
    const tab = query.get('tab') === 'posts' ? 'posts' : query.get('tab') === 'mentions' ? 'mentions' : 'threads';

    let content = '';

    if (tab === 'threads') {
      content = p.threads.length ? p.threads.map(threadRowHtml).join('') : '<section class="empty">No threads yet.</section>';
    } else if (tab === 'posts') {
      content = p.posts.length
        ? p.posts.map((post) => `
            <article class="post">
              ${avatarHtml(p.user.username, '', p.user.avatar || '')}
              <div class="post-main">
                <div class="feed-head">
                  <span class="muted">in <a href="#/thread/${Number(post.thread_id)}">${esc(post.thread_title)}</a> · ${time(post.created_at)}</span>
                </div>
                <div class="post-body">${mdToHtml(post.body.slice(0, 400))}</div>
              </div>
            </article>
          `).join('')
        : '<section class="empty">No posts yet.</section>';
    } else {
      content = p.mentions.length
        ? p.mentions.map((m) => `
            <article class="post">
              ${avatarHtml(m.author, '')}
              <div class="post-main">
                <div class="feed-head">
                  <span class="muted">mentioned by ${userLink(m.author)} in <a href="#/thread/${Number(m.thread_id)}">${esc(m.thread_title)}</a> · ${time(m.created_at)}</span>
                </div>
                <div class="post-body muted">${esc((m.body || '').slice(0, 200))}</div>
              </div>
            </article>
          `).join('')
        : '<section class="empty">No mentions yet.</section>';
    }

    app.innerHTML = `
      <section class="card profile-card">
        <div class="profile-banner">
          ${p.user.banner ? `<img src="${esc(p.user.banner)}" alt="">` : ''}
        </div>
        <div class="profile-info">
          ${avatarHtml(p.user.username, 'big', p.user.avatar || '')}
          <div>
            <div class="feed-head">
              <span class="feed-name">${esc(p.user.display_name || p.user.username)}</span>
              ${badgesHtml(p.user.badges, p.user)}
              <span class="muted">@${esc(p.user.username)}</span>
            </div>
            <div class="muted">joined ${time(p.user.created_at)} · ${p.user.thread_count} threads · ${p.user.post_count} posts</div>
            <div class="post-body">${p.user.bio ? mdToHtml(p.user.bio) : '<span class="muted">No bio yet.</span>'}</div>
            <div class="admin-controls">
              ${state.me && !isOwn ? `<a class="btn small" href="#/messages/new?to=${encodeURIComponent(p.user.username)}">Send PM</a>` : ''}
              ${isOwn ? `<a class="btn ghost small" href="#/settings">Edit profile</a>` : ''}
              ${shareButtonHtml(`${location.origin}/#/user/${encodeURIComponent(p.user.username)}`, `@${p.user.username} on PentHub`)}
            </div>
          </div>
        </div>
      </section>

      <nav class="tabs">
        <a class="tab ${tab === 'threads' ? 'active' : ''}" href="#/user/${encodeURIComponent(username)}?tab=threads">Threads</a>
        <a class="tab ${tab === 'posts' ? 'active' : ''}" href="#/user/${encodeURIComponent(username)}?tab=posts">Posts</a>
        <a class="tab ${tab === 'mentions' ? 'active' : ''}" href="#/user/${encodeURIComponent(username)}?tab=mentions">Mentions</a>
      </nav>

      ${content}
    `;

    attachShareHandlers(app);
  };
}

// === AUTH PAGES ===

function renderLogin() {
  return function loginView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Log in</h1>
        <form id="login-form" class="form">
          <label>Username <input id="login-username" class="input" autocomplete="username" required minlength="3" maxlength="32" /></label>
          <label>Password <input id="login-password" class="input" type="password" autocomplete="current-password" required minlength="12" maxlength="128" /></label>
          <div id="turnstile-box"></div>
          <button class="btn" type="submit">Log in</button>
          <div id="form-error" class="form-error"></div>
        </form>
        <p><a href="#/recover">Forgot password / recover access</a></p>
        <p class="muted">Don't have an account? <a href="#/register">Register</a></p>
      </section>
    `;

    renderTurnstile();

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('form-error');

      try {
        await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password, turnstileToken: state.turnstileToken || undefined })
        });
        state.me = await api('/api/auth/me');
        updateTopbar(); updateSidebar();
        location.hash = '#/';
      } catch (error) {
        errorEl.textContent = error.message;
        resetTurnstile(); renderTurnstile();
      }
    });
  };
}

function renderRegister() {
  return function registerView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Create account</h1>

        <div class="notice info">
          By registering you agree to our <a href="#/terms" target="_blank">Terms of Service</a>
          and <a href="#/privacy" target="_blank">Privacy Policy</a>. The platform is for legal,
          educational and authorized security research only.
        </div>

        <form id="register-form" class="form">
          <label>Username <input id="register-username" class="input" autocomplete="username" required minlength="3" maxlength="32" /></label>
          <label>Display name (optional) <input id="register-display" class="input" autocomplete="name" maxlength="40" placeholder="How others will see you" /></label>
          <label>Password <input id="register-password" class="input" type="password" autocomplete="new-password" required minlength="12" maxlength="128" /></label>
          <div id="turnstile-box"></div>

          <label class="checkbox">
            <input id="register-terms" type="checkbox" required />
            <span>I accept the <a href="#/terms" target="_blank">Terms of Service</a>.</span>
          </label>

          <label class="checkbox">
            <input id="register-privacy" type="checkbox" required />
            <span>I accept the <a href="#/privacy" target="_blank">Privacy Policy</a>.</span>
          </label>

          <label class="checkbox">
            <input id="register-age" type="checkbox" required />
            <span>I confirm I am 18+ or have parental consent.</span>
          </label>

          <label class="checkbox">
            <input id="register-legal" type="checkbox" required />
            <span>I will use this platform only for legal, authorized research and education.</span>
          </label>

          <button class="btn" type="submit">Create account</button>
          <div id="form-error" class="form-error"></div>
        </form>
        <p class="muted">Already have an account? <a href="#/login">Log in</a></p>
      </section>
    `;

    renderTurnstile();

    document.getElementById('register-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('register-username').value.trim();
      const displayName = document.getElementById('register-display').value.trim();
      const password = document.getElementById('register-password').value;
      const acceptTerms = document.getElementById('register-terms').checked;
      const acceptPrivacy = document.getElementById('register-privacy').checked;
      const acceptAge = document.getElementById('register-age').checked;
      const acceptLegal = document.getElementById('register-legal').checked;
      const errorEl = document.getElementById('form-error');

      try {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username, password, acceptTerms, acceptPrivacy, acceptAge, acceptLegal,
            display_name: displayName,
            turnstileToken: state.turnstileToken || undefined
          })
        });
        state.me = await api('/api/auth/me');
        updateTopbar(); updateSidebar();
        toast('Account created');
        state.welcomeSeen = false;
        localStorage.setItem('penthub_welcome_seen', '0');
        location.hash = '#/';
        if (data.recoveryCode) showRecoveryModal(data.recoveryCode);
      } catch (error) {
        errorEl.textContent = error.message;
        resetTurnstile(); renderTurnstile();
      }
    });
  };
}

function renderRecover() {
  return function recoverView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Recover access</h1>
        <p class="muted">Enter your username and recovery code. After reset the old code is burned.</p>
        <form id="recover-form" class="form">
          <label>Username <input id="recover-username" class="input" autocomplete="username" required minlength="3" maxlength="32" /></label>
          <label>Recovery code <input id="recover-code" class="input" autocomplete="off" required placeholder="PH-XXXX-XXXX-XXXX-XXXX" /></label>
          <label>New password <input id="recover-password" class="input" type="password" autocomplete="new-password" required minlength="12" maxlength="128" /></label>
          <button class="btn" type="submit">Reset password</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('recover-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('recover-username').value.trim();
      const recoveryCode = document.getElementById('recover-code').value.trim();
      const newPassword = document.getElementById('recover-password').value;
      const errorEl = document.getElementById('form-error');

      try {
        const data = await api('/api/auth/recover', { method: 'POST', body: JSON.stringify({ username, recoveryCode, newPassword }) });
        toast('Password changed. Log in with the new password.');
        location.hash = '#/login';
        if (data.recoveryCode) showRecoveryModal(data.recoveryCode);
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function renderRules() {
  return function rulesView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>PentHub Rules</h1>
        <h2>Allowed</h2>
        <ul>
          <li>Authorized pentesting with written permission.</li>
          <li>Research on your own devices, networks and accounts.</li>
          <li>CTF, training stands, sandbox labs.</li>
          <li>Defensive security: protection, monitoring, hardening, detection.</li>
          <li>Hardware security labs on your own hardware.</li>
          <li>Responsible disclosure and legal framework discussions.</li>
        </ul>
        <h2>Prohibited</h2>
        <ul>
          <li>Discussing attacks on third-party systems without permission.</li>
          <li>Jammers, jamming, deauthentication, DoS/DDoS.</li>
          <li>Brute-forcing third-party accounts/systems.</li>
          <li>Malware, stealers, ransomware, botnets.</li>
          <li>Carding, skimming, data theft, fraud.</li>
          <li>Selling exploits/access/accounts for illegal use.</li>
        </ul>
        <h2>Legal</h2>
        <p>
          The platform is educational and research-oriented. The user is fully responsible for their actions
          outside the forum and must comply with applicable law. The administration is not responsible for
          user actions outside the platform.
        </p>
      </section>
    `;
  };
}

function renderNotFound() {
  return function notFoundView() {
    app.innerHTML = '<section class="card narrow"><h1>404</h1><p class="muted">Page not found.</p><p><a href="#/">Back home</a></p></section>';
  };
}

// === ROUTER ===

async function render() {
  const { segments, query } = parseRoute();

  app.innerHTML = '<div class="loading">Loading...</div>';

  updateSidebar();
  updateRightbar();

  try {
    const section = segments[0] || '';

    if (!section) await renderHome()();
    else if (section === 'welcome') await renderWelcome()();
    else if (section === 'categories') await renderCategories()();
    else if (section === 'section') await renderSection(segments[1], query)();
    else if (section === 'category') await renderCategory(segments[1], query)();
    else if (section === 'tag') await renderTag(segments[1], query)();
    else if (section === 'thread') await renderThread(segments[1], query)();
    else if (section === 'user') await renderProfile(segments[1], query)();
    else if (section === 'notifications') await renderNotifications(query)();
    else if (section === 'messages') {
      if (segments[1] === 'user') await renderConversation(segments[2], query)();
      else if (segments[1] === 'new') renderNewMessage(query)();
      else await renderMessages(query)();
    }
    else if (section === 'settings') await renderSettings()();
    else if (section === 'support') await renderSupport(query)();
    else if (section === 'ticket') await renderTicket(Number(segments[1]))();
    else if (section === 'appeal') await renderAppeal()();
    else if (section === 'changelog') await renderChangelog(query)();
    else if (section === 'learn') await renderLearn(segments[1])();
    else if (section === 'firmware') {
      if (segments[1] === 'bruce' && segments[2] === 'wiki') await renderBruceWiki()();
      else await renderFirmwareHub()();
    }
    else if (section === 'releases') await renderReleases()();
    else if (section === 'login') renderLogin()();
    else if (section === 'register') renderRegister()();
    else if (section === 'recover') renderRecover()();
    else if (section === 'new-thread') await renderNewThread(query)();
    else if (section === 'search') await renderSearch(query)();
    else if (section === 'rules') renderRules()();
    else if (section === 'terms') renderTerms()();
    else if (section === 'privacy') renderPrivacy()();
    else if (section === 'admin') await renderAdmin(query)();
    else renderNotFound()();
  } catch (error) {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Error</h1>
        <p class="error">${esc(error.message)}</p>
        <p><a href="#/">Back home</a></p>
      </section>
    `;
  }

  updateTopbar();
}

// === GLOBAL HANDLERS ===

function openReportModal(postId) {
  reportPostId = postId;
  modal.classList.remove('hidden');
  document.getElementById('modal-reason').value = '';
  document.getElementById('modal-reason').focus();
}

function closeReportModal() {
  modal.classList.add('hidden');
  reportPostId = null;
}

async function submitReport() {
  const reason = document.getElementById('modal-reason').value.trim();
  if (!reason) { toast('Specify a reason', true); return; }

  try {
    await api('/api/report', { method: 'POST', body: JSON.stringify({ postId: reportPostId, reason }) });
    closeReportModal();
    toast('Report sent');
  } catch (error) {
    toast(error.message, true);
  }
}

async function copyRecoveryCode() {
  const code = document.getElementById('recovery-code').textContent.trim();
  try { await navigator.clipboard.writeText(code); toast('Code copied'); }
  catch { toast('Copy the code manually', true); }
}

document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
});

document.getElementById('modal-cancel').addEventListener('click', closeReportModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeReportModal(); });
document.getElementById('modal-send').addEventListener('click', submitReport);

document.getElementById('recovery-copy').addEventListener('click', copyRecoveryCode);
document.getElementById('recovery-close').addEventListener('click', closeRecoveryModal);
recoveryModal.addEventListener('click', (event) => { if (event.target === recoveryModal) closeRecoveryModal(); });

window.addEventListener('hashchange', render);

(async function init() {
  await Promise.all([loadMe(), loadConfig(), ensureCategories()]);
  updateTopbar();
  await render();
})();
