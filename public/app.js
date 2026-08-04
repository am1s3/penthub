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
// === SETTINGS (redesigned, tabs) ===

function fileToDataURL(file, maxSize) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    if (file.size > maxSize) return reject(new Error(`File too big (${Math.round(file.size / 1024)}KB)`));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Read error'));
    reader.readAsDataURL(file);
  });
}

function renderSettings(query) {
  return async function settingsView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const tab = ['appearance', 'security'].includes(query.get('tab')) ? query.get('tab') : 'profile';
    const data = await api('/api/settings');
    const p = data.profile;

    let content = '';

    if (tab === 'profile') {
      content = `
        <form id="settings-profile" class="form">
          <label>Display name <input id="s-display" class="input" maxlength="40" value="${esc(p.display_name || '')}" placeholder="How others see you" /></label>
          <label>Username <input class="input" value="@${esc(p.username)}" disabled /></label>
          <label>Bio <textarea id="s-bio" maxlength="500">${esc(p.bio || '')}</textarea></label>
          <button class="btn small" type="submit">Save profile</button>
          <div id="profile-error" class="form-error"></div>
        </form>
      `;
    } else if (tab === 'appearance') {
      content = `
        <h2>Avatar</h2>
        <div class="image-upload">
          <div class="preview" id="s-avatar-preview">
            ${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : avatarHtml(p.username)}
          </div>
          <input type="file" id="s-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" />
          <button class="btn small" type="button" id="s-avatar-upload">Upload</button>
          <button class="btn ghost small" type="button" id="s-avatar-clear">Remove</button>
        </div>
        <p class="muted">PNG / JPEG / WebP / GIF, up to 256KB.</p>

        <h2>Banner</h2>
        <div class="image-upload">
          <div class="preview banner" id="s-banner-preview" ${p.banner ? `style="background-image:url('${esc(p.banner)}')"` : ''}></div>
          <input type="file" id="s-banner-file" accept="image/png,image/jpeg,image/webp" />
          <button class="btn small" type="button" id="s-banner-upload">Upload</button>
          <button class="btn ghost small" type="button" id="s-banner-clear">Remove</button>
        </div>
        <p class="muted">PNG / JPEG / WebP, up to 512KB. Shown on your profile.</p>
      `;
    } else {
      content = `
        <h2>Change password</h2>
        <form id="settings-password" class="form">
          <label>Current password <input id="s-current" class="input" type="password" required /></label>
          <label>New password <input id="s-new" class="input" type="password" required minlength="12" maxlength="128" /></label>
          <button class="btn small" type="submit">Change password</button>
          <div id="password-error" class="form-error"></div>
        </form>

        <h2>Recovery code</h2>
        <p class="muted">Rotate your recovery code. The old one stops working immediately.</p>
        <form id="settings-recovery" class="form">
          <label>Current recovery code <input id="s-rec" class="input" autocomplete="off" required placeholder="PH-XXXX-XXXX-XXXX-XXXX" /></label>
          <button class="btn small" type="submit">Rotate recovery code</button>
          <div id="recovery-error" class="form-error"></div>
        </form>
      `;
    }

    app.innerHTML = `
      <section class="page-head"><h1>Settings</h1></section>

      <div class="settings-grid">
        <nav class="settings-nav">
          <a class="tab ${tab === 'profile' ? 'active' : ''}" href="#/settings?tab=profile">Profile</a>
          <a class="tab ${tab === 'appearance' ? 'active' : ''}" href="#/settings?tab=appearance">Appearance</a>
          <a class="tab ${tab === 'security' ? 'active' : ''}" href="#/settings?tab=security">Security</a>
        </nav>

        <div class="card" style="margin-bottom:0">
          ${content}
        </div>
      </div>
    `;

    const profileForm = document.getElementById('settings-profile');

    if (profileForm) {
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('profile-error');

        try {
          await api('/api/settings', {
            method: 'POST',
            body: JSON.stringify({
              field: 'profile',
              display_name: document.getElementById('s-display').value,
              bio: document.getElementById('s-bio').value
            })
          });
          toast('Profile saved');
          await loadMe();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }

    const avatarUpload = document.getElementById('s-avatar-upload');

    if (avatarUpload) {
      avatarUpload.addEventListener('click', async () => {
        try {
          const file = document.getElementById('s-avatar-file').files[0];
          const dataUrl = await fileToDataURL(file, 262144);
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'avatar', avatar: dataUrl }) });
          document.getElementById('s-avatar-preview').innerHTML = `<img src="${esc(dataUrl)}" alt="">`;
          toast('Avatar updated');
          await loadMe();
        } catch (error) {
          toast(error.message, true);
        }
      });

      document.getElementById('s-avatar-clear').addEventListener('click', async () => {
        try {
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'avatar', avatar: '' }) });
          toast('Avatar removed');
          await render();
        } catch (error) {
          toast(error.message, true);
        }
      });

      document.getElementById('s-banner-upload').addEventListener('click', async () => {
        try {
          const file = document.getElementById('s-banner-file').files[0];
          const dataUrl = await fileToDataURL(file, 524288);
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'banner', banner: dataUrl }) });
          document.getElementById('s-banner-preview').style.backgroundImage = `url('${dataUrl}')`;
          toast('Banner updated');
          await loadMe();
        } catch (error) {
          toast(error.message, true);
        }
      });

      document.getElementById('s-banner-clear').addEventListener('click', async () => {
        try {
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'banner', banner: '' }) });
          toast('Banner removed');
          await render();
        } catch (error) {
          toast(error.message, true);
        }
      });
    }

    const passwordForm = document.getElementById('settings-password');

    if (passwordForm) {
      passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('password-error');

        try {
          await api('/api/settings', {
            method: 'POST',
            body: JSON.stringify({
              field: 'password',
              current_password: document.getElementById('s-current').value,
              new_password: document.getElementById('s-new').value
            })
          });
          toast('Password changed');
          document.getElementById('s-current').value = '';
          document.getElementById('s-new').value = '';
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });

      document.getElementById('settings-recovery').addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('recovery-error');

        try {
          const res = await api('/api/settings', {
            method: 'POST',
            body: JSON.stringify({ field: 'recovery', recoveryCode: document.getElementById('s-rec').value })
          });
          toast('Recovery code rotated');
          if (res.recoveryCode) showRecoveryModal(res.recoveryCode);
          document.getElementById('s-rec').value = '';
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }
  };
}

// === SUPPORT / TICKETS ===

function renderSupport(query) {
  return async function supportView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/tickets?page=${page}`);
    const tickets = data.tickets || [];

    app.innerHTML = `
      <section class="page-head">
        <h1>Support</h1>
        <button class="btn small" id="support-new">+ New ticket</button>
      </section>

      <p class="muted">Use tickets for account issues, bug reports or questions to the team. For public discussions, post in a category.</p>

      ${tickets.length ? tickets.map((t) => `
        <a class="feed-row" href="#/ticket/${Number(t.id)}">
          <span class="notif-icon">${t.status === 'open' ? '?' : '✓'}</span>
          <div class="feed-main">
            <div class="feed-head">
              <span class="chip ${t.status === 'open' ? 'warn' : 'green'}">${esc(t.status)}</span>
              <span class="feed-name">${esc(t.subject)}</span>
              ${t.username ? `<span class="muted">· @${esc(t.username)}</span>` : ''}
            </div>
            <div class="muted">Updated ${time(t.updated_at)}</div>
          </div>
        </a>
      `).join('') : '<section class="empty">No tickets yet.</section>'}

      ${paginationHtml('#/support', page, Boolean(data.hasMore))}
    `;

    document.getElementById('support-new').addEventListener('click', () => {
      const subject = prompt('Subject (up to 100 characters):');
      if (!subject) return;
      const body = prompt('Describe the issue (up to 5000 characters):');
      if (!body) return;

      api('/api/tickets', { method: 'POST', body: JSON.stringify({ action: 'create', subject, body }) })
        .then((res) => { location.hash = `#/ticket/${res.id}`; })
        .catch((err) => toast(err.message, true));
    });
  };
}

function renderTicket(ticketId) {
  return async function ticketView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const data = await api(`/api/tickets?id=${ticketId}`);
    const { ticket, messages } = data;

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h1>${esc(ticket.subject)}</h1>
          <div class="feed-tags">
            <span class="chip ${ticket.status === 'open' ? 'warn' : 'green'}">${esc(ticket.status)}</span>
            <span class="muted">Opened ${time(ticket.created_at)} · Updated ${time(ticket.updated_at)}</span>
          </div>
        </div>
        <a class="btn ghost small" href="#/support">Back</a>
      </section>

      <section>
        ${messages.map((m) => `
          <article class="post">
            ${avatarHtml(m.username, '')}
            <div class="post-main">
              <div class="feed-head">
                <span class="feed-name">${userLink(m.username)}</span>
                ${m.is_staff ? '<span class="chip green">staff</span>' : ''}
                <span class="muted">· ${time(m.created_at)}</span>
              </div>
              <div class="post-body">${mdToHtml(m.body)}</div>
            </div>
          </article>
        `).join('')}
      </section>

      ${ticket.status === 'closed' && !isStaff() ? '<p class="notice">This ticket is closed.</p>' : `
        <form id="ticket-reply" class="form">
          <label>Reply <textarea id="ticket-body" maxlength="5000" required minlength="1"></textarea></label>
          <div class="admin-controls">
            <button class="btn" type="submit">Send</button>
            ${isStaff() ? `<button class="btn ghost" type="button" data-ticket-close="${ticket.id}">${ticket.status === 'closed' ? 'Reopen' : 'Close ticket'}</button>` : ''}
          </div>
          <div id="ticket-error" class="form-error"></div>
        </form>
      `}
    `;

    const replyForm = document.getElementById('ticket-reply');

    if (replyForm) {
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('ticket-error');

        try {
          await api('/api/tickets', {
            method: 'POST',
            body: JSON.stringify({ action: 'reply', ticketId, body: document.getElementById('ticket-body').value })
          });
          toast('Reply sent');
          await render();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }

    const closeBtn = document.querySelector('[data-ticket-close]');

    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        try {
          await api('/api/tickets', {
            method: 'POST',
            body: JSON.stringify({ action: ticket.status === 'closed' ? 'reopen' : 'close', ticketId })
          });
          toast('Ticket updated');
          await render();
        } catch (error) {
          toast(error.message, true);
        }
      });
    }
  };
}

// === APPEAL ===

function renderAppeal() {
  return async function appealView() {
    if (!state.me) { location.hash = '#/login'; return; }

    let appeals = [];

    try {
      const data = await api('/api/appeals?mine=1');
      appeals = data.appeals || [];
    } catch {
      // ignore
    }

    const pending = appeals.find((a) => a.status === 'pending');

    app.innerHTML = `
      <section class="card narrow">
        <h1>Appeal suspension</h1>

        ${state.me.banned ? `
          <div class="notice warn">
            <strong>Reason:</strong> ${esc(state.me.ban_reason || '—')}
            <br><span class="muted">Banned ${state.me.banned_at ? time(state.me.banned_at) : ''}</span>
          </div>
        ` : '<p>You are not currently suspended.</p>'}

        ${pending ? `
          <p class="notice">You already have a pending appeal submitted on ${time(pending.created_at)}.</p>
        ` : state.me.banned ? `
          <p class="muted">Write a short, honest explanation. Frivolous appeals are rejected.</p>
          <form id="appeal-form" class="form">
            <label>Reason <textarea id="appeal-body" maxlength="2000" required minlength="20"></textarea></label>
            <button class="btn" type="submit">Submit appeal</button>
            <div id="appeal-error" class="form-error"></div>
          </form>
        ` : ''}

        ${appeals.length ? `
          <h2>Your appeals</h2>
          ${appeals.map((a) => `
            <article class="admin-row">
              <div class="admin-row-head">
                <span class="chip ${a.status === 'pending' ? 'warn' : a.status === 'approved' ? 'green' : 'danger'}">${esc(a.status)}</span>
                <span class="muted">${time(a.created_at)}</span>
              </div>
              <div class="post-body">${esc(a.reason)}</div>
            </article>
          `).join('')}
        ` : ''}

        <div class="admin-controls">
          <a class="btn ghost small" href="#/settings">Settings</a>
          <a class="btn ghost small" href="#/support">Open support ticket</a>
          <button id="appeal-logout" class="btn danger small">Log out</button>
        </div>
      </section>
    `;

    document.getElementById('appeal-logout')?.addEventListener('click', logout);

    const form = document.getElementById('appeal-form');

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('appeal-error');

        try {
          await api('/api/appeals', {
            method: 'POST',
            body: JSON.stringify({ action: 'submit', reason: document.getElementById('appeal-body').value })
          });
          toast('Appeal submitted');
          await render();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }
  };
}

// === CHANGELOG ===

function renderChangelog(query) {
  return async function changelogView() {
    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/changelog?page=${page}`);
    const items = data.items || [];

    if (data.latest_id) {
      state.changelogSeenId = data.latest_id;
      localStorage.setItem('penthub_changelog_seen', String(data.latest_id));
      whatsnewBar.classList.add('hidden');
    }

    app.innerHTML = `
      <section class="page-head">
        <h1>What's new</h1>
        ${state.me?.isAdmin ? '<button class="btn small" id="changelog-new">+ New release</button>' : ''}
      </section>

      ${items.map((c) => `
        <article class="card">
          <div class="feed-head">
            <span class="chip green">${esc(c.version)}</span>
            <span class="feed-name">${esc(c.title)}</span>
            <span class="muted">· ${time(c.created_at)}</span>
          </div>
          <div class="post-body">${mdToHtml(c.body)}</div>
        </article>
      `).join('') || '<section class="empty">No changelog yet.</section>'}

      ${paginationHtml('#/changelog', page, Boolean(data.hasMore))}
    `;

    document.getElementById('changelog-new')?.addEventListener('click', () => {
      const version = prompt('Version (e.g. 1.1.0):');
      if (!version) return;
      const title = prompt('Title:');
      if (!title) return;
      const body = prompt('Body (markdown):');
      if (!body) return;

      api('/api/changelog', { method: 'POST', body: JSON.stringify({ version, title, body }) })
        .then(() => { toast('Published'); render(); })
        .catch((err) => toast(err.message, true));
    });
  };
}

