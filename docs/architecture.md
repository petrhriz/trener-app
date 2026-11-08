# Architektura

```
                ┌──────────── Cloudflare (free) ─────────────────────────────┐
 Garmin API ───►│  Worker „trener-app“ (TypeScript, Hono)                     │
 (plán B:       │   ├─ scheduled (*/15) → plánovač (čas Europe/Prague)        │
 intervals.icu) │   │    ├─ sync dávka (kurzor v D1)                          │
                │   │    ├─ přepočet daily_metrics (inkrementálně)            │
 Open-Meteo ───►│   │    └─ zprávy: ráno / aktivita / 20:00 / neděle / alerty │
                │   ├─ POST /telegram/webhook (secret_token + chat_id)        │──► Telegram
                │   ├─ /api/*  (JSON pro dashboard)      ┐ Cloudflare Access  │
                │   └─ statické soubory dashboardu        ┘ (jen můj e-mail)  │──► prohlížeč
                │  D1 (data, plán, stav)   KV (Garmin token, zámky)           │
                │  Workers AI (jen převod hotových čísel do češtiny)          │
                └─────────────────────────────────────────────────────────────┘
                         │ volitelně: plán → intervals.icu events → Garmin Connect → Edge 530
```

## Vrstvy

| Složka | Odpovědnost | Pravidlo |
|---|---|---|
| `src/datasource/` | adaptér `DataSource` (`garmin`, `intervals`) → normalizované záznamy | nic nad ním nezná Garmin pole |
| `src/sync/` | dávky, kurzory, upsert do D1 | každé spuštění jen kousek práce (10 ms CPU) |
| `src/core/` | **trenérské jádro**, čisté funkce bez I/O, 100 % testované | rozhoduje kód, ne LLM |
| `src/report/` | z výsledků jádra skládá datové objekty reportů (připravenost, aktivita, plán, týden) | |
| `src/telegram/` | webhook, příkazy, záměry, šablony zpráv, tlačítka Z1… | šablona funguje bez LLM |
| `src/llm/` | Workers AI (+ volitelná záloha), kontrola čísel | když číslo nesedí → šablona |
| `src/plan/` | `planned_workouts`, návrhy změn, potvrzení, zrcadlo do intervals.icu, FIT | kalendář jen po „ano“ |
| `src/api/` + `public/` | dashboard | data jen přes `/api` |

## Datový model (D1, fáze 1)

- `activities` – normalizovaná aktivita (sport, start, čas, km, převýšení, tep, výkon, NP, TSS/hrTSS + `load_source`, Garmin load zvlášť, zóny JSON, teploty, `raw_json` zkrácený)
- `activity_laps` – lapy (čas, výkon, NP, tep, kadence, km, převýšení)
- `wellness_daily` – den: HRV, klidový tep, spánek (délka, skóre, kvalifikátor), kroky, Body Battery, stres, váha, VO2max
- `daily_metrics` – den: zátěž, CTL, ATL, forma, ramp rate, normy (průměr/SD/N), semafor
- `planned_workouts` – den, název (7.2), kroky (JSON + text 7.3), cílová zátěž, zdůvodnění, stav, `intervals_event_id`
- `constraints` – omezení (nemůžu, hokej, nemoc…)
- `proposals` – poslední seznam změn Z1… (platí jen nejnovější)
- `weather_hourly` – cache Open-Meteo
- `settings` – FTP, zóny, cíl, časy zpráv, přepínače
- `sync_state` – kurzory a stav synchronizace, `sent_messages` – deduplikace

## Plánovač (cron každých 15 min)

Čas se převádí do Europe/Prague přes `Intl.DateTimeFormat` (letní/zimní čas automaticky). Úlohy:

| Úloha | Kdy | Podmínka |
|---|---|---|
| sync dávka | každé spuštění | zámek v KV (TTL 10 min) |
| ranní připravenost | 5:30–11:00 | dnešní spánek + HRV jsou v D1, ještě neodesláno (fallback v 11:00 s „nemám“) |
| rozbor aktivity | každé spuštění | nová aktivita od posledního odeslání |
| zítřek | 20:00 (nastavitelné) | jednou denně |
| týden + plán | neděle 19:30 | jednou týdně |
| upozornění | po přepočtu | stav se změnil, deduplikace |
| Garmin klíč | denně | 30 dní před koncem platnosti |

