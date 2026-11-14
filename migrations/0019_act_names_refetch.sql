-- Názvy aktivit: verze 1.0.21 je přepisovala na „místo + druh“. Historie aktivit se proto stáhne z Garminu znovu
-- (postupně na pozadí, po stránkách) – synchronizace přitom vrátí původní názvy („Hostomice - Z2“).
UPDATE sync_state SET value = '{"start":0,"done":false,"count":0}' WHERE key = 'bf_act';
