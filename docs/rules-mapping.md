# Převod pravidel z `docs/coach-rules/` do kódu

Pravidla byla psaná pro Claude + MCP intervals.icu + AccuWeather. Tady je, odkud bere každé pole aplikace.
✅ = přímá náhrada, ⚙️ = počítáme sami vzorcem, ⚠️ = Garmin pole nevrací, je navržena náhrada (potvrď nebo uprav).
Stav „ověřeno“ doplníme po fázi 0/1 podle `docs/garmin-endpoints.md`.

## Prahy a zóny

| Pravidlo (intervals.icu) | Náhrada | Pozn. |
|---|---|---|
| `icu_ftp` | ⚙️ `settings.ftp` (`/ftp 272`, dashboard) | |
| `icu_rolling_ftp` (eFTP) | ⚙️ max `maxAvgPower_1200` za 42 dní × 0,95 | prompt kap. 4 |
| `lthr`, `icu_hr_zones` | ✅ Garmin `/biometric-service/heartRateZones/v2` (kolo), záloha `settings.hr_zones` | |
| `icu_power_zones` (% FTP) | ⚙️ výchozí Coggan 7 zón: Z1 < 55, Z2 56–75, Z3 76–90, Z4 91–105, Z5 106–120, Z6 121–150, Z7 > 150 % FTP | stejné jako výchozí intervals.icu; měnitelné v nastavení |
| Cílové pásmo Z2 57–72 % FTP (6.2) | ⚙️ přesně podle 6.2 | je to cíl workoutu, ne zóna výkonu |

## Zotavení (kap. 4)

| Pole | Náhrada | Pozn. |
|---|---|---|
| `hrv` | ✅ HRV `lastNightAvg` | |
| `restingHR` | ✅ dailysummaries `restingHeartRate` / `heartRate.restingValue` | |
| `sleepSecs` | ✅ sleep `sleepTimeSeconds` | |
| `sleepScore` | ✅ sleep `sleepScores.overall.value` | |
| `sleepQuality` (Q1–Q4) | ⚠️ Garmin vrací `sleepScores.overall.qualifierKey` (EXCELLENT/GOOD/FAIR/POOR) | mapujeme EXCELLENT→Q1 Výborný, GOOD→Q2 Dobrý, FAIR→Q3 Uspokojivý, POOR→Q4 Špatný. Číslo se nedopočítává. |
| Body Battery, stres | ✅ dailysummaries | jen doplňkový údaj, do semaforu nevstupují |
| `vo2max` | ⚠️ Garmin maxmet endpoint 404 | bereme z intervals.icu wellness `vo2max` (Garmin ho tam posílá) |

## Kondice / únava / forma (6.4)

| Pole | Náhrada |
|---|---|
| `ctl`, `atl`, `rampRate` | ⚙️ vlastní výpočet z odjetých aktivit (vzorce 6.4), ukládáno do `daily_metrics`. Žádná naplánovaná zátěž v historii → problém „dnešní řádek obsahuje plán“ odpadá. |
| `icu_training_load` | ⚙️ TSS = (s × NP × IF) / (FTP × 3600) × 100, IF = NP / FTP; nebo Garmin `trainingStressScore`, když existuje. Bez wattmetru hrTSS. Zdroj se ukládá (`load_source`). |
| hrTSS | ⚙️ zkalibrováno 7. 11. 2026 proti `icu_training_load` (intervals.icu HRSS) na 151 aktivitách: hlavní vzorec z průměrného tepu IF = (HRavg − klid) / (LTHR − klid), TSS = h × IF² × 100 (LTHR a klid z Garminu) → průměrná odchylka 13. Záloha bez LTHR: sazby podle zón tepu Z1..Z5 = 11 / 42 / 42 / 42 / 109 TSS/h (odchylka 12). Původní návrh sazeb nadhodnocoval 1,74×. Garmin `activityTrainingLoad` se ukládá zvlášť a do CTL se nemíchá. |
| `get_fitness_forecast` | ⚙️ výhled vzorcem z `planned_workouts` (6.3, 6.4) |

## Aktivita (kap. 5, `Aktivita.md`)

| Pole | Náhrada | Pozn. |
|---|---|---|
| NP, průměrný výkon | ✅ `normPower`, `avgPower` | |
| `icu_variability_index` | ⚙️ VI = NP / avgPower (2 des. místa) | |
| Intenzita | ⚙️ NP / FTP v % | |
| `decoupling` (aerobní drift) | ⚠️ ze souhrnu nejde | ⚙️ Pw:HR decoupling z `/details?maxChartSize=300` (ověřeno, ~300 bodů): poměr výkon/tep 1. vs. 2. polovina. Bez wattmetru rychlost/tep. Ve fázi 2 porovnáme s `decoupling` z intervals.icu. |
| `compliance` | ⚠️ Garmin nemá | ⚙️ splnění = skutečná zátěž / plánovaná zátěž × 100 %, omezeno na 150 % (jen když je jednotka v plánu). Změnu stačí napsat. |
| `icu_lap_count`, intervaly | ✅ počet lapů = Garmin `lapCount`; ⚠️ samotné lapy Garmin Personal API nevrací (404) → bereme z intervals.icu `/activity/{id}/intervals` | pravidla kap. 5 o „Use laps for intervals“ proto platí dál beze změny |
| `icu_hr_zone_times` | ✅ `hrTimeInZone_1..5` | |
| `icu_zone_times` (výkon) | ⚠️ Garmin `powerTimeInZone_1..7` počítá podle zón nastavených v Garminu | správně jen když má Garmin stejné FTP a Coggan zóny. Jinak „–“ a upozornění v nastavení. Alternativa: lapy (hrubé). |
| Křivka výkonu (`get_power_curves`) | ⚙️ `maxAvgPower_30/60/300/1200` z aktivit → nejlepší v okně 42 / 42 dní | |
| `get_interval_intensity_stats` | ⚙️ z lapů (výkon, tep, délka) vs. kroky `planned_workouts` | |
| `paired_event_id` | ⚙️ párování aktivity s `planned_workouts` stejného dne a sportu | |
| Teplota min/max | ✅ `minTemperature`, `maxTemperature` aktivity | |
| `device_watts` | ⚙️ existuje `avgPower` > 0 | |

