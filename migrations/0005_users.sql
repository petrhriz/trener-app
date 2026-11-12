-- Příprava na víc uživatelů.
-- Účet id 1 = vlastník. Session v dashboardu nese id uživatele. Data dalších uživatelů jsou ve vlastních tabulkách
-- (docs/multi-user.md).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user', -- owner | user
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);
INSERT OR IGNORE INTO users (id, name, role, active, created_at) VALUES (1, NULL, 'owner', 1, datetime('now'));
