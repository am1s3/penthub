const app = document.getElementById('app');
const authArea = document.getElementById('auth-area');
const modal = document.getElementById('modal');
const recoveryModal = document.getElementById('recovery-modal');

const REACTION_EMOJIS = ['👍', '', '', '😂', '❤️', '🛡️'];

const state = {
  me: null,
  categories: [],
  config: null,
  turnstileToken: null,
  turnstileWidget: null
};

let reportPostId = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
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
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    const blockMatch = line.match(/^\u0000B(\d+)\u0000$/);

    if (blockMatch) {
      flushPara();
      closeList();
      out.push(`<pre class="code-block"><code>${blocks[Number(blockMatch[1])]}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)$/);

    if (h) {
      flushPara();
      closeList();
      const level = h[1].length + 2;
      out.push(`<h${level}>${mdInline(h[2])}</h${level}>`);
      continue;
    }

    if (/^&gt;\s?/.test(line)) {
      flushPara();
      closeList();
      out.push(`<blockquote>${mdInline(line.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);

    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${mdInline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.+)$/);

    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${mdInline(ol[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      closeList();
      continue;
    }

    closeList();
    para.push(line);
  }

  flushPara();
  closeList();

  return out.join('\n');
}

function time(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function toast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

function isStaff() {
  return Boolean(state.me && (state.me.isAdmin || state.me.isModerator));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'Fetch',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;

    if (response.status === 401) {
      state.me = null;
    }

    throw error;
  }

  return data;
}

async function loadMe() {
  try {
    state.me = await api('/api/auth/me');
  } catch {
    state.me = null;
  }
}

async function loadConfig() {
  try {
    state.config = await api('/api/config');
  } catch {
    state.config = null;
  }
}

async function ensureCategories(force = false) {
  if (!state.categories.length || force) {
    const data = await api('/api/categories');
    state.categories = data.categories || [];
  }

  return state.categories;
}

function renderTurnstile() {
  const box = document.getElementById('turnstile-box');
  if (!box) return;

  const siteKey = state.config?.turnstileSiteKey;

  if (!siteKey || !window.turnstile) {
    box.innerHTML = '';
    return;
  }

  if (state.turnstileWidget !== null) {
    try {
      window.turnstile.remove(state.turnstileWidget);
    } catch {
      // ignore
    }
  }

  state.turnstileToken = null;

  state.turnstileWidget = window.turnstile.render(box, {
    sitekey: siteKey,
    theme: 'dark',
    callback: (token) => {
      state.turnstileToken = token;
    },
    'expired-callback': () => {
      state.turnstileToken = null;
    },
    'error-callback': () => {
      state.turnstileToken = null;
    }
  });
}

function resetTurnstile() {
  state.turnstileToken = null;

  if (window.turnstile && state.turnstileWidget !== null) {
    try {
      window.turnstile.reset(state.turnstileWidget);
    } catch {
      // ignore
    }
  }
}

function showRecoveryModal(code) {
  document.getElementById('recovery-code').textContent = code;
  recoveryModal.classList.remove('hidden');
}

function closeRecoveryModal() {
  recoveryModal.classList.add('hidden');
}

function userLink(username) {
  return `<a href="#/user/${encodeURIComponent(username)}">@${esc(username)}</a>`;
}

function updateAuthArea() {
  if (!authArea) return;

  if (state.me) {
    const unread = Number(state.me.unread_count || 0);

    authArea.innerHTML = `
      <a class="btn small" href="#/new-thread">+ Thread</a>
      <a class="btn ghost small" href="#/messages">PM${unread ? ` (${unread})` : ''}</a>
      ${isStaff() ? '<a class="btn ghost small" href="#/admin">Admin</a>' : ''}
      <a class="muted" href="#/user/${encodeURIComponent(state.me.username)}">@${esc(state.me.username)}</a>
      ${state.me.isAdmin ? '<span class="badge admin">admin</span>' : ''}
      ${state.me.isModerator ? '<span class="badge">moderator</span>' : ''}
      <button id="logout-btn" class="btn ghost small" type="button">Logout</button>
    `;

    document.getElementById('logout-btn')?.addEventListener('click', logout);
  } else {
    authArea.innerHTML = `
      <a class="btn ghost small" href="#/login">Log in</a>
      <a class="btn small" href="#/register">Register</a>
    `;
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }

  state.me = null;
  updateAuthArea();
  location.hash = '#/';
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, queryString] = raw.split('?');
  const segments = path ? path.split('/').filter(Boolean) : [];
  const query = new URLSearchParams(queryString || '');

  return { segments, query };
}

function pageLink(base, page) {
  return `${base}${base.includes('?') ? '&' : '?'}page=${page}`;
}

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

function categoryCardHtml(category) {
  return `
    <a class="category-card" href="#/category/${encodeURIComponent(category.slug)}">
      <h3>${esc(category.name)}</h3>
      <p>${esc(category.description)}</p>
      <div class="meta">Threads: ${Number(category.thread_count || 0)}</div>
    </a>
  `;
}

function threadItemHtml(thread) {
  return `
    <a class="thread" href="#/thread/${Number(thread.id)}">
      <h3 class="thread-title">
        ${thread.is_pinned ? '<span class="badge warn">pin</span> ' : ''}
        ${thread.is_locked ? '<span class="badge">lock</span> ' : ''}
        ${esc(thread.title)}
      </h3>
      <div class="meta">
        <span>${esc(thread.category_name || '')}</span>
        <span>by ${userLink(thread.author || 'unknown')}</span>
        <span>replies: ${Number(thread.post_count || 0)}</span>
        <span>updated: ${time(thread.updated_at)}</span>
      </div>
    </a>
  `;
}

function renderHome() {
  return async function homeView() {
    const categories = await ensureCategories();

    app.innerHTML = `
      <section class="hero">
        <h1>PentHub</h1>
        <p>
          A forum for legal pentesting, hardware security labs, CTF, ESP32, Flipper Zero
          and defensive security.
        </p>
        <p>
          Authorized tests only: your own devices, your own networks, written permission.
          Any illegal activity is prohibited.
        </p>
        <p>
          <a href="#/rules">Read the rules</a>
        </p>
      </section>

      <section class="section-head">
        <h2>Categories</h2>
        ${state.me ? '<a class="btn" href="#/new-thread">New thread</a>' : ''}
      </section>

      <section class="grid">
        ${categories.map(categoryCardHtml).join('')}
      </section>
    `;
  };
}

function renderCategory(slug, query) {
  return async function categoryView() {
    if (!slug) return renderHome()();

    const categories = await ensureCategories();
    const category = categories.find((item) => item.slug === slug);

    if (!category) {
      throw new Error('Category not found');
    }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const data = await api(`/api/threads?category=${encodeURIComponent(slug)}&page=${page}`);
    const threads = data.threads || [];
    const base = `#/category/${encodeURIComponent(slug)}`;

    app.innerHTML = `
      <section class="section-head">
        <div>
          <h1>${esc(category.name)}</h1>
          <p class="muted">${esc(category.description)}</p>
        </div>
        ${state.me ? `<a class="btn" href="#/new-thread?category=${encodeURIComponent(slug)}">New thread</a>` : ''}
      </section>

      ${
        threads.length
          ? `<section class="thread-list">${threads.map(threadItemHtml).join('')}</section>`
          : '<section class="empty">No threads yet. Create the first one within the rules.</section>'
      }

      ${paginationHtml(base, page, Boolean(data.hasMore))}
    `;
  };
}

function threadAdminHtml(thread) {
  if (!isStaff()) return '';

  return `
    <div class="admin-controls">
      <button class="btn ghost small" data-admin-thread="${thread.id}" data-admin-action="${thread.is_locked ? 'unlock' : 'lock'}">
        ${thread.is_locked ? 'Unlock' : 'Lock'}
      </button>

      <button class="btn ghost small" data-admin-thread="${thread.id}" data-admin-action="${thread.is_pinned ? 'unpin' : 'pin'}">
        ${thread.is_pinned ? 'Unpin' : 'Pin'}
      </button>

      <button class="btn danger small" data-admin-thread="${thread.id}" data-admin-action="delete">
        Delete thread
      </button>
    </div>
  `;
}

function replyFormHtml(thread) {
  if (!state.me) {
    return `<p class="notice"><a href="#/login">Log in</a> to reply.</p>`;
  }

  if (thread.is_locked && !isStaff()) {
    return `<p class="notice warn">Thread is locked.</p>`;
  }

  return `
    <form id="reply-form" class="form">
      <label>
        Reply
        <textarea id="reply-body" maxlength="10000" required minlength="1"></textarea>
      </label>
      <p class="muted">
        Markdown: **bold**, *italic*, \`code\`, \`\`\`code blocks\`\`\`, lists (- and 1.), &gt; quotes, [link](https://example.com), @mentions
      </p>
      <button class="btn" type="submit">Reply</button>
      <div id="reply-error" class="form-error"></div>
    </form>
  `;
}

function reactionsHtml(post) {
  const counts = post.reactions || [];

  const countButtons = counts
    .map(
      (r) => `
        <button class="btn ghost small ${post.my_reaction === r.emoji ? 'tab active' : ''}" data-react-post="${post.id}" data-react-emoji="${r.emoji}">
          ${r.emoji} ${r.count}
        </button>
      `
    )
    .join('');

  return `
    <div class="admin-controls">
      ${countButtons}
      <details class="react-picker">
        <summary class="link">+ react</summary>
        <div class="admin-controls">
          ${REACTION_EMOJIS.map((e) => `<button class="btn small" data-react-post="${post.id}" data-react-emoji="${e}">${e}</button>`).join('')}
        </div>
      </details>
    </div>
  `;
}

function postFooterHtml(post) {
  const canEdit = state.me && (state.me.id === post.user_id || isStaff());

  const editButton = canEdit
    ? `<button class="link" data-edit-post="${post.id}">Edit</button>`
    : '';

  const reportButton = state.me
    ? `<button class="link" data-report-post="${post.id}">Report</button>`
    : '';

  const adminDelete = isStaff()
    ? `<button class="link danger" data-admin-post="${post.id}" data-admin-action="delete">Delete</button>`
    : '';

  return [editButton, reportButton, adminDelete].filter(Boolean).join('');
}

function postHtml(thread, post) {
  const edited = post.updated_at > post.created_at ? '<span class="edited">(edited)</span>' : '';

  return `
    <article class="post" id="post-${post.id}">
      <header>
        <div class="post-author">
          ${userLink(post.username)}
          ${post.is_admin ? '<span class="badge admin">admin</span>' : ''}
        </div>
        <time>${time(post.created_at)} ${edited}</time>
      </header>

      <div class="post-body">${mdToHtml(post.body)}</div>

      ${state.me ? reactionsHtml(post) : ''}

      <footer>
        ${postFooterHtml(post)}
      </footer>
    </article>
  `;
}

function renderThread(id, query) {
  return async function threadView() {
    const threadId = Number(id);

    if (!Number.isInteger(threadId)) {
      throw new Error('Invalid thread');
    }

    const page = Math.max(1, Number(query.get('page') || 1) || 1);

    const [{ thread }, postsData] = await Promise.all([
      api(`/api/thread?id=${threadId}`),
      api(`/api/posts?threadId=${threadId}&page=${page}`)
    ]);

    const posts = postsData.posts || [];
    const base = `#/thread/${threadId}`;

    app.innerHTML = `
      <section class="section-head">
        <div>
          <h1>${esc(thread.title)}</h1>
          <div class="meta">
            <a href="#/category/${encodeURIComponent(thread.category_slug)}">${esc(thread.category_name)}</a>
            <span>by ${userLink(thread.author)}</span>
            <span>created: ${time(thread.created_at)}</span>
          </div>
        </div>
      </section>

      ${threadAdminHtml(thread)}

      <section>
        ${posts.map((post) => postHtml(thread, post)).join('')}
      </section>

      ${paginationHtml(base, page, Boolean(postsData.hasMore))}

      <section class="page-card">
        <h2>Reply</h2>
        ${replyFormHtml(thread)}
      </section>
    `;

    bindThreadPage(thread, posts);
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
        await api('/api/posts', {
          method: 'POST',
          body: JSON.stringify({ threadId: thread.id, body })
        });

        toast('Reply published');
        await render();
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  }

  document.querySelectorAll('[data-report-post]').forEach((button) => {
    button.addEventListener('click', () => {
      openReportModal(Number(button.dataset.reportPost));
    });
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
          body: JSON.stringify({
            postId: Number(button.dataset.reactPost),
            emoji: button.dataset.reactEmoji
          })
        });

        await render();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('[data-admin-thread]').forEach((button) => {
    button.addEventListener('click', () => {
      adminAction('thread', Number(button.dataset.adminThread), button.dataset.adminAction);
    });
  });

  document.querySelectorAll('[data-admin-post]').forEach((button) => {
    button.addEventListener('click', () => {
      adminAction('post', Number(button.dataset.adminPost), button.dataset.adminAction);
    });
  });
}

function startEditPost(post) {
  const article = document.getElementById(`post-${post.id}`);
  if (!article) return;

  const bodyEl = article.querySelector('.post-body');

  bodyEl.innerHTML = `
    <textarea id="edit-body-${post.id}" class="input edit-area" maxlength="10000">${esc(post.body)}</textarea>
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
      await api('/api/posts', {
        method: 'PATCH',
        body: JSON.stringify({ postId: post.id, body: newBody })
      });

      toast('Post updated');
      await render();
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });

  document.querySelector(`[data-edit-cancel="${post.id}"]`).addEventListener('click', () => {
    render();
  });
}

async function adminAction(type, id, action) {
  try {
    await api('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ type, id, action })
    });

    toast('Done');
    await render();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderProfile(username) {
  return async function profileView() {
    const data = await api(`/api/profile?username=${encodeURIComponent(username)}`);
    const p = data.profile;
    const isOwn = state.me && state.me.id === p.user.id;

    app.innerHTML = `
      <section class="card page-card">
        <div class="admin-row-head">
          <span class="post-author">@${esc(p.user.username)}</span>
          ${p.user.is_admin ? '<span class="badge admin">admin</span>' : ''}
          ${p.user.is_moderator ? '<span class="badge">moderator</span>' : ''}
          <span class="muted">joined ${time(p.user.created_at)}</span>
        </div>

        <div class="meta">
          <span>threads: ${p.user.thread_count}</span>
          <span>posts: ${p.user.post_count}</span>
        </div>

        <div class="post-body">
          ${p.user.bio ? mdToHtml(p.user.bio) : '<span class="muted">No bio yet.</span>'}
        </div>

        <div class="admin-controls">
          ${state.me && !isOwn ? `<a class="btn small" href="#/messages/new?to=${encodeURIComponent(p.user.username)}">Send PM</a>` : ''}
          ${isOwn ? `
            <details>
              <summary class="link">Edit bio</summary>
              <form id="bio-form" class="form">
                <textarea id="bio-input" class="input" maxlength="500">${esc(p.user.bio || '')}</textarea>
                <button class="btn small" type="submit">Save bio</button>
                <div id="bio-error" class="form-error"></div>
              </form>
            </details>
          ` : ''}
        </div>
      </section>

      <section class="section-head"><h2>Latest threads</h2></section>
      ${p.threads.length ? `<section class="thread-list">${p.threads.map(threadItemHtml).join('')}</section>` : '<section class="empty">No threads yet.</section>'}

      <section class="section-head"><h2>Latest posts</h2></section>
      ${
        p.posts.length
          ? `<section>${p.posts
              .map(
                (post) => `
                  <article class="post">
                    <header>
                      <div class="meta">in <a href="#/thread/${Number(post.thread_id)}">${esc(post.thread_title)}</a></div>
                      <time>${time(post.created_at)}</time>
                    </header>
                    <div class="post-body">${mdToHtml(post.body.slice(0, 400))}</div>
                  </article>
                `
              )
              .join('')}</section>`
          : '<section class="empty">No posts yet.</section>'
      }

      <section class="section-head"><h2>Mentions</h2></section>
      ${
        p.mentions.length
          ? `<section>${p.mentions
              .map(
                (m) => `
                  <article class="post">
                    <header>
                      <div class="meta">mentioned by ${userLink(m.author)} in <a href="#/thread/${Number(m.thread_id)}">${esc(m.thread_title)}</a></div>
                      <time>${time(m.created_at)}</time>
                    </header>
                    <div class="post-body muted">${esc((m.body || '').slice(0, 200))}</div>
                  </article>
                `
              )
              .join('')}</section>`
          : '<section class="empty">No mentions yet.</section>'
      }
    `;

    const bioForm = document.getElementById('bio-form');

    if (bioForm) {
      bioForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const bio = document.getElementById('bio-input').value;
        const errorEl = document.getElementById('bio-error');

        try {
          await api('/api/profile', { method: 'POST', body: JSON.stringify({ bio }) });
          toast('Bio updated');
          await render();
        } catch (error) {
          errorEl.textContent = error.message;
        }
      });
    }
  };
}

function pmRowHtml(m, box) {
  const other = box === 'inbox' ? m.sender_username : m.recipient_username;
  const unread = box === 'inbox' && !m.read_at;

  return `
    <a class="thread" href="#/messages/user/${encodeURIComponent(other)}">
      <h3 class="thread-title">${unread ? '<span class="badge warn">new</span> ' : ''}${esc(other)}</h3>
      <div class="meta">
        <span>${esc((m.body || '').slice(0, 120))}</span>
        <span>${time(m.created_at)}</span>
      </div>
    </a>
  `;
}

function renderMessages(query) {
  return async function messagesView() {
    if (!state.me) {
      location.hash = '#/login';
      return;
    }

    const box = query.get('box') === 'outbox' ? 'outbox' : 'inbox';
    const page = Math.max(1, Number(query.get('page') || 1) || 1);

    const data = await api(`/api/messages?box=${box}&page=${page}`);
    const messages = data.messages || [];

    app.innerHTML = `
      <section class="section-head">
        <h1>Private messages</h1>
        <a class="btn small" href="#/messages/new">New message</a>
      </section>

      <nav class="tabs">
        <a class="tab ${box === 'inbox' ? 'active' : ''}" href="#/messages?box=inbox">Inbox</a>
        <a class="tab ${box === 'outbox' ? 'active' : ''}" href="#/messages?box=outbox">Outbox</a>
      </nav>

      ${messages.length ? `<section class="thread-list">${messages.map((m) => pmRowHtml(m, box)).join('')}</section>` : '<section class="empty">No messages.</section>'}

      ${paginationHtml(`#/messages?box=${box}`, page, Boolean(data.hasMore))}
    `;
  };
}

function renderConversation(username) {
  return async function conversationView() {
    if (!state.me) {
      location.hash = '#/login';
      return;
    }

    const page = Math.max(1, Number(parseRoute().query.get('page') || 1) || 1);
    const data = await api(`/api/messages?with=${encodeURIComponent(username)}&page=${page}`);
    const messages = data.messages || [];

    await loadMe();
    updateAuthArea();

    app.innerHTML = `
      <section class="section-head">
        <h1>Chat with ${userLink(data.with.username)}</h1>
        <a class="btn ghost small" href="#/messages">Back to inbox</a>
      </section>

      <section>
        ${messages
          .map(
            (m) => `
              <article class="post">
                <header>
                  <div class="post-author">${userLink(m.sender_username)}</div>
                  <time>${time(m.created_at)}</time>
                </header>
                <div class="post-body">${mdToHtml(m.body)}</div>
              </article>
            `
          )
          .join('') || '<section class="empty">No messages yet.</section>'}
      </section>

      ${paginationHtml(`#/messages/user/${encodeURIComponent(username)}`, page, Boolean(data.hasMore))}

      <form id="pm-reply-form" class="form">
        <label>
          Message
          <textarea id="pm-reply-body" maxlength="5000" required minlength="1"></textarea>
        </label>
        <button class="btn" type="submit">Send</button>
        <div id="pm-reply-error" class="form-error"></div>
      </form>
    `;

    document.getElementById('pm-reply-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const body = document.getElementById('pm-reply-body').value;
      const errorEl = document.getElementById('pm-reply-error');

      try {
        await api('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ toUsername: username, body })
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
    if (!state.me) {
      location.hash = '#/login';
      return;
    }

    const to = query.get('to') || '';

    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>New message</h1>
        <form id="pm-new-form" class="form">
          <label>
            To
            <input id="pm-to" class="input" required minlength="3" maxlength="32" value="${esc(to)}" />
          </label>
          <label>
            Message
            <textarea id="pm-body" maxlength="5000" required minlength="1"></textarea>
          </label>
          <button class="btn" type="submit">Send</button>
          <div id="pm-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('pm-new-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const toUsername = document.getElementById('pm-to').value.trim();
      const body = document.getElementById('pm-body').value;
      const errorEl = document.getElementById('pm-error');

      try {
        await api('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ toUsername, body })
        });

        toast('Sent');
        location.hash = `#/messages/user/${encodeURIComponent(toUsername)}`;
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function reportRowHtml(report) {
  const bodyPreview = report.post_body || '';

  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="badge ${report.status === 'open' ? 'warn' : ''}">${esc(report.status)}</span>
        <span class="muted">reported by @${esc(report.reporter)}</span>
        <time>${time(report.created_at)}</time>
      </div>

      <p class="report-reason">Reason: ${esc(report.reason)}</p>

      <div class="post-body muted">
        Post by @${esc(report.post_author)}: ${esc(bodyPreview.slice(0, 300))}${bodyPreview.length > 300 ? '…' : ''}
      </div>

      <div class="meta">
        <a href="#/thread/${Number(report.thread_id)}">Thread: ${esc(report.thread_title)}</a>
      </div>

      ${
        report.status === 'open'
          ? `
            <div class="admin-controls">
              <button class="btn small" data-admin-report="${report.id}" data-admin-action="resolve">Resolve</button>
              <button class="btn ghost small" data-admin-report="${report.id}" data-admin-action="dismiss">Dismiss</button>
            </div>
          `
          : ''
      }
    </article>
  `;
}

function userRowHtml(user) {
  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="post-author">@${esc(user.username)}</span>
        ${user.is_admin ? '<span class="badge admin">admin</span>' : ''}
        ${user.is_moderator ? '<span class="badge">moderator</span>' : ''}
        ${user.banned ? '<span class="badge danger">banned</span>' : ''}
      </div>

      <div class="meta">
        <span>id: ${user.id}</span>
        <span>threads: ${user.thread_count}</span>
        <span>posts: ${user.post_count}</span>
        <span>since ${time(user.created_at)}</span>
      </div>

      <div class="admin-controls">
        ${
          user.banned
            ? `<button class="btn small" data-admin-user="${user.id}" data-admin-action="unban">Unban</button>`
            : `<button class="btn danger small" data-admin-user="${user.id}" data-admin-action="ban">Ban</button>`
        }
        ${
          user.is_moderator
            ? `<button class="btn ghost small" data-admin-user="${user.id}" data-admin-action="mod_demote">Demote moderator</button>`
            : `<button class="btn ghost small" data-admin-user="${user.id}" data-admin-action="mod_promote">Make moderator</button>`
        }
      </div>
    </article>
  `;
}

function auditRowHtml(log) {
  return `
    <article class="admin-row">
      <div class="admin-row-head">
        <span class="badge">${esc(log.action)}</span>
        <span class="muted">${log.username ? '@' + esc(log.username) : 'system'}</span>
        <span class="muted">${esc(log.ip || '')}</span>
        <time>${time(log.created_at)}</time>
      </div>
      ${log.details ? `<div class="meta">${esc(log.details)}</div>` : ''}
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
      app.innerHTML = `
        <section class="card page-card narrow">
          <h1>403</h1>
          <p class="error">Staff only.</p>
        </section>
      `;
      return;
    }

    const tab = query.get('tab') === 'users' ? 'users' : query.get('tab') === 'audit' ? 'audit' : 'reports';
    const page = Math.max(1, Number(query.get('page') || 1) || 1);
    const status = query.get('status') || 'open';

    if ((tab === 'users' || tab === 'audit') && !state.me.isAdmin) {
      app.innerHTML = `
        <section class="card page-card narrow">
          <h1>403</h1>
          <p class="error">This section is admin-only.</p>
        </section>
      `;
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

      content += reports.length
        ? reports.map(reportRowHtml).join('')
        : '<section class="empty">No reports.</section>';

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

      content += users.length
        ? users.map(userRowHtml).join('')
        : '<section class="empty">Nobody found.</section>';

      content += paginationHtml(`#/admin?tab=users&q=${encodeURIComponent(q)}`, page, data.hasMore);
    } else {
      const data = await api(`/api/admin?type=audit&page=${page}`);
      const logs = data.logs || [];

      content = logs.length
        ? logs.map(auditRowHtml).join('')
        : '<section class="empty">Log is empty.</section>';

      content += paginationHtml('#/admin?tab=audit', page, data.hasMore);
    }

    app.innerHTML = `
      <section class="section-head">
        <h1>Admin</h1>
        ${state.me.isAdmin ? '<button id="export-btn" class="btn ghost small">Download backup (JSON)</button>' : ''}
      </section>

      <nav class="tabs">
        <a class="tab ${tab === 'reports' ? 'active' : ''}" href="#/admin?tab=reports">Reports</a>
        ${state.me.isAdmin ? `<a class="tab ${tab === 'users' ? 'active' : ''}" href="#/admin?tab=users">Users</a>` : ''}
        ${state.me.isAdmin ? `<a class="tab ${tab === 'audit' ? 'active' : ''}" href="#/admin?tab=audit">Audit log</a>` : ''}
      </nav>

      <section class="admin-list">${content}</section>
    `;

    bindAdminPage();
  };
}

