-- Trenér: základní schéma

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,              -- Garmin activityId
  start_local TEXT NOT NULL,        -- 'YYYY-MM-DD HH:MM:SS'
  date TEXT NOT NULL,               -- 'YYYY-MM-DD' (místní)
  type_key TEXT,
  sport TEXT NOT NULL,              -- ride | mtb | indoor | run | skate | xc_ski | walk | hike | strength | mobility | padel | other
  name TEXT,
  distance_m REAL, duration_s REAL, moving_s REAL, elev_gain REAL,
  avg_hr REAL, max_hr REAL,
  avg_power REAL, max_power REAL, np REAL, max20 REAL,
  tss_garmin REAL, if_garmin REAL, garmin_load REAL, aerobic_te REAL,
  avg_cad REAL, min_temp REAL, max_temp REAL, lap_count INTEGER, calories REAL,
  hr_z TEXT,                        -- JSON [s] Z1..Z5
  pwr_z TEXT,                       -- JSON [s] Z1..Z7 (podle zón v Garminu)
  mmp TEXT,                         -- JSON {"30":W,"60":W,...}
  load REAL,                        -- zátěž do CTL (TSS / hrTSS)
  load_source TEXT,                 -- garmin_tss | np_ftp | hr_zones | hr_avg | none
  drift REAL,                       -- aerobní drift % (Pw:HR)
  icu_id TEXT,                      -- id v intervals.icu
  icu_load REAL,                    -- icu_training_load (srovnání)
  icu_decoupling REAL,
  laps TEXT,                        -- JSON lapy (z intervals.icu)
  quality_type TEXT,                -- vo2 | vo2short | prah | sweetspot | tempo | xc_ski | null
  is_quality INTEGER DEFAULT 0,
  enrich_state INTEGER DEFAULT 0,   -- 0 čeká, 1 hotovo, 2+ počet neúspěchů
  analyzed_sent INTEGER DEFAULT 0,
  seen_at TEXT,                     -- kdy jsme aktivitu poprvé viděli (rozbor do 30 min)
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_act_date ON activities(date);
CREATE INDEX IF NOT EXISTS ix_act_enrich ON activities(enrich_state, date);

CREATE TABLE IF NOT EXISTS wellness (
  date TEXT PRIMARY KEY,
  hrv REAL, hrv_weekly REAL, hrv_status TEXT,
  rhr REAL,
  sleep_s REAL, sleep_score REAL, sleep_q TEXT,
  steps INTEGER, bb_max REAL, bb_min REAL, stress_avg REAL,
  weight_kg REAL, vo2max REAL, intensity_min INTEGER, respiration REAL,
  fitness_age REAL,
  wake_time TEXT,                   -- konec spánku (místní), pravidelnost spánku
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  week_from TEXT PRIMARY KEY,       -- pondělí
  data TEXT NOT NULL,               -- JSON WeeklyReview (paměť pro trendy)
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  date TEXT PRIMARY KEY,
  load REAL NOT NULL,
  ctl REAL NOT NULL,                -- stav na konci dne
  atl REAL NOT NULL,
  form REAL NOT NULL,               -- forma ráno = CTL(D-1) - ATL(D-1)
  ramp REAL                         -- CTL(D) - CTL(D-7)
);

CREATE TABLE IF NOT EXISTS planned_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,               -- z2 | quality | long | recovery | rest
  quality_type TEXT,
  name TEXT NOT NULL,
  indoor INTEGER DEFAULT 0,
  duration_min INTEGER,
  steps_json TEXT,
  steps_text TEXT,                  -- syntaxe intervals.icu (7.3)
  target_load REAL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'planned',   -- planned | done | missed | moved | skipped
  moved_from TEXT,
  icu_event_id TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_pw_date ON planned_workouts(date);

CREATE TABLE IF NOT EXISTS constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,               -- nemuzu | bezky | nemoc | dovolena | nepojedu
  note TEXT,
  icu_event_id TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_con_date ON constraints(date);

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  source TEXT,                      -- rano | zitra | tyden | plan
  items TEXT NOT NULL,              -- JSON [{code:'Z1', ...}]
  status TEXT NOT NULL DEFAULT 'open'  -- open | applied | rejected | superseded
);

CREATE TABLE IF NOT EXISTS weather_hourly (
  time TEXT PRIMARY KEY,            -- 'YYYY-MM-DDTHH:00' místní
  temp REAL, feels REAL, precip_prob REAL, precip REAL, gust REAL, wind REAL, code INTEGER
);

CREATE TABLE IF NOT EXISTS sent_messages (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,               -- sila | mobilita
  note TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS events_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  level TEXT NOT NULL,
  msg TEXT NOT NULL
);
