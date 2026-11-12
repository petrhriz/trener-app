-- Hodnoty z intervals.icu (CTL/ATL, eFTP, spárovaný workout), detail spánku, sport plánované jednotky

-- spánek: fáze, probuzení, stres a tep ve spánku, potřeba spánku, dílčí hodnocení Garminu (JSON)
ALTER TABLE wellness ADD COLUMN deep_s REAL;
ALTER TABLE wellness ADD COLUMN light_s REAL;
ALTER TABLE wellness ADD COLUMN rem_s REAL;
ALTER TABLE wellness ADD COLUMN awake_s REAL;
ALTER TABLE wellness ADD COLUMN awake_count INTEGER;
ALTER TABLE wellness ADD COLUMN sleep_stress REAL;
ALTER TABLE wellness ADD COLUMN sleep_hr REAL;
ALTER TABLE wellness ADD COLUMN sleep_resp REAL;
ALTER TABLE wellness ADD COLUMN sleep_need_min INTEGER;
ALTER TABLE wellness ADD COLUMN sleep_feedback TEXT;
ALTER TABLE wellness ADD COLUMN sleep_sub TEXT;
ALTER TABLE wellness ADD COLUMN sleep_start TEXT;
-- Body Battery a stres během dne
ALTER TABLE wellness ADD COLUMN bb_charged REAL;
ALTER TABLE wellness ADD COLUMN bb_drained REAL;
ALTER TABLE wellness ADD COLUMN bb_latest REAL;
ALTER TABLE wellness ADD COLUMN stress_max REAL;
ALTER TABLE wellness ADD COLUMN stress_dist TEXT;      -- JSON {rest, low, med, high} podíly 0–1
-- kondice / únava přímo z intervals.icu (konec dne)
ALTER TABLE wellness ADD COLUMN icu_ctl REAL;
ALTER TABLE wellness ADD COLUMN icu_atl REAL;
ALTER TABLE wellness ADD COLUMN icu_ramp REAL;

-- aktivity: spárovaný workout z intervals.icu, plnění, eFTP, strain
ALTER TABLE activities ADD COLUMN icu_event TEXT;      -- JSON {id, name, description, load, moving_time, type}
ALTER TABLE activities ADD COLUMN icu_compliance REAL;
ALTER TABLE activities ADD COLUMN icu_eftp REAL;
ALTER TABLE activities ADD COLUMN icu_strain REAL;
ALTER TABLE activities ADD COLUMN icu_intensity REAL;

-- plán: sport jednotky (ride | run | xc_ski | walk) a cíl, se kterým vznikla
ALTER TABLE planned_workouts ADD COLUMN sport TEXT DEFAULT 'ride';
ALTER TABLE planned_workouts ADD COLUMN goal TEXT;

-- zátěž aktivit sjednotit s intervals.icu tam, kde ji známe
UPDATE activities SET load = icu_load, load_source = 'icu' WHERE icu_load IS NOT NULL;
-- doplnění z intervals.icu znovu (spárovaný workout, eFTP) za posledních 400 dní
UPDATE activities SET enrich_state = 0 WHERE date >= date('now', '-400 days');
UPDATE sync_state SET value = '"1900-01-01"' WHERE key = 'metrics_dirty';