// === LEARN (original training articles) ===

const LEARN_ARTICLES = {
  'home-wifi-lab': {
    title: 'Building a home Wi-Fi audit lab (your own network only)',
    body: `
## Why a lab

Wi-Fi security is best learned on infrastructure you fully own. A home lab gives you a safe, legal environment to understand how wireless networks actually work: beacons, association, the 4-way handshake, and how WPA2/WPA3 protect (or fail to protect) traffic.

## What you need

- A spare router you own, flashed or stock, isolated from your family network.
- A dedicated test SSID with a passphrase you control.
- A Wi-Fi adapter that supports monitor mode (for learning, not for touching other networks).
- A laptop or SBC (a Raspberry Pi works great) for tooling.

## Isolation rules

1. The lab router must not bridge to your main network or the internet devices you care about.
2. Use a separate VLAN or a physically separate router.
3. Only your own client devices join the lab SSID.

## What to practice

- Reading beacons and understanding channel, SSID, and capability fields.
- Capturing your own 4-way handshake from your own client reconnecting.
- Verifying that a strong passphrase resists offline checks, and understanding why weak passphrases fail.
- Comparing WPA2 and WPA3 behavior on your own AP, including management frame protection.

## Hardening takeaways

After the lab you should be able to configure a real home network properly: WPA3 or WPA2 with PMF enabled, a long random passphrase, disabled WPS, and a separate guest network for untrusted devices.

## Legal line

Everything above happens on hardware and spectrum you control. Scanning or capturing on networks you do not own is where learning ends and law-breaking begins. Stay on your side of the line.
`
  },
  'ctf-start': {
    title: 'Getting started with CTF: a practical path',
    body: `
## What CTF actually trains

Capture-the-flag competitions are legal, structured puzzles. They train the exact skills a security engineer uses daily: reading documentation, debugging, scripting, and thinking in systems.

## Your first month

1. Pick one beginner-friendly platform and create an account.
2. Solve 10 easy challenges in any category. Do not rush to hard ones.
3. Write a one-paragraph note for every solved challenge: what worked, what did not.

## Categories to taste

- **Web**: requests, cookies, headers, and why validation matters.
- **Crypto**: encoding vs encryption, and classic mistakes.
- **Forensics**: carving data from files and memory dumps.
- **Reverse**: reading assembly at a high level, using a disassembler.
- **Misc**: scripting, automation, and creative thinking.

## How to get unstuck

- Sleep on it. Most flags come after a break.
- Read writeups only after you solved it, or after a full day of honest effort. Then re-solve it yourself.
- Keep a personal wiki. Your notes become your superpower.

## From player to contributor

When you are comfortable, join a team, play a jeopardy event, and later try attack-defense format. Teaching one beginner per season keeps your own fundamentals sharp.
`
  },
  'uart-jtag-basics': {
    title: 'UART and JTAG on your own devices: a gentle hardware intro',
    body: `
## The mindset

Hardware security research starts with one rule: open only devices you own, and expect to brick some of them. A cheap development board is the right tuition fee.

## UART: the friendly serial port

UART is the simplest debug interface. Manufacturers often leave test points labeled TX, RX, GND (and sometimes VCC).

1. Identify candidates with a multimeter: GND is continuous, VCC is stable voltage, TX idles high and flickers at boot.
2. Connect a USB-UART adapter: adapter RX to device TX, adapter TX to device RX, GND to GND.
3. Open a serial console at common baud rates (115200 first) and watch the boot log.

The boot log teaches you how the firmware starts, what it mounts, and sometimes where it keeps configuration. On your own device, this is pure learning.

## JTAG: the deeper interface

JTAG gives boundary scan and, on some chips, full debug control. It is more pins, more timing, and more patience. Start with UART; come back to JTAG after you are comfortable with logic analyzers.

## Tools worth learning

- A USB-UART adapter and a serial terminal.
- A logic analyzer to see what is actually on the wire.
- A multimeter for continuity and voltage.

## Safety and legality

Never probe devices you do not own, never dump firmware you are not licensed to inspect, and never connect VCC from two sources at once. The skills transfer directly to authorized product security work.
`
  },
  'responsible-disclosure': {
    title: 'Responsible disclosure: how to report a vulnerability properly',
    body: `
## The goal

You found a real vulnerability in a product or service. Responsible disclosure means the vendor learns about it safely, users get protected, and you get credit without legal risk.

## Before you report

1. Confirm the issue on an account or asset you are allowed to test.
2. Do not read, copy or exfiltrate data beyond the minimum proof.
3. Do not run destructive payloads. A proof of concept, not a breach.

## Writing the report

A good report has:

- A one-paragraph summary: what, where, impact.
- Exact reproduction steps with requests or screenshots.
- The affected endpoint or component version.
- Your suggested severity and a reasonable fix idea.

## Where to send it

Look for security.txt, a security@ address, or a public bug bounty program. If none exists, use a trusted coordinator or a national CERT.

## Timelines and conduct

Give the vendor a reasonable window (commonly 90 days) before any public discussion. Keep the details private until a fix ships. Professional conduct today is your reputation tomorrow.

## The legal line

Reporting is protected in many jurisdictions when done in good faith, but only if the discovery itself was lawful. Testing without permission is not disclosure; it is an incident. Always start from authorized ground.
`
  },
  'rfid-nfc-lab': {
    title: 'RFID/NFC lab on a budget: learn protocols safely',
    body: `
## What you can legally study

Your own cards, your own tags, your own readers. That is a complete curriculum: low-frequency and high-frequency RFID, NFC modes, and how access systems make decisions.

## A cheap starter kit

- A multi-protocol reader/writer you own.
- A few blank writable tags (different chip families).
- Your own old access cards that are already deactivated.

## Exercises

1. Read the UID of every tag and notice which are fixed and which are random.
2. Write an NDEF record to a tag and read it with a phone. Observe the handshake.
3. Map the memory layout of a classic MIFARE tag on a blank sample. Understand sectors and keys conceptually.
4. Compare how a reader behaves with a valid vs unknown tag.

## What this teaches

Most real-world access control failures are not crypto breaks; they are design mistakes: trusting the UID, shipping default keys, or accepting cloned identifiers. Seeing this firsthand on your own tags changes how you design systems.

## The legal line

Cloning or reading cards that are not yours is where it stops being a lab. Keep every experiment inside your own pocket of cards and readers.
`
  },
  'network-hardening': {
    title: 'Hardening your home network: a defensive checklist',
    body: `
## Why defensive skills matter

Attack skills decay fast; defensive fundamentals compound. This checklist turns everything you learn into protection for people you care about.

## Router

- Change the admin password; disable remote management.
- Keep firmware updated; enable auto-update if available.
- Disable WPS and UPnP unless you truly need them.

## Wi-Fi

- WPA3 if supported, otherwise WPA2 with PMF.
- A long random passphrase, not a dictionary phrase.
- A separate guest network for visitors and cheap IoT devices.

## Devices

- Enable full-disk encryption on laptops and phones.
- Use a password manager and unique passwords everywhere.
- Turn on 2FA, preferring app or hardware keys over SMS.

## Visibility

- Run a local DNS with filtering for malware domains on your own network.
- Periodically list connected clients on your router and recognize every one of them.

## The habit

Security is not a product you buy; it is a list of small decisions you keep making. Do this checklist once per season and your home network stays ahead of almost every realistic threat.
`
  }
};

function renderLearn(slug) {
  return async function learnView() {
    if (slug) {
      const article = LEARN_ARTICLES[slug];

      if (!article) throw new Error('Article not found');

      app.innerHTML = `
        <section class="page-head">
          <div>
            <h1>${esc(article.title)}</h1>
            <p class="muted">Original PentHub training material · legal, authorized research only</p>
          </div>
          <div class="top-actions">
            ${shareButtonHtml(`${location.origin}/#/learn/${slug}`, article.title)}
            <a class="btn ghost small" href="#/learn">All articles</a>
          </div>
        </section>

        <article class="card">
          <div class="post-body">${mdToHtml(article.body)}</div>
        </article>
      `;

      attachShareHandlers(app);
      return;
    }

    app.innerHTML = `
      <section class="page-head">
        <h1>Learn</h1>
        <p class="muted">Original training articles. Everything assumes your own devices and written permission.</p>
      </section>

      <div class="feature-grid">
        ${Object.entries(LEARN_ARTICLES).map(([key, a]) => `
          <a class="feature-card" href="#/learn/${key}">
            <h3>${esc(a.title)}</h3>
            <p>${esc(a.body.replace(/[#`\n]/g, ' ').slice(0, 120))}…</p>
          </a>
        `).join('')}
      </div>
    `;
  };
}

// === FIRMWARE / WIKI / RELEASES ===

function renderFirmwareHub() {
  return async function firmwareHubView() {
    let releases = [];

    try {
      const data = await api('/api/releases');
      releases = data.releases || [];
    } catch {
      // ignore
    }

    app.innerHTML = `
      <section class="welcome-hero">
        <h1>Firmware Hub</h1>
        <p>Latest releases from security hardware and firmware projects, auto-synced from GitHub.</p>
      </section>

      <section class="feature-grid">
        <a class="feature-card" href="#/firmware/bruce/wiki">
          <h3>Bruce wiki index</h3>
          <p>Curated summaries with links to the official wiki.bruce.computer.</p>
        </a>
        <a class="feature-card" href="#/releases">
          <h3>All releases</h3>
          <p>Full feed of synced firmware releases with direct GitHub links.</p>
        </a>
        <a class="feature-card" href="#/category/esp32-security-lab">
          <h3>ESP32 category</h3>
          <p>Community discussions around ESP32-based security projects.</p>
        </a>
        <a class="feature-card" href="#/category/flipper-zero-research">
          <h3>Flipper Zero</h3>
          <p>Protocol research on your own devices in a controlled lab.</p>
        </a>
      </section>

      <section class="page-head"><h2>Latest releases</h2></section>

      ${releases.slice(0, 10).map((r) => `
        <article class="card">
          <div class="feed-head">
            <span class="chip tag">${esc(r.source)}</span>
            <span class="chip">${esc(r.tag)}</span>
            <span class="muted">· ${time(r.published_at)}</span>
          </div>
          <h3>${esc(r.title)}</h3>
          <div class="post-body">${mdToHtml((r.body || '').slice(0, 400))}</div>
          <div class="admin-controls">
            ${r.url ? `<a class="btn small" href="${esc(r.url)}" target="_blank" rel="noopener">View on GitHub</a>` : ''}
            ${r.thread_id ? `<a class="btn ghost small" href="#/thread/${Number(r.thread_id)}">Discuss</a>` : ''}
          </div>
        </article>
      `).join('') || '<section class="empty">No releases synced yet. The cron runs hourly.</section>'}
    `;
  };
}

function renderBruceWiki() {
  return function wikiView() {
    const original = 'https://wiki.bruce.computer/';

    app.innerHTML = `
      <div class="wiki-notice">
        <strong>About this page</strong> — this is a curated index with short original summaries.
        The full, official and always-up-to-date wiki lives at
        <a href="${original}" target="_blank" rel="noopener">${original}</a>.
        We link to the original for every topic.
      </div>

      <section class="page-head">
        <h1>Bruce — curated wiki index</h1>
        <a class="btn small" href="${original}" target="_blank" rel="noopener">Open original wiki</a>
      </section>

      <article class="card">
        <h3>Getting started</h3>
        <div class="post-body">
          <p>Bruce is an open-source firmware for ESP32-based security multi-tools. It bundles modules for Wi-Fi, Bluetooth, RFID, NFC, IR and Sub-GHZ research behind one touch-friendly menu.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <article class="card">
        <h3>Installation & flashing</h3>
        <div class="post-body">
          <p>Flashing is typically done over USB with esptool or a web flasher on supported boards (M5Stack Cardputer, StickC Plus 2, Lilygo T-Display and others). Use stable releases on your own hardware.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <article class="card">
        <h3>Wi-Fi module</h3>
        <div class="post-body">
          <p>Scanning, handshake capture and lab testing against networks you own or have written permission to audit.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <article class="card">
        <h3>Bluetooth / BLE</h3>
        <div class="post-body">
          <p>Device discovery, GATT inspection and interaction with your own BLE peripherals. Useful for auditing IoT devices and studying pairing flows.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <article class="card">
        <h3>RFID / NFC / Sub-GHz / IR</h3>
        <div class="post-body">
          <p>Read, emulate and replay signals on your own tags, fobs and remotes. Only on equipment you own or are explicitly authorized to test.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <article class="card">
        <h3>GPIO & hardware</h3>
        <div class="post-body">
          <p>Pin mapping, external modules (CC1101, PN532, etc.) and wiring references. Great reading before soldering your own lab stand.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <article class="card">
        <h3>Troubleshooting & FAQ</h3>
        <div class="post-body">
          <p>Common boot issues, SD card quirks, board-specific notes and how to report bugs to maintainers.</p>
          <p><strong>Original:</strong> <a href="${original}" target="_blank" rel="noopener">wiki.bruce.computer</a></p>
        </div>
      </article>

      <p class="muted">Found a broken link or want to suggest a topic? <a href="#/support">Open a support ticket.</a></p>
    `;
  };
}

