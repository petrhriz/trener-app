# 9. kolo (12. 11. 2026)

Podnět: návrh a audit od ChatGPT (`screenshoty/Chatgpt navrh stranky/`). Závěr: aplikaci nepřepisovat
(Next.js / Supabase / FastAPI by znamenaly začít znovu a platit hosting), převzít jen pár věcí.

| # | Co | Stav |
|---|---|---|
| 0 | Kondice z intervals.icu za celou historii | hotovo |
| 1 | AI trenér: kontrola celého týdne po úpravě | hotovo |
| 2 | FTP a zóny s datem platnosti | hotovo |
| 3 | Graf tréninku a úprava kvality | hotovo |
| 4 | AI bez zdravotních údajů (přepínač) | hotovo, výchozí vypnuto |

## 0. Kondice z intervals.icu za celou historii

Do intervals.icu se nahrála historie od 2019. Aplikace z něj dřív dočetla kondici jen od září 2025 (dočtení
skončilo, když tam starší data nebyla), starší roky počítala sama ze zátěže odhadnuté z tepu.

- Vzorec je stejný jako v intervals.icu (veřejný model Banister / Coggan: CTL 42 dní, ATL 7 dní, forma = CTL − ATL).
  Nad zátěží z intervals.icu dává do 0,2 stejné CTL.
- Rozdíl byl jen v zátěži aktivit bez wattmetru: vlastní odhad z průměrného tepu o 5–13 % výš (dnešní LTHR a klidový
  tep na staré roky), CTL v průměru o 1–3,5 výš, v jednotlivých dnech až o 7,6.
- Oprava: znovu dočíst kondici (`icu_fit_bf` verze 2) a nový krok `icu zátěž historie` (zátěž starších aktivit).
  Dočítá se jen s potřebnými poli (`fields=`), jinak velká odpověď přetáhne limit CPU.
- Výsledek: uložená kondice sedí s intervals.icu ve všech letech. Srovnání: `node scripts/compare-kondice.mjs`.
- intervals.icu tedy zůstává zdrojem kondice; vlastní výpočet je záloha pro dny a aktivity, které ještě nemá.

## 1. AI trenér: kontrola celého týdne po úpravě

`/coach/ask` po úpravách od AI hledal nová porušení pravidel jen na upravených dnech. Přesun ale umí rozbít i jiný
den (4 dny za sebou, kvalita po nově dlouhém dni, propad formy o pár dní dál). `newViolations(before, after)`
v `src/core/coach/validate.ts` porovná kontrolu celého týdne; nová chyba kdekoli → upravené dny se vrátí.
U řady dní a propadu formy rozhoduje počet výskytů, ne datum. Upozornění úpravu nevrací.

## 2. FTP a zóny s datem platnosti

- Tabulka `zone_history` (migrace 0012): řádek platí od `date` do dalšího. `zonesAt()` v `src/core/zones.ts`.
- Plnění: změna FTP / zón (Nastavení, intervals.icu, Garmin) → řádek od dneška (`recordZones`, každou hodinu
  a při uložení Nastavení). Historie FTP z jízd v intervals.icu (`icu_ftp` v den jízdy, krok `historie zón`).
- Výsledek u vlastníka: 298 W do 8/2025 (hodnota z doby nahrání do intervals.icu, ne skutečná tehdejší),
  250 W od 4. 9. 2025, 298 W od 26. 9. 2026.
- Podle tehdejších hodnot se teď počítá: barvy zón v grafu aktivity, popis zón tepu, výkon v Z2 na tep,
  výběr lehkých jízd pro EF a vlastní odhad zátěže. Přehled v Nastavení → „FTP a zóny v čase“.

## 3. Graf tréninku a úprava kvality

- Trenér: u každého tréninku graf (sloupec = krok, šířka = délka, výška a barva = % FTP / zóna tepu, čárkovaně FTP).
- U kvality v panelu „Upravit“: počet opakování, délka úseku, intenzita ±10 %. Uloží se jako omezení dne `kroky`
  (JSON) + typ kvalita, aby řešič den neodsunul. `applyStepEdit()` v `src/core/coach/library.ts` přepočítá délku,
  zátěž, čas nad Z2 i cíl okruhů; pracovní čas série nejvýš +50 %. Souvislé tempo: jen délka a intenzita.
  Kontrola týdne bere úpravu jako tvoji volbu (výjimka). „Zpět na návrh trenéra“ úpravu smaže.

## 4. AI bez zdravotních údajů

Nastavení → „AI nedostane zdravotní údaje“. Zapnuto: z kontextu chatu, Telegramu a zhodnocení aktivity se vyřadí
VST, klidový tep, spánek, stres, Body Battery, dech, váha a zotavení (`stripHealth` v `src/core/privacy.ts`),
obsah stránky se pošle jen u tréninkových stránek, AI trenér nedostane ranní připravenost a závěry zpráv
se neuhlazují. Výchozí vypnuto (chování beze změny).