function bindAdminPage() {
  document.querySelectorAll('[data-admin-report]').forEach((button) => {
    button.addEventListener('click', () => {
      adminAction('report', Number(button.dataset.adminReport), button.dataset.adminAction);
    });
  });

  document.querySelectorAll('[data-admin-user]').forEach((button) => {
    button.addEventListener('click', () => {
      adminAction('user', Number(button.dataset.adminUser), button.dataset.adminAction);
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

  const exportBtn = document.getElementById('export-btn');

  if (exportBtn) {
    exportBtn.addEventListener('click', exportBackup);
  }
}

function renderLogin() {
  return function loginView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Log in</h1>
        <form id="login-form" class="form">
          <label>
            Username
            <input id="login-username" class="input" autocomplete="username" required minlength="3" maxlength="32" />
          </label>

          <label>
            Password
            <input id="login-password" class="input" type="password" autocomplete="current-password" required minlength="12" maxlength="128" />
          </label>

          <div id="turnstile-box"></div>

          <button class="btn" type="submit">Log in</button>
          <div id="form-error" class="form-error"></div>
        </form>
        <p><a href="#/recover">Forgot password / recover access</a></p>
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
          body: JSON.stringify({
            username,
            password,
            turnstileToken: state.turnstileToken || undefined
          })
        });

        state.me = await api('/api/auth/me');
        updateAuthArea();
        location.hash = '#/';
      } catch (error) {
        errorEl.textContent = error.message;
        resetTurnstile();
        renderTurnstile();
      }
    });
  };
}