function renderReleases() {
  return async function releasesView() {
    let releases = [];

    try {
      const data = await api('/api/releases');
      releases = data.releases || [];
    } catch {
      // ignore
    }

    app.innerHTML = `
      <section class="page-head">
        <h1>All releases</h1>
        ${shareButtonHtml(`${location.origin}/#/releases`, 'PentHub firmware releases feed')}
      </section>

      ${releases.map((r) => `
        <article class="card">
          <div class="feed-head">
            <span class="chip tag">${esc(r.source)}</span>
            <span class="chip">${esc(r.tag)}</span>
            <span class="muted">· ${time(r.published_at)}</span>
          </div>
          <h3>${esc(r.title)}</h3>
          <div class="post-body">${mdToHtml(r.body || '')}</div>
          <div class="admin-controls">
            ${r.url ? `<a class="btn small" href="${esc(r.url)}" target="_blank" rel="noopener">View on GitHub</a>` : ''}
            ${r.thread_id ? `<a class="btn ghost small" href="#/thread/${Number(r.thread_id)}">Discuss</a>` : ''}
            ${shareButtonHtml(r.url || `${location.origin}/#/releases`, `${r.source} ${r.tag}`)}
          </div>
        </article>
      `).join('') || '<section class="empty">No releases synced yet.</section>'}
    `;

    attachShareHandlers(app);
  };
}

// === WELCOME ===

function renderWelcome() {
  return async function welcomeView() {
    app.innerHTML = `
      <section class="welcome-hero">
        <h1>Welcome to PentHub</h1>
        <p>A forum for <strong>legal pentesting</strong>, hardware security labs, CTF, ESP32, Flipper Zero and defensive security.</p>
        <p class="muted">Authorized research only. Your own devices, networks and accounts, or written permission.</p>
        <div class="admin-controls" style="justify-content:center">
          <a class="btn" href="#/register">Create account</a>
          <a class="btn ghost" href="#/login">Log in</a>
          <a class="btn ghost" href="#/rules">Read the rules</a>
        </div>
      </section>

      <section class="feature-grid">
        <a class="feature-card" href="#/learn">
          <h3>Learn</h3>
          <p>Original training articles: home labs, CTF path, UART/JTAG, disclosure.</p>
        </a>
        <a class="feature-card" href="#/firmware">
          <h3>Firmware hub</h3>
          <p>Auto-synced releases from Bruce and other security firmware projects.</p>
        </a>
        <a class="feature-card" href="#/categories">
          <h3>Communities</h3>
          <p>Categories grouped into Firmwares, Hardwares, Networks, Research, Training.</p>
        </a>
        <a class="feature-card" href="#/changelog">
          <h3>Transparent platform</h3>
          <p>Reports, audit log, appeals, badges, tickets and a public changelog.</p>
        </a>
      </section>

      <div class="admin-controls" style="justify-content:center">
        <button class="btn ghost" id="welcome-skip">Skip welcome and enter the forum</button>
      </div>
    `;

    document.getElementById('welcome-skip').addEventListener('click', () => {
      state.welcomeSeen = true;
      localStorage.setItem('penthub_welcome_seen', '1');
      location.hash = '#/';
    });
  };
}

// === NEW THREAD / SEARCH / NOTIFICATIONS / MESSAGES ===

function renderNewThread(query) {
  return async function newThreadView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const categories = await ensureCategories();
    const selectedCategory = query.get('category') || '';

    app.innerHTML = `
      <section class="card narrow">
        <h1>New thread</h1>
        <p class="muted">Legal research, education, CTF, defensive security or authorized pentesting only.</p>
        <form id="new-thread-form" class="form">
          <label>
            Category
            <select id="thread-category" required>
              <option value="">Pick a category</option>
              ${categories.map((c) => `<option value="${c.id}" ${c.slug === selectedCategory ? 'selected' : ''}>${esc(c.section)} · ${esc(c.name)}</option>`).join('')}
            </select>
          </label>
          <label>Title <input id="thread-title" class="input" required minlength="4" maxlength="160" /></label>
          <label>Tags (comma separated, max 5) <input id="thread-tags" class="input" maxlength="120" placeholder="esp32, lab, wifi-audit" /></label>
          <label>First post <textarea id="thread-body" required minlength="1" maxlength="10000"></textarea></label>
          <p class="muted">Markdown: **bold**, *italic*, \`code\`, \`\`\`blocks\`\`\`, lists, &gt; quotes, [link](https://...), @mentions</p>
          <button class="btn" type="submit">Publish</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('new-thread-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('form-error');

      try {
        const data = await api('/api/threads', {
          method: 'POST',
          body: JSON.stringify({
            categoryId: Number(document.getElementById('thread-category').value),
            title: document.getElementById('thread-title').value.trim(),
            body: document.getElementById('thread-body').value,
            tags: document.getElementById('thread-tags').value
          })
        });
        toast('Thread created');
        location.hash = `#/thread/${data.id}`;
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function renderSearch(query) {
  return async function searchView() {
    const q = (query.get('q') || '').trim();

    if (q.length < 3) {
      app.innerHTML = '<section class="card narrow"><h1>Search</h1><p class="notice">Enter at least 3 characters.</p></section>';
      return;
    }

    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const results = data.results || [];

    app.innerHTML = `
      <section class="page-head"><h1>Search: ${esc(q)}</h1></section>
      ${results.length ? results.map(threadRowHtml).join('') : '<section class="empty">Nothing found.</section>'}
    `;
  };
}

function notifRowHtml(n) {
  const icon = n.type === 'mention' ? '@' : n.type === 'reaction' ? '★' : '↩';

  return `
    <a class="feed-row ${n.read_at ? '' : 'unread'}" href="${n.thread_id ? `#/thread/${Number(n.thread_id)}` : '#/notifications'}">
      <span class="notif-icon">${icon}</span>
      <div class="feed-main">
        <div class="feed-head">
          <span class="feed-name">${n.actor ? '@' + esc(n.actor) : 'system'}</span>
          <span class="muted">· ${n.type} · ${time(n.created_at)}</span>
        </div>
        ${n.thread_title ? `<div class="muted">${esc(n.thread_title)}</div>` : ''}
      </div>
    </a>
  `;
}

function renderNotifications(query) {
  return async function notificationsView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/notifications?page=${page}`);

    api('/api/notifications/read', { method: 'POST' }).catch(() => {});
    loadMe().then(() => { updateTopbar(); updateSidebar(); });

    const items = data.notifications || [];

    app.innerHTML = `
      <section class="page-head"><h1>Notifications</h1></section>
      ${items.length ? items.map(notifRowHtml).join('') : '<section class="empty">No notifications.</section>'}
      ${paginationHtml('#/notifications', page, Boolean(data.hasMore))}
    `;
  };
}

function pmRowHtml(m, box) {
  const other = box === 'inbox' ? m.sender_username : m.recipient_username;
  const unread = box === 'inbox' && !m.read_at;

  return `
    <a class="feed-row ${unread ? 'unread' : ''}" href="#/messages/user/${encodeURIComponent(other)}">
      ${avatarHtml(other, '')}
      <div class="feed-main">
        <div class="feed-head"><span class="feed-name">@${esc(other)}</span><span class="muted">· ${time(m.created_at)}</span></div>
        <div class="muted">${esc((m.body || '').slice(0, 120))}</div>
      </div>
    </a>
  `;
}

function renderMessages(query) {
  return async function messagesView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const box = query.get('box') === 'outbox' ? 'outbox' : 'inbox';
    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/messages?box=${box}&page=${page}`);
    const messages = data.messages || [];

    app.innerHTML = `
      <section class="page-head">
        <h1>Messages</h1>
        <a class="btn small" href="#/messages/new">New message</a>
      </section>

      <nav class="tabs">
        <a class="tab ${box === 'inbox' ? 'active' : ''}" href="#/messages?box=inbox">Inbox</a>
        <a class="tab ${box === 'outbox' ? 'active' : ''}" href="#/messages?box=outbox">Outbox</a>
      </nav>

      ${messages.length ? messages.map((m) => pmRowHtml(m, box)).join('') : '<section class="empty">No messages.</section>'}

      ${paginationHtml(`#/messages?box=${box}`, page, Boolean(data.hasMore))}
    `;
  };
}

function renderConversation(username, query) {
  return async function conversationView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/messages?with=${encodeURIComponent(username)}&page=${page}`);
    const messages = data.messages || [];

    loadMe().then(() => { updateTopbar(); updateSidebar(); });

    app.innerHTML = `
      <section class="page-head">
        <h1>Chat with ${userLink(data.with.username)}</h1>
        <a class="btn ghost small" href="#/messages">Inbox</a>
      </section>

      ${messages.map((m) => postHtml({ ...m, username: m.sender_username, is_admin: false, badges: [], reactions: [] })).join('') || '<section class="empty">No messages yet.</section>'}

      ${paginationHtml(`#/messages/user/${encodeURIComponent(username)}`, page, Boolean(data.hasMore))}

      <form id="pm-reply-form" class="form">
        <label>Message <textarea id="pm-reply-body" maxlength="5000" required minlength="1"></textarea></label>
        <button class="btn" type="submit">Send</button>
        <div id="pm-reply-error" class="form-error"></div>
      </form>
    `;

    document.getElementById('pm-reply-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('pm-reply-error');

      try {
        await api('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ toUsername: username, body: document.getElementById('pm-reply-body').value })
        });
        toast('Sent');
        await render();
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function renderNewMessage(query) {
  return function newMessageView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const to = query.get('to') || '';

    app.innerHTML = `
      <section class="card narrow">
        <h1>New message</h1>
        <form id="pm-new-form" class="form">
          <label>To <input id="pm-to" class="input" required minlength="3" maxlength="32" value="${esc(to)}" /></label>
          <label>Message <textarea id="pm-body" maxlength="5000" required minlength="1"></textarea></label>
          <button class="btn" type="submit">Send</button>
          <div id="pm-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('pm-new-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('pm-error');

      try {
        await api('/api/messages', {
          method: 'POST',
          body: JSON.stringify({
            toUsername: document.getElementById('pm-to').value.trim(),
            body: document.getElementById('pm-body').value
          })
        });
        toast('Sent');
        location.hash = `#/messages/user/${encodeURIComponent(document.getElementById('pm-to').value.trim())}`;
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

// === TERMS & PRIVACY (detailed) ===

function renderTerms() {
  return function termsView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Terms of Service</h1>
        <p class="muted">Effective date: 2026-08-04 · Version 1.0</p>

        <h2>1. About the service</h2>
        <p>PentHub ("the service", "we", "us") is an online forum and community platform dedicated to legal security research, education, capture-the-flag (CTF) training, defensive security and hardware security labs. These Terms of Service ("Terms") govern your access to and use of the service, including any content, features and functionality offered through it.</p>
        <p>By creating an account, accessing or using the service, you agree to be bound by these Terms. If you do not agree, you must not use the service.</p>

        <h2>2. Eligibility</h2>
        <p>2.1. You must be at least 18 years old, or the age of legal majority in your jurisdiction, whichever is higher, or have verifiable parental or guardian consent.</p>
        <p>2.2. You must not be prohibited from using the service under applicable laws, and you must not be suspended or removed from the service previously.</p>
        <p>2.3. You are responsible for ensuring that your use of the service complies with all laws, regulations and professional obligations applicable to you.</p>

        <h2>3. Accounts and security</h2>
        <p>3.1. You must provide accurate registration information and keep it up to date.</p>
        <p>3.2. You are responsible for maintaining the confidentiality of your password and recovery code. We never ask for your password or recovery code outside the service interface.</p>
        <p>3.3. You are responsible for all activities that occur under your account. Notify us immediately through Support if you suspect unauthorized use.</p>
        <p>3.4. We may require additional verification if we detect suspicious activity.</p>

        <h2>4. Permitted use</h2>
        <p>4.1. The service is intended for: authorized penetration testing discussion (with written permission), research on your own devices and networks, CTF and training, defensive security, hardware labs on your own hardware, and responsible disclosure education.</p>
        <p>4.2. You may share knowledge, tools and techniques only in contexts that are lawful and authorized.</p>

        <h2>5. Prohibited conduct</h2>
        <p>5.1. You must not use the service to plan, facilitate or discuss: unauthorized access to systems or accounts; brute-forcing third-party credentials; malware, stealers, ransomware or botnets; jamming or deauthentication of networks you do not own; denial-of-service attacks; carding, skimming or fraud; trafficking in stolen data, exploits for illegal use, or access to third-party systems.</p>
        <p>5.2. You must not harass, threaten, impersonate others, or disclose personal data of third parties without a lawful basis.</p>
        <p>5.3. You must not attempt to disrupt, probe or attack the service itself, except through our authorized reporting channels.</p>
        <p>5.4. You must not use automated systems to extract content or create accounts at scale without written permission.</p>

        <h2>6. User content</h2>
        <p>6.1. You retain ownership of the content you post. You grant us a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display and distribute your content as part of operating the service.</p>
        <p>6.2. You represent and warrant that your content is lawful, that you have the rights to post it, and that it does not infringe third-party rights.</p>
        <p>6.3. We may remove or modify content, or restrict its visibility, at our discretion, especially where required by law or these Terms.</p>

        <h2>7. Moderation and enforcement</h2>
        <p>7.1. Staff and moderators may lock, move, edit or delete threads and posts; issue warnings; suspend or ban accounts; and revoke badges or roles.</p>
        <p>7.2. Bans include a stated reason. You may submit one appeal at a time through the Appeal page; frivolous or abusive appeals may be rejected without further review.</p>
        <p>7.3. We are not required to give prior notice before enforcement actions where urgent action is needed.</p>

        <h2>8. Releases and third-party links</h2>
        <p>8.1. The service may display releases and links from third-party projects (for example, GitHub repositories and external wikis). These are provided for convenience only.</p>
        <p>8.2. We do not control and are not responsible for third-party content, software or practices. You use third-party software at your own risk and under its own license.</p>

        <h2>9. Intellectual property</h2>
        <p>9.1. The service design, logo and original articles are our property or used with permission. Original training articles are provided for personal education; you may quote them with attribution.</p>
        <p>9.2. If you believe content on the service infringes your rights, contact us through Support with details.</p>

        <h2>10. Disclaimers</h2>
        <p>10.1. The service is provided "as is" and "as available" without warranties of any kind, express or implied.</p>
        <p>10.2. Security topics carry inherent risk. You acknowledge that applying techniques discussed on the service may damage hardware or data; you accept full responsibility for your actions.</p>
        <p>10.3. We do not provide legal advice. For questions about legality in your jurisdiction, consult a qualified lawyer.</p>

        <h2>11. Limitation of liability</h2>
        <p>11.1. To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential or punitive damages, or for loss of profits, data or goodwill.</p>
        <p>11.2. Our total liability for any claim relating to the service is limited to the greater of the amount you paid us in the last 12 months (if any) or the minimum amount permitted by law.</p>

        <h2>12. Termination</h2>
        <p>12.1. You may delete your content and stop using the service at any time. You may request account export or deletion through Support.</p>
        <p>12.2. We may suspend or terminate access for breach of these Terms, for legal requirements, or where continued access creates risk to others.</p>
        <p>12.3. Sections that by their nature should survive termination (ownership, disclaimers, liability, disputes) survive.</p>

        <h2>13. Changes to the Terms</h2>
        <p>13.1. We may update these Terms from time to time. We will indicate the effective date at the top and, for material changes, provide notice through the "What's new" banner or a post.</p>
        <p>13.2. Continued use after the effective date constitutes acceptance of the updated Terms.</p>

        <h2>14. Governing law and disputes</h2>
        <p>14.1. These Terms are governed by the laws of the jurisdiction where the service operator is established, without regard to conflict-of-law rules.</p>
        <p>14.2. Disputes should first be raised through Support; if unresolved, courts of the operator's jurisdiction have exclusive competence, unless mandatory local law provides otherwise.</p>

        <h2>15. Contact</h2>
        <p>For any questions about these Terms, use the Support page or open a ticket. We aim to respond within a reasonable time.</p>
      </section>
    `;
  };
}

function renderPrivacy() {
  return function privacyView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Privacy Policy</h1>
        <p class="muted">Effective date: 2026-08-04 · Version 1.0</p>

        <h2>1. Introduction</h2>
        <p>This Privacy Policy explains what data PentHub ("we") collects, why we collect it, how we use and protect it, and what choices you have. It applies to the website, APIs and related services.</p>

        <h2>2. Data we collect</h2>
        <p><strong>2.1. Account data.</strong> Username, optional display name, hashed password (PBKDF2), recovery code hash, optional bio, optional avatar and banner images, registration date, and role flags (admin/moderator).</p>
        <p><strong>2.2. Content data.</strong> Threads, posts, tags, reactions, mentions, private messages, reports, tickets and appeals you create, with timestamps.</p>
        <p><strong>2.3. Technical data.</strong> IP address at registration, login and audited actions; session token hashes; approximate activity timestamps. We do not store raw session tokens.</p>
        <p><strong>2.4. Security checks.</strong> Turnstile verification results processed by Cloudflare to prevent abuse. Cloudflare also processes standard request metadata as part of delivering the site.</p>

        <h2>3. How we use data</h2>
        <p>3.1. To operate the service: display your content, deliver notifications and messages, and maintain community features.</p>
        <p>3.2. To secure the service: prevent abuse, enforce rules, investigate incidents, and maintain audit logs.</p>
        <p>3.3. To communicate with you: ticket replies, appeal outcomes, and service notices.</p>
        <p>3.4. We do not sell personal data and we do not use it for advertising.</p>

        <h2>4. Legal bases</h2>
        <p>Where applicable law requires a legal basis, we rely on: performance of the contract (providing the service you requested), legitimate interests (security, abuse prevention, moderation), consent (optional profile elements), and legal obligations (where disclosure is required by law).</p>

        <h2>5. Who we share data with</h2>
        <p>5.1. <strong>Cloudflare</strong> provides hosting, CDN, D1 database and Turnstile; request metadata is processed as described in Cloudflare's privacy policy.</p>
        <p>5.2. <strong>GitHub</strong> releases data is fetched publicly and displayed; no personal data is sent to GitHub by us.</p>
        <p>5.3. <strong>Authorities</strong>, only where we are legally compelled, and only the minimum necessary data.</p>
        <p>5.4. We do not share data with other third parties for their own use.</p>

        <h2>6. Retention</h2>
        <p>6.1. Account and content data are retained while your account exists.</p>
        <p>6.2. Deleted posts are soft-deleted and retained for moderation and safety review.</p>
        <p>6.3. Audit logs, reports, appeals and ban records are retained as long as needed for safety and legal compliance.</p>
        <p>6.4. Rate-limit counters expire automatically within their time window.</p>

        <h2>7. Your rights and choices</h2>
        <p>7.1. You can access and edit your profile, bio, avatar and banner in Settings at any time.</p>
        <p>7.2. You can change your password and rotate your recovery code in Settings.</p>
        <p>7.3. You can delete your own posts (or request deletion via Support where staff action is needed).</p>
        <p>7.4. You can request an export of your data, or account deletion, by opening a Support ticket. We will verify ownership before acting.</p>
        <p>7.5. Where applicable law grants additional rights (access, rectification, erasure, restriction, objection, portability, complaint to a supervisory authority), you may exercise them via Support.</p>

        <h2>8. Security</h2>
        <p>8.1. Passwords are hashed with PBKDF2; sessions are stored as hashes; cookies are HttpOnly, Secure and SameSite=Lax.</p>
        <p>8.2. Access to administrative functions is restricted and audited.</p>
        <p>8.3. No method of transmission or storage is 100% secure; we work to protect your data with reasonable measures.</p>

        <h2>9. Children</h2>
        <p>The service is not directed to children under 18 (or the age of majority). We do not knowingly collect data from children. If you believe a child has provided data, contact us and we will delete it.</p>

        <h2>10. International transfers</h2>
        <p>Data is processed where our infrastructure operates (Cloudflare's global network). Where required, we rely on appropriate safeguards for international transfers.</p>

        <h2>11. Cookies and local storage</h2>
        <p>11.1. We use one essential session cookie. We do not use advertising or tracking cookies.</p>
        <p>11.2. Your browser stores local preferences (for example, whether you have seen the welcome page or changelog). This data never leaves your device.</p>

        <h2>12. Changes to this policy</h2>
        <p>We may update this policy. The effective date at the top changes accordingly, and material changes are announced through the service. Continued use after the effective date means acceptance.</p>

        <h2>13. Contact</h2>
        <p>Privacy questions and rights requests: open a ticket on the Support page. Include enough information to verify ownership, but do not send secrets in tickets.</p>
      </section>
    `;
  };
}

// === ADMIN ===

function reportRowHtml(report) {
  const bodyPreview = report.post_body || '';

  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="chip ${report.status === 'open' ? 'warn' : ''}">${esc(report.status)}</span>
        <span class="muted">reported by @${esc(report.reporter)}</span>
        <span class="muted">· ${time(report.created_at)}</span>
      </div>
      <p class="report-reason">Reason: ${esc(report.reason)}</p>
      <div class="post-body muted">Post by @${esc(report.post_author)}: ${esc(bodyPreview.slice(0, 300))}${bodyPreview.length > 300 ? '…' : ''}</div>
      <div class="feed-tags"><a href="#/thread/${Number(report.thread_id)}">Thread: ${esc(report.thread_title)}</a></div>
      ${report.status === 'open' ? `
        <div class="admin-controls">
          <button class="btn small" data-admin-report="${report.id}" data-admin-action="resolve">Resolve</button>
          <button class="btn ghost small" data-admin-report="${report.id}" data-admin-action="dismiss">Dismiss</button>
        </div>
      ` : ''}
    </article>
  `;
}

function userRowHtml(user) {
  return `
    <article class="admin-row">
      <div class="admin-row-head">
        ${avatarHtml(user.username, 'small', '')}
        <span class="feed-name">${esc(user.display_name || user.username)}</span>
        <span class="muted">@${esc(user.username)}</span>
        ${user.is_admin ? '<span class="chip green">admin</span>' : ''}
        ${user.is_moderator ? '<span class="chip">moderator</span>' : ''}
        ${user.banned ? `<span class="chip danger">banned: ${esc(user.ban_reason || '—')}</span>` : ''}
      </div>
      <div class="feed-tags">
        <span class="muted">id ${user.id} · ${user.thread_count} threads · ${user.post_count} posts · since ${time(user.created_at)}</span>
      </div>
      <div class="admin-controls">
        ${user.banned
          ? `<button class="btn small" data-admin-user="${user.id}" data-admin-action="unban">Unban</button>`
          : `<button class="btn danger small" data-admin-user-ban="${user.id}">Ban</button>`}
        ${user.is_moderator
          ? `<button class="btn ghost small" data-admin-user="${user.id}" data-admin-action="mod_demote">Demote moderator</button>`
          : `<button class="btn ghost small" data-admin-user="${user.id}" data-admin-action="mod_promote">Make moderator</button>`}
        <a class="btn ghost small" href="#/user/${encodeURIComponent(user.username)}">View profile</a>
      </div>
    </article>
  `;
}

function auditRowHtml(log) {
  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="chip">${esc(log.action)}</span>
        <span class="muted">${log.username ? '@' + esc(log.username) : 'system'}</span>
        <span class="muted">${esc(log.ip || '')}</span>
        <span class="muted">· ${time(log.created_at)}</span>
      </div>
      ${log.details ? `<div class="feed-tags muted">${esc(log.details)}</div>` : ''}
    </article>
  `;
}

function appealRowHtml(a) {
  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="chip ${a.status === 'pending' ? 'warn' : a.status === 'approved' ? 'green' : 'danger'}">${esc(a.status)}</span>
        <span class="feed-name">@${esc(a.username)}</span>
        <span class="muted">· ${time(a.created_at)}</span>
      </div>
      <div class="post-body">${esc(a.reason)}</div>
      ${a.status === 'pending' ? `
        <div class="admin-controls">
          <button class="btn small" data-appeal-approve="${a.id}">Approve (unban)</button>
          <button class="btn ghost small" data-appeal-reject="${a.id}">Reject</button>
          <a class="btn ghost small" href="#/user/${encodeURIComponent(a.username)}">Profile</a>
        </div>
      ` : `<div class="muted">Resolved ${a.resolved_at ? time(a.resolved_at) : ''}</div>`}
    </article>
  `;
}

function badgeRowHtml(b) {
  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="badge-chip" style="color:${esc(b.color)};border-color:${esc(b.color)}40">${esc(b.icon)} ${esc(b.label)}</span>
        <span class="muted">${esc(b.name)}</span>
        <span class="muted">· ${time(b.created_at)}</span>
      </div>
      <div class="admin-controls">
        <button class="btn danger small" data-badge-delete="${b.id}">Delete badge</button>
      </div>
    </article>
  `;
}

async function exportBackup() {
  try {
    const data = await api('/api/admin?type=export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `penthub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export ready');
  } catch (error) {
    toast(error.message, true);
  }
}

function renderAdmin(query) {
  return async function adminView() {
    if (!isStaff()) {
      app.innerHTML = '<section class="card narrow"><h1>403</h1><p class="error">Staff only.</p></section>';
      return;
    }

    const tab = ['reports', 'users', 'audit', 'appeals', 'badges', 'changelog'].includes(query.get('tab'))
      ? query.get('tab')
      : 'reports';

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const status = query.get('status') || 'open';

    if (['users', 'audit', 'appeals', 'badges', 'changelog'].includes(tab) && !state.me.isAdmin) {
      app.innerHTML = '<section class="card narrow"><h1>403</h1><p class="error">This section is admin-only.</p></section>';
      return;
    }

    let content = '';

    if (tab === 'reports') {
      const data = await api(`/api/admin?type=reports&page=${page}&status=${encodeURIComponent(status)}`);
      const reports = data.reports || [];
      content = `
        <div class="admin-controls">
          <a class="btn ghost small" href="#/admin?tab=reports&status=open">Open</a>
          <a class="btn ghost small" href="#/admin?tab=reports&status=all">All</a>
        </div>
      `;
      content += reports.length ? reports.map(reportRowHtml).join('') : '<section class="empty">No reports.</section>';
      content += paginationHtml(`#/admin?tab=reports&status=${encodeURIComponent(status)}`, page, data.hasMore);
    } else if (tab === 'users') {
      const q = query.get('q') || '';
      const data = await api(`/api/admin?type=users&page=${page}&q=${encodeURIComponent(q)}`);
      const users = data.users || [];
      content = `
        <form id="admin-user-search" class="form">
          <input id="admin-user-q" class="input" placeholder="Search username" value="${esc(q)}" maxlength="32" />
        </form>
      `;
      content += users.length ? users.map(userRowHtml).join('') : '<section class="empty">Nobody found.</section>';
      content += paginationHtml(`#/admin?tab=users&q=${encodeURIComponent(q)}`, page, data.hasMore);
    } else if (tab === 'audit') {
      const data = await api(`/api/admin?type=audit&page=${page}`);
      const logs = data.logs || [];
      content = logs.length ? logs.map(auditRowHtml).join('') : '<section class="empty">Log is empty.</section>';
      content += paginationHtml('#/admin?tab=audit', page, data.hasMore);
    } else if (tab === 'appeals') {
      const data = await api(`/api/admin?type=appeals&page=${page}`);
      const appeals = data.appeals || [];
      content = appeals.length ? appeals.map(appealRowHtml).join('') : '<section class="empty">No appeals.</section>';
      content += paginationHtml('#/admin?tab=appeals', page, data.hasMore);
    } else if (tab === 'badges') {
      const data = await api('/api/badges');
      const badges = data.badges || [];
      content = `
        <details class="card">
          <summary>Create badge</summary>
          <form id="badge-create" class="form" style="margin-top:10px">
            <label>Name (slug) <input id="b-name" class="input" required minlength="2" maxlength="24" placeholder="founder" /></label>
            <label>Label <input id="b-label" class="input" required maxlength="24" placeholder="Founder" /></label>
            <label>Icon (1-2 chars) <input id="b-icon" class="input" maxlength="2" value="★" /></label>
            <label>Color
              <select id="b-color">
                <option value="#58a6ff">Blue</option>
                <option value="#3fb950">Green</option>
                <option value="#d29922">Amber</option>
                <option value="#f85149">Red</option>
                <option value="#a371f7">Purple</option>
                <option value="#f778ba">Pink</option>
              </select>
            </label>
            <button class="btn" type="submit">Create</button>
          </form>
        </details>

        <details class="card">
          <summary>Assign / revoke badge</summary>
          <form id="badge-assign-form" class="form" style="margin-top:10px">
            <label>Username <input id="ba-username" class="input" required minlength="3" maxlength="32" /></label>
            <label>Badge
              <select id="ba-badge">
                ${badges.map((b) => `<option value="${b.id}">${esc(b.icon)} ${esc(b.label)} (${esc(b.name)})</option>`).join('')}
              </select>
            </label>
            <div class="admin-controls">
              <button class="btn small" type="button" id="ba-assign">Assign</button>
              <button class="btn danger small" type="button" id="ba-revoke">Revoke</button>
            </div>
          </form>
        </details>

        ${badges.length ? badges.map(badgeRowHtml).join('') : '<section class="empty">No badges.</section>'}
      `;
    } else if (tab === 'changelog') {
      const data = await api(`/api/changelog?page=${page}`);
      const items = data.items || [];
      content = `
        <button class="btn small" id="changelog-new-admin" style="margin-bottom:14px">+ New changelog entry</button>
      `;
      content += items.length
        ? items.map((c) => `
            <article class="admin-row">
              <div class="admin-row-head">
                <span class="chip green">${esc(c.version)}</span>
                <span class="feed-name">${esc(c.title)}</span>
                <span class="muted">· ${time(c.created_at)}</span>
              </div>
              <div class="post-body">${mdToHtml(c.body.slice(0, 300))}</div>
            </article>
          `).join('')
        : '<section class="empty">No changelog yet.</section>';
      content += paginationHtml('#/admin?tab=changelog', page, data.hasMore);
    }

    app.innerHTML = `
      <section class="page-head">
        <h1>Admin</h1>
        ${state.me.isAdmin ? '<button id="export-btn" class="btn ghost small">Download backup (JSON)</button>' : ''}
      </section>

      <nav class="tabs">
        <a class="tab ${tab === 'reports' ? 'active' : ''}" href="#/admin?tab=reports">Reports</a>
        ${state.me.isAdmin ? `<a class="tab ${tab === 'users' ? 'active' : ''}" href="#/admin?tab=users">Users</a>` : ''}
        ${state.me.isAdmin ? `<a class="tab ${tab === 'appeals' ? 'active' : ''}" href="#/admin?tab=appeals">Appeals</a>` : ''}
        ${state.me.isAdmin ? `<a class="tab ${tab === 'badges' ? 'active' : ''}" href="#/admin?tab=badges">Badges</a>` : ''}
        ${state.me.isAdmin ? `<a class="tab ${tab === 'changelog' ? 'active' : ''}" href="#/admin?tab=changelog">Changelog</a>` : ''}
        ${state.me.isAdmin ? `<a class="tab ${tab === 'audit' ? 'active' : ''}" href="#/admin?tab=audit">Audit log</a>` : ''}
      </nav>

      ${content}
    `;

    bindAdminPage();
  };
}

function bindAdminPage() {
  document.querySelectorAll('[data-admin-report]').forEach((button) => {
    button.addEventListener('click', () => adminAction('report', Number(button.dataset.adminReport), button.dataset.adminAction));
  });

  document.querySelectorAll('[data-admin-user]').forEach((button) => {
    button.addEventListener('click', () => adminAction('user', Number(button.dataset.adminUser), button.dataset.adminAction));
  });

  document.querySelectorAll('[data-admin-user-ban]').forEach((button) => {
    button.addEventListener('click', () => {
      const reason = prompt('Ban reason (shown to the user):');
      if (!reason) return;
      adminAction('user', Number(button.dataset.adminUserBan), 'ban', { reason });
    });
  });

  document.querySelectorAll('[data-appeal-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api('/api/appeals', { method: 'POST', body: JSON.stringify({ action: 'approve', id: Number(button.dataset.appealApprove) }) });
        toast('Appeal approved, user unbanned');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('[data-appeal-reject]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api('/api/appeals', { method: 'POST', body: JSON.stringify({ action: 'reject', id: Number(button.dataset.appealReject) }) });
        toast('Appeal rejected');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('[data-badge-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this badge? It will be revoked from everyone.')) return;
      try {
        await api('/api/badges', { method: 'POST', body: JSON.stringify({ action: 'delete', id: Number(button.dataset.badgeDelete) }) });
        toast('Badge deleted');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  const searchForm = document.getElementById('admin-user-search');

  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const q = document.getElementById('admin-user-q').value.trim();
      location.hash = `#/admin?tab=users&q=${encodeURIComponent(q)}`;
    });
  }

  document.getElementById('export-btn')?.addEventListener('click', exportBackup);

  const badgeCreate = document.getElementById('badge-create');

  if (badgeCreate) {
    badgeCreate.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/api/badges', {
          method: 'POST',
          body: JSON.stringify({
            action: 'create',
            name: document.getElementById('b-name').value,
            label: document.getElementById('b-label').value,
            icon: document.getElementById('b-icon').value,
            color: document.getElementById('b-color').value
          })
        });
        toast('Badge created');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  async function assignOrRevoke(action) {
    try {
      const username = document.getElementById('ba-username').value.trim();
      const badgeId = Number(document.getElementById('ba-badge').value);
      const profile = await api(`/api/profile?username=${encodeURIComponent(username)}`);

      await api('/api/badges', {
        method: 'POST',
        body: JSON.stringify({ action, userId: profile.profile.user.id, badgeId })
      });

      toast(action === 'assign' ? 'Badge assigned' : 'Badge revoked');
      await render();
    } catch (error) {
      toast(error.message, true);
    }
  }

  document.getElementById('ba-assign')?.addEventListener('click', () => assignOrRevoke('assign'));
  document.getElementById('ba-revoke')?.addEventListener('click', () => assignOrRevoke('revoke'));

  document.getElementById('changelog-new-admin')?.addEventListener('click', () => {
    const version = prompt('Version (e.g. 1.1.0):');
    if (!version) return;
    const title = prompt('Title:');
    if (!title) return;
    const body = prompt('Body (markdown):');
    if (!body) return;

    api('/api/changelog', { method: 'POST', body: JSON.stringify({ version, title, body }) })
      .then(() => { toast('Published'); render(); })
      .catch((err) => toast(err.message, true));
  });
}
// === FIXES PART 3 (overrides) ===

