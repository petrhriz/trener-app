# Architektura

```
                ┌──────────── Cloudflare (free) ─────────────────────────────┐
 Garmin API ───►│  Worker „trener-app“ (TypeScript, Hono)                     │
 (plán B:       │   ├─ scheduled (cron) → plánovač (čas Europe/Prague)        │
 intervals.icu) │   │    ├─ sync dávka (kurzor v D1)                          │
                │   │    ├─ přepočet daily_metrics (inkrementálně)            │
 Open-Meteo ───►│   │    └─ stavy plánu, týdenní souhrn                       │
                │   ├─ /api/*  (JSON pro dashboard, upozornění) ┐ přihlášení  │
                │   └─ statické soubory dashboardu        ┘ (session cookie)  │──► prohlížeč
                │  D1 (data, plán, stav)   KV (Garmin token, zámky)           │
                │  Workers AI (jen převod hotových čísel do češtiny)          │
                └─────────────────────────────────────────────────────────────┘
                         │ volitelně: plán → intervals.icu events → Garmin Connect → hodinky / cyklopočítač
```

## Vrstvy

| Složka | Odpovědnost | Pravidlo |
|---|---|---|
| `src/datasource/` | adaptér `DataSource` (`garmin`, `intervals`) → normalizované záznamy | nic nad ním nezná Garmin pole |
| `src/sync/` | dávky, kurzory, upsert do D1 | každé spuštění jen kousek práce (10 ms CPU) |
| `src/core/` | **trenérské jádro**, čisté funkce bez I/O, 100 % testované | rozhoduje kód, ne LLM |
| `src/report/` | z výsledků jádra skládá datové objekty reportů (připravenost, aktivita, plán, týden) | |
| `src/llm/` | AI modely (Gemma / Nemotron / Workers AI), kontrola čísel | když číslo nesedí → bez AI textu |
| `src/plan/` | `planned_workouts`, návrhy změn, potvrzení, zrcadlo do intervals.icu, FIT | kalendář jen po „ano“ |
| `src/api/` + `public/` | dashboard | data jen přes `/api` |

## Datový model (D1)

- `activities` – normalizovaná aktivita (sport, start, čas, km, převýšení, tep, výkon, NP, TSS/hrTSS + `load_source`, Garmin load zvlášť, zóny JSON, teploty, `raw_json` zkrácený)
- `activity_laps` – lapy (čas, výkon, NP, tep, kadence, km, převýšení)
- `wellness_daily` – den: HRV, klidový tep, spánek (délka, skóre, kvalifikátor), kroky, energie, stres, váha, VO2max
- `daily_metrics` – den: zátěž, CTL, ATL, forma, ramp rate, normy (průměr/SD/N), semafor
- `planned_workouts` – den, název, kroky (JSON + text), cílová zátěž, zdůvodnění, stav, `intervals_event_id`
- `constraints` – omezení (nemůžu, nemoc, jiný sport, vlastní jízda…)
- `proposals` – poslední seznam změn plánu (platí jen nejnovější)
- `weather_hourly` – cache Open-Meteo
- `settings` – FTP, zóny, cíl, časy zpráv, přepínače
- `gear`, `activity_gear`, `gear_parts`, `gear_service` – vybavení a jeho servis
- `activity_tags` – s kým jsem jel, RPE
- `zone_history` – FTP a zóny tepu s datem platnosti
- `users` – účty dalších uživatelů (jejich data v tabulkách `u<id>_…`, viz `docs/multi-user.md`)
- `sync_state` – kurzory a stav synchronizace, `sent_messages` – deduplikace

## Plánovač (cron každou minutu)

Čas se převádí do Europe/Prague přes `Intl.DateTimeFormat` (letní/zimní čas automaticky). Vlastník se synchronizuje
každých 5 min, další uživatelé v mezičase. Úlohy:

| Úloha | Kdy | Podmínka |
|---|---|---|
| sync dávka | každé spuštění | zámek v KV (TTL 10 min) |
| stavy jednotek | každé spuštění | minulé dny → odjeto / vynecháno |
| týdenní souhrn | neděle od 20:00 | jednou týdně, uloží se do `weekly_reviews` |

## Soubory

| Soubor | Co |
|---|---|
| `src/index.ts` | Hono app: /api, /auth, /admin, cron |
| `src/scheduler.ts` | plánovač: synchronizace, stavy jednotek, týdenní souhrn |
| `src/sync/*` | dávkový sync Garmin + intervals.icu + Open-Meteo, přepočet metrik, spánek, energie |
| `src/core/*` | zotavení, kondice, zátěž, kvalita, plán, workout, počasí, výživa, rozbor aktivity, doplňky |
| `src/core/coach/*` | trenér (cíl týdne, kostra, délky, knihovna tréninků) – popis v `docs/trener/` |
| `src/report/*` | načtení kontextu z D1 a skládání reportů |
| `src/plan/*` | návrhy změn, zápis + ověření, FIT |
| `src/llm/*` | AI modely, kontrola čísel, pravidlové odpovědi |
| `src/api/*` | API dashboardu, přihlášení, účty, upozornění (`alerts.ts`) |
| `public/*` | dashboard (vanilla JS, SVG grafy) |
