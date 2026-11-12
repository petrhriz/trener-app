-- S kým jsem jel (skupina / parťák) – vysvětlí přetaženou Z2 u společné jízdy.
-- Zvlášť od activities, ať ho synchronizace z Garminu nepřepíše.
CREATE TABLE IF NOT EXISTS activity_tags (
  activity_id TEXT PRIMARY KEY,
  company TEXT,                      -- NULL = sám; „skupina“ nebo jméno
  created_at TEXT
);
