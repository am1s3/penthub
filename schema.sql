PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  accepted_terms_at INTEGER,
  bio TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(category_id, deleted, updated_at);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id, deleted, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  ip TEXT,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

INSERT OR IGNORE INTO categories (id, slug, name, description, sort_order) VALUES
(1, 'rules-and-legal', 'Правила и юридическая зона', 'Правовые рамки, scope, письменные разрешения, responsible disclosure и правила площадки.', 1),
(2, 'authorized-pentesting', 'Авторизованный пентест', 'Методологии, чек-листы, отчёты, лаборатории и тесты только с письменного разрешения.', 2),
(3, 'esp32-security-lab', 'ESP32 security lab', 'Исследование ESP32 на собственных устройствах: прошивки, отладка, изоляция, secure design.', 3),
(4, 'flipper-zero-research', 'Flipper Zero research', 'Изучение протоколов, RFID/NFC/ИК/Sub-GHz на своих устройствах и в контролируемой lab-среде.', 4),
(5, 'wifi-security-audit', 'Wi-Fi security audit', 'Аудит собственных сетей, WPA2/WPA3, конфигурации, защита, изолированные lab-стенды.', 5),
(6, 'rfid-nfc-lab', 'RFID/NFC lab', 'Тестирование собственных карт, меток и ридеров. Эмуляция и анализ только в lab-условиях.', 6),
(7, 'hardware-security', 'Hardware security', 'UART/JTAG/SWD, side-channel, glitching и защита железа. Только свои устройства.', 7),
(8, 'ctf-training', 'CTF и тренировки', 'Задачи, writeups, курсы, стенды, безопасные платформы и командные тренировки.', 8),
(9, 'firmware-dev', 'Firmware и разработка', 'Проектирование прошивок, secure boot, обновления, защита устройств и разработка.', 9),
(10, 'defensive-security', 'Defensive security', 'Детект, харденинг, мониторинг, защита от атак, incident response и безопасность инфраструктуры.', 10);
