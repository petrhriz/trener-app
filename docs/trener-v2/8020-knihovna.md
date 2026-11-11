# Příloha: 80/20 zóny, knihovna tréninků a pravidla plánů

Výtah z 8020endurance.com (přečteno 11. 11. 2026) pro implementaci Trenéra v2. Čísla přepsaná z webu;
`Z1`, `Z2`, `X`, `Z3`, `Y`, `Z4`, `Z5` = 80/20 zóny. Délky v minutách (s = sekundy). `N×(a Zk/b Zj)` = N opakování
a min v Zk + b min v Zj.

**Pozor:** čísla workoutů (CF1, CF2 …) jsou **pořadí, v jakém vznikly, ne obtížnost**. Postup = seřadit podle minut
v cílové zóně. U některých workoutů nesedí uvedený součet se součtem kroků (např. CCI24 121 vs. 120) – provádět
kroky, zobrazovat součet kroků.

## 1. Zóny (7 pásem)

| Zóna | Tep % LTHR (kolo i běh, každý svůj LTHR) | Kolo % FTP | Běh tempo % prahové rychlosti | Běh výkon % rFTP |
|---|---|---|---|---|
| Z1 | 72–81 | 50–70 | 60–76 | 50–76 |
| Z2 | 81–90 | 70–83 | 76–87 | 76–88 |
| X | 90–95 | 83–91 | 87–93 | 88–94 |
| Z3 | 95–100 | 91–100 | 93–100 | 94–100 |
| Y | 100–102 | 100–102 | 100–102 | 100–103 |
| Z4 | 102–105 | 102–110 | 102–115 | 103–120 |
| Z5 | > 105 | > 110 | > 115 | > 120 |

- Nízká intenzita = Z1 + Z2, střední = X + Z3, vysoká = Y + Z4 + Z5. X a Y nejsou cílové zóny.
- Horní hranice Z3 = laktátový práh (FTP). CP ≈ spodek Z4, MAP ≈ spodek Z5.
- RPE (Borg 6–20): 7–9 Z1, 10–11 Z2, 12–13 X, 14–15 Z3, 16–17 Y/Z4, 18 Z4, 19 Z5.
- Uvnitř zóny platí kterýkoli bod; při únavě spodek, odpočatý vršek. Cardiac drift v Z2 neřešit, dokud výkon /
  tempo nejsou nad Z2.
- **Pro naši aplikaci**: FTP 298 W → Z2 209–247 W, X 247–271 W, Z3 271–298 W, Z4 304–328 W, Z5 > 328 W.
  Dnešní pásmo Z2 v aplikaci (170–215 W ≈ 57–72 % FTP) je v 80/20 spíš Z1 / spodek Z2. V2 musí rozhodnout,
  které pásmo použije (zapsat do `otazky.md`).

### Testy prahu
- 20 min časovka (po 15 min rozjetí s několika 15s zrychleními): FTP = 95 % průměrného výkonu, LTHR = průměrný tep
  posledních 15 min, prahové tempo běhu = průměrné tempo.
- Talk test (bez časovky): každých 1,5 min zrychlit, 30 s odříkat ~50 slabik; poslední pohodlné = horní Z2.
- Opakovat každých 6–8 týdnů nebo v každém 2. odpočinkovém týdnu (nahradí nejtěžší jednotku). CT / RT (Tempo) slouží
  i jako test. Odhady hodinek / platforem nepoužívat jako práh.
- Na trenažéru práh o 5–10 bpm a 10–15 W nižší.

## 2. Cyklistika (218 workoutů)

