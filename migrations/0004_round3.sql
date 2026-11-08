-- Fáze 10 (3. kolo připomínek): víc údajů z aktivit, patra, dýchání ve spánku, potřeba spánku na dnešní noc,
-- vybavení (kola, lyže, boty), šifrované API klíče v nastavení

-- aktivity: JSON s doplňkovými údaji z Garminu (max. rychlost, kadence, otáčky, dech, výška, anaerobní TE, štítek)
ALTER TABLE activities ADD COLUMN extra TEXT;

-- wellness: patra, dýchání ve spánku min/max, potřeba spánku na následující noc
ALTER TABLE wellness ADD COLUMN floors_up REAL;
ALTER TABLE wellness ADD COLUMN floors_down REAL;
ALTER TABLE wellness ADD COLUMN sleep_resp_lo REAL;
ALTER TABLE wellness ADD COLUMN sleep_resp_hi REAL;
ALTER TABLE wellness ADD COLUMN next_sleep_need_min INTEGER;

-- vybavení
CREATE TABLE IF NOT EXISTS gear (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                -- bike | ski | shoe | other
  default_for TEXT,                  -- čárkou oddělené sporty (ride,mtb,indoor | xc_ski | run …), aktivita bez ručního přiřazení
  from_date TEXT,                    -- výchozí přiřazení až od tohoto data (NULL = celá historie)
  to_date TEXT,                      -- vyřazeno k datu (NULL = používá se)
  start_km REAL DEFAULT 0,           -- km najeté před evidencí
  note TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS activity_gear (
  activity_id TEXT PRIMARY KEY,
  gear_id INTEGER                    -- NULL = bez vybavení (ručně odebráno)
);

-- API klíče zadané v dashboardu (AES-GCM, klíč odvozený z ADMIN_TOKEN)
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

-- znovu stáhnout celou historii aktivit z Garminu (nová pole); zátěž a vazby z intervals.icu zůstávají
UPDATE sync_state SET value = '{"start":0,"done":false,"count":0}' WHERE key = 'bf_act';
-- wellness za posledních 400 dní znovu (patra, dech, potřeba spánku)
UPDATE sync_state SET value = '{"cursor":"2026-11-04","done":false,"empty":0}' WHERE key = 'bf_well';
