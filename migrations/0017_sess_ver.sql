-- Verze přihlášení: změna hesla nebo „Odhlásit všude“ ji zvýší a starší přihlášení přestanou platit.
ALTER TABLE users ADD COLUMN sess_ver INTEGER NOT NULL DEFAULT 0;
