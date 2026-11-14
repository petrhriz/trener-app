-- Vybavení: kola se dělí na silniční, horské (MTB), gravel a trenažér. Starší „kolo“ (bike) se zatřídí podle sportu,
-- pro který je výchozí: jen MTB → horské, silnice → silniční. Ostatní (bez výchozího sportu) zůstávají „Kolo (jiné)“.
UPDATE gear SET kind = 'mtb' WHERE kind = 'bike' AND (',' || COALESCE(default_for, '') || ',') LIKE '%,mtb,%' AND (',' || COALESCE(default_for, '') || ',') NOT LIKE '%,ride,%';
UPDATE gear SET kind = 'road' WHERE kind = 'bike' AND (',' || COALESCE(default_for, '') || ',') LIKE '%,ride,%';
UPDATE gear SET kind = 'trainer' WHERE kind = 'bike' AND COALESCE(default_for, '') = 'indoor';
