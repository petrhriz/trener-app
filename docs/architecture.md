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

0. Účty + test Garmin z Cloudflare ← **teď**
1. Data: D1 schéma, sync po dávkách, backfill celé historie
2. Jádro výpočtů + testy, srovnání 14 dní s intervals.icu
3. Telegram bot: ráno, rozbor aktivity, příkazy
4. Plán: 7 dní, návrhy Z1…, potvrzení, intervals.icu sync / FIT
5. Dashboard za Cloudflare Access
6. LLM vrstva
7. Doladění: týden, upozornění, síla/mobilita, roční cíl