| Rodina | Kód | Účel | Stavba |
|---|---|---|---|
| Regenerace | CRe1–14 | aktivní regenerace, „vyhni se i Z2“, vysoká kadence | vše Z1: 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 150 |
| Foundation | CF1–26 | základ, jen Z1–2, ne skupinová jízda nad Z2 | CF2–9, CF26: 5 Z1, (celek−10) Z2, 5 Z1 (25–60, 75); CF10–25: a Z1, b Z2, 10 Z1 (60–360) |
| Aerobní intervaly | CAe1–37 | dlouhé Z2 bloky (Ironman), pokročilí i X | např. CAe2 90: 15 Z1, 3×(15 Z2/5 Z1), 15 Z1; CAe8 180: 10 Z1, 4×(30 Z2/10 Z1), 10 Z1 |
| Cruise intervaly | CCI1–24 | svalová vytrvalost v Z3, „opak zóny X“; když jdou dobře, pauzu 3→2→1 min | viz tabulka níže |
| Tempo | CT1–33 | souvislá Z3, „začni níž, skonči silněji“, slouží i jako test | viz tabulka níže |
| Fast Finish | CFF1–27 | Z3 na konci při únavě | 5 Z1, A Z2, B Z3 (A 15–340, B 5–15) |
| Force | CFo1–24 | krátké Z5 (30 s – 1,5 min), podle RPE, kopec nebo 65–75 ot./min ve stoje | viz tabulka níže |
| Mixed | CMI1–6 | Z3 + Z4 | 20 Z1, 2×(20 Z3/15 Z1), pak 10×(1 Z4/2 Z1) (CMI6 5×), dojezd 0–90 Z1 |
| Anaerobic | CAn1–9 | VO2max, 2,5 min Z4, „nesklouznout do Z3 ani Z5“ | viz tabulka níže |
| Speed Play | CSP1–18 | volné intervaly, malé dávky Z4 | 5 Z1, 5 Z2, N×(1–2 Z4/2 Z1), Z2 doplnit do celku, 5 Z1 |

### Cruise intervaly (CCI) – seřazeno podle minut v Z3

| Z3 min | Kód | Celkem | Stavba |
|---|---|---|---|
| 9 | CCI17 | 30 | 10 Z1, 3×(3 Z3/2 Z1), 5 Z1 |
| 9 | CCI22 | 90 | 10 Z1, 20 Z2, 3×(3 Z3/2 Z1), 30 Z2, 15 Z1 |
| 15 | CCI1 | 60 | 5 Z1, 20 Z2, 3×(5 Z3/3 Z1), 5 Z2, 6 Z1 |
| 15 | CCI23 | 91 | 10 Z1, 20 Z2, 3×(5 Z3/2 Z1), 30 Z2, 10 Z1 |
| 15 | CCI24 | 120 | 10 Z1, 20 Z2, 3×(5 Z3/2 Z1), 60 Z2, 10 Z1 |
| 20 | CCI2 | 60 | 5 Z1, 5 Z2, 4×(5 Z3/3 Z1), 13 Z2, 5 Z1 |
| 20 | CCI12 | 60 | 10 Z1, 10 Z2, 2×(10 Z3/4 Z1), 12 Z1 |
| 20 | CCI20 | 90 | 5 Z1, 5 Z2, 4×(5 Z3/3 Z1), 43 Z2, 5 Z1 |
| 20 | CCI21 | 90 | 10 Z1, 10 Z2, 2×(10 Z3/4 Z1), 10 Z2, 32 Z1 |
| 24 | CCI3 | 61 | 5 Z1, 10 Z2, 4×(6 Z3/3 Z1), 5 Z2, 5 Z1 |
| 24 | CCI13 | 90 | 10 Z1, 10 Z2, 4×(6 Z3/3 Z1), 29 Z2, 5 Z1 |
| 24 | CCI18 | 105 | 10 Z1, 10 Z2, 4×(6 Z3/3 Z1), 44 Z2, 5 Z1 |
| 24 | CCI19 | 120 | 20 Z1, 10 Z2, 4×(6 Z3/3 Z1), 49 Z2, 5 Z1 |
| 28 | CCI4 | 65 | 5 Z1, 10 Z2, 4×(7 Z3/3 Z1), 5 Z2, 5 Z1 |
| 28 | CCI14 | 90 | 10 Z1, 10 Z2, 4×(7 Z3/3 Z1), 25 Z2, 5 Z1 |
| 32 | CCI5 | 64 | 5 Z1, 5 Z2, 4×(8 Z3/3 Z1), 5 Z2, 5 Z1 |
| 32 | CCI15 | 90 | 10 Z1, 10 Z2, 4×(8 Z3/3 Z1), 21 Z2, 5 Z1 |
| 32 | CCI10 | 119 | 10 Z1, 15 Z2, 4×(8 Z3/3 Z1), 40 Z2, 10 Z1 |
| 32 | CCI11 | 150 | 10 Z1, 15 Z2, 4×(8 Z3/3 Z1), 71 Z2, 10 Z1 |
| 36 | CCI16 | 90 | 10 Z1, 10 Z2, 4×(9 Z3/3 Z1), 17 Z2, 5 Z1 |
| 40 | CCI6 | 72 | 5 Z1, 5 Z2, 4×(10 Z3/3 Z1), 5 Z2, 5 Z1 |
| 48 | CCI7 | 80 | 5 Z1, 5 Z2, 4×(12 Z3/3 Z1), 5 Z2, 5 Z1 |
| 60 | CCI8 | 92 | 5 Z1, 5 Z2, 4×(15 Z3/3 Z1), 5 Z2, 5 Z1 |
| 60 | CCI9 | 95 | 5 Z1, 5 Z2, 5×(12 Z3/3 Z1), 5 Z2, 5 Z1 |

