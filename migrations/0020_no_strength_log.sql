-- Síla a mobilita se už nezapisují ručně (stránka zrušena). Aktivity síly a mobility z Garminu zůstávají v aktivitách.
DROP TABLE IF EXISTS training_log;
DELETE FROM settings WHERE key = 'floor_strength';
