# Trenér – osobní trenér cyklistiky a zdraví

Běží zdarma na Cloudflare Workers. Data bere z **Garmin Personal API** (lapy jízd a VO2max z intervals.icu),
počasí z **Open-Meteo**, mluví přes **Telegram bota** a **webový dashboard**. Rozhodnutí (zotavení, forma, plán,
workouty, výživa) dělá kód podle pravidel v [`docs/coach-rules/`](docs/coach-rules/). LLM (Workers AI) jen
odpovídá na volné otázky nad předpočítanými čísly – bez něj vše funguje, každá zpráva má šablonu.

- Bot: **@trener1234bot** (odpovídá jen na tvoje chat_id)
- Dashboard: https://trener-app.trener-app.workers.dev (za Cloudflare Access)
- Provoz: **0 Kč** (Workers Free, D1, KV, Workers AI free, Open-Meteo, Telegram)

## Co dělá

| Kdy | Co přijde do Telegramu |
|---|---|
| ráno 5:30–11:00, jakmile Garmin má dnešní spánek a HRV (jinak v 11:00) | **Připravenost**: semafor 🟢🟡🔴, HRV / klidový tep / spánek se slovním hodnocením, forma, dnešní jednotka a rozhodnutí, počasí a okno na jízdu, sacharidy, tlačítka „Dnes nepojedu“ a „Lehčí“ |
| do 30 min po synchronizaci nové aktivity | **Rozbor aktivity** (Aktivita.md): základ, splnění cíle, zóny, okruhy, drift, VI |
| 20:00 | **Zítřek**: jednotka, kroky, počasí, sacharidy, návrh změn s tlačítky, FIT soubor |
| neděle 19:30 | **Týden**: plán vs. skutečnost, vynechané, Z2 která nebyla lehká, výhry, trend + plán na další týden |
| při problému | 🔴 stav, 3 dny zvýšený klidový tep, forma pod −25, ramp rate nad +5, poměr zátěže 7/28 nad 1,3, selhání synchronizace, končící Garmin klíč |

Příkazy: `/rano` `/stav` `/plan` `/zitra` `/aktivita [21.10.|včera|běžky]` `/tyden` `/pocasi` `/nepojedu`
`/nemuzu <den>` `/hokej <den>` `/bezky <den>` `/nemoc` `/cil zlepseni|udrzeni|pokles` `/ftp 272` `/vaha 75,5`
`/jizd 3` `/sila` `/mobilita` `/fit [zítra|datum]` `/dashboard` `/nastaveni` `/export` `/pomoc`.
Totéž jde napsat volně česky („nemůžu ve středu“, „hokej v pátek“, „dnes nepojedu“). Na návrh změn odpověz
„ano“, „ano Z1, Z3“ nebo „ne Z2“, nebo použij tlačítka.

**Přizpůsobivost:** plán se nikdy nedohání. Když nepojedeš (tlačítko, `/nepojedu`, „nechce se mi“), jednotka se
navrhne přesunout nebo smazat a plán se přepočítá. Špatné počasí → kvalita na trenažér, Z2 přesun nebo trenažér.
Režim plánu: **zlepšení** (+5–10 % nad 7 × CTL, max. +3 CTL týdně), **udržení** (7 × CTL ± 10 %),
**řízený pokles** (80–90 %, o jízdu méně, jedna kvalita zůstává – vhodné na zimu). Navíc nikdy víc než +10 %
proti běžnému týdnu a po 3 týdnech růstu lehčí týden.

## Příkazy na PC

| Příkaz | Co dělá |
|---|---|
| `npm run deploy` | migrace D1 + nasazení Workeru + nastavení Telegram webhooku |
| `npm run test` | unit testy trenérského jádra (71 testů) |
| `npm run sync:backfill` | zrychlené stažení celé historie (jinak to udělá cron po dávkách) |
| `npm run compare` | srovnání zátěže a CTL/ATL s intervals.icu |
| `npm run export` | export celé databáze do `exports/trener-export.sql` (v Telegramu `/export` jako JSON) |
| `npm run wipe -- --yes` | smazání všech dat (D1, token, události aplikace v intervals.icu) |
| `npm run secrets:check` | které klíče jsou v `.dev.vars` vyplněné (hodnoty nikdy) |
| `npm run secrets:push` | nahraje klíče z `.dev.vars` na Cloudflare |
| `npm run admin -- send/rano` | ručně pošle ranní zprávu (`send/zitra`, `send/tyden`, `send/plan`, `scheduler`, `preview/rano GET`) |
| `npm run tg -- "text"` | test: pošle Workeru zprávu, jako by přišla z Telegramu |

