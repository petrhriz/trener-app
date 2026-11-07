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
| `vo2max` | ⚠️ není v uvedených endpointech | zkusíme `/metrics-service/metrics/maxmet/daily/{od}/{do}`, jinak pole aktivity `vO2MaxValue` (poslední jízda s wattmetrem) |

## Kondice / únava / forma (6.4)

| Pole | Náhrada |
|---|---|
| `ctl`, `atl`, `rampRate` | ⚙️ vlastní výpočet z odjetých aktivit (vzorce 6.4), ukládáno do `daily_metrics`. Žádná naplánovaná zátěž v historii → problém „dnešní řádek obsahuje plán“ odpadá. |
| `icu_training_load` | ⚙️ TSS = (s × NP × IF) / (FTP × 3600) × 100, IF = NP / FTP; nebo Garmin `trainingStressScore`, když existuje. Bez wattmetru hrTSS. Zdroj se ukládá (`load_source`). |
| hrTSS | ⚠️ návrh: ze zón tepu, hodinová sazba Z1 30 · Z2 55 · Z3 70 · Z4 90 · Z5 120 (TSS/h, práh = 100), tj. hrTSS = Σ hodiny v zóně × sazba. Ve fázi 2 sazby zkalibrujeme proti `icu_training_load` tvých posledních aktivit a rozdíl vypíšeme. Garmin `activityTrainingLoad` se ukládá zvlášť a do CTL se nemíchá. |
| `get_fitness_forecast` | ⚙️ výhled vzorcem z `planned_workouts` (6.3, 6.4) |

## Aktivita (kap. 5, `Aktivita.md`)

| Pole | Náhrada | Pozn. |
|---|---|---|
| NP, průměrný výkon | ✅ `normPower`, `avgPower` | |
| `icu_variability_index` | ⚙️ VI = NP / avgPower (2 des. místa) | |
| Intenzita | ⚙️ NP / FTP v % | |
| `decoupling` (aerobní drift) | ⚠️ ze souhrnu nejde | ⚙️ Pw:HR decoupling z `/details` s malým vzorkem (~300 bodů): poměr výkon/tep 1. vs. 2. polovina. Bez wattmetru rychlost/tep. Když endpoint nejde: „–“. |
| `compliance` | ⚠️ Garmin nemá | návrh: splnění = skutečná zátěž / plánovaná zátěž × 100 %, omezeno na 0–150 %; v reportu jako „splnění (zátěž)“. **Potvrď.** |
| `icu_lap_count`, intervaly | ✅ Garmin laps (`/activity-service/activity/{id}/splits`, pokud Personal API pustí) | lapy jsou přímo z Garminu → problém „Use laps for intervals“ odpadá. Když endpoint nejde: plán B lapy z intervals.icu. |
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

## Výstupy

| Pravidlo | Náhrada |
|---|---|
| HTML artefakt (Příloha A/B) | stránky dashboardu (stejné bloky a pořadí) + krátká zpráva v Telegramu s odkazem |
| Zpráva v chatu (kap. 10) | Telegram HTML; `**tučně**` → `<b>` |
| „Trenér {d.m.}“ / „Plán“ / „Připravenost“ / „Aktivita“ | `/rano` = připravenost, `/plan`, `/aktivita`, `/stav` = celý denní report |