// 1) Share as inline dropdown, not a corner box
function shareButtonHtml(url, title) {
  return `
    <div class="menu-wrap" data-share-url="${esc(url)}" data-share-title="${esc(title)}">
      <button class="action" data-share-toggle>${ICONS.share} Share</button>
      <div class="menu">
        <button data-share-act="copy">Copy link</button>
        <button data-share-act="twitter">Twitter / X</button>
        <button data-share-act="reddit">Reddit</button>
        <button data-share-act="hn">Hacker News</button>
      </div>
    </div>
  `;
}

function attachShareHandlers() {
  // handled by global delegation below
}

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-share-toggle]');

  if (toggle) {
    e.stopPropagation();
    const menu = toggle.parentElement.querySelector('.menu');
    if (menu) openMenu(menu);
    return;
  }

  const act = e.target.closest('[data-share-act]');

  if (act) {
    e.stopPropagation();
    const wrap = act.closest('[data-share-url]');
    const url = wrap?.dataset.shareUrl || location.href;
    const title = wrap?.dataset.shareTitle || '';
    const encoded = encodeURIComponent(url);
    const t = encodeURIComponent(title);
    const kind = act.dataset.shareAct;

    if (kind === 'copy') {
      navigator.clipboard?.writeText(url)
        .then(() => toast('Link copied'))
        .catch(() => toast('Copy failed', true));
    } else if (kind === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${t}&url=${encoded}`, '_blank', 'noopener');
    } else if (kind === 'reddit') {
      window.open(`https://www.reddit.com/submit?url=${encoded}&title=${t}`, '_blank', 'noopener');
    } else if (kind === 'hn') {
      window.open(`https://news.ycombinator.com/submitlink?u=${encoded}&t=${t}`, '_blank', 'noopener');
    }

    closeMenus();
  }
});

