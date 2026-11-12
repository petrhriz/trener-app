-- VO2max z FIT souboru aktivity (zpráva 140) – zvlášť pro kolo a běh.
-- intervals.icu dostává od Garminu jen jedno číslo a u některých jízd žádné.
ALTER TABLE activities ADD COLUMN vo2_fit REAL;
ALTER TABLE activities ADD COLUMN vo2_try INTEGER NOT NULL DEFAULT 0;
-- TomTom mapa odebrána → uložený klíč pryč
DELETE FROM app_secrets WHERE key = 'TOMTOM_API_KEY';