## Nasazení od nuly

1. Nainstaluj Node.js LTS a Git, pak v této složce `npm install`.
2. `npx wrangler login` (prohlížeč, přihlášení do Cloudflare, Allow).
3. `npx wrangler kv namespace create KV` a `npx wrangler d1 create trener-db` → id vlož do `wrangler.jsonc`.
4. Telegram: @BotFather → `/newbot` → token. Napiš botovi `/start`.
5. Zkopíruj `.dev.vars.example` na `.dev.vars` a vyplň `GARMIN_API_KEY`, `TELEGRAM_BOT_TOKEN`,
   `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`, `WORKER_URL`.
6. `npm run telegram:chatid` (zapíše tvoje chat_id), `npm run secrets:push`.
7. `npm run deploy`, pak `npm run sync:backfill`.
8. Cloudflare Access (níže) a ve `wrangler.jsonc` doplň `ACCESS_TEAM_DOMAIN` a `ACCESS_AUD`, znovu `npm run deploy`.

## Cloudflare Access (ochrana dashboardu)

1. https://one.dash.cloudflare.com → Zero Trust (free plán, tým si pojmenuj, např. `petr`).
2. **Access → Applications → Add an application → Self-hosted**:
   - Application domain: `trener-app.trener-app.workers.dev` (cesta prázdná)
   - Policy: **Allow**, Include → Emails → tvůj e-mail
3. Druhá aplikace pro webhook a admin (musí jít bez přihlášení, chrání je vlastní tajný token):
   - Domain: `trener-app.trener-app.workers.dev`, path `telegram/*` → Policy **Bypass**, Include → Everyone
   - totéž pro path `admin/*`
4. V detailu první aplikace zkopíruj **Application Audience (AUD) Tag** → `ACCESS_AUD` ve `wrangler.jsonc`,
   `ACCESS_TEAM_DOMAIN` = `<tým>.cloudflareaccess.com`. Pak `npm run deploy`.

Worker navíc ověřuje podpis Access JWT – bez něj `/api` vrací 403.

## Workouty do Edge 530

- **Přes intervals.icu (zapnuto):** po „ano“ se jednotky zapíšou do kalendáře intervals.icu. V intervals.icu →
  Settings → **Garmin Connect** → zapni **Upload planned workouts**. intervals.icu je pošle do Garmin Connect a
  Edge 530 si je stáhne při synchronizaci (Trénink → Tréninkový kalendář).
- **Záloha bez intervals.icu:** `/fit zítra` nebo tlačítko „📥 FIT“ – soubor nahraj kabelem do `Garmin/NewFiles`.

## Tajné klíče

Nikdy v kódu ani v gitu. Lokálně jen `.dev.vars` (v `.gitignore`), na Cloudflare přes `wrangler secret`.
Logy neobsahují tokeny ani zdravotní hodnoty.

## Obnova Garmin klíče

Klíč platí 1 rok; 30 dní před koncem pošle bot upozornění. Postup: Garmin Connect → Nastavení → Personal API →
vytvořit klíč → vlož do `.dev.vars` jako `GARMIN_API_KEY=` → `npm run secrets:push` → v Telegramu
`/garminklic RRRR-MM-DD` (datum vytvoření).

## Změna časů zpráv

Dashboard → Nastavení (ranní okno, večer, neděle), nebo `/nastaveni` v Telegramu ukáže aktuální hodnoty.

## Dokumentace

[`docs/architecture.md`](docs/architecture.md) · [`docs/limits.md`](docs/limits.md) ·
[`docs/garmin-endpoints.md`](docs/garmin-endpoints.md) · [`docs/rules-mapping.md`](docs/rules-mapping.md)