function renderRegister() {
  return function registerView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Register</h1>

        <p class="muted">
          By registering you agree to the rules: legal research only, your own
          devices/networks/accounts or written permission. The administration is not
          responsible for user actions outside the platform; the user must comply
          with applicable laws.
        </p>

        <form id="register-form" class="form">
          <label>
            Username
            <input id="register-username" class="input" autocomplete="username" required minlength="3" maxlength="32" />
          </label>

          <label>
            Password
            <input id="register-password" class="input" type="password" autocomplete="new-password" required minlength="12" maxlength="128" />
          </label>

          <label class="checkbox">
            <input id="register-terms" type="checkbox" required />
            <span>
              I accept the <a href="#/rules" target="_blank" rel="noopener">rules</a> and understand
              that the platform is for educational, research and authorized security purposes only.
            </span>
          </label>

          <div id="turnstile-box"></div>

          <button class="btn" type="submit">Create account</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    renderTurnstile();

    document.getElementById('register-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const username = document.getElementById('register-username').value.trim();
      const password = document.getElementById('register-password').value;
      const acceptTerms = document.getElementById('register-terms').checked;
      const errorEl = document.getElementById('form-error');

      try {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            acceptTerms,
            turnstileToken: state.turnstileToken || undefined
          })
        });

        state.me = await api('/api/auth/me');
        updateAuthArea();
        toast('Account created');
        location.hash = '#/';

        if (data.recoveryCode) {
          showRecoveryModal(data.recoveryCode);
        }
      } catch (error) {
        errorEl.textContent = error.message;
        resetTurnstile();
        renderTurnstile();
      }
    });
  };
}

