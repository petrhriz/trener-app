-- Fáze 9 (druhé kolo připomínek): výkon na konci Z2 tepu z intervals.icu, oprava stavu backfillu wellness

-- Pw:HR v zóně 2 (W/bpm) a kolik minut v Z2 se do něj počítalo (intervals.icu icu_power_hr_z2 / _mins)
ALTER TABLE activities ADD COLUMN icu_pwhr_z2 REAL;
ALTER TABLE activities ADD COLUMN icu_pwhr_z2_min REAL;

-- stav backfillu wellness byl uložený jako neplatný JSON → /api/status vracel HTTP 500 a backfill stál
UPDATE sync_state SET value = '{"cursor":"2026-11-04","done":false,"empty":0}' WHERE key = 'bf_well' AND value NOT LIKE '{"%';

-- doplnit nová pole z intervals.icu za posledních 400 dní
UPDATE activities SET enrich_state = 0 WHERE date >= date('now', '-400 days') AND icu_id IS NOT NULL;
