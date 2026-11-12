-- 9. kolo (12. 11. 2026): FTP a zóny tepu s datem platnosti. Řádek platí od `date` do dalšího řádku.
-- Staré aktivity se vyhodnocují podle hodnot platných v den aktivity, ne podle dnešních.
CREATE TABLE IF NOT EXISTS zone_history (
  date TEXT PRIMARY KEY,            -- platí od (YYYY-MM-DD)
  ftp INTEGER,                      -- W, null = beze změny / neznámé
  hr_zones TEXT,                    -- JSON jako settings.hr_zones, null = beze změny / neznámé
  source TEXT,                      -- icu (FTP z jízd v intervals.icu) | settings (změna v nastavení / synchronizace)
  created_at TEXT
);