### Tempo (CT)

- CT2–7, CT25–28: 5 Z1, 5 Z2, **T** Z3, 5 Z2, 5 Z1 – T = 15, 18, 20, 24, 28, 30, 32, 36, 40, 45 (celkem T + 20).
- CT29–33: 5 Z1, 15 Z2, T Z3, Z2 doplnit, 5 Z1 – T = 15, 20, 24, 32 (CT33: 10 Z2, 40 Z3, 10 Z2).
- CT8–24 (dlouhé): 5 Z1, 10 Z2, 20 nebo 30 Z3, pak Z2 35–250 min, 5 Z1 (celkem 60–300).
- CT1 60: 15 Z1, 5 Z3, 40 Z2.

### Fast Finish (CFF) – 5 Z1, A Z2, B Z3

| Kód | Celkem | A | B | | Kód | Celkem | A | B |
|---|---|---|---|---|---|---|---|---|
| CFF1 | 25 | 15 | 5 | | CFF10 | 65 | 45 | 15 |
| CFF2 | 30 | 20 | 5 | | CFF11 | 75 | 55 | 15 |
| CFF3 | 30 | 15 | 10 | | CFF12 | 90 | 70 | 15 |
| CFF4 | 40 | 25 | 10 | | CFF13 | 105 | 85 | 15 |
| CFF5 | 42 | 25 | 12 | | CFF14 | 120 | 100 | 15 |
| CFF6 | 47 | 30 | 12 | | CFF16 | 150 | 130 | 15 |
| CFF7 | 52 | 35 | 12 | | CFF18 | 180 | 160 | 15 |
| CFF8 | 55 | 35 | 15 | | CFF22 | 240 | 220 | 15 |
| CFF9 | 60 | 40 | 15 | | CFF27 | 60 | 45 | 10 |

(CFF15–26: celek 135–360 po 15–30 min, B vždy 15.)

### Force (CFo) – 5 Z1, 5 Z2, N×(práce Z5 / pauza Z1), 5 Z1

| Kód | Celkem | Série | | Kód | Celkem | Série |
|---|---|---|---|---|---|---|
| CFo1 | 27 | 6×(30 s/90 s) | | CFo7 | 39 | 6×(1,5/2,5) |
| CFo2 | 31 | 8×(30 s/90 s) | | CFo8 | 45 | 10×(1/2) |
| CFo3 | 33 | 6×(1/2) | | CFo9 | 47 | 8×(1,5/2,5) |
| CFo4 | 35 | 10×(30 s/90 s) | | CFo10 | 51 | 12×(1/2) |
| CFo5 | 39 | 12×(30 s/90 s) | | CFo11 | 55 | 10×(1,5/2,5) |
| CFo6 | 39 | 8×(1/2) | | CFo12 | 63 | 12×(1,5/2,5) |

Delší varianty (CFo13–24, 60–180 min) = stejné série + Z2 blok před / po (např. CFo21 120: 15 Z1, 15 Z2,
10×(1 Z5/2 Z1), 55 Z2, 5 Z1).

### Anaerobic (CAn) – 2,5 min Z4 / 5 min Z1

