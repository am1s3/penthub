const app = document.getElementById('app');
const topActions = document.getElementById('top-actions');
const sidebar = document.getElementById('sidebar');
const rightbar = document.getElementById('rightbar');
const modal = document.getElementById('modal');
const recoveryModal = document.getElementById('recovery-modal');
const banBar = document.getElementById('ban-bar');
const whatsnewBar = document.getElementById('whatsnew-bar');
const shareMenu = document.getElementById('share-menu');

const REACTION_EMOJIS = ['👍', '', '', '', '❤️', '️'];

const ICONS = {
  home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21h4"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5 8-5s6.5 1 8 5"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h14v18H5z"/><path d="M9 3v18"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.4l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.4 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  help: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/><circle cx="12" cy="17" r="0.5"/></svg>'
};

const state = {
  me: null,
  categories: [],
  sections: {},
  config: null,
  turnstileToken: null,
  turnstileWidget: null,
  changelogLatestId: 0,
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
    if (para.length) {
      out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
      para = [];
    }
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
  return user.display_name || user.username;
}

function badgesHtml(badges, user) {
  const list = [];

  if (user?.is_admin) list.push(`<span class="badge-chip" style="color:var(--green);border-color:rgba(63,185,80,0.4)">★ admin</span>`);
  if (user?.is_moderator) list.push(`<span class="badge-chip" style="color:var(--blue);border-color:rgba(88,166,255,0.4)">⚡ moderator</span>`);

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
        <a class="btn ghost small" href="#/settings">Settings</a>
        <button id="ban-logout" class="btn danger small">Log out</button>
      </div>
    `;
    document.getElementById('ban-logout')?.addEventListener('click', logout);
  } else {
    banBar.classList.add('hidden');
  }

  if (state.changelogLatestId > state.changelogSeenId) {
    whatsnewBar.classList.remove('hidden');
    whatsnewBar.innerHTML = `
      <div>
        <strong>What's new</strong> · version ${esc(state.me.changelog_latest_version || '')} is out.
      </div>
      <div class="top-actions">
        <a class="btn small" href="#/changelog">See changes</a>
        <button id="whatsnew-dismiss" class="btn ghost small">Dismiss</button>
      </div>
    `;
    document.getElementById('whatsnew-dismiss')?.addEventListener('click', () => {
      state.changelogSeenId = state.changelogLatestId;
      localStorage.setItem('penthub_changelog_seen', String(state.changelogLatestId));
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

  const top = [
    { href: '', label: 'Home', icon: ICONS.home },
    state.me ? { href: 'notifications', label: 'Notifications', icon: ICONS.bell, count: ntf } : null,
    state.me ? { href: 'messages', label: 'Messages', icon: ICONS.mail, count: pm } : null,
    { href: 'firmware', label: 'Firmware Hub', icon: ICONS.book },
    { href: 'rules', label: 'Rules', icon: ICONS.shield },
    { href: 'support', label: 'Support', icon: ICONS.help }
  ].filter(Boolean);

  const sections = Object.keys(state.sections || {}).sort();

  const bottom = [
    state.me ? { href: 'settings', label: 'Settings', icon: ICONS.settings } : null,
    isStaff() ? { href: 'admin', label: 'Admin', icon: ICONS.shield } : null,
    state.me ? { href: `user/${encodeURIComponent(state.me.username)}`, label: 'Profile', icon: ICONS.user } : null,
    state.me ? { href: '__logout__', label: 'Log out', icon: '✕', danger: true } : null
  ].filter(Boolean);

  const sideItem = (item) => {
    const cls = `side-item ${active === item.href || (item.href && active.startsWith(item.href + '/')) ? 'active' : ''} ${item.danger ? 'danger' : ''}`;
    const count = item.count ? `<span class="side-count">${item.count}</span>` : '';
    const style = item.danger ? 'style="color:var(--danger)"' : '';

    if (item.href === '__logout__') {
      return `<button class="${cls}" ${style} data-logout="1">${item.icon}<span>${item.label}</span></button>`;
    }

    return `<a class="${cls}" ${style} href="#/${item.href}">${item.icon}<span>${item.label}</span>${count}</a>`;
  };

  sidebar.innerHTML = `
    ${top.map(sideItem).join('')}
    ${sections.length ? `<div class="side-section">Categories</div>` : ''}
    ${sections.map((s) => `<a class="side-item" href="#/section/${encodeURIComponent(s)}">${s}</a>`).join('')}
    ${bottom.length ? `<div class="side-section">Account</div>` : ''}
    ${bottom.map(sideItem).join('')}
  `;

  sidebar.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
}

async function updateRightbar() {
  if (!rightbar) return;

  try {
    const categories = await ensureCategories();
    const sections = state.sections || {};

    const sectionBoxes = Object.keys(sections).sort().map((s) => `
      <div class="box">
        <h3>${esc(s)}</h3>
        ${sections[s].map((c) => `
          <div class="box-row">
            <a href="#/category/${encodeURIComponent(c.slug)}">${esc(c.name)}</a>
            <span class="muted">${Number(c.thread_count || 0)}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    rightbar.innerHTML = `
      ${sectionBoxes}
      <div class="box">
        <h3>Legal & safety</h3>
        <p class="muted">Authorized research only. Your own devices, networks and accounts, or written permission.</p>
        <p><a href="#/rules">Rules</a> · <a href="#/terms">Terms</a> · <a href="#/privacy">Privacy</a></p>
        <p><a href="/api/rss">RSS feed</a> · <a href="#/support">Support</a></p>
      </div>
    `;
  } catch {
    rightbar.innerHTML = '';
  }
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

  shareMenu.querySelector('[data-share-close]').addEventListener('click', () => {
    shareMenu.classList.add('hidden');
  });
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
          <span class="feed-name">${esc(displayName(t))}</span>
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
        ${shareButtonHtml(`${location.origin}/#/`, 'PentHub — legal pentesting forum')}
      </section>

      ${threads.length ? threads.map(threadRowHtml).join('') : '<section class="empty">No threads yet.</section>'}

      ${paginationHtml('#/', 1, Boolean(data.hasMore))}
    `;

    attachShareHandlers(app);
  };
}

function renderSection(section, query) {
  return async function sectionView() {
    await ensureCategories();
    const cats = (state.sections[section] || []);

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

      ${cats.map((c) => `
        <div class="box" style="margin-bottom:10px">
          <h3><a href="#/category/${encodeURIComponent(c.slug)}">${esc(c.name)}</a></h3>
          <p class="muted">${esc(c.description)}</p>
        </div>
      `).join('')}

      <section class="page-head"><h2>Latest in ${esc(section)}</h2></section>
      ${allThreads.length ? allThreads.map(threadRowHtml).join('') : '<section class="empty">No threads in this section.</section>'}
    `;

    attachShareHandlers(app);
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
          <p class="muted">${esc(category.description)} · section: ${esc(category.section)}</p>
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
        localStorage.setItem('penthub_welcome_seen', '0');
        state.welcomeSeen = false;
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

function renderTerms() {
  return function termsView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Terms of Service</h1>
        <p class="muted">Last updated: 2026-08-04</p>
        <h2>1. Acceptance</h2>
        <p>By creating an account you accept these Terms. If you do not agree, do not use the service.</p>
        <h2>2. Eligibility</h2>
        <p>You must be at least 18 years old, or have parental consent, and comply with all laws applicable to you.</p>
        <h2>3. Permitted use</h2>
        <p>The service is for authorized security research, education, CTF and defensive security only. Any use against systems you do not own or have written permission to test is prohibited.</p>
        <h2>4. Prohibited conduct</h2>
        <p>You will not post, request, sell or facilitate: malware, jammers, deauth tools, brute-forcing, carding, skimming, botnets, credential dumps or similar. You will not impersonate others or share leaked credentials.</p>
        <h2>5. User content</h2>
        <p>You retain ownership of what you post. By posting you grant PentHub a non-exclusive license to host, display and distribute your content as part of the service.</p>
        <h2>6. Moderation</h2>
        <p>Staff may lock, delete or move threads, and ban users who violate the rules, without prior notice. Bans may be appealed.</p>
        <h2>7. Disclaimer</h2>
        <p>The service is provided "as is". The administration is not liable for actions users take outside the platform.</p>
        <h2>8. Changes</h2>
        <p>We may update these Terms. Continued use after a notice means acceptance.</p>
      </section>
    `;
  };
}

function renderPrivacy() {
  return function privacyView() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>Privacy Policy</h1>
        <p class="muted">Last updated: 2026-08-04</p>
        <h2>What we collect</h2>
        <ul>
          <li>Account data: username, display name, hashed password, recovery code hash, bio, avatar, banner.</li>
          <li>Content you post: threads, posts, reactions, mentions, PMs, tickets.</li>
          <li>Logs: IP address at login/registration and for audit actions.</li>
          <li>Turnstile verification token (processed by Cloudflare).</li>
        </ul>
        <h2>How we use it</h2>
        <p>To operate the service, prevent abuse, enforce the rules and investigate incidents.</p>
        <h2>Sharing</h2>
        <p>We do not sell data. We may share data with Cloudflare (infrastructure) and, when legally required, with authorities.</p>
        <h2>Your rights</h2>
        <p>You may delete your posts, change profile fields, change password and request account export via the admin (open a Support ticket).</p>
        <h2>Retention</h2>
        <p>Deleted posts are soft-deleted and retained for moderation. Bans, audit logs and appeals are retained for safety.</p>
      </section>
    `;
  };
}

function renderNotFound() {
  return function notFoundView() {
    app.innerHTML = '<section class="card narrow"><h1>404</h1><p class="muted">Page not found.</p><p><a href="#/">Back home</a></p></section>';
  };
}

async function render() {
  const { segments, query } = parseRoute();

  app.innerHTML = '<div class="loading">Loading...</div>';

  updateSidebar();
  updateRightbar();

  try {
    const section = segments[0] || '';

    if (!section) await renderHome()();
    else if (section === 'welcome') await renderWelcome()();
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
