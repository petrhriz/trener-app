-- Tabulka users bez nepoužívaného sloupce pro Telegram. SQLite neumí smazat sloupec s UNIQUE → přestavba tabulky.
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user', -- owner | user
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  username TEXT,
  pass_hash TEXT,
  schema_ver INTEGER DEFAULT 0
);
INSERT INTO users_new (id, name, role, active, created_at, username, pass_hash, schema_ver)
  SELECT id, name, role, active, created_at, username, pass_hash, schema_ver FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username);