| Kód | Celkem | Stavba |
|---|---|---|
| CAn9 | 60 | 10 Z1, 10 Z2, 3×(2,5 Z4/5 Z1), 17 Z1 |
| CAn7 | 92 | 10 Z1, 10 Z2, 3×(2,5 Z4/5 Z1), 45 Z2, 5 Z1 |
| CAn1 | 60 | 15 Z1, 4×(2,5 Z4/5 Z1), 15 Z1 |
| CAn8 | 150 | 10 Z1, 10 Z2, 4×(2,5 Z4/5 Z1), 95 Z2, 5 Z1 |
| CAn2 | 62,5 | 15 Z1, 5×(2,5 Z4/5 Z1), 10 Z1 |
| CAn3 | 60 | 10 Z1, 6×(2,5 Z4/5 Z1), 5 Z1 |
| CAn4 | 90 | 10 Z1, 6×(2,5 Z4/5 Z1), 30 Z2, 5 Z1 |
| CAn5 | 120 | 10 Z1, 6×(2,5 Z4/5 Z1), 60 Z2, 5 Z1 |
| CAn6 | 150 | 10 Z1, 10 Z2, 6×(2,5 Z4/5 Z1), 80 Z2, 5 Z1 |

### Speed Play (CSP) – 5 Z1, 5 Z2, série Z4 s pauzou 2 min Z1, Z2 do celku, 5 Z1

Série podle obtížnosti: 3×2 (CSP1, 27) · 4×2 (CSP3, 31) · 5×1 (CSP2, 60) · 5×2 (CSP5, 35) · 6×1 (CSP4, 60) ·
6×2 (CSP7, 39; CSP15, 79) · 7×1 (CSP6, 66) · 7×2 (CSP10, 60) · 8×1 (CSP8, 60; CSP17, 79; CSP18, 90) ·
8×2 (CSP12, 60; CSP16, 87) · 9×1 (CSP9, 42) · 9×2 (CSP13, 51) · 10×1 (CSP11, 45) · 12×1 (CSP14, 61).

## 3. Běh (209 workoutů)

| Rodina | Kód | Stavba / postup |
|---|---|---|
| Regenerace | RRe1–9 | vše Z1, 20–60 min po 5 |
| Foundation | RF1–17 | 5 Z1, Z2, 5 Z1; celek 20–60 po 5, pak 70–120 po 10 |
| Dlouhý | RL1–15 | 1 míle Z1, Z2, 0,5 míle Z1; 6–20 mil (9,7–32 km) |
| Fast Finish | RFF1–11 | 5 Z1, A Z2, B Z3 (25–65 min, B 5–15) |
| Dlouhý Fast Finish | RLFF1–6 | 0,5 mi Z1, A mi Z2, B mi Z3; 10–20 mil, B 1–2 míle |
| Cruise intervaly | RCI1–15 | 5 Z1, 5 Z2, 4×(5→8→10→12→15 Z3/3 Z1), 5 Z2, 5 Z1 (52–92 min); krátké RCI13 30: 10 Z1, 3×(3 Z3/2 Z1), 5 Z1 |
| Tempo | RT1–20 | 5 Z1, 5 Z2, T Z3 (15–45 po ~4), 5 Z2, 5 Z1 |
| Kopce | RHR1–14 | 5 Z1, 5 Z2, N×(30 s–1,5 min Z5 do kopce / 90 s–2,5 min Z1), 5 Z1; jako CFo |
| Krátké intervaly | RSI1–11 | jako RHR na rovině |
| Dlouhé intervaly | RLI1–12 | 5 Z1, 5 Z2, 3–8×(3–5 Z4/2–3 Z1), 5 Z1 – pokročilí |
| Anaerobic | RAn1–5 | 15 Z1, 3–6×(2,5 Z4/5 Z1), Z1 |
| Speed Play | RSP1–21 | 5 Z1, 5–28 Z2, 3–12×(1–2 Z4/2 Z1), 5 Z1 |
| Mixed | RMI1–4 | Z5, Z4, Z3 pyramida (36–71 min) |
| Ladění | RTa1 | 5 Z1, 6×(20 s Z4/40 s) |

Náhrada: každý Recovery nebo Foundation běh jde nahradit jiným sportem (kolo, běžky) **stejné délky a zóny**.

## 4. Pravidla plánů (s odkazem)