## Fáze (podle promptu, kap. 9)

0. ✅ Účty + test Garmin z Cloudflare (funguje)
1. ✅ Data: D1 schéma, sync po dávkách, backfill celé historie (696 aktivit od 2019, 584 nocí)
2. ✅ Jádro výpočtů + 71 testů, srovnání s intervals.icu (`npm run compare`, kalibrace hrTSS)
3. ✅ Telegram bot: ráno, rozbor aktivity, příkazy, volný text
4. ✅ Plán: 7 dní, návrhy Z1…, potvrzení, intervals.icu sync s ověřením, FIT
5. ✅ Dashboard (čeká na zapnutí Cloudflare Access – kroky v README)
6. ✅ LLM vrstva (Workers AI Mistral Small 3.1, kontrola čísel, šablony)
7. ✅ Týdenní review, upozornění, síla/mobilita, roční cíl, režimy plánu
8. ✅ (7. 11. 2026) CTL/ATL/forma a FTP/eFTP přímo z intervals.icu (forma = CTL − ATL dne, kotvy v `wellness.icu_*`),
   spárované workouty z intervals.icu (`activities.icu_event`, plnění %), fáze spánku a Body Battery detail,
   jiné sporty v plánu (`constraints.kind='sport'`, `planned_workouts.sport`), přepočet plánu po změně cíle
   (`planned_workouts.goal`), pestrost kvality (jiné zaměření než kvalita v posledních 10 dnech),
   nový dashboard (mobil: 5 záložek + Více), průběh aktivity a křivka výkonu z intervals.icu (cache v KV),
   cron každých 5 min (těžší kroky po 15 min / hodině)
9. ✅ (7. 11. 2026, 2. kolo připomínek) `/api/day` (tep po 2 min + Body Battery z Garminu, vlastní záznamy BB v KV `bbsnap:*`
   každých 15 min), průběh aktivity se zónovými barvami a zálohou z Garminu (`/activity-service/.../details`) pro aktivity,
   které intervals.icu nemá (intervals má jen od 9/2025), 1./2. polovina + decoupling + výkon na konci Z2 (`icu_pwhr_z2`),
   `/api/vo2` (běh/kolo podle aktivity dne), tréninkové vyvážení (`core/balance.ts`), zóny formy, volba sportu / volna
   ve dni volna (`constraints.note='rest'`), chůze = vždy regenerace, HRV → VST, oprava HTTP 500 (`bf_well` neplatný JSON,
   `getState` už chybu nevyhodí). Migrace 0003.
10. ✅ (7. 11. 2026, 3. kolo) průběh aktivity primárně z Garminu (kadence, teplota, dech, výkonnostní stav, trasa,
   okruhy po 1/5/10 km), mapa Leaflet + OSM, `activities.extra` (max. rychlost, otáčky, dech, výška, TE), vybavení
   (`gear`, `activity_gear`, `/api/gear`), API klíče v dashboardu (`app_secrets`, AES-GCM z ADMIN_TOKEN, `lib/secrets.ts`),
   patra + dech ve spánku + potřeba spánku na další noc, VST přes noc a stres dne v `/api/day`, Kondice od 1. 1.,
   vyvážení v bodech Garminu kalibrované na Garmin Connect, běh bez lapů, běžky bez struktury, Telegram: nové šablony,
   spodní menu (/menu), změna dne tlačítky. Migrace 0004. Knihovna tréninků: `docs/knihovna-treninku.md`.
