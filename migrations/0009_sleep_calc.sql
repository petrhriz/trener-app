-- Vlastní skóre a potřeba spánku (src/core/sleepCalc.ts).
-- sleep_score / sleep_need_min / next_sleep_need_min = přepočtené hodnoty (s nimi pracuje celá aplikace),
-- původní čísla z Garminu zůstávají ve sloupcích *_g pro srovnání.
ALTER TABLE wellness ADD COLUMN sleep_score_g REAL;
ALTER TABLE wellness ADD COLUMN sleep_need_g_min INTEGER;
ALTER TABLE wellness ADD COLUMN next_sleep_need_g_min INTEGER;
UPDATE wellness SET sleep_score_g = sleep_score, sleep_need_g_min = sleep_need_min, next_sleep_need_g_min = next_sleep_need_min;
-- Energie (src/core/energy.ts) místo Garmin Body Battery: bb_* = výpočet, bb_*_g = Garmin.
ALTER TABLE wellness ADD COLUMN bb_max_g REAL;
ALTER TABLE wellness ADD COLUMN bb_min_g REAL;
ALTER TABLE wellness ADD COLUMN bb_charged_g REAL;
ALTER TABLE wellness ADD COLUMN bb_drained_g REAL;
ALTER TABLE wellness ADD COLUMN bb_latest_g REAL;
ALTER TABLE wellness ADD COLUMN energy_end REAL;           -- hladina na konci dne (start dalšího dne)
UPDATE wellness SET bb_max_g = bb_max, bb_min_g = bb_min, bb_charged_g = bb_charged, bb_drained_g = bb_drained, bb_latest_g = bb_latest;
-- jiná stupnice než Garmin → staré hodnoty pryč, výpočet doplní 60 dní zpět (sync krok „energie“)
UPDATE wellness SET bb_max = NULL, bb_min = NULL, bb_charged = NULL, bb_drained = NULL, bb_latest = NULL;
-- průběh energie za den (body po 2 min, stres, klidné chvíle, události) – JSON, kreslí se v kartě Energie
CREATE TABLE IF NOT EXISTS energy_day (
  date TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT
);