function renderRecover() {
  return function recoverView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Recover access</h1>

        <p class="muted">
          Enter your username and the recovery code you got at registration.
          After reset the old code is burned — you will get a new one.
        </p>

        <form id="recover-form" class="form">
          <label>
            Username
            <input id="recover-username" class="input" autocomplete="username" required minlength="3" maxlength="32" />
          </label>

          <label>
            Recovery code
            <input id="recover-code" class="input" autocomplete="off" required placeholder="PH-XXXX-XXXX-XXXX-XXXX" />
          </label>

          <label>
            New password
            <input id="recover-password" class="input" type="password" autocomplete="new-password" required minlength="12" maxlength="128" />
          </label>

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
        const data = await api('/api/auth/recover', {
          method: 'POST',
          body: JSON.stringify({ username, recoveryCode, newPassword })
        });

        toast('Password changed. Log in with the new password.');
        location.hash = '#/login';

        if (data.recoveryCode) {
          showRecoveryModal(data.recoveryCode);
        }
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function renderNewThread(query) {
  return async function newThreadView() {
    if (!state.me) {
      location.hash = '#/login';
      return;
    }

    const categories = await ensureCategories();
    const selectedCategory = query.get('category') || '';

    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>New thread</h1>

        <p class="muted">
          Before publishing, make sure the topic is about legal research, education,
          CTF, defensive security or authorized pentesting.
        </p>

        <form id="new-thread-form" class="form">
          <label>
            Category
            <select id="thread-category" required>
              <option value="">Pick a category</option>
              ${categories
                .map(
                  (category) => `
                    <option value="${category.id}" ${category.slug === selectedCategory ? 'selected' : ''}>
                      ${esc(category.name)}
                    </option>
                  `
                )
                .join('')}
            </select>
          </label>

          <label>
            Title
            <input id="thread-title" class="input" required minlength="4" maxlength="160" />
          </label>

          <label>
            First post
            <textarea id="thread-body" required minlength="1" maxlength="10000"></textarea>
          </label>

          <p class="muted">
            Markdown: **bold**, *italic*, \`code\`, \`\`\`code blocks\`\`\`, lists (- and 1.), &gt; quotes, [link](https://example.com), @mentions
          </p>

          <button class="btn" type="submit">Publish</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('new-thread-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const categoryId = Number(document.getElementById('thread-category').value);
      const title = document.getElementById('thread-title').value.trim();
      const body = document.getElementById('thread-body').value;
      const errorEl = document.getElementById('form-error');

      try {
        const data = await api('/api/threads', {
          method: 'POST',
          body: JSON.stringify({ categoryId, title, body })
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
      app.innerHTML = `
        <section class="card page-card narrow">
          <h1>Search</h1>
          <p class="notice">Enter at least 3 characters.</p>
        </section>
      `;
      return;
    }

    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const results = data.results || [];

    app.innerHTML = `
      <section class="section-head">
        <h1>Search: ${esc(q)}</h1>
      </section>

      ${
        results.length
          ? `<section class="thread-list">${results.map(threadItemHtml).join('')}</section>`
          : '<section class="empty">Nothing found.</section>'
      }
    `;
  };
}

function renderRules() {
  return function rulesView() {
    app.innerHTML = `
      <section class="card page-card narrow">
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
          The platform is educational and research-oriented. The user is fully responsible
          for their actions outside the forum and must comply with applicable law.
          The administration is not responsible for user actions outside the platform.
        </p>
      </section>
    `;
  };
}

function renderNotFound() {
  return function notFoundView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>404</h1>
        <p class="muted">Page not found.</p>
        <p><a href="#/">Back home</a></p>
      </section>
    `;
  };
}

async function render() {
  const { segments, query } = parseRoute();

  app.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const section = segments[0] || '';

    if (!section) {
      await renderHome()();
    } else if (section === 'category') {
      await renderCategory(segments[1], query)();
    } else if (section === 'thread') {
      await renderThread(segments[1], query)();
    } else if (section === 'user') {
      await renderProfile(segments[1])();
    } else if (section === 'messages') {
      if (segments[1] === 'user') {
        await renderConversation(segments[2])();
      } else if (segments[1] === 'new') {
        renderNewMessage(query)();
      } else {
        await renderMessages(query)();
      }
    } else if (section === 'login') {
      renderLogin()();
    } else if (section === 'register') {
      renderRegister()();
    } else if (section === 'recover') {
      renderRecover()();
    } else if (section === 'new-thread') {
      await renderNewThread(query)();
    } else if (section === 'search') {
      await renderSearch(query)();
    } else if (section === 'rules') {
      renderRules()();
    } else if (section === 'admin') {
      await renderAdmin(query)();
    } else {
      renderNotFound()();
    }
  } catch (error) {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Error</h1>
        <p class="error">${esc(error.message)}</p>
        <p><a href="#/">Back home</a></p>
      </section>
    `;
  }

  updateAuthArea();
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

  if (!reason) {
    toast('Specify a reason', true);
    return;
  }

  try {
    await api('/api/report', {
      method: 'POST',
      body: JSON.stringify({ postId: reportPostId, reason })
    });

    closeReportModal();
    toast('Report sent');
  } catch (error) {
    toast(error.message, true);
  }
}

async function copyRecoveryCode() {
  const code = document.getElementById('recovery-code').textContent.trim();

  try {
    await navigator.clipboard.writeText(code);
    toast('Code copied');
  } catch {
    toast('Copy the code manually', true);
  }
}

document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const q = document.getElementById('search-input').value.trim();

  if (q) {
    location.hash = `#/search?q=${encodeURIComponent(q)}`;
  }
});

document.getElementById('modal-cancel').addEventListener('click', closeReportModal);

modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeReportModal();
  }
});

document.getElementById('modal-send').addEventListener('click', submitReport);

document.getElementById('recovery-copy').addEventListener('click', copyRecoveryCode);
document.getElementById('recovery-close').addEventListener('click', closeRecoveryModal);

recoveryModal.addEventListener('click', (event) => {
  if (event.target === recoveryModal) {
    closeRecoveryModal();
  }
});

window.addEventListener('hashchange', render);

(async function init() {
  await Promise.all([loadMe(), loadConfig()]);
  updateAuthArea();
  await render();
})();
