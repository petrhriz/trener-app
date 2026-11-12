-- Verze plánu: každá změna budoucích dnů s důvodem a seznamem změněných dnů (src/core/coach/versions.ts).
CREATE TABLE IF NOT EXISTS plan_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  week_start TEXT NOT NULL,
  reason TEXT NOT NULL,
  drivers TEXT NOT NULL,   -- JSON: co plán ovlivňuje (porovnání → důvod další verze)
  days TEXT NOT NULL,      -- JSON: dny tohoto a příštího týdne
  changes TEXT NOT NULL    -- JSON: změněné dny proti minulé verzi
);
