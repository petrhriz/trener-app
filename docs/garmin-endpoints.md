# Garmin Personal API – ověřené endpointy

Ověřeno 7. 11. 2026 voláním z Cloudflare Workeru (`/admin/phase0`) a doplňkově lokálně (stejný klíč).
**Garmin API z Cloudflare funguje** – datacentrové IP nejsou blokované.

| Endpoint | Stav | Co vrací / pozn. |
|---|---|---|
| token `POST …/personal-api-key/token` | ✅ 200 | token jako text |
| `/activitylist-service/activities/search/activities?start&limit` | ✅ 200 | 111 polí: `distance`, `duration`, `movingDuration`, `elevationGain`, `averageHR`, `maxHR`, `avgPower`, `normPower`, `max20MinPower`, `trainingStressScore`, `intensityFactor`, `activityTrainingLoad`, `hrTimeInZone_1..5`, `powerTimeInZone_1..7`, `maxAvgPower_1…3600` (křivka výkonu), `lapCount`, `minTemperature`/`maxTemperature`, `averageBikingCadenceInRevPerMinute` |
| `/activity-service/activity/{id}` | ✅ 200 | `summaryDTO` (navíc `functionalThresholdPower` z Garminu, `averageMovingSpeed`, `minHR`) |
| `/activity-service/activity/{id}/details?maxChartSize=300&maxPolylineSize=0` | ✅ 200 (~10 KB) | ~300 bodů: `directPower`, `directHeartRate`, `directBikeCadence`, `directSpeed`, `sumDistance`, `sumDuration`, `directAirTemperature` → **aerobní drift** |
| `/download-service/files/activity/{id}` | ✅ 200 jen s `Accept: */*` (zip ~170 KB) | originální FIT. S `application/json`/`zip`/`octet-stream` → 406. Parsování ve Workeru by překročilo 10 ms CPU → nepoužíváme. |
| `/activity-service/activity/{id}/splits`, `/typedsplits`, `/laps`, `/split_summaries` | ❌ 404 | **lapy z Garminu nejdou** → lapy bereme z intervals.icu (`/api/v1/activity/{id}/intervals`, ověřeno 200) |
| `/activity-service/activity/{id}/hrTimeInZones`, `/powerTimeInZones` | ❌ 404 | nevadí – zóny jsou v seznamu aktivit |
| `/usersummary-service/v2/dailysummaries?startDate&endDate` | ✅ 200 | `{data:[…]}` – kroky, klidový tep, stres, Body Battery |
| `/sleep-service/sleep/dailySleepSummariesByDate?startDate&endDate` | ✅ 200 | `sleepTimeSeconds`, fáze, `sleepScores`, `avgHeartRate` |
| `/hrv-service/hrv/daily/{od}/{do}` | ✅ 200 | `hrvSummaries[]` |
| `/weight-service/weight/range/{od}/{do}` | ✅ 200 | `dailyWeightSummaries` |
| `/fitnessage-service/fitnessage/v2/{datum}` | ✅ 200 | `fitnessAge`, `chronologicalAge` |
| `/biometric-service/heartRateZones/v2` | ✅ 200 | `zone1Floor…zone5Floor`, `lactateThresholdHeartRateUsed`, `maxHeartRateUsed`, `sport` |
| `/metrics-service/metrics/maxmet/daily/{od}/{do}` | ❌ 404 | **VO2max z Garminu nejde** → z intervals.icu wellness (`vo2max`) |
| `/metrics-service/metrics/trainingstatus/aggregated/{datum}` | ❌ 404 | nepotřebujeme |

## Důsledky pro architekturu

- Hlavní zdroj: **Garmin** (aktivity, spánek, HRV, klidový tep, kroky, váha, zóny).
- **intervals.icu jako doplněk** jen pro lapy jízd a VO2max (a jako plán B pro vše, adaptér `intervals`).
- Velikosti odpovědí jsou malé (< 10 KB na 3 dny / 1 aktivitu), dávky se do 10 ms CPU vejdou.