// 10) smaller sidebar + 9) Forum button
function updateSidebar() {
  if (!sidebar) return;

  const ntf = Number(state.me?.notifications_unread || 0);
  const pm = Number(state.me?.unread_count || 0);
  const active = location.hash.replace(/^#\/?/, '').split('?')[0];

  const main = [
    { href: '', label: 'Home', icon: ICONS.home },
    { href: 'forum', label: 'Forum', icon: ICONS.book },
    { href: 'categories', label: 'Categories', icon: ICONS.grid },
    { href: 'learn', label: 'Learn', icon: ICONS.grad },
    { href: 'firmware', label: 'Firmware', icon: ICONS.shield },
    { href: 'rules', label: 'Rules', icon: ICONS.book },
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

// 9) Home = personal dashboard; forum feed moved to #/forum
function renderHome() {
  return async function homeView() {
    if (!state.me) {
      await renderWelcome()();
      return;
    }

    const [p1, p2, rel] = await Promise.all([
      api('/api/threads?page=1'),
      api('/api/threads?page=2').catch(() => ({ threads: [] })),
      api('/api/releases').catch(() => ({ releases: [] }))
    ]);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const topWeek = [...(p1.threads || []), ...(p2.threads || [])]
      .filter((t) => t.updated_at > weekAgo)
      .sort((a, b) => Number(b.post_count || 0) - Number(a.post_count || 0))
      .slice(0, 5);

    const releases = (rel.releases || []).slice(0, 4);

    app.innerHTML = `
      <section class="welcome-hero" style="text-align:left;padding:22px;animation:rise .4s ease both">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          ${avatarHtml(state.me.username, '', state.me.avatar || '')}
          <div style="flex:1;min-width:200px">
            <h1 style="font-size:1.3rem;margin:0">Hey, ${esc(state.me.display_name || state.me.username)}</h1>
            <p style="margin:4px 0 0">Your security community dashboard.</p>
          </div>
          <div class="top-actions">
            <a class="btn small" href="#/new-thread">+ New thread</a>
            <a class="btn ghost small" href="#/forum">Open forum</a>
          </div>
        </div>
      </section>

      <section class="page-head"><h2>Top threads this week</h2></section>
      ${topWeek.length ? topWeek.map(threadRowHtml).join('') : '<section class="empty">No activity this week yet.</section>'}

      <section class="page-head" style="margin-top:20px"><h2>Popular projects</h2></section>
      <div class="feature-grid">
        ${releases.map((r) => `
          <a class="feature-card" href="${esc(r.url)}" target="_blank" rel="noopener">
            <h3>${esc(r.source)} ${esc(r.tag)}</h3>
            <p>${esc((r.title || '').slice(0, 80))}</p>
          </a>
        `).join('') || `
          <a class="feature-card" href="#/firmware"><h3>Firmware Hub</h3><p>Releases will appear once the sync cron runs.</p></a>
        `}
        <a class="feature-card" href="#/firmware/bruce/wiki"><h3>Bruce wiki index</h3><p>Curated summaries with links to the official wiki.</p></a>
      </div>

      <section class="page-head" style="margin-top:20px"><h2>Useful links</h2></section>
      <div class="feature-grid">
        <a class="feature-card" href="#/learn"><h3>Learn</h3><p>Original training articles: labs, CTF path, UART/JTAG, disclosure.</p></a>
        <a class="feature-card" href="#/rules"><h3>Rules</h3><p>What is allowed and what gets you banned.</p></a>
        <a class="feature-card" href="#/support"><h3>Support</h3><p>Tickets for account issues and questions.</p></a>
        <a class="feature-card" href="/api/rss" ><h3>RSS</h3><p>Follow new threads in your reader.</p></a>
      </div>
    `;

    attachShareHandlers(app);
  };
}

function renderForum(query) {
  return async function forumView() {
    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/threads?page=${page}`);
    const threads = data.threads || [];

    app.innerHTML = `
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
        ${shareButtonHtml(`${location.origin}/#/forum`, 'PentHub forum')}
      </section>

      ${threads.length ? threads.map(threadRowHtml).join('') : '<section class="empty">No threads yet.</section>'}

      ${paginationHtml('#/forum', page, Boolean(data.hasMore))}
    `;

    attachShareHandlers(app);
  };
}

// 6) Welcome: guests only, more attractive
function renderWelcome() {
  return async function welcomeView() {
    if (state.me) { location.hash = '#/'; return; }

    const totalThreads = state.categories.reduce((a, c) => a + Number(c.thread_count || 0), 0);

    app.innerHTML = `
      <section class="welcome-hero">
        <img class="welcome-logo" src="/logo.svg" alt="PentHub logo" />
        <h1>The home of legal hardware hacking</h1>
        <p>
          PentHub is a community for <strong>authorized</strong> security research:
          ESP32 & Flipper Zero labs, CTF training, defensive security and firmware deep-dives.
        </p>
        <p class="muted">${state.categories.length} categories · ${totalThreads} threads · original training articles · auto-synced firmware releases</p>
        <div class="admin-controls" style="justify-content:center">
          <a class="btn" href="#/register">Create account</a>
          <a class="btn blue" href="#/login">Log in</a>
          <a class="btn ghost" href="#/forum">Browse forum</a>
        </div>
      </section>

      <section class="feature-grid">
        <a class="feature-card" href="#/learn">
          <h3>Learn by doing</h3>
          <p>Home Wi-Fi labs, CTF path, UART/JTAG basics, responsible disclosure — original articles.</p>
        </a>
        <a class="feature-card" href="#/firmware">
          <h3>Firmware Hub</h3>
          <p>Bruce & friends: releases auto-synced from GitHub with discussion threads.</p>
        </a>
        <a class="feature-card" href="#/categories">
          <h3>Pick your lane</h3>
          <p>Firmwares, Hardwares, Networks, Research, Training — find your community.</p>
        </a>
        <a class="feature-card" href="#/rules">
          <h3>Safe by design</h3>
          <p>Authorized research only. Reports, appeals, audits and transparent moderation.</p>
        </a>
      </section>

      <section class="card" style="text-align:center">
        <h2 style="margin-top:0">Why people join</h2>
        <p class="muted">
          “Finally a place where ESP32 tinkerers, CTF players and professional pentesters
          talk shop without stepping over the legal line.”
        </p>
        <div class="admin-controls" style="justify-content:center">
          <a class="btn" href="#/register">Join PentHub — it's free</a>
        </div>
      </section>
    `;
  };
}

// 2) fixed router: settings gets query, forum route added
async function render() {
  const { segments, query } = parseRoute();

  app.innerHTML = '<div class="loading">Loading...</div>';

  updateSidebar();
  updateRightbar();

  try {
    const section = segments[0] || '';

    if (!section) await renderHome()();
    else if (section === 'welcome') await renderWelcome()();
    else if (section === 'forum') await renderForum(query)();
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
    else if (section === 'settings') await renderSettings(query)();
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
// === PART 4: attachments + no native dialogs ===

const attachStore = {};

function attachmentsHtml(list) {
  if (!list || !list.length) return '';
  return `
    <div class="attach-grid">
      ${list.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="attachment"></a>`).join('')}
    </div>
  `;
}

function attachPickerHtml(pid) {
  return `
    <div class="admin-controls">
      <label class="btn ghost small" style="cursor:pointer">
        📎 Attach image
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-attach-input="${pid}" hidden />
      </label>
    </div>
    <div class="attach-grid" id="attach-preview-${pid}"></div>
  `;
}

function renderAttachPreview(pid) {
  const box = document.getElementById(`attach-preview-${pid}`);
  if (!box) return;

  box.innerHTML = (attachStore[pid] || []).map((u, i) => `
    <span class="attach-item">
      <img src="${esc(u)}" alt="">
      <button type="button" class="attach-remove" data-attach-remove="${pid}:${i}">✕</button>
    </span>
  `).join('');

  box.querySelectorAll('[data-attach-remove]').forEach((b) => {
    b.addEventListener('click', () => {
      const [p, idx] = b.dataset.attachRemove.split(':');
      (attachStore[p] || []).splice(Number(idx), 1);
      renderAttachPreview(p);
    });
  });
}

function bindAttachPicker(pid) {
  attachStore[pid] = attachStore[pid] || [];
  const input = document.querySelector(`[data-attach-input="${pid}"]`);
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    if ((attachStore[pid] || []).length >= 4) {
      toast('Max 4 images per message', true);
      input.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataURL(file, 1500000);
      const res = await api('/api/upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      attachStore[pid].push(res.url);
      renderAttachPreview(pid);
      toast('Image attached');
    } catch (e) {
      toast(e.message, true);
    }

    input.value = '';
  });

  renderAttachPreview(pid);
}

// postHtml override: render attachments
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
        ${attachmentsHtml(post.attachments)}
        ${state.me ? reactionsHtml(post) : ''}
        ${actionBarHtml(post)}
      </div>
    </article>
  `;
}

// thread override: reply form with attachments
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

    const replyInner = (!state.me)
      ? `<p class="notice"><a href="#/login">Log in</a> to reply.</p>`
      : (thread.is_locked && !isStaff())
        ? `<p class="notice warn">Thread is locked.</p>`
        : `
          <form id="reply-form" class="form">
            <label>Reply <textarea id="reply-body" maxlength="10000" required minlength="1"></textarea></label>
            <div id="reply-attach-slot">${attachPickerHtml('reply')}</div>
            <p class="muted">Markdown: **bold**, *italic*, \`code\`, \`\`\`blocks\`\`\`, lists, &gt; quotes, [link](https://...), @mentions</p>
            <button class="btn" type="submit">Reply</button>
            <div id="reply-error" class="form-error"></div>
          </form>
        `;

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
        ${replyInner}
      </section>
    `;

    bindAttachPicker('reply');
    bindThreadPage(thread, posts);
    attachShareHandlers(app);

    const replyForm = document.getElementById('reply-form');

    if (replyForm) {
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('reply-error');

        try {
          await api('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
              threadId: thread.id,
              body: document.getElementById('reply-body').value,
              attachments: attachStore['reply'] || []
            })
          });
          attachStore['reply'] = [];
          toast('Reply published');
          await render();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }
  };
}

// new thread with attachments
function renderNewThread(query) {
  return async function newThreadView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const categories = await ensureCategories();
    const selectedCategory = query.get('category') || '';

    app.innerHTML = `
      <section class="card narrow">
        <h1>New thread</h1>
        <p class="muted">Legal research, education, CTF, defensive security or authorized pentesting only.</p>
        <form id="new-thread-form" class="form">
          <label>
            Category
            <select id="thread-category" required>
              <option value="">Pick a category</option>
              ${categories.map((c) => `<option value="${c.id}" ${c.slug === selectedCategory ? 'selected' : ''}>${esc(c.section)} · ${esc(c.name)}</option>`).join('')}
            </select>
          </label>
          <label>Title <input id="thread-title" class="input" required minlength="4" maxlength="160" /></label>
          <label>Tags (comma separated, max 5) <input id="thread-tags" class="input" maxlength="120" placeholder="esp32, lab, wifi-audit" /></label>
          <label>First post <textarea id="thread-body" required minlength="1" maxlength="10000"></textarea></label>
          ${attachPickerHtml('newthread')}
          <button class="btn" type="submit">Publish</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    bindAttachPicker('newthread');

    document.getElementById('new-thread-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('form-error');

      try {
        const data = await api('/api/threads', {
          method: 'POST',
          body: JSON.stringify({
            categoryId: Number(document.getElementById('thread-category').value),
            title: document.getElementById('thread-title').value.trim(),
            body: document.getElementById('thread-body').value,
            tags: document.getElementById('thread-tags').value
          })
        });

        const firstPostId = data.id;

        if ((attachStore['newthread'] || []).length) {
          // attach images to the first post via edit (keeps threads.js simple)
          await api('/api/posts', {
            method: 'PATCH',
            body: JSON.stringify({
              postId: await getFirstPostId(firstPostId),
              body: document.getElementById('thread-body').value,
              attachments: attachStore['newthread']
            })
          }).catch(() => {});
        }

        attachStore['newthread'] = [];
        toast('Thread created');
        location.hash = `#/thread/${data.id}`;
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

async function getFirstPostId(threadId) {
  const data = await api(`/api/posts?threadId=${threadId}&page=1`);
  return (data.posts || [])[0]?.id;
}

// PM new + conversation with attachments
function renderNewMessage(query) {
  return function newMessageView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const to = query.get('to') || '';

    app.innerHTML = `
      <section class="card narrow">
        <h1>New message</h1>
        <form id="pm-new-form" class="form">
          <label>To <input id="pm-to" class="input" required minlength="3" maxlength="32" value="${esc(to)}" /></label>
          <label>Message <textarea id="pm-body" maxlength="5000" required minlength="1"></textarea></label>
          ${attachPickerHtml('pm-new')}
          <button class="btn" type="submit">Send</button>
          <div id="pm-error" class="form-error"></div>
        </form>
      </section>
    `;

    bindAttachPicker('pm-new');

    document.getElementById('pm-new-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('pm-error');

      try {
        await api('/api/messages', {
          method: 'POST',
          body: JSON.stringify({
            toUsername: document.getElementById('pm-to').value.trim(),
            body: document.getElementById('pm-body').value,
            attachments: attachStore['pm-new'] || []
          })
        });
        attachStore['pm-new'] = [];
        toast('Sent');
        location.hash = `#/messages/user/${encodeURIComponent(document.getElementById('pm-to').value.trim())}`;
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function renderConversation(username, query) {
  return async function conversationView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/messages?with=${encodeURIComponent(username)}&page=${page}`);
    const messages = data.messages || [];

    loadMe().then(() => { updateTopbar(); updateSidebar(); });

    app.innerHTML = `
      <section class="page-head">
        <h1>Chat with ${userLink(data.with.username)}</h1>
        <a class="btn ghost small" href="#/messages">Inbox</a>
      </section>

      ${messages.map((m) => postHtml({ ...m, username: m.sender_username, is_admin: false, badges: [], reactions: [] })).join('') || '<section class="empty">No messages yet.</section>'}

      ${paginationHtml(`#/messages/user/${encodeURIComponent(username)}`, page, Boolean(data.hasMore))}

      <form id="pm-reply-form" class="form">
        <label>Message <textarea id="pm-reply-body" maxlength="5000" required minlength="1"></textarea></label>
        ${attachPickerHtml('pm-reply')}
        <button class="btn" type="submit">Send</button>
        <div id="pm-reply-error" class="form-error"></div>
      </form>
    `;

    bindAttachPicker('pm-reply');

    document.getElementById('pm-reply-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('pm-reply-error');

      try {
        await api('/api/messages', {
          method: 'POST',
          body: JSON.stringify({
            toUsername: username,
            body: document.getElementById('pm-reply-body').value,
            attachments: attachStore['pm-reply'] || []
          })
        });
        attachStore['pm-reply'] = [];
        toast('Sent');
        await render();
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

// Support: proper modal instead of prompt()
function renderSupport(query) {
  return async function supportView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/tickets?page=${page}`);
    const tickets = data.tickets || [];

    app.innerHTML = `
      <section class="page-head">
        <h1>Support</h1>
        <button class="btn small" id="support-new">+ New ticket</button>
      </section>

      <p class="muted">Use tickets for account issues, bug reports or questions to the team. For public discussions, post in a category.</p>

      ${tickets.length ? tickets.map((t) => `
        <a class="feed-row" href="#/ticket/${Number(t.id)}">
          <span class="notif-icon">${t.status === 'open' ? '?' : '✓'}</span>
          <div class="feed-main">
            <div class="feed-head">
              <span class="chip ${t.status === 'open' ? 'warn' : 'green'}">${esc(t.status)}</span>
              <span class="feed-name">${esc(t.subject)}</span>
              ${t.username ? `<span class="muted">· @${esc(t.username)}</span>` : ''}
            </div>
            <div class="muted">Updated ${time(t.updated_at)}</div>
          </div>
        </a>
      `).join('') : '<section class="empty">No tickets yet.</section>'}

      ${paginationHtml('#/support', page, Boolean(data.hasMore))}
    `;

    document.getElementById('support-new').addEventListener('click', () => {
      openTicketModal();
    });
  };
}

function openTicketModal() {
  const m = document.getElementById('ticket-modal');
  document.getElementById('ticket-subject').value = '';
  document.getElementById('ticket-body').value = '';
  document.getElementById('ticket-modal-error').textContent = '';
  document.getElementById('ticket-attach-slot').innerHTML = attachPickerHtml('ticket');
  bindAttachPicker('ticket');
  m.classList.remove('hidden');
}

document.getElementById('ticket-modal-cancel').addEventListener('click', () => {
  document.getElementById('ticket-modal').classList.add('hidden');
});

document.getElementById('ticket-modal').addEventListener('click', (e) => {
  if (e.target.id === 'ticket-modal') e.target.classList.add('hidden');
});

document.getElementById('ticket-modal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('ticket-modal-error');

  try {
    const res = await api('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        subject: document.getElementById('ticket-subject').value,
        body: document.getElementById('ticket-body').value,
        attachments: attachStore['ticket'] || []
      })
    });

    attachStore['ticket'] = [];
    document.getElementById('ticket-modal').classList.add('hidden');
    toast('Ticket created');
    location.hash = `#/ticket/${res.id}`;
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// Ticket view with attachments in replies
function renderTicket(ticketId) {
  return async function ticketView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const data = await api(`/api/tickets?id=${ticketId}`);
    const { ticket, messages } = data;

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h1>${esc(ticket.subject)}</h1>
          <div class="feed-tags">
            <span class="chip ${ticket.status === 'open' ? 'warn' : 'green'}">${esc(ticket.status)}</span>
            <span class="muted">Opened ${time(ticket.created_at)} · Updated ${time(ticket.updated_at)}</span>
          </div>
        </div>
        <a class="btn ghost small" href="#/support">Back</a>
      </section>

      <section>
        ${messages.map((m) => `
          <article class="post">
            ${avatarHtml(m.username, '')}
            <div class="post-main">
              <div class="feed-head">
                <span class="feed-name">${userLink(m.username)}</span>
                ${m.is_staff ? '<span class="chip green">staff</span>' : ''}
                <span class="muted">· ${time(m.created_at)}</span>
              </div>
              <div class="post-body">${mdToHtml(m.body)}</div>
              ${attachmentsHtml(m.attachments)}
            </div>
          </article>
        `).join('')}
      </section>

      ${ticket.status === 'closed' && !isStaff() ? '<p class="notice">This ticket is closed.</p>' : `
        <form id="ticket-reply" class="form">
          <label>Reply <textarea id="ticket-reply-body" maxlength="5000" required minlength="1"></textarea></label>
          ${attachPickerHtml('ticket-reply')}
          <div class="admin-controls">
            <button class="btn" type="submit">Send</button>
            ${isStaff() ? `<button class="btn ghost" type="button" data-ticket-close="${ticket.id}">${ticket.status === 'closed' ? 'Reopen' : 'Close ticket'}</button>` : ''}
          </div>
          <div id="ticket-error" class="form-error"></div>
        </form>
      `}
    `;

    bindAttachPicker('ticket-reply');

    const replyForm = document.getElementById('ticket-reply');

    if (replyForm) {
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('ticket-error');

        try {
          await api('/api/tickets', {
            method: 'POST',
            body: JSON.stringify({
              action: 'reply',
              ticketId,
              body: document.getElementById('ticket-reply-body').value,
              attachments: attachStore['ticket-reply'] || []
            })
          });
          attachStore['ticket-reply'] = [];
          toast('Reply sent');
          await render();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }

    const closeBtn = document.querySelector('[data-ticket-close]');

    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        try {
          await api('/api/tickets', {
            method: 'POST',
            body: JSON.stringify({ action: ticket.status === 'closed' ? 'reopen' : 'close', ticketId })
          });
          toast('Ticket updated');
          await render();
        } catch (error) {
          toast(error.message, true);
        }
      });
    }
  };
}

// Changelog: modal instead of prompt()
function renderChangelog(query) {
  return async function changelogView() {
    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/changelog?page=${page}`);
    const items = data.items || [];

    if (data.latest_id) {
      state.changelogSeenId = data.latest_id;
      localStorage.setItem('penthub_changelog_seen', String(data.latest_id));
      whatsnewBar.classList.add('hidden');
    }

    app.innerHTML = `
      <section class="page-head">
        <h1>What's new</h1>
        ${state.me?.isAdmin ? '<button class="btn small" id="changelog-new">+ New release</button>' : ''}
      </section>

      ${items.map((c) => `
        <article class="card">
          <div class="feed-head">
            <span class="chip green">${esc(c.version)}</span>
            <span class="feed-name">${esc(c.title)}</span>
            <span class="muted">· ${time(c.created_at)}</span>
          </div>
          <div class="post-body">${mdToHtml(c.body)}</div>
        </article>
      `).join('') || '<section class="empty">No changelog yet.</section>'}

      ${paginationHtml('#/changelog', page, Boolean(data.hasMore))}
    `;

    document.getElementById('changelog-new')?.addEventListener('click', () => {
      document.getElementById('cl-version').value = '';
      document.getElementById('cl-title').value = '';
      document.getElementById('cl-body').value = '';
      document.getElementById('changelog-modal-error').textContent = '';
      document.getElementById('changelog-modal').classList.remove('hidden');
    });
  };
}

document.getElementById('changelog-modal-cancel').addEventListener('click', () => {
  document.getElementById('changelog-modal').classList.add('hidden');
});

document.getElementById('changelog-modal').addEventListener('click', (e) => {
  if (e.target.id === 'changelog-modal') e.target.classList.add('hidden');
});

document.getElementById('changelog-modal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('changelog-modal-error');

  try {
    await api('/api/changelog', {
      method: 'POST',
      body: JSON.stringify({
        version: document.getElementById('cl-version').value,
        title: document.getElementById('cl-title').value,
        body: document.getElementById('cl-body').value
      })
    });
    document.getElementById('changelog-modal').classList.add('hidden');
    toast('Published');
    await render();
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// Admin override: ban via modal, badge delete via two-step confirm (no confirm())
function bindAdminPage() {
  document.querySelectorAll('[data-admin-report]').forEach((button) => {
    button.addEventListener('click', () => adminAction('report', Number(button.dataset.adminReport), button.dataset.adminAction));
  });

  document.querySelectorAll('[data-admin-user]').forEach((button) => {
    button.addEventListener('click', () => adminAction('user', Number(button.dataset.adminUser), button.dataset.adminAction));
  });

  document.querySelectorAll('[data-admin-user-ban]').forEach((button) => {
    button.addEventListener('click', () => {
      const userId = Number(button.dataset.adminUserBan);
      const banModal = document.getElementById('ban-modal');
      document.getElementById('ban-reason').value = '';
      banModal.classList.remove('hidden');

      const form = document.getElementById('ban-modal-form');
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = document.getElementById('ban-reason').value.trim();
        if (!reason) return;
        banModal.classList.add('hidden');
        adminAction('user', userId, 'ban', { reason });
      });
    });
  });

  document.getElementById('ban-modal-cancel').addEventListener('click', () => {
    document.getElementById('ban-modal').classList.add('hidden');
  });

  document.getElementById('ban-modal').addEventListener('click', (e) => {
    if (e.target.id === 'ban-modal') e.target.classList.add('hidden');
  });

  document.querySelectorAll('[data-appeal-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api('/api/appeals', { method: 'POST', body: JSON.stringify({ action: 'approve', id: Number(button.dataset.appealApprove) }) });
        toast('Appeal approved, user unbanned');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('[data-appeal-reject]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api('/api/appeals', { method: 'POST', body: JSON.stringify({ action: 'reject', id: Number(button.dataset.appealReject) }) });
        toast('Appeal rejected');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('[data-badge-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!button.dataset.armed) {
        button.dataset.armed = '1';
        button.classList.add('confirm-arm');
        button.textContent = 'Click again to confirm';
        setTimeout(() => {
          delete button.dataset.armed;
          button.classList.remove('confirm-arm');
          button.textContent = 'Delete badge';
        }, 3000);
        return;
      }

      try {
        await api('/api/badges', { method: 'POST', body: JSON.stringify({ action: 'delete', id: Number(button.dataset.badgeDelete) }) });
        toast('Badge deleted');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  const searchForm = document.getElementById('admin-user-search');

  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const q = document.getElementById('admin-user-q').value.trim();
      location.hash = `#/admin?tab=users&q=${encodeURIComponent(q)}`;
    });
  }

  document.getElementById('export-btn')?.addEventListener('click', exportBackup);

  const badgeCreate = document.getElementById('badge-create');

  if (badgeCreate) {
    badgeCreate.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/api/badges', {
          method: 'POST',
          body: JSON.stringify({
            action: 'create',
            name: document.getElementById('b-name').value,
            label: document.getElementById('b-label').value,
            icon: document.getElementById('b-icon').value,
            color: document.getElementById('b-color').value
          })
        });
        toast('Badge created');
        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  async function assignOrRevoke(action) {
    try {
      const username = document.getElementById('ba-username').value.trim();
      const badgeId = Number(document.getElementById('ba-badge').value);
      const profile = await api(`/api/profile?username=${encodeURIComponent(username)}`);

      await api('/api/badges', {
        method: 'POST',
        body: JSON.stringify({ action, userId: profile.profile.user.id, badgeId })
      });

      toast(action === 'assign' ? 'Badge assigned' : 'Badge revoked');
      await render();
    } catch (error) {
      toast(error.message, true);
    }
  }

  document.getElementById('ba-assign')?.addEventListener('click', () => assignOrRevoke('assign'));
  document.getElementById('ba-revoke')?.addEventListener('click', () => assignOrRevoke('revoke'));

  document.getElementById('changelog-new-admin')?.addEventListener('click', () => {
    document.getElementById('cl-version').value = '';
    document.getElementById('cl-title').value = '';
    document.getElementById('cl-body').value = '';
    document.getElementById('changelog-modal').classList.remove('hidden');
  });
}
// === PART 5: sidebar bottom account + full settings ===

function updateSidebar() {
  if (!sidebar) return;

  const ntf = Number(state.me?.notifications_unread || 0);
  const pm = Number(state.me?.unread_count || 0);
  const active = location.hash.replace(/^#\/?/, '').split('?')[0];

  const main = [
    { href: '', label: 'Home', icon: ICONS.home },
    { href: 'forum', label: 'Forum', icon: ICONS.book },
    { href: 'categories', label: 'Categories', icon: ICONS.grid },
    { href: 'learn', label: 'Learn', icon: ICONS.grad },
    { href: 'firmware', label: 'Firmware', icon: ICONS.shield },
    { href: 'rules', label: 'Rules', icon: ICONS.book },
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
    ${account.length ? `<div class="side-account"><div class="side-section">Account</div>${account.map(sideItem).join('')}</div>` : ''}
  `;

  sidebar.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
}

function renderSettings(query) {
  return async function settingsView() {
    if (!state.me) { location.hash = '#/login'; return; }

    const tab = ['appearance', 'security', 'privacy', 'danger'].includes(query.get('tab')) ? query.get('tab') : 'profile';

    const [data, account] = await Promise.all([
      api('/api/settings'),
      api('/api/account').catch(() => ({ sessions: [], prefs: {} }))
    ]);

    const p = data.profile;
    const prefs = account.prefs || {};
    const sessions = account.sessions || [];

    let content = '';

    if (tab === 'profile') {
      content = `
        <form id="settings-profile" class="form">
          <label>Display name <input id="s-display" class="input" maxlength="40" value="${esc(p.display_name || '')}" placeholder="How others see you" /></label>
          <label>Username <input class="input" value="@${esc(p.username)}" disabled /></label>
          <label>Bio <textarea id="s-bio" maxlength="500">${esc(p.bio || '')}</textarea></label>
          <button class="btn small" type="submit">Save profile</button>
          <div id="profile-error" class="form-error"></div>
        </form>
      `;
    } else if (tab === 'appearance') {
      content = `
        <h2>Avatar</h2>
        <div class="image-upload">
          <div class="preview" id="s-avatar-preview">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : avatarHtml(p.username)}</div>
          <input type="file" id="s-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" />
          <button class="btn small" type="button" id="s-avatar-upload">Upload</button>
          <button class="btn ghost small" type="button" id="s-avatar-clear">Remove</button>
        </div>
        <p class="muted">PNG / JPEG / WebP / GIF, up to 256KB.</p>

        <h2>Banner</h2>
        <div class="image-upload">
          <div class="preview banner" id="s-banner-preview" ${p.banner ? `style="background-image:url('${esc(p.banner)}')"` : ''}></div>
          <input type="file" id="s-banner-file" accept="image/png,image/jpeg,image/webp" />
          <button class="btn small" type="button" id="s-banner-upload">Upload</button>
          <button class="btn ghost small" type="button" id="s-banner-clear">Remove</button>
        </div>
        <p class="muted">PNG / JPEG / WebP, up to 512KB. Shown on your profile.</p>
      `;
    } else if (tab === 'security') {
      content = `
        <h2>Change username</h2>
        <form id="settings-username" class="form">
          <label>New username <input id="s-username" class="input" minlength="3" maxlength="32" value="${esc(p.username)}" required /></label>
          <button class="btn small" type="submit">Change username</button>
          <div id="username-error" class="form-error"></div>
        </form>

        <h2>Change password</h2>
        <form id="settings-password" class="form">
          <label>Current password <input id="s-current" class="input" type="password" required /></label>
          <label>New password <input id="s-new" class="input" type="password" required minlength="12" maxlength="128" /></label>
          <button class="btn small" type="submit">Change password</button>
          <div id="password-error" class="form-error"></div>
        </form>

        <h2>Recovery code</h2>
        <p class="muted">Rotate your recovery code. The old one stops working immediately.</p>
        <form id="settings-recovery" class="form">
          <label>Current recovery code <input id="s-rec" class="input" autocomplete="off" required placeholder="PH-XXXX-XXXX-XXXX-XXXX" /></label>
          <button class="btn small" type="submit">Rotate recovery code</button>
          <div id="recovery-error" class="form-error"></div>
        </form>

        <h2>Active sessions</h2>
        ${sessions.map((s) => `
          <article class="admin-row">
            <div class="admin-row-head">
              <span class="chip ${s.current ? 'green' : ''}">${s.current ? 'current device' : 'session'}</span>
              <span class="muted">${esc(s.ip || 'unknown')}</span>
              <span class="muted">· started ${time(s.created_at)}</span>
            </div>
            ${s.current ? '' : `<div class="admin-controls"><button class="btn danger small" data-revoke="${esc(s.token_hash)}">Revoke</button></div>`}
          </article>
        `).join('') || '<section class="empty">No sessions.</section>'}
        <button class="btn ghost small" id="revoke-others">Log out all other devices</button>
      `;
    } else if (tab === 'privacy') {
      content = `
        <form id="settings-privacy" class="form">
          <label>Who can send you private messages
            <select id="s-pm-policy">
              <option value="all" ${prefs.pm_policy === 'all' ? 'selected' : ''}>Everyone</option>
              <option value="staff" ${prefs.pm_policy === 'staff' ? 'selected' : ''}>Staff only</option>
              <option value="none" ${prefs.pm_policy === 'none' ? 'selected' : ''}>Nobody</option>
            </select>
          </label>

          <label class="checkbox"><input type="checkbox" id="s-hidden" ${prefs.profile_hidden ? 'checked' : ''} /><span>Hide my profile from other users (staff always sees it)</span></label>
          <label class="checkbox"><input type="checkbox" id="s-ntf-reply" ${prefs.notify_reply !== false ? 'checked' : ''} /><span>Notify me about replies to my threads</span></label>
          <label class="checkbox"><input type="checkbox" id="s-ntf-mention" ${prefs.notify_mention !== false ? 'checked' : ''} /><span>Notify me about @mentions</span></label>
          <label class="checkbox"><input type="checkbox" id="s-ntf-reaction" ${prefs.notify_reaction !== false ? 'checked' : ''} /><span>Notify me about reactions</span></label>

          <button class="btn small" type="submit">Save preferences</button>
          <div id="privacy-error" class="form-error"></div>
        </form>
      `;
    } else if (tab === 'danger') {
      content = `
        <div class="card danger-zone">
          <h2 style="margin-top:0">Delete account</h2>
          <p class="muted">This permanently removes your account, threads, posts and messages. There is no undo.</p>
          <form id="settings-delete" class="form">
            <label>Confirm password <input id="s-del-pass" class="input" type="password" required /></label>
            <button class="btn danger" type="submit" id="delete-account-btn">Delete my account</button>
            <div id="delete-error" class="form-error"></div>
          </form>
        </div>
      `;
    }

    app.innerHTML = `
      <section class="page-head"><h1>Settings</h1></section>

      <div class="settings-grid">
        <nav class="settings-nav">
          <a class="tab ${tab === 'profile' ? 'active' : ''}" href="#/settings?tab=profile">Profile</a>
          <a class="tab ${tab === 'appearance' ? 'active' : ''}" href="#/settings?tab=appearance">Appearance</a>
          <a class="tab ${tab === 'security' ? 'active' : ''}" href="#/settings?tab=security">Security</a>
          <a class="tab ${tab === 'privacy' ? 'active' : ''}" href="#/settings?tab=privacy">Privacy</a>
          <a class="tab ${tab === 'danger' ? 'active' : ''}" href="#/settings?tab=danger">Danger zone</a>
        </nav>

        <div class="card" style="margin-bottom:0">${content}</div>
      </div>
    `;

    // profile
    document.getElementById('settings-profile')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ field: 'profile', display_name: document.getElementById('s-display').value, bio: document.getElementById('s-bio').value })
        });
        toast('Profile saved');
        await loadMe();
      } catch (err) { document.getElementById('profile-error').textContent = err.message; }
    });

    // appearance
    if (tab === 'appearance') {
      document.getElementById('s-avatar-upload').addEventListener('click', async () => {
        try {
          const dataUrl = await fileToDataURL(document.getElementById('s-avatar-file').files[0], 262144);
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'avatar', avatar: dataUrl }) });
          document.getElementById('s-avatar-preview').innerHTML = `<img src="${esc(dataUrl)}" alt="">`;
          toast('Avatar updated');
          await loadMe();
        } catch (err) { toast(err.message, true); }
      });

      document.getElementById('s-avatar-clear').addEventListener('click', async () => {
        try {
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'avatar', avatar: '' }) });
          toast('Avatar removed'); await render();
        } catch (err) { toast(err.message, true); }
      });

      document.getElementById('s-banner-upload').addEventListener('click', async () => {
        try {
          const dataUrl = await fileToDataURL(document.getElementById('s-banner-file').files[0], 524288);
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'banner', banner: dataUrl }) });
          document.getElementById('s-banner-preview').style.backgroundImage = `url('${dataUrl}')`;
          toast('Banner updated'); await loadMe();
        } catch (err) { toast(err.message, true); }
      });

      document.getElementById('s-banner-clear').addEventListener('click', async () => {
        try {
          await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'banner', banner: '' }) });
          toast('Banner removed'); await render();
        } catch (err) { toast(err.message, true); }
      });
    }

    // security
    document.getElementById('settings-username')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/account', { method: 'POST', body: JSON.stringify({ action: 'username', username: document.getElementById('s-username').value.trim() }) });
        toast('Username changed');
        await loadMe(); await render();
      } catch (err) { document.getElementById('username-error').textContent = err.message; }
    });

    document.getElementById('settings-password')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ field: 'password', current_password: document.getElementById('s-current').value, new_password: document.getElementById('s-new').value })
        });
        toast('Password changed');
        document.getElementById('s-current').value = '';
        document.getElementById('s-new').value = '';
      } catch (err) { document.getElementById('password-error').textContent = err.message; }
    });

    document.getElementById('settings-recovery')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await api('/api/settings', { method: 'POST', body: JSON.stringify({ field: 'recovery', recoveryCode: document.getElementById('s-rec').value }) });
        toast('Recovery code rotated');
        if (res.recoveryCode) showRecoveryModal(res.recoveryCode);
        document.getElementById('s-rec').value = '';
      } catch (err) { document.getElementById('recovery-error').textContent = err.message; }
    });

    document.querySelectorAll('[data-revoke]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await api('/api/account', { method: 'POST', body: JSON.stringify({ action: 'revoke', token_hash: b.dataset.revoke }) });
          toast('Session revoked'); await render();
        } catch (err) { toast(err.message, true); }
      });
    });

    document.getElementById('revoke-others')?.addEventListener('click', async () => {
      try {
        await api('/api/account', { method: 'POST', body: JSON.stringify({ action: 'revoke_others' }) });
        toast('Other devices logged out'); await render();
      } catch (err) { toast(err.message, true); }
    });

    // privacy
    document.getElementById('settings-privacy')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/account', {
          method: 'POST',
          body: JSON.stringify({
            action: 'prefs',
            pm_policy: document.getElementById('s-pm-policy').value,
            profile_hidden: document.getElementById('s-hidden').checked,
            notify_reply: document.getElementById('s-ntf-reply').checked,
            notify_mention: document.getElementById('s-ntf-mention').checked,
            notify_reaction: document.getElementById('s-ntf-reaction').checked
          })
        });
        toast('Preferences saved');
      } catch (err) { document.getElementById('privacy-error').textContent = err.message; }
    });

    // danger: two-step delete
    document.getElementById('settings-delete')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('delete-account-btn');

      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.classList.add('confirm-arm');
        btn.textContent = 'Click again to permanently delete';
        setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('confirm-arm'); btn.textContent = 'Delete my account'; }, 4000);
        return;
      }

      try {
        await api('/api/account', { method: 'POST', body: JSON.stringify({ action: 'delete', password: document.getElementById('s-del-pass').value }) });
        state.me = null;
        toast('Account deleted');
        location.hash = '#/';
        await loadMe(); await render();
      } catch (err) { document.getElementById('delete-error').textContent = err.message; }
    });
  };
}
// === PART 6: hero layouts without inline styles ===

function renderHome() {
  return async function homeView() {
    if (!state.me) {
      await renderWelcome()();
      return;
    }

    const [p1, p2, rel] = await Promise.all([
      api('/api/threads?page=1'),
      api('/api/threads?page=2').catch(() => ({ threads: [] })),
      api('/api/releases').catch(() => ({ releases: [] }))
    ]);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const topWeek = [...(p1.threads || []), ...(p2.threads || [])]
      .filter((t) => t.updated_at > weekAgo)
      .sort((a, b) => Number(b.post_count || 0) - Number(a.post_count || 0))
      .slice(0, 5);

    const releases = (rel.releases || []).slice(0, 4);

    app.innerHTML = `
      <section class="welcome-hero">
        <div class="hero-avatar-row">${avatarHtml(state.me.username, '', state.me.avatar || '')}</div>
        <h1>Hey, ${esc(state.me.display_name || state.me.username)}</h1>
        <p>Your security community dashboard.</p>
        <div class="hero-actions">
          <a class="btn" href="#/new-thread">+ New thread</a>
          <a class="btn ghost" href="#/forum">Open forum</a>
        </div>
      </section>

      <section class="page-head"><h2>Top threads this week</h2></section>
      ${topWeek.length ? topWeek.map(threadRowHtml).join('') : '<section class="empty">No activity this week yet.</section>'}

      <section class="page-head" style="margin-top:20px"><h2>Popular projects</h2></section>
      <div class="feature-grid">
        ${releases.map((r) => `
          <a class="feature-card" href="${esc(r.url)}" target="_blank" rel="noopener">
            <h3>${esc(r.source)} ${esc(r.tag)}</h3>
            <p>${esc((r.title || '').slice(0, 80))}</p>
          </a>
        `).join('') || `
          <a class="feature-card" href="#/firmware"><h3>Firmware Hub</h3><p>Releases appear once the sync cron runs.</p></a>
        `}
        <a class="feature-card" href="#/firmware/bruce/wiki"><h3>Bruce wiki index</h3><p>Curated summaries with links to the official wiki.</p></a>
      </div>

      <section class="page-head" style="margin-top:20px"><h2>Useful links</h2></section>
      <div class="feature-grid">
        <a class="feature-card" href="#/learn"><h3>Learn</h3><p>Original training articles: labs, CTF path, UART/JTAG, disclosure.</p></a>
        <a class="feature-card" href="#/rules"><h3>Rules</h3><p>What is allowed and what gets you banned.</p></a>
        <a class="feature-card" href="#/support"><h3>Support</h3><p>Tickets for account issues and questions.</p></a>
        <a class="feature-card" href="/api/rss"><h3>RSS</h3><p>Follow new threads in your reader.</p></a>
      </div>
    `;

    attachShareHandlers(app);
  };
}

function renderWelcome() {
  return async function welcomeView() {
    if (state.me) { location.hash = '#/'; return; }

    const totalThreads = state.categories.reduce((a, c) => a + Number(c.thread_count || 0), 0);

    app.innerHTML = `
      <section class="welcome-hero">
        <img class="welcome-logo" src="/logo.svg" alt="PentHub logo" />
        <h1>The home of legal hardware hacking</h1>
        <p>
          PentHub is a community for <strong>authorized</strong> security research:
          ESP32 & Flipper Zero labs, CTF training, defensive security and firmware deep-dives.
        </p>
        <p class="muted">${state.categories.length} categories · ${totalThreads} threads · original training articles · auto-synced firmware releases</p>
        <div class="hero-actions">
          <a class="btn" href="#/register">Create account</a>
          <a class="btn blue" href="#/login">Log in</a>
          <a class="btn ghost" href="#/forum">Browse forum</a>
        </div>
      </section>

      <section class="feature-grid">
        <a class="feature-card" href="#/learn">
          <h3>Learn by doing</h3>
          <p>Home Wi-Fi labs, CTF path, UART/JTAG basics, responsible disclosure — original articles.</p>
        </a>
        <a class="feature-card" href="#/firmware">
          <h3>Firmware Hub</h3>
          <p>Bruce & friends: releases auto-synced from GitHub with discussion threads.</p>
        </a>
        <a class="feature-card" href="#/categories">
          <h3>Pick your lane</h3>
          <p>Firmwares, Hardwares, Networks, Research, Training — find your community.</p>
        </a>
        <a class="feature-card" href="#/rules">
          <h3>Safe by design</h3>
          <p>Authorized research only. Reports, appeals, audits and transparent moderation.</p>
        </a>
      </section>

      <section class="card" style="text-align:center">
        <h2 style="margin-top:0">Why people join</h2>
        <p class="muted">
          “Finally a place where ESP32 tinkerers, CTF players and professional pentesters
          talk shop without stepping over the legal line.”
        </p>
        <div class="hero-actions">
          <a class="btn" href="#/register">Join PentHub — it's free</a>
        </div>
      </section>
    `;
  };
}
// === PART 7: FINAL — attachments render guarantee (must stay last) ===

function attachmentsHtml(list) {
  if (!list || !list.length) return '';
  return `
    <div class="attach-grid">
      ${list.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="attachment"></a>`).join('')}
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
        ${attachmentsHtml(post.attachments)}
        ${state.me ? reactionsHtml(post) : ''}
        ${actionBarHtml(post)}
      </div>
    </article>
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

    const replyInner = (!state.me)
      ? `<p class="notice"><a href="#/login">Log in</a> to reply.</p>`
      : (thread.is_locked && !isStaff())
        ? `<p class="notice warn">Thread is locked.</p>`
        : `
          <form id="reply-form" class="form">
            <label>Reply <textarea id="reply-body" maxlength="10000" required minlength="1"></textarea></label>
            ${typeof attachPickerHtml === 'function' ? attachPickerHtml('reply') : ''}
            <button class="btn" type="submit">Reply</button>
            <div id="reply-error" class="form-error"></div>
          </form>
        `;

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
        ${replyInner}
      </section>
    `;

    if (typeof bindAttachPicker === 'function') bindAttachPicker('reply');

    bindThreadPage(thread, posts);
    attachShareHandlers(app);

    const replyForm = document.getElementById('reply-form');

    if (replyForm) {
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorEl = document.getElementById('reply-error');

        try {
          await api('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
              threadId: thread.id,
              body: document.getElementById('reply-body').value,
              attachments: (typeof attachStore !== 'undefined' && attachStore['reply']) || []
            })
          });

          if (typeof attachStore !== 'undefined') attachStore['reply'] = [];
          toast('Reply published');
          await render();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }
  };
}
// === PART 8: FINAL — client-side image resize + robust attach ===

function downscaleImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);

          let q = quality;
          let out = canvas.toDataURL('image/jpeg', q);

          while (out.length > 900000 && q > 0.4) {
            q -= 0.15;
            out = canvas.toDataURL('image/jpeg', q);
          }

          resolve(out);
        } catch {
          reject(new Error('Resize failed'));
        }
      };

      img.onerror = () => reject(new Error('Bad image file'));
      img.src = reader.result;
    };

    reader.onerror = () => reject(new Error('Read error'));
    reader.readAsDataURL(file);
  });
}

function bindAttachPicker(pid) {
  if (typeof attachStore === 'undefined') return;

  attachStore[pid] = attachStore[pid] || [];

  const input = document.querySelector(`[data-attach-input="${pid}"]`);
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    if ((attachStore[pid] || []).length >= 4) {
      toast('Max 4 images per message', true);
      input.value = '';
      return;
    }

    try {
      const dataUrl = await downscaleImage(file);
      const res = await api('/api/upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });

      if (!res || !res.url) {
        throw new Error('Upload failed: no url returned');
      }

      attachStore[pid].push(res.url);

      if (typeof renderAttachPreview === 'function') renderAttachPreview(pid);
      toast('Image attached');
    } catch (e) {
      console.error('PentHub upload error:', e);
      toast(e.message || 'Upload failed', true);
    }

    input.value = '';
  });

  if (typeof renderAttachPreview === 'function') renderAttachPreview(pid);
}
