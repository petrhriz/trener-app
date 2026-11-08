-- 6. kolo (8. 11. 2026): servis vybavení – díly s km od posledního servisu (řetěz, vosk na lyže, …) a záznamy servisu.

CREATE TABLE IF NOT EXISTS gear_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gear_id INTEGER NOT NULL,
  name TEXT NOT NULL,                -- např. Řetěz, Vosk, Pneumatiky
  action TEXT,                       -- text tlačítka: „Vyměněno“, „Navoskováno“
  interval_km REAL,                  -- první upozornění (km od servisu), NULL = bez upozornění
  repeat_km REAL,                    -- další upozornění každých X km, dokud se neprovede servis
  since TEXT NOT NULL,               -- od kdy se km počítají ('YYYY-MM-DD HH:MM:SS' místní, porovnává se s activities.start_local)
  start_km REAL DEFAULT 0,           -- km najeté před evidencí dílu
  notified_km REAL DEFAULT 0,        -- poslední hranice, na kterou už šlo upozornění
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_parts_gear ON gear_parts(gear_id);

CREATE TABLE IF NOT EXISTS gear_service (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL,
  gear_id INTEGER NOT NULL,
  at TEXT NOT NULL,                  -- místní čas servisu
  km REAL,                           -- km dílu v okamžiku servisu
  note TEXT
);
