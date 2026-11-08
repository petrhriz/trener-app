# Víc uživatelů (do ~10 lidí)

Stav k 9. 11. 2026 (8. kolo): **hotovo.**

## Jak to funguje

- **Oddělená data:** vlastník (id 1) má původní tabulky (`activities`, `wellness`, …). Každý další uživatel má
  vlastní sadu `u<id>_activities`, `u<id>_wellness`, … a vlastní prostor v KV (`u<id>:…`).
  `src/lib/tenant.ts` vytvoří pro uživatele „env“, ve kterém se SQL přepíše na jeho tabulky (`rewriteSql`) a KV klíče
  dostanou předponu. Kód aplikace se tak nemusel měnit dotaz po dotazu a uživatel jiné tabulky vůbec neadresuje.
  Test `test/phase12.test.ts` projde všechny SQL řetězce ve zdrojácích a migracích a hlídá, že po přepisu žádný
  neukazuje na tabulky vlastníka.
- **Tabulky uživatele** se vytvoří při registraci (migrace 0001–0007 s předponou, bez společné tabulky `users`).
  Nová migrace s datovými tabulkami se musí přidat do `TENANT_MIGRATIONS` – doplní se uživatelům automaticky
  při dalším přihlášení / cronu (`users.schema_ver`).
- **Přihlášení:** jméno + heslo (`/auth/login`, PBKDF2), cookie platí 1 rok. Vlastník se dál může přihlásit odkazem
  z Telegramu (`/dashboard`). Heslo vlastník nastaví v Nastavení → Účet.
- **Pozvánka:** Nastavení → Účet → „Pozvat“ = odkaz `/#/join/<token>` (7 dní, jednou). Max. 10 aktivních uživatelů.
- **Klíče:** každý si zadá svůj Garmin API klíč (a případně intervals.icu) v Nastavení. Mapové klíče (Mapy.com,
  TomTom) jsou společné a zadává je vlastník.
- **Telegram:** jeden bot. Nastavení → Účet → „Propojit Telegram“ dá šestimístný kód, botovi se pošle `/start <kód>`.
- **Počasí:** podle „Místo pro počasí“ v Nastavení (souřadnice z Open-Meteo geocodingu).
- **Cron každou minutu:** vlastník každých 5 min (jako dřív), do 4 dalších lidí má každý svou minutu (taky po 5 min),
  při víc lidech se střídají. Na jedno spuštění jen jeden uživatel – kvůli limitu CPU free plánu.

## Limity free plánu (pro 10 lidí)

| Co | Spotřeba | Limit | Poznámka |
|---|---|---|---|
| Požadavky | 1 440 cron + dashboard | 100 000 / den | v pohodě |
| D1 velikost | ~1 MB na člověka s historií od 2019 | 500 MB | v pohodě |
| D1 zápisy | první stažení historie jednotky tisíc řádků na člověka | 100 000 / den | v pohodě |
| **KV zápisy** | snímky Body Battery ~100 / den / člověk | **1 000 / den** | při 8+ aktivních lidech na hraně → zvážit snímky jen u vlastníka |
| CPU | jeden uživatel na spuštění cronu | 10 ms (už teď překračováno, Cloudflare zatím toleruje) | |

Test lokálně: `npx wrangler d1 migrations apply trener-db --local --persist-to <dir>`, `npx wrangler dev --local
--persist-to <dir> --port 8790`, pak `node scripts/multiuser-local.mjs` (pozvánka, registrace, login, oddělení dat).
