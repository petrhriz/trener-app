-- Příprava na víc uživatelů (5. kolo, 8. 11. 2026).
-- Zatím jeden účet (id 1 = vlastník). Session v dashboardu nese id uživatele, přihlašovací odkaz se váže na uživatele
-- podle Telegram chat_id. Data (aktivity, wellness, plán…) zatím user_id nemají – postup v docs/multi-user.md.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  telegram_chat_id TEXT UNIQUE,      -- NULL u vlastníka = bere se TELEGRAM_CHAT_ID ze secrets
  role TEXT NOT NULL DEFAULT 'user', -- owner | user
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);
INSERT OR IGNORE INTO users (id, name, telegram_chat_id, role, active, created_at) VALUES (1, NULL, NULL, 'owner', 1, datetime('now'));
