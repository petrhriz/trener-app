# Trenér – osobní trenér cyklistiky a zdraví

Běží zdarma na Cloudflare Workers. Data bere z Garmin Personal API (záloha intervals.icu), počasí z Open-Meteo,
mluví přes Telegram a webový dashboard. Rozhodnutí (zotavení, forma, plán, workouty, výživa) dělá kód podle
pravidel v [`docs/coach-rules/`](docs/coach-rules/). LLM jen přepisuje hotová čísla do češtiny a bez něj vše funguje.

> Stav: **fáze 0** (test Garmin API z Cloudflare). Postup fází viz [`docs/architecture.md`](docs/architecture.md).

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run test` | unit testy trenérského jádra |
| `npm run deploy` | nasazení Workeru na Cloudflare |
| `npm run secrets:check` | ukáže, které klíče jsou v `.dev.vars` vyplněné (hodnoty nikdy) |
| `npm run secrets:push` | nahraje klíče z `.dev.vars` na Cloudflare |
| `npm run telegram:chatid` | zjistí tvoje Telegram chat_id a zapíše ho do `.dev.vars` |
| `npm run phase0` | test fáze 0 na nasazeném Workeru |
| `npm run sync:backfill`, `npm run wipe` | přibudou ve fázi 1 |

## Nasazení od nuly

1. `npm install`
2. `npx wrangler login` (otevře prohlížeč, přihlášení do Cloudflare)
3. `npx wrangler kv namespace create KV` → id vlož do `wrangler.jsonc`
4. Zkopíruj `.dev.vars.example` na `.dev.vars` a vyplň klíče (Garmin, Telegram, intervals.icu)
5. Napiš svému botovi `/start`, pak `npm run telegram:chatid`
6. `npm run deploy`, URL Workeru zapiš do `.dev.vars` jako `WORKER_URL=`
7. `npm run secrets:push`
8. `npm run phase0`

## Tajné klíče

Nikdy v kódu ani v gitu. Lokálně jen `.dev.vars` (v `.gitignore`), na Cloudflare přes `wrangler secret`.

## Obnova Garmin klíče

Klíč platí 1 rok, 30 dní před koncem pošle bot upozornění. Postup: Garmin Connect → Personal API → nový klíč →
vlož do `.dev.vars` jako `GARMIN_API_KEY=` → `npm run secrets:push`. (Podrobnosti doplníme ve fázi 7.)

## Změna časů zpráv

Ve fázi 3+: dashboard → Nastavení, nebo v Telegramu `/nastaveni`.
