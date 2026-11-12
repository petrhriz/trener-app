-- Účty pro víc lidí (do ~10). Data každého dalšího uživatele jsou ve vlastních tabulkách
-- u<id>_… (src/lib/tenant.ts), tady jen přihlašovací údaje a verze jeho tabulek.
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN pass_hash TEXT;             -- pbkdf2$<iterace>$<sůl>$<hash>
ALTER TABLE users ADD COLUMN schema_ver INTEGER DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username);