11. ✅ (8. 11. 2026, 4. kolo) grafy v reálné šířce (`sized()` v `app.js`, ostré na mobilu i 4K), tep/výkon jako čára
   s plynulým gradientem zón (`zoneLine`), náhled 7 dní zpět (`/overview?date=`, `/recovery?date=`), Body Battery
   snímek každých 5 min (snímky se v `/day` čtou čerstvé, cache jen pro Garmin), přehled zátěže z bodů Garminu a
   tréninkového efektu (`fitness.loadDays`, nahrazuje odhad vyvážení), VO2max s přenesením poslední hodnoty, mapa
   barvená výkonem/tepem/rychlostí/výškou + vrstvy Mapy.com (klíč `MAPY_API_KEY` v Nastavení) a CyclOSM,
   `DELETE /api/constraint` (vrácení „nepojedu“ i se smazanou jednotkou), přepočet délek po změně cíle (`Slot.replan`),
   `/api/gear/:id/activities`, `POST /api/weight` (Garmin Personal API zápis nedovoluje → D1 + intervals.icu),
   příprava na víc uživatelů (`users`, session `v2.<uid>`, `docs/multi-user.md`). Migrace 0005.

## Soubory

| Soubor | Co |
|---|---|
| `src/index.ts` | Hono app: webhook, /api, /admin, cron |
| `src/scheduler.ts` | rozvrh zpráv podle pražského času |
| `src/sync/*` | dávkový sync Garmin + intervals.icu + Open-Meteo, přepočet metrik |
| `src/core/*` | zotavení, kondice, zátěž, kvalita, plán, workout 7.3, počasí, výživa, rozbor aktivity, doplňky |
| `src/report/*` | načtení kontextu z D1 a skládání reportů |
| `src/telegram/*` | API, šablony zpráv, příkazy a záměry |
| `src/plan/*` | návrhy změn, zápis + ověření, FIT |
| `src/llm/llm.ts` | Workers AI, kontrola čísel, pravidlové odpovědi |
| `src/api/*` | API dashboardu + ověření Access JWT |
| `public/*` | dashboard (vanilla JS, SVG grafy) |
12. ✅ (8. 11. 2026, 6. kolo – `docs/plan-kolo6.md`) skóre Zátěž / Zotavení / Spánek v % (`core/readinessScore.ts`, zotavení z VST,
   klidového tepu, tepu ve spánku, spánku proti potřebě, skóre a dechu proti normě 60 dní; nízké skóre posune zelený semafor na žlutý),
   ranní / večerní zhodnocení, stav Aktivní / Nemocný / Zraněný / Dovolená (`settings.status`, virtuální omezení v `planFor`),
   servis vybavení (`gear_parts`, `gear_service`, upozornění v Telegramu), kalendář (`/api/calendar`), chat s AI (`/api/chat`),
   přesun kvality / „místo toho Z2“ (`constraints.kind='typ'`), max. 2–3 dny tréninku za sebou, běh bez intervalů při málo bězích,
   zátěž po týdnech v Trenérovi, přehled zátěže v Kondici z TSS (dřív body Garminu), Body Battery snímky s časem měření,
   plynulé grafy, podbarvení zón, mapa podle tvaru trasy s tlumeným podkladem, iPhone (bezpečné okraje, start na Přehledu), 1920/2560 px.
   `/api` posílá `Cache-Control: no-store`. Migrace 0006.
13. ✅ (8. 11. 2026, 7. kolo – `docs/plan-kolo7.md`) cíl tréninku mění plán i po slabších týdnech (strop a délka Z2 podle cíle,
   Z2 navíc u Zlepšit), kontrola FTP (`core/ftpCheck.ts`, stav `ftp_set_at`, `icu_ftp_seen`), osobní hranice počasí
   (`settings.ride_temps`), vlastní jízda (`core/ownRide.ts`, `constraints.kind='jizda'`, `/api/plan/own`, Telegram `/jizda`, chat),
   s kým jsem jel (`activity_tags`, `/api/activity/:id/company`), jednotný detail metrik (VST, tep, spánek, stres, Body Battery, dech),
   nový Body Battery panel, kalendář s týdny, jemná mapa (CARTO / TomTom) + vycentrování, PNG ikony pro iPhone. Migrace 0007.
14. ✅ (9. 11. 2026, 8. kolo – `docs/plan-kolo8.md`) víc uživatelů (`src/lib/tenant.ts`, `src/api/accounts.ts`, migrace 0008,
   `docs/multi-user.md`), cron každou minutu se střídáním uživatelů, náhled na libovolný den historie, 🤖 AI na každé stránce,
   Zlepšit už nezkracuje jízdy, mobilní úpravy.