## Kalendář (kap. 7)

| Pravidlo | Náhrada |
|---|---|
| `get_events`, `add_or_update_event` | ✅ tabulka `planned_workouts` (pravda o plánu), volitelně zrcadlo do intervals.icu events |
| NOTE (omezení 7.4) | ✅ tabulka `constraints`; zapisuje se hned, bez potvrzení; volitelně i NOTE do intervals.icu |
| „ano / ano Z1, Z3 / ne Z2“ | ✅ Telegram text + tlačítka; seznam Z platí jen poslední odeslaný (`proposals` v D1), starší se neplatí |
| Syntaxe kroků 7.3 | ⚙️ `core/workout.ts` + validátor (poslední krok `press lap`, krok před 1. intervalem `press lap`, v opakování žádný lap, žádný `ramp`) |

## Počasí (kap. 8)

| AccuWeather | Open-Meteo |
|---|---|
| `widgets-daily` `day` srážky ≥ 50 % a ≥ 1 mm | ⚙️ max `precipitation_probability` 7–20 h ≥ 50 % a součet `precipitation` 7–20 h ≥ 1 mm |
| `gusts` přes den > 40 km/h | ⚙️ max `wind_gusts_10m` 7–20 h > 40 km/h |
| mráz: noc předchozí < 0 °C | ⚙️ min `temperature_2m` 0–8 h daného dne < 0 °C |
| `iceProbability` | ⚠️ Open-Meteo nemá. Pravidlo říká „jen když konektor vrací“ → náledí neuvádíme; mráz se hlásí jako „riziko náledí ráno“ (jako v 8). |
| Nejlepší 3h okno | ⚙️ zelená hodina = srážky ≤ 30 %, nárazy ≤ 40 km/h, pocitově (`apparent_temperature`) ≥ 3 °C; okno = 3 po sobě zelené hodiny 7–20 h s nejlepším skóre |

## Režim plánu (tvoje přání 7. 11. 2026)

| Režim | Týdenní zátěž | Poznámka |
|---|---|---|
| zlepšení (`/cil zlepseni`, výchozí podle tvé odpovědi) | 7 × CTL + 5–10 %, ramp max. +3 / týden | pravidla 6.6 krok 1 |
| udržení (`/cil udrzeni`) | 7 × CTL ± 10 % | původní cíl v pravidlech |
| řízený pokles (`/cil pokles`) | 80–90 % ze 7 × CTL, o 1 jízdu méně, 1 kvalita zůstává | „mírný pokles mimo sezónu do −10 % je v pořádku“ – objem klesá, intenzita se drží |

## Doplňky z referencí (`Navrhy.txt`, VO2 prompt)

Jen doplňkové údaje a pojistky, pravidla z `docs/coach-rules/` mají vždy přednost.

| Odkud | Co je v aplikaci |
|---|---|
| Recovery check | poměr zátěže 7/28 dní (ACWR) v tabulce kondice; upozornění nad 1,3 a 1,5; do semaforu nevstupuje. Upozornění jen když je co hlásit. |
| Plan my week | max. +10 % proti běžnému týdnu (větší z minulého týdne a průměru 4 týdnů); po 3 týdnech růstu lehčí týden (−30 %); zdůvodnění klíčové jednotky |
| Weekly review | plán vs. skutečnost, vynechané jmenovitě, „Z2 nebyla lehká“ (> 20 % času v Z3+), výhry (nové maximum 5/20 min), 1–2 úpravy, trend přes týdny uložený v `weekly_reviews` |
| Aerobic decoupling | drift pod 40 min nehodnotím, upozornění na teplo ≥ 25 °C; prahy 5 / 8 % zůstávají z tvých pravidel |
| Fuel & pace | tekutiny (l/h) a sodík (mg/h) jako odhad z teploty a hmotnosti, plán výživy pro cíl 120 km / 4 h, návod na test pocení |
| Sleep | pravidelnost spánku (rozptyl času vstávání za 14 dní) na stránce Zotavení |
| Zone calculator | kontrola LTHR = 85–92 % nejvyššího tepu z dat |
| VO2 optimizer | u VO2 kvality označení, zda jde o ověřený protokol 4×4 min (Tier 1) nebo jeho úpravu |

## Výstupy

| Pravidlo | Náhrada |
|---|---|
| HTML artefakt (Příloha A/B) | stránky dashboardu (stejné bloky a pořadí) + krátká zpráva v Telegramu s odkazem |
| Zpráva v chatu (kap. 10) | Telegram HTML; `**tučně**` → `<b>` |
| „Trenér {d.m.}“ / „Plán“ / „Připravenost“ / „Aktivita“ | `/rano` = připravenost, `/plan`, `/aktivita`, `/stav` = celý denní report |
