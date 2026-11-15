# Odkud jsou čísla: hotová data vs. výpočet

**Hotové** = číslo přebírám ze zdroje a jen ho zobrazím (případně zaokrouhlím nebo přeložím).
**Výpočet** = aplikace ho počítá sama ze surových dat (vzorec je v uvedeném souboru).

## Přebírám hotové

| Údaj | Zdroj | Pozn. |
|---|---|---|
| Aktivita: čas, vzdálenost, převýšení, rychlost, tep ⌀/max, výkon ⌀/max, NP, kadence, kalorie, teploty, dech | Garmin (seznam aktivit) | |
| Běh: výkon, délka kroku, kontakt se zemí, vertikální oscilace a poměr | Garmin | nové v 26. kole |
| Čas v zónách tepu a výkonu, nejlepší výkony 5 s – 60 min (křivka výkonu) | Garmin | zóny podle nastavení v Garminu |
| Tréninkový efekt aerobní / anaerobní a hlavní přínos („Limitní“, „Základ“…) | Garmin | |
| Dopad aktivity na Body Battery (např. −10) | Garmin | |
| VO2max kolo a běh | Garmin – čtu ho z FIT souboru aktivity | starší dny z intervals.icu |
| Zátěž aktivity (TSS s wattmetrem, HRSS z tepu) | intervals.icu | když chybí, viz výpočet níž |
| Kondice (CTL), únava (ATL), ramp rate | intervals.icu | dny, které intervals.icu nemá, dopočítám; trenažér, kde vyhrála zátěž z tepu, se přičte jako rozdíl (`src/core/fitness.ts`) |
| Okruhy (lapy), splnění workoutu (%), eFTP, strain | intervals.icu | |
| Aerobní drift (decoupling) | intervals.icu | vlastní výpočet jen když ho intervals.icu nemá (od 27. kola) |
| FTP | intervals.icu (nebo ručně v Nastavení) | |
| Spánek: délka, fáze (hluboký, REM, lehký, bdění), probuzení, tep a dech ve spánku | Garmin | dech Garmin zaokrouhluje na celé dechy |
| VST (HRV) noc a 7denní průměr, klidový tep | Garmin | |
| Kroky, patra, minuty intenzity, stres (průměr, max, minuty v pásmech) | Garmin | |
| Tep během dne (po 2 min), VST přes noc (po 5 min) | Garmin | podklad pro výpočty |
| Váha, fitness věk, zóny tepu (LTHR, max) | Garmin | |
| Garmin skóre spánku, potřeba spánku, Body Battery | Garmin | jen pro srovnání (sloupce `*_g`) |
| Počasí po hodinách (teplota, pocitová, srážky, vítr, nárazy), východ a západ slunce | Open-Meteo (mix modelů nebo ALADIN) | |

## Počítám sám

| Údaj | Ze kterých dat | Kde je vzorec |
|---|---|---|
| Skóre spánku 0–100 | délka a fáze spánku proti tvé potřebě | `src/core/sleepCalc.ts` |
| Potřeba spánku (dnes, další noc) | tvůj obvyklý spánek (medián 60 dní, 6–9 h) + čtvrtina dluhu 7 nocí, nejvýš +1 h | `src/core/sleepCalc.ts` |
| Spánková banka | spánek − cíl, součet 7 nocí | `public/app.js` (`sleepBankCard`) |
| Optimum fází spánku (v optimu / pod) | podíl fáze z celkového spánku, rozsahy jako v Garminu | `src/core/sleep.ts` |
| Pravidelnost spánku | časy usnutí a probuzení 14 dní | `src/core/extras.ts` |
| Energie (místo Body Battery) | tep po 2 min, stres, spánek, aktivity | `src/core/energy.ts` |
| Zotavení % a ranní semafor 🟢🟡🔴 | VST, klidový tep, spánek proti tvé normě 60 dní | `src/core/recovery.ts`, `readinessScore.ts` |
| Normální rozsah (průměr ± 1 SD) a „v normě / nad / pod“ | posledních 30–60 dní | `src/core/recovery.ts`, `public/app.js` |
| Forma (TSB) | CTL − ATL | `src/core/fitness.ts` |
| CTL / ATL pro dny bez intervals.icu (např. starší roky) | denní zátěž aktivit, exponenciální průměr 42 / 7 dní | `src/core/fitness.ts`, `src/sync/metrics.ts` |
| Zátěž aktivity bez intervals.icu | NP a FTP (TSS), jinak tep a zóny (HRSS) | `src/core/load.ts` |
| Aerobní drift – jen záloha | průběh výkonu a tepu z Garminu, když intervals.icu decoupling nedá | `src/core/activity.ts` |
| Splnění plánu – jen záloha | zátěž / plánovaná zátěž, když workout není v intervals.icu spárovaný | `src/core/activity.ts` |
| AI zhodnocení aktivity (2–3 věty) | hotová čísla z analýzy aktivity, model z Nastavení → AI model, uloženo v KV | `src/llm/activityAi.ts` |
| Kvalita / typ jednotky (VO2, práh, sweet spot…) | čas v zónách výkonu, název | `src/core/quality.ts` |
| Rovnováha zátěže (nízko / vysoce aerobní / anaerobní) | hlavní přínos z Garminu + zátěž | `src/core/balance.ts` |
| Plán týdne, workouty, cíl zátěže týdne | kondice, forma, cíl, omezení, počasí | `src/core/plan.ts`, `qualityDesign.ts` |
| Splnění posledních tréninků | plán vs. aktivita (nebo % z intervals.icu) | `src/api/routes.ts` (`/coach`) |
| Okna na jízdu, vhodnost hodin | hodinová předpověď + tvoje teplotní hranice | `src/core/weather.ts` |
| Sacharidy na jízdu | délka a intenzita jednotky | `src/core/nutrition.ts` |
| Měsíční a roční souhrny, srovnání let | součty aktivit | `src/api/routes.ts` |
| Tempo (min/km) | jen převod průměrné rychlosti z Garminu (1000 / m/s), Garmin tempo jako samostatné číslo nedává | `src/core/activity.ts` |

## Kondice za minulé roky

Když je v intervals.icu celá historie, aplikace z něj dočte kondici (CTL/ATL) i zátěž
starších aktivit (`icu kondice backfill` a `icu zátěž historie` v `src/sync/sync.ts`). Vlastní výpočet běží jen
pro dny, které intervals.icu ještě nemá (dnešek před synchronizací), a pro aktivity, které se nespárovaly.

Vzorec je stejný jako v intervals.icu (veřejný model výkonnosti Banister / Coggan: CTL = exponenciální průměr
denní zátěže za 42 dní, ATL za 7 dní, forma = CTL − ATL). Nad zátěží z intervals.icu dává do 0,2 stejné CTL.
Rozdíl dělá jen zátěž aktivit bez wattmetru: vlastní odhad z průměrného tepu je proti HRSS z intervals.icu
(počítá z celého průběhu tepu) v součtu o několik procent výš, u starších let víc (počítá s dnešní LTHR
a klidovým tepem). Srovnání: `node scripts/compare-kondice.mjs`.
