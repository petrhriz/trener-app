-- Trenér: plán uložený po týdnech (po–ne) a postup v žebříčcích tréninků.
-- Plán se přepočítává jen při změně vstupů (otisk v hash), ne při každém otevření stránky.
CREATE TABLE IF NOT EXISTS coach_weeks (
  week_start TEXT PRIMARY KEY,      -- pondělí týdne
  data TEXT NOT NULL,               -- JSON StoredWeek (rozpočet, dny, role, rodiny)
  hash TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS coach_progress (
  key TEXT PRIMARY KEY,             -- sport:rodina (ride:thr, run:tempo …)
  level INTEGER NOT NULL,           -- stupeň žebříčku
  last_date TEXT,                   -- poslední odjetá jednotka rodiny
  last_outcome TEXT
);