| Pravidlo | Hodnota | Zdroj |
|---|---|---|
| Rozložení intenzity | ~80 % času Z1–2, ~20 % Z3+; za týden, podle času | understanding-your-8020-run-plan |
| Těžké dny | max. 3–4 dny s intervaly týdně (triatlon), nikdy 3 „těžké“ (intervaly / dlouhý) za sebou | frequency-of-hard-and-easy-workouts, getting-started |
| Přesuny | v rámci týdne; nestřídat 3 dny stejný sport; intenzivnější jednotka první | getting-started-with-80-20-training |
| Kotvy týdne | den 1 = volno (posunout jde), den 7 = nejdelší trénink | getting-started-with-80-20-training |
| Odpočinkové týdny | kolo a běh každý 3. týden; triatlon 3. nebo 4.; objem −30 až −40 % | intensity-guidelines-for-cycling, why-80-20-reduces-injuries |
| Testy | v odpočinkovém týdnu, místo nejtěžší jednotky; cyklistika týden 6, 12 … | intensity-guidelines-for-cycling |
| Zmeškané | nedohánět; 1–2 → pokračovat; delší → pár dní lehce; hodně dlouho → začít znovu | training-plans/*, understanding-your-8020-run-plan |
| Únava v Z2 den | zůstat v Z1 je v pořádku | trouble-staying-in-zone-1-hr |
| Ukončení série | úsek o > 3 % slabší než předchozí → konec, dojet Z1–2 | understanding-your-8020-run-plan |
| Ladění | 10–14 dní, objem dolů, intenzita krátce; CTL −5–7 % (půlmaraton, 70.3), −10 % (maraton, IM); TSB v den D +10 až +20 | tapering-for-endurance-athletes |
| Úroveň | podle průměrných hodin, které zvládneš většinu týdnů; při váhání nižší | training-plans/* |
| Šedá zóna | každý den = zátěžový / regenerační / přípravný | grey-zone |
| Hierarchie | objem v nízké intenzitě > dávka vysoké intenzity > rozložení > periodizace | seilers-hierarchy-of-endurance-training-needs |

### Cyklistické plány 80/20 (délka a hodiny týdně přes úrovně 0–3)

| Plán | Týdnů | h / týden |
|---|---|---|
| Gran Fondo > 160 km / vícedenní | 18 | 5,5–10,8 |
| Gran Fondo 120–160 km | 15 | 5–10,3 |
| Gran Fondo do 120 km | 12 | 4,5–9,5 |
| 20 km časovka / zvýšení FTP | 9 | 4,3–9,3 |
| 40 km časovka / zvýšení FTP | 12 | 4,5–9,5 |
| Gravel 60–80 km | 15 | 5–10,3 |
| Gravel > 80 km / vícedenní | 18 | 5,5–11 |
| Gravel do 60 km | 12 | 4,5–9,5 |

### Co web neříká (doplnit jinde)
Pevné fáze base / build / peak s délkami, procento týdenního růstu zátěže, zimní / přechodné období, převod zátěže
kolo ↔ běh. V zadání (README kap. 4) doplněno podle Friela – ověřit, pokud uživatel dodá knihy.

## 5. Přečtené stránky

8020endurance.com: `/`, `/blog/`, `/blog/the-8020-method/`, `/blog/training-intensity/`, `/80-20-zone-calculator/`,
`/intensity-guidelines-for-80-20-running/`, `/intensity-guidelines-for-8020-triathlon/`,
`/intensity-guidelines-for-cycling/`, `/training-plans/running/marathon/`, `/training-plans/triathlon/half-ironman/`,
`/training-plans/cycling/`, `/frequency-of-hard-and-easy-workouts/`, `/tapering-for-endurance-athletes/`,
`/getting-started-with-80-20-training/`, `/adjusting-your-8020-training-plan/`, `/understanding-your-8020-run-plan/`,
`/understanding-your-8020-triathlon-plan/`, `/grey-zone/`, `/why-80-20-training-reduces-the-risk-of-injuries/`,
`/performance-management-chart-is-lying-to-you/`, `/trouble-staying-in-zone-1-hr/`,
`/new-study-strikes-fatal-blow-to-80-20-training-philosophy/`, `/seilers-hierarchy-of-endurance-training-needs/`,
`/8020-workout-library/`.

Nepřečteno: detaily plánů jednotlivých úrovní (5K, 10K, půlmaraton, Ironman, olympijský triatlon), plavání podrobně,
stránka AI trenéra „Mind of Matt“, norská metoda.
