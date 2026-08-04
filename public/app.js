const app = document.getElementById('app');
const authArea = document.getElementById('auth-area');
const modal = document.getElementById('modal');

const state = {
  me: null,
  categories: []
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

function textToHtml(value) {
  return esc(value).replace(/\n/g, '<br>');
}

function time(timestamp) {
  return new Date(timestamp).toLocaleString('ru-RU', {
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

async function ensureCategories(force = false) {
  if (!state.categories.length || force) {
    const data = await api('/api/categories');
    state.categories = data.categories || [];
  }

  return state.categories;
}

function updateAuthArea() {
  if (!authArea) return;

  if (state.me) {
    authArea.innerHTML = `
      <a class="btn small" href="#/new-thread">+ Тема</a>
      <span class="muted">@${esc(state.me.username)}</span>
      ${state.me.isAdmin ? '<span class="badge admin">admin</span>' : ''}
      <button id="logout-btn" class="btn ghost small" type="button">Выход</button>
    `;

    document.getElementById('logout-btn')?.addEventListener('click', logout);
  } else {
    authArea.innerHTML = `
      <a class="btn ghost small" href="#/login">Вход</a>
      <a class="btn small" href="#/register">Регистрация</a>
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
      ${page > 1 ? `<a class="btn ghost small" href="${pageLink(base, page - 1)}">Назад</a>` : ''}
      <span class="muted">Страница ${page}</span>
      ${hasMore ? `<a class="btn ghost small" href="${pageLink(base, page + 1)}">Дальше</a>` : ''}
    </nav>
  `;
}

function categoryCardHtml(category) {
  return `
    <a class="category-card" href="#/category/${encodeURIComponent(category.slug)}">
      <h3>${esc(category.name)}</h3>
      <p>${esc(category.description)}</p>
      <div class="meta">Тредов: ${Number(category.thread_count || 0)}</div>
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
        <span>автор: ${esc(thread.author || 'unknown')}</span>
        <span>ответов: ${Number(thread.post_count || 0)}</span>
        <span>обновлено: ${time(thread.updated_at)}</span>
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
          Форум для легального пентеста, hardware security lab, CTF, ESP32, Flipper Zero
          и defensive security.
        </p>
        <p>
          Только авторизованные тесты, собственные устройства, собственные сети
          и письменные разрешения. Любые незаконные действия запрещены.
        </p>
        <p>
          <a href="#/rules">Прочитать правила</a>
        </p>
      </section>

      <section class="section-head">
        <h2>Категории</h2>
        ${state.me ? '<a class="btn" href="#/new-thread">Создать тред</a>' : ''}
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
      throw new Error('Категория не найдена');
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
        ${state.me ? `<a class="btn" href="#/new-thread?category=${encodeURIComponent(slug)}">Новый тред</a>` : ''}
      </section>

      ${
        threads.length
          ? `<section class="thread-list">${threads.map(threadItemHtml).join('')}</section>`
          : '<section class="empty">Пока нет тредов. Создай первый в рамках правил.</section>'
      }

      ${paginationHtml(base, page, Boolean(data.hasMore))}
    `;
  };
}

function threadAdminHtml(thread) {
  if (!state.me?.isAdmin) return '';

  return `
    <div class="admin-controls">
      <button class="btn ghost small" data-admin-thread="${thread.id}" data-admin-action="${thread.is_locked ? 'unlock' : 'lock'}">
        ${thread.is_locked ? 'Разблокировать' : 'Заблокировать'}
      </button>

      <button class="btn ghost small" data-admin-thread="${thread.id}" data-admin-action="${thread.is_pinned ? 'unpin' : 'pin'}">
        ${thread.is_pinned ? 'Открепить' : 'Закрепить'}
      </button>

      <button class="btn danger small" data-admin-thread="${thread.id}" data-admin-action="delete">
        Удалить тред
      </button>
    </div>
  `;
}

function replyFormHtml(thread) {
  if (!state.me) {
    return `<p class="notice"><a href="#/login">Войди</a>, чтобы отвечать.</p>`;
  }

  if (thread.is_locked && !state.me.isAdmin) {
    return `<p class="notice warn">Тред закрыт для ответов.</p>`;
  }

  return `
    <form id="reply-form" class="form">
      <label>
        Ответ
        <textarea id="reply-body" maxlength="10000" required minlength="1"></textarea>
      </label>
      <button class="btn" type="submit">Ответить</button>
      <div id="reply-error" class="form-error"></div>
    </form>
  `;
}

function postFooterHtml(thread, post) {
  const reportButton = state.me
    ? `<button class="link" data-report-post="${post.id}">Пожаловаться</button>`
    : '';

  const adminDelete = state.me?.isAdmin
    ? `<button class="link danger" data-admin-post="${post.id}" data-admin-action="delete">Удалить</button>`
    : '';

  return [reportButton, adminDelete].filter(Boolean).join('');
}

function postHtml(thread, post) {
  return `
    <article class="post" id="post-${post.id}">
      <header>
        <div class="post-author">
          ${esc(post.username)}
          ${post.is_admin ? '<span class="badge admin">admin</span>' : ''}
        </div>
        <time>${time(post.created_at)}</time>
      </header>

      <div class="post-body">${textToHtml(post.body)}</div>

      <footer>
        ${postFooterHtml(thread, post)}
      </footer>
    </article>
  `;
}

function renderThread(id, query) {
  return async function threadView() {
    const threadId = Number(id);

    if (!Number.isInteger(threadId)) {
      throw new Error('Некорректный тред');
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
            <span>автор: ${esc(thread.author)}</span>
            <span>создано: ${time(thread.created_at)}</span>
          </div>
        </div>
      </section>

      ${threadAdminHtml(thread)}

      <section>
        ${posts.map((post) => postHtml(thread, post)).join('')}
      </section>

      ${paginationHtml(base, page, Boolean(postsData.hasMore))}

      <section class="page-card">
        <h2>Ответ</h2>
        ${replyFormHtml(thread)}
      </section>
    `;

    bindThreadPage(thread);
  };
}

function bindThreadPage(thread) {
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

        toast('Ответ опубликован');
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

async function adminAction(type, id, action) {
  try {
    await api('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ type, id, action })
    });

    toast('Действие выполнено');
    await render();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderLogin() {
  return function loginView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Вход</h1>
        <form id="login-form" class="form">
          <label>
            Ник
            <input id="login-username" class="input" autocomplete="username" required minlength="3" maxlength="32" />
          </label>

          <label>
            Пароль
            <input id="login-password" class="input" type="password" autocomplete="current-password" required minlength="12" maxlength="128" />
          </label>

          <button class="btn" type="submit">Войти</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('form-error');

      try {
        state.me = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });

        updateAuthArea();
        location.hash = '#/';
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });
  };
}

function renderRegister() {
  return function registerView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Регистрация</h1>

        <p class="muted">
          Регистрация означает согласие с правилами: только легальные исследования,
          только собственные устройства/сети/аккаунты или письменные разрешения.
          Администрация не несёт ответственности за действия пользователя вне площадки,
          пользователь сам обязан соблюдать законы и нормы.
        </p>

        <form id="register-form" class="form">
          <label>
            Ник
            <input id="register-username" class="input" autocomplete="username" required minlength="3" maxlength="32" />
          </label>

          <label>
            Пароль
            <input id="register-password" class="input" type="password" autocomplete="new-password" required minlength="12" maxlength="128" />
          </label>

          <label class="checkbox">
            <input id="register-terms" type="checkbox" required />
            <span>
              Я принимаю <a href="#/rules" target="_blank" rel="noopener">правила</a> и понимаю,
              что площадка предназначена только для познавательных, исследовательских,
              учебных и авторизованных security-задач.
            </span>
          </label>

          <button class="btn" type="submit">Создать аккаунт</button>
          <div id="form-error" class="form-error"></div>
        </form>
      </section>
    `;

    document.getElementById('register-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const username = document.getElementById('register-username').value.trim();
      const password = document.getElementById('register-password').value;
      const acceptTerms = document.getElementById('register-terms').checked;
      const errorEl = document.getElementById('form-error');

      try {
        state.me = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, password, acceptTerms })
        });

        updateAuthArea();
        toast('Аккаунт создан');
        location.hash = '#/';
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
        <h1>Новый тред</h1>

        <p class="muted">
          Перед публикацией убедись, что тема относится к легальным исследованиям,
          обучению, CTF, defensive security или авторизованному пентесту.
        </p>

        <form id="new-thread-form" class="form">
          <label>
            Категория
            <select id="thread-category" required>
              <option value="">Выбери категорию</option>
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
            Заголовок
            <input id="thread-title" class="input" required minlength="4" maxlength="160" />
          </label>

          <label>
            Текст первого поста
            <textarea id="thread-body" required minlength="1" maxlength="10000"></textarea>
          </label>

          <button class="btn" type="submit">Опубликовать</button>
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

        toast('Тред создан');
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
          <h1>Поиск</h1>
          <p class="notice">Введи минимум 3 символа.</p>
        </section>
      `;
      return;
    }

    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const results = data.results || [];

    app.innerHTML = `
      <section class="section-head">
        <h1>Поиск: ${esc(q)}</h1>
      </section>

      ${
        results.length
          ? `<section class="thread-list">${results.map(threadItemHtml).join('')}</section>`
          : '<section class="empty">Ничего не найдено.</section>'
      }
    `;
  };
}

function renderRules() {
  return function rulesView() {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Правила PentHub</h1>

        <h2>Разрешено</h2>
        <ul>
          <li>Авторизованный пентест при наличии письменного разрешения.</li>
          <li>Исследование собственных устройств, сетей и аккаунтов.</li>
          <li>CTF, учебные стенды, sandbox-лаборатории.</li>
          <li>Defensive security: защита, мониторинг, харденинг, детект.</li>
          <li>Hardware security lab на своём железе.</li>
          <li>Обсуждение responsible disclosure и правовых рамок.</li>
        </ul>

        <h2>Запрещено</h2>
        <ul>
          <li>Обсуждение атак на чужие системы без разрешения.</li>
          <li>Глушилки, jamming, деаутентификация, DoS/DDoS.</li>
          <li>Брутфорс и подбор паролей к чужим аккаунтам/системам.</li>
          <li>Малварь, стилеры, ransomware, ботнеты.</li>
          <li>Кардинг, скимминг, кража данных, мошенничество.</li>
          <li>Продажа эксплойтов/доступов/учёток для незаконного использования.</li>
        </ul>

        <h2>Юридическая часть</h2>
        <p>
          Площадка носит познавательный, учебный и исследовательский характер.
          Пользователь несёт полную ответственность за свои действия вне форума
          и обязан соблюдать применимое законодательство.
          Администрация не несёт ответственности за действия пользователей вне платформы.
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
        <p class="muted">Страница не найдена.</p>
        <p><a href="#/">Вернуться на главную</a></p>
      </section>
    `;
  };
}

async function render() {
  const { segments, query } = parseRoute();

  app.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    const section = segments[0] || '';

    if (!section) {
      await renderHome()();
    } else if (section === 'category') {
      await renderCategory(segments[1], query)();
    } else if (section === 'thread') {
      await renderThread(segments[1], query)();
    } else if (section === 'login') {
      renderLogin()();
    } else if (section === 'register') {
      renderRegister()();
    } else if (section === 'new-thread') {
      await renderNewThread(query)();
    } else if (section === 'search') {
      await renderSearch(query)();
    } else if (section === 'rules') {
      renderRules()();
    } else {
      renderNotFound()();
    }
  } catch (error) {
    app.innerHTML = `
      <section class="card page-card narrow">
        <h1>Ошибка</h1>
        <p class="error">${esc(error.message)}</p>
        <p><a href="#/">Вернуться на главную</a></p>
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
    toast('Укажи причину жалобы', true);
    return;
  }

  try {
    await api('/api/report', {
      method: 'POST',
      body: JSON.stringify({ postId: reportPostId, reason })
    });

    closeReportModal();
    toast('Жалоба отправлена');
  } catch (error) {
    toast(error.message, true);
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

window.addEventListener('hashchange', render);

(async function init() {
  await loadMe();
  updateAuthArea();
  await render();
})();
