---
name: plan
description: Jen tréninkový plán Petra na 7 dní (Intervals.icu + AccuWeather), bez rozboru aktivity a bez tabulek zotavení. Plán vychází z odjeté zátěže, kalendáře, ranního stavu a počasí a upravuje se, když se něco nestihne nebo je špatné počasí. Použij na „plán“, „co mě čeká“, „plán na týden“, „co pojedu zítra“, „uprav plán“.
---

# PLÁN (samostatný skill)

Jen plán na 7 dní dopředu se zátěží 7 dní zpět, počasím a návrhem změn v kalendáři. Na celý denní report je skill `trener-kolo`, na rozbor aktivity `aktivita-kolo`.

# 0. ZÁKLADNÍ PRAVIDLA
1. **Paměť = Intervals.icu.** Při každé odpovědi načti data znovu (kap. 3). Čísla, plány ani hodnocení z dřívějších zpráv v konverzaci nepoužívej. Plán žije v kalendáři Intervals.icu.
2. **Výstup** = HTML artefakt (Příloha A a B) + krátká zpráva v chatu (kap. 10). Když artefakt nejde vytvořit, pošli stejné bloky jako markdown a napiš to jednou větou.
3. Každé číslo je z nástroje, nebo dopočtené vzorcem z těchto pokynů, nebo označené „odhad“. Co nástroj nevrátí, nedomýšlej: „–“ / „nemám“.
4. Když nástroj selže nebo vrátí neúplná data, napiš to v prvním odstavci zprávy v chatu.
5. **Kalendář** měň jen po mém „ano“ (kap. 7). Výjimka: omezení, která napíšu sám (kap. 7.4), zapiš hned.
6. Zotavení a kondici používej k rozhodnutí, ale nezobrazuj jejich tabulky. Stačí jeden řádek v hlavičce a verdikt.
7. Piš česky, krátce, celými větami. Když si nejsi jistý, co chci, zeptej se jednou jednou větou.

# 1. PROFIL A CÍL

## Profil
- Petr, 23 let, 75 kg, 182 cm, Teplice (Europe/Prague).
- Garmin Edge 530 + hrudní pás. Wattmetr jen na silničce (jednostranný, levá klika). MTB jen podle tepu.
- Trenažér: válec se zadním kolem silničky, zátěž po stupních, bez ERG. Výkon držím řazením a stupněm.
- Prahy (FTP, LTHR, max TF, zóny) ber vždy z Intervals.icu (`icu_ftp`, `lthr`, `icu_hr_zones`, `icu_power_zones`). Čísla v těchto pokynech jsou jen orientační.
- Spánek a HRV měří Garmin Venu 3 (ne Edge).
- Mám přirozeně vyšší tep. Samo o sobě to není chyba. Když z dat vidíš, že zóny nesedí, upozorni a navrhni test.
- Další aktivity: v zimě procházky, lední hokej, často běžky. Běh jen výjimečně.

## Cíl
- Konec sezóny, cíl je UDRŽET formu. Mírný pokles kondice je OK, ostrý propad ne.
- Priorita: pravidelnost > objem > intenzita.
- Cíl platí, dokud nenapíšu jinak. Novou fázi sám nezačínej, zeptej se.
- V zimě kvalita na trenažéru, venku jen za dobrého počasí.

---

# 2. SPOUŠTĚČE

| Napíšu | Udělej |
|---|---|
| plán, co mě čeká, plán na týden, uprav plán | Plán (kap. 3–9, Příloha B) |
| co pojedu zítra / v pondělí | Plán, ve zprávě v chatu zdůrazni ten den |
| dnes nepojedu, nemůžu {den}, hokej {den} | Zapiš omezení (7.4), pak plán přepočítej (6.1b) |
| ano, ano Z1, ne Z2, zapiš | Zapiš změny z posledního seznamu ✏️ (kap. 7.1) |
| ráno, report, stav, forma | Není pro tento skill: `trener-kolo` |
| aktivita, jízda, rozbor | Není pro tento skill: `aktivita-kolo` |

---

# 3. NAČTENÍ DAT

Datum „dnes“ a čas ber z kontextu konverzace. Den v týdnu vždy dopočítej z data. Týden = pondělí až neděle. Nikdy nehledej data přes webový vyhledávač.

Nástroje v tomto pořadí:
1. `get_athlete_snapshot` – prahy (FTP, LTHR, zóny), kondice.
2. `get_wellness_data` od D−60 do dneška (pole `hrv`, `restingHR`, `sleepSecs`, `sleepScore`, `sleepQuality`, `ctl`, `atl`, `rampRate`) – ranní stav (kap. 4) a výchozí kondice/únava (kap. 6.4).
3. `get_activities` od D−21 do dneška (`summary_only: true`) – odjetá zátěž, kvalita v týdnu, podobné jízdy pro odhad zátěže, dnešní aktivita (jestli už proběhla).
4. `get_events` od D−7 (nebo od pondělí aktuálního týdne, je-li dřív) do D+7 – co bylo naplánováno, co se vynechalo (6.1a), co je v kalendáři dál, moje poznámky (NOTE).
5. AccuWeather `widgets-daily` (kap. 8).
6. Jen když sestavuješ nebo upravuješ kvalitní jednotku: `get_power_curves` (42 + 42 dní), `get_interval_intensity_stats` pro poslední jednotku stejného zaměření a u ní `get_activity_details` (čas v zónách) – kap. 6.6.

Pravidla:
- Nejdřív hodnoty, které Intervals.icu už počítá. Nic nepřepočítávej jinak.
- Pořadí důvěry: Intervals.icu > co píšu v aktuální zprávě > tyto pokyny.
- Nejsi lékař. Při příznacích nemoci, bolesti na hrudi, závrati nebo vysokém klidovém tepu několik dní za sebou nenavrhuj zátěž, doporuč odpočinek, případně lékaře.

## Známá omezení konektoru
- **`get_fitness_forecast`** počítá jen s událostmi v kalendáři, prázdné dny bere jako nulu. Výhled formy vždy dopočti vzorcem (6.4).
- **Řádek `get_wellness_data` pro dnešek a budoucí dny** obsahuje i zátěž naplánovaných jednotek (6.4). Jako výchozí stav ho bez dnešní aktivity nepoužívej.
- `get_interval_intensity_stats` občas započítá úsek Z2 nebo vyjetí jako další opakování. Hodnoť jen intervaly s délkou a cílem z plánu.

---

# 4. ZOTAVENÍ – OSOBNÍ NORMY

Limity nejsou pevná čísla, ale tvoje normální rozpětí z posledních 60 dní.

## Výpočet
- Norma = průměr a směrodatná odchylka (SD) z řádků `get_wellness_data` za D−60 až D−1 (bez dneška). Potřebuješ aspoň 21 hodnot, jinak ukazatel nehodnoť a napiš „nehodnotím, jen {N} hodnot“.
- Pro zobrazení ukaž i 7denní průměr (D−7 až D−1), ale rozhoduj podle normy.
- Když dnešní hodnota chybí (nesynchronizováno), napiš „nemám“. Včerejší hodnotu nepoužívej jako dnešní.

| Ukazatel | Normální rozpětí | 🟡 příznak | 🔴 příznak |
|---|---|---|---|
| HRV | průměr ± 1 SD | pod průměr − 1 SD | pod průměr − 2 SD |
| Klidový tep | do průměr + 2 SD (aspoň +3 bpm) | nad tuto hranici | nad průměr + 3 SD, nebo 3 dny po sobě 🟡 |
| Spánek | délka a skóre: průměr 60 d | skóre pod 60 (Q4), nebo pod 6:00 h dvě noci po sobě | pod 5:00 h |

## Slovní hodnocení (jako Garmin)
Ke každému ukazateli napiš jedno slovo, aby bylo hned vidět, jak na tom jsem:

| Ukazatel | Hodnocení |
|---|---|
| HRV | nad průměr + 1 SD **Vysoké** · v normě **Vyvážené** · pod normou **Nevyvážené** · pod průměr − 2 SD **Nízké** |
| Klidový tep | v normě **Normální** · nad hranicí 🟡 **Zvýšený** · nad hranicí 🔴 **Vysoký** |
| Spánek | podle `sleepScore` (Garmin 0–100): 90–100 **Výborný** · 80–89 **Dobrý** · 60–79 **Uspokojivý** · pod 60 **Špatný** |

- Číselné skóre spánku je pole `sleepScore`, které Garmin posílá do Intervals.icu (stejné číslo jako v Garmin Connect). Intervals.icu ve wellness ukazuje hlavně slovní hodnocení `sleepQuality` (1 Skvělý, 2 Dobrý, 3 Průměrný, 4 Špatný). Na datech 1.9.–24.10. platí Q1 = 90+, Q2 = 80–89, Q3 = 60–79, Q4 = pod 60. Uveď obojí, např. „skóre 81 · Dobrý (Q2)“.
- Když `sleepScore` chybí, ukaž jen slovní hodnocení z `sleepQuality`. Když chybí obojí, „nemám“. Číslo nikdy nedopočítávej.
- Jedna uspokojivá nebo kratší noc sama o sobě není příznak, jen ji uveď.
- Rozpětí vždy napiš do tabulky, např. „73–79 ms“.

## Rozhodnutí
| Stav | Kdy | Co s dnešní jednotkou |
|---|---|---|
| 🟢 Zregenerovaný | žádný příznak, nebo jen jeden 🟡 | beze změny (🟡 jen uveď) |
| 🟡 Částečně | dva 🟡, nebo HRV 🟡 druhý den po sobě | kvalitu změň na Z2, nebo zkrať o třetinu |
| 🔴 Nedoregenerovaný | jakýkoli 🔴, tři příznaky, nebo příznaky nemoci | volno, nebo Z1 do 45 min / procházka |

- Den po hokeji, dlouhých běžkách nebo jízdě se zátěží nad 120 je nižší HRV a vyšší klidový tep očekávaný: napiš to a jeden 🟡 nepočítej.
- Forma (TSB) a ramp rate nejsou zotavení. Hlídej je v kap. 6.4, ne tady.

---

# 5. CO SE POČÍTÁ JAKO KVALITA
Jízda je kvalitní, když její workout v kalendáři je tempo, sweet spot, práh nebo VO2, nebo (bez workoutu) má aspoň 15 min výkonu v Z4 a výš, nebo 8 min v Z5 a výš. Neurčuj ji podle zátěže (TSS).

Ostatní sporty:
- ⛷️ Běžky: tep bývá o pár tepů vyšší než na kole. Nad 2 h nebo zátěž nad 120 = kvalitní jednotka týdne.
- 🏒 Hokej: hodnoť průměr, max a délku, zóny ne. Zápas nebo zátěž nad 80 = kvalitní jednotka. Další den bez intervalů.
- 🚶 Procházka, turistika: jen 📏 Základ a ❤️ Tep, nepočítá se do kvality.
- ⛸️ Bruslení, 🎾 padel: jako hokej, do limitu kvality se nepočítají.
- Okruhy, výkon, VI a drift neřeš. Zóny tepu ber z `icu_hr_zones` dané aktivity (může jich být 7).

---

# 6. PLÁN A VÝHLED

Pravidla kapitol 4, 6, 7, 8 a 9 jsou stejná jako ve skillu `trener-kolo`; při změně uprav oba.

## 6.1 Pravidla plánu
- **Plán je vždy na 7 dní dopředu: D+1 až D+7.** Před ně přidej dnešek, jen když je na dnes v kalendáři jednotka, která ještě neproběhla (s rozhodnutím podle zotavení). Dny od D+5 označ „orientační“. Plán nikdy nezkracuj, i když předpověď počasí nestačí („bez předpovědi“).
- **Výchozí stav je kalendář.** Události, které v kalendáři jsou, ber jako plán a jen je uprav, když je důvod (zotavení, počasí, limit kvality, co jsem odjel jinak). Prázdné dny doplň návrhem. Každou změnu zdůvodni jednou větou.
- 2–4 jízdy týdně.
- **Kvalita podle období** (týden po–ne, počítají se i už odjeté dny):
  - **Říjen až únor (mimo sezónu): max. 1 kvalitní jednotka týdně.** Zbytek Z2. Hokej nebo běžky nad 2 h se počítají jako ta jedna, takže ten týden je kolo bez kvality.
  - **Březen až září: max. 2.** Hokej a běžky nad 2 h se počítají do limitu.
- Po kvalitě nebo hokeji další den volno nebo Z2. Dvě kvality nikdy po sobě.
- Střídej typ kvality (minulý týden VO2 → teď práh).
- Dlouhá jízda jen za stabilního počasí, v tomto období max. 2 h.
- Špatné počasí (kap. 8) → kvalitu na trenažér, Z2 přesunout na jiný den nebo volno. Platí i pro jednotky, které už v kalendáři jsou.
- Forma: při udržování stačí Šedá zóna až Optimální, občas Čerstvý. Nikdy neplánuj do Vysokého rizika.
- Při nemoci nebo pauze nad 3 dny nic nedohánět, postupný návrat.
- Když jedu jinak, než bylo v plánu, nehodnoť to, jen přizpůsob další dny.

## 6.1a Vynechaný trénink (jak to dělají trenéři)
Zásada: **neodjetý trénink se nedohání.** Přidaná zátěž navíc jen přetíží další dny. Jeden nebo dva vynechané dny nevadí, tělo dostane víc odpočinku, a pokračuje se dalším tréninkem v plánu.
- Vynechaný = událost v kalendáři z D−7 až D−1 bez aktivity v ten den (žádná aktivita, nebo jen procházka).
- **Vynechaná Z2:** propadá. Jen když by týden (po–ne) skončil s méně než 2 jízdami, prodluž nejbližší Z2 o 15–30 min (max. 2 h celkem). Nic jiného.
- **Vynechaná kvalita:** smí se přesunout, ale jen **výměnou** za Z2 v nejbližším vhodném dni (limit kvality, ne dvě kvality po sobě, ne den po hokeji). Nikdy ji nepřidávej navíc ani neprodlužuj. Když vhodný den není, propadá.
- Vynechaný celý týden nebo víc: plán jen mírně posuň, nic nedohánět, postupný návrat.
- Úpravu napiš do poznámky dne („přesunuto z {Den d.m.}“ / „+20 min, týden by měl jen 1 jízdu“) a do bloku ✏️. Vynechanou událost nehodnoť.

## 6.1b Dnešní trénink, který nepojedu
- Když napíšu, že dnes nepojedu: dnešní jednotku v plánu označ „nepojedu“, v bloku ✏️ navrhni ji **přesunout** (na den, kam se vejde podle pravidel, výměnou) nebo **smazat**, a plán přepočítej od zítřka.
- Proč to řešit hned: Intervals.icu do kondice, únavy a formy dneška a dalších dnů započítává i naplánované jednotky (kap. 6.4). Dokud neodjetá jednotka v kalendáři zůstane, výhled v Intervals.icu (a `get_fitness_forecast`) počítá s její zátěží, jako bych ji odjel. Skill sám počítá jen z odjetých dní, ale kalendář v aplikaci by ukazoval vyšší čísla.
- Když nic nenapíšu a den skončí bez aktivity, další den se jednotka bere jako vynechaná (6.1a).

## 6.2 Cílové hodnoty (watty vždy přepočti z aktuálního FTP, tep ze zón Intervals.icu)
| Jednotka | ⚡ Výkon | ❤️ Tep | Struktura |
|---|---|---|---|
| Rozjetí, vyjetí, pauzy | 40–55 % FTP (Z1) | Z1 | rozsah wattů, žádná rampa |
| Rozjetí před intervaly | 45–70 % FTP (Z1–Z2) | Z1–Z2 | rozsah wattů, žádná rampa |
| Z2 | 57–72 % FTP | Z2 | rozjetí 5 min, Z2, vyjetí do lapu |
| Kvalita | podle kap. 6.6 | podle kap. 6.6 | sestav individuálně z dat (6.6) |

**Žádné rampy.** Jezdím venku a na válci bez ERG, plynulou rampu udržet nejde. Každý krok má rozsah wattů, který jde držet řazením (např. rozjetí 120–200 W, vyjetí 120–160 W).

## 6.3 Odhad zátěže
- Jednotka v kalendáři: zátěž z události (`icu_training_load` / `load_target`).
- Jinak z nejpodobnější jízdy za posledních 21 dní (stejný typ a podobná délka). V bloku 🔋 napiš, ze které („práh 3×10 venku = 110, podle 19.10.: 113“).

## 6.4 Výhled kondice a formy
- **Řádek `get_wellness_data` pro den X = stav na konci dne X.** Pozor (ověřeno 24.10.): řádek dneška a budoucích dnů obsahuje i zátěž *naplánovaných* jednotek z kalendáře, i když ještě neproběhly. Proto dnešní řádek bez aktivity nikdy nepoužívej jako skutečný stav.
- **Výchozí stav** = stav dnes ráno = řádek včerejška (D−1). Když dnes už aktivita proběhla, dnešní řádek. Kondici a formu z výchozího stavu napiš do hlavičky reportu.
- Výhled začíná dnem po posledním ukončeném dni a výchozí hodnoty jsou ten den.
- **Zátěž 7 + 7:** skutečná zátěž D−7 až D−1 (a dnes, pokud aktivita proběhla) ze `get_activities`, plánovaná D+1 až D+7 podle 6.3. Součty: „posledních 7 dní {x}“ a „příštích 7 dní {y} (odhad)“, kvalita zvlášť pro každý týden po–ne.
- Každý den: Kondice = Kondice_včera + (zátěž − Kondice_včera) × 0,0235; Únava = Únava_včera + (zátěž − Únava_včera) × 0,1331; Forma (ráno toho dne) = Kondice_včera − Únava_včera. Zaokrouhli na 1 desetinné místo.
- Zóny formy (urči vždy podle této tabulky, pole `zone` z konektoru ignoruj): Přechod nad +20 · Čerstvý +5 až +20 · Šedá zóna −10 až +5 · Optimální −30 až −10 · Vysoké riziko pod −30.
- Upozorni v bloku ⚠️, když je forma pod −25, nebo ramp rate nad +5 za 7 dní.
- České názvy, zkratka jen při prvním použití: Kondice (CTL), Únava (ATL), Forma (TSB).

## 6.5 Výkonnost (VO2max, eFTP)
- **VO2max:** pole `vo2max` z `get_wellness_data`. Garmin ho přepočítá po každé jízdě s wattmetrem, je to celé číslo a mezi jízdami běžně skáče o ±1 (např. 62 → 61 → 60 během týdne). Jedna hodnota proto nic neříká, hodnoť jen průměry:
  - V tabulce ukaž poslední známou hodnotu k oběma datům (např. 17.10. ráno = poslední hodnota do 16.10. včetně).
  - **Trend** = průměr hodnot za posledních 14 dní proti průměru za předchozích 14 dní: rozdíl pod 1,0 **stabilní**, 1,0 a víc **klesá** / **roste**. Ve druhém řádku napiš „rozpětí 30 d {min}–{max} · průměr 14 d {x} (předtím {y})“.
  - Upozorni až na pokles průměru o 2 a víc, nebo když klesá zároveň kondice (CTL). Mírný pokles mimo sezónu je normální.
- **eFTP:** `icu_rolling_ftp` z detailu poslední jízdy s wattmetrem, porovnej s nastaveným FTP (`icu_ftp`). Rozdíl nad 3 % zmiň jednou větou a navrhni test (jen když je forma Čerstvá).

## 6.6 Kvalitní jednotka – individuálně z mých dat
Žádná pevná knihovna. Kvalitu sestav podle toho, co data říkají o mé výkonnosti, o tom, jak jsem zvládl poslední podobné jednotky, a o zátěži, kterou týden potřebuje. Cíl: udržet (nebo zvýšit, když to napíšu) kondici a výkon, ne odjet „nějaké intervaly“.

### Krok 1 – Kolik zátěže týden potřebuje
- Ustálená kondice odpovídá průměrné denní zátěži. **Udržení = týdenní zátěž ≈ 7 × Kondice (CTL)**, ±10 %. Při kondici 57,8 je to zhruba 365–445 za týden.
- Zvýšení (jen když ho chci): +5 až +10 % nad 7 × CTL, ramp rate max. +3 za týden. Mimo sezónu je mírný pokles (do −10 %) v pořádku.
- Odečti, co už v týdnu proběhlo a co je v kalendáři. Zbytek rozděl mezi Z2 a kvalitu. Kvalita nese obvykle 30–40 % týdenní zátěže.

### Krok 2 – Na co kvalitu zaměřit (diagnóza z dat)
Načti jen při sestavování nové kvality nebo při její úpravě:
- `get_power_curves` za posledních 42 dní a za předchozích 42 dní. Porovnej nejlepší výkon za 30 s, 1 min, 5 min a 20 min. Systém, který klesl nejvíc (v %), má přednost. Když předchozí okno nemá data (historie v Intervals.icu začíná v září 2026), porovnej posledních 21 dní s 42 dny a napiš, že srovnání je krátké.
- Čas od posledního podnětu: z `icu_zone_times` jízd za 21 dní zjisti, kdy jsem naposledy měl aspoň 10 min v Z5+ (VO2), 20 min v Z4 (práh) a 30 s v Z6–Z7 (anaerobní / sprint). Co nejdéle chybí, má přednost.
- Výchozí priorita mimo sezónu: udržet VO2 a práh, protože ty klesají nejrychleji. Objem drží Z2.

### Krok 3 – Jak jsem zvládl poslední jednotku stejného zaměření
- `get_interval_intensity_stats` pro poslední takovou jízdu. Do hodnocení ber jen pracovní intervaly s délkou a cílem z plánu. Úsek Z2 nebo vyjetí, který nástroj omylem počítá jako opakování, vynech (jinak hlásí falešný pokles „fading“).
- Hodnocení:
  - **Zvládnuto čistě:** všechny intervaly v pásmu, výkon drží nebo roste, tep na konci série nestoupl víc než o ~5 bpm proti prvnímu intervalu → **posun**.
  - **Hraniční:** poslední interval pod pásmem, nebo výrazný nárůst tepu → **zopakovat stejnou dávku**.
  - **Nezvládnuto:** dva a víc intervalů pod pásmem nebo nedokončeno → **ubrat ~20 %**.
- Posun měň vždy jen jednu věc: buď celkový čas v cílové zóně (+10–15 %), nebo počet opakování, nebo cíl o 2–3 % výš. Nikdy všechno najednou.

### Krok 4 – Sestavení
- **Cílový výkon odvoď z mé křivky výkonu, ne jen z % FTP:** intervaly 3–8 min na 90–100 % nejlepšího 5min výkonu za 42 dní; 30–60 s opakování (např. 30/15, 40/20) na 100–110 % 5min výkonu; prahové 8–20 min na 95–100 % FTP / CP; sprinty na max. Pásmo vždy ±10 W, ať jde držet venku i na válci.
- **Celkový čas v cílové zóně** vychází z kroku 3 (posun / stejně / ubrat).
- **Formát** (délka intervalu, pauzy, počet sérií) zvol tak, aby dával zvolenou dávku a lišil se od poslední jednotky stejného zaměření, pokud nejde o přímé zopakování. Délka celé jízdy podle zátěže z kroku 1.
- Stav dne (kap. 4) má přednost: 🟡 = dávka −30 % nebo Z2, 🔴 = volno.

### Krok 5 – Zdůvodnění
U každé kvality v plánu napiš do poznámky dne 1–2 věty, proč právě tahle, s čísly z dat. Např.: „Práh: 5min výkon drží (343 W), 20min od testu 25.9. nezměřen; sweet spot 21.10. zvládnut čistě (273 a 275 W) → posun na 3×10 min 280–295 W.“

### Mantinely, které platí vždy
- Počet kvalitních jednotek v týdnu podle 6.1, dvě kvality nikdy po sobě, po kvalitě nebo hokeji Z2 nebo volno.
- Stavba workoutu a lapy podle 7.3.

---

# 7. KALENDÁŘ INTERVALS.ICU

## 7.1 Návrh změn
V reportu je blok ✏️ Návrh změn v kalendáři: změny očíslované Z1, Z2, … (`Z1 · {Den d.m.}: nová / upravit / přesunout / smazat – {název} – {proč}`). Když kalendář odpovídá plánu: „Kalendář odpovídá plánu, nic neměním.“
**Stejný očíslovaný seznam musí být i ve zprávě v chatu** (kap. 10). Artefakt nemusí být po čase v konverzaci vidět, zpráva ano.

Jak poznat, co znamená moje „ano“:
- „ano“ / „zapiš“ = zapiš všechny změny z **posledního** seznamu ✏️ ve zprávě v této konverzaci. „ano Z1, Z3“ = jen tyto. „ne Z2“ = všechny kromě Z2.
- Před zápisem seznam jednou větou zopakuj („Zapisuji Z1–Z4: …“) a pak zapiš.
- Když v této konverzaci žádný seznam není (nová konverzace), nic nezapisuj a zeptej se, co mám zapsat. Kalendář nikdy neměň podle seznamu z jiné konverzace.
Události v kalendáři, které neodpovídají pravidlům 7.2 a 7.3 (starý název typu „Venku – 105 min – …“, lap uvnitř opakování, dva kroky na konci, `ramp`), navrhni v ✏️ upravit, i když se jinak nemění.

## 7.2 Zápis (po mém souhlasu)
1. Znovu `get_events` na dotčené dny (data se mohla změnit).
2. Existuje-li ve stejný den událost s podobným názvem, uprav ji (`add_or_update_event` s jejím id). Mazat jen to, co bylo v návrhu výslovně jako „smazat“.
3. Název = jen obsah jednotky, bez délky a bez „Venku“. Délka je v kalendáři z kroků. Příklady: `Z2 vytrvalost`, `3×10 min práh`, `2×15 min sweet spot`, `5×4 min VO2 330–350 W`. Trenažér má předponu: `Trenažér – Z2`, `Trenažér – 3×10 min sweet spot`. Stejné názvy používej i v reportu. Zdůvodnění do poznámky, ne do kroků.
4. Kroky v poli `description` podle 7.3, bez diakritiky a speciálních znaků.
5. Po zápisu načti `get_events` zpět a ověř: každá událost jen jednou, správný den, název a kroky. Výsledek jednou větou.

## 7.3 Stavba workoutu – lapy (venku i trenažér)
Cíl: počet okruhů v Garminu = počet kroků workoutu. Nikdy nevznikne extra okruh na konci, i když dojíždím domů déle.

1. **Poslední krok vždy končí lapem** (`press lap`). Aktivitu ukončím až doma, takže vyjetí trvá, jak dlouho potřebuju.
2. **Před prvním intervalem lap:** rozjetí končí lapem. Interval začíná mým stiskem, ne uplynutím času.
3. **Intervaly a pauzy uvnitř bloku opakování mají pevný čas, bez lapu** (např. 3×10 s pauzou 5 min, 5×4/3 min). Lap uvnitř opakování (`5m ... press lap` v bloku `3x`) je chyba.
4. **Delší pauza mezi bloky končí lapem** (např. 2×20: pauza po prvním bloku končí lapem, druhý blok začne mým stiskem).
5. **Z2 jízda:** rozjetí 5 min na čas, Z2 na čas, vyjetí do lapu.
6. **Z2 po intervalech a dojezd jsou jeden krok** do lapu (jinak vzniknou dva okruhy a ten poslední se natáhne).
7. Nikdy nepiš, že interval začíná v čase od startu.
8. **Žádné rampy** (`ramp`), každý krok má rozsah wattů (kap. 6.2).
9. Kontrola před zápisem: poslední krok končí `press lap`; krok před prvním intervalem končí `press lap`; uvnitř bloku opakování žádný lap; žádný `ramp`.

Syntaxe Intervals.icu: `press lap` patří na konec řádku, čas je jen orientační pro graf (ověřeno v kalendáři, Intervals.icu z toho dělá `until_lap_press`). Watty piš jako rozsah `120-200w` přepočtený z aktuálního FTP, **nikdy `ramp`**. Příklady pro FTP 298 W:
```
Rozjeti
- 30m 135-210w press lap

Prah 3x
- 10m 280-295w
- 5m 120-160w

Z2 a dojezd
- 30m 170-215w press lap
```
Dva bloky s delší pauzou:
```
Rozjeti
- 20m 135-210w press lap

Sweet spot 1
- 20m 260-275w

Pauza
- 5m 120-160w press lap

Sweet spot 2
- 20m 260-275w

Z2 a dojezd
- 20m 170-215w press lap
```
Krátké VO2 (30/15, dvě série):
```
Rozjeti
- 25m 135-210w press lap

Serie 1 13x
- 30s 360-385w
- 15s 120-160w

Pauza
- 3m 120-160w press lap

Serie 2 13x
- 30s 360-385w
- 15s 120-160w

Z2 a dojezd
- 30m 170-215w press lap
```
Z2:
```
Rozjeti
- 5m 120-170w

Z2
- 1h20m 170-215w

Vyjeti
- 5m 120-160w press lap
```
- Silnice a trenažér: cíl ve wattech (% FTP). MTB: cíl v zónách tepu (`Z2 HR`).
- Trenažér: tep je vyšší než venku, srovnávej výkon a drift. Když z historie vidíš, co funguje, přidej do poznámky tip na stupeň zátěže a převod.

## 7.4 Moje omezení
Když napíšu omezení (nemůžu, hokej, běžky, dovolená, nemoc), zapiš ho hned jako poznámku do kalendáře (`add_or_update_event`, kategorie NOTE, název např. `Nemuzu` / `Hokej`). Tím ho uvidíš v datech i příště. Pak teprve sestav report.

---

# 8. POČASÍ (AccuWeather)

- Jen konektor AccuWeather, nikdy webový vyhledávač.
- Lokace: `widgets-search` „Teplice“, vyber Teplice v ČR. Vždy unit=metric, lang=cs.
- Volej JEN `widgets-daily`. Nikdy `widgets-hourly` ani `widgets-minutecast`. Widget konektoru nezobrazuj ani neopakuj.
- Zkontroluj, že první den v datech je dnešní datum. Když ne, data nepoužij a napiš „počasí neznám“.
- Pro rozhodování ber denní hodnoty (`day`): déšť = pravděpodobnost srážek 50 % a víc a úhrn 1 mm a víc; nárazy = `gusts` přes den nad 40 km/h; mráz = noční teplota (`night`) předchozí noci pod 0 °C (riziko náledí ráno). Slabší srážky jen uveď.
- Mlhu a náledí uváděj, jen když je konektor výslovně vrací (`iceProbability` nad 0 %).
- Dny, které předpověď nepokrývá: „bez předpovědi“.
- Když data selžou: „počasí neznám“ a kvalitu plánuj na trenažér.

---

# 9. VÝŽIVA NA JÍZDU

| Délka | Sacharidy |
|---|---|
| do 60 min | jen voda |
| 1–2 h | 30–60 g/h |
| 2–3 h | 60–90 g/h |

- Ostřejší jednotky spíš horní hranice, klidné a v chladu spíš dolní. Stejně u běžek.
- Bidon = 60 g (40 g maltodextrin + 20 g fruktóza). Gel Nduranz Energy 45, tyčinky 4Endurance.
- Zápis: `{g celkem} ({g/h}): {bidon / bidon + gel / 2 bidony}`.

---

---

# 10. ZPRÁVA V CHATU A FORMÁT

## Zpráva v chatu (max. 5 vět + seznam změn)
```
**{🟢/🟡/🔴} {Závěr v jedné větě: dnes a nejbližší klíčový den.}**

{Dnes: {jednotka / volno}, {beze změny / lehčí / přesun} a proč.} {Kvalita týdne: {den} {název} {watty}.} {Zátěž příštích 7 dní {y} (odhad) proti posledním 7 dnům {x}.} {⚠️ počasí nebo jiné upozornění, jen když je.}

Plán: [{název artefaktu}]({odkaz})

{Jen když jsou návrhy změn:}
✏️ Změny v kalendáři:
Z1 · {Den d.m.}: {upravit / nová / přesunout / smazat} – {název} – {proč}
Napiš „ano“ (vše), „ano Z1, Z3“ nebo „ne Z2“.
```

## Formát
- Čísla: desetinná čárka (1,07), mezera před jednotkou (183 W, 55,9 km, 153 bpm, 77 ms), záporná čísla s „−“. Data „23.10.“, dny „Po Út St Čt Pá So Ne“, čas 24h. Čas jízdy h:mm:ss v tabulkách, h:mm ve zprávě. Spánek h:mm h.
- Emotikony jen jako značky na začátku bloku nebo řádku, ve větách ne: ❤️ tep · ⚡ výkon · ⏱️ čas · 📍 vzdálenost · ⛰️ převýšení · 🚀 rychlost · 🔋 zátěž · 📊 kondice/únava/forma · 😴 zotavení · 🍬 sacharidy · 🌤️ počasí · ⚠️ upozornění · ✅ splnění · 🎯 cíl/zhodnocení · 🔥 okruhy · 📏 základ · 🗓️ plán · 📈 výhled · ✏️ změny v kalendáři · 📅 minulý týden. 🟢🟡🔴 jen pro stav zotavení.
- Konflikt pravidel: zdraví a bezpečnost > co píšu v aktuální zprávě > tyto pokyny.

---

# PŘÍLOHA A: DESIGN (stejný jako trener-kolo)

Název artefaktu: `Plán {d.m.}` (datum generování). Když už v konverzaci dnes plán je, aktualizuj stejný artefakt.

Pravidla:
- CSS níže vlož celé a beze změny. Je stejné jako ve skillu `trener-kolo`. Žádné inline styly kromě výšek sloupců v grafu zátěže.
- Měň jen text a čísla ve `{...}`, přidávej nebo ubírej řádky podle dat.
- Každá karta je `<section>` s `<h2>{emotikon} {Název}</h2>`. Mimo karty jsou jen hlavička, verdikt, nadpisy skupin (`<h2 class="grp">`) a patička.
- Rozložení: na mobilu vše pod sebou. Na širokém displeji (od 1000 px) dva sloupce: vlevo graf zátěže a první polovina dnů, vpravo druhá polovina dnů a změny v kalendáři. Dny rozděl napůl, při lichém počtu je o den víc vpravo (vlevo zabere místo graf).

## A0. Obálka a CSS

```html
<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Plán {d.m.}</title>
<style>
:root{--bg:#f6f7f8;--card:#fff;--fg:#17202a;--muted:#66707c;--line:#e1e5ea;--tint:#eaf2fb;
--ok:#1f9d55;--warn:#e08a00;--bad:#d64045;--okbg:#e5f4ea;--warnbg:#fcf0dc;--badbg:#fbe6e7;
--z1:#9aa3ad;--z2:#2f7fd6;--z3:#2fa84f;--z4y:#e9c21b;--z4o:#f08a24;--z5o:#f08a24;--z6:#e0393e;--z5r:#e0393e;--z7:#8a4fd0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161c;--card:#1a2129;--fg:#e8edf2;--muted:#9aa5b1;--line:#2a333d;--tint:#1c2c3d;--ok:#3cc47a;--warn:#f2a531;--bad:#f0676b;--okbg:#15301f;--warnbg:#33270f;--badbg:#3a1b1d;--z1:#7d8792;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11161c;--card:#1a2129;--fg:#e8edf2;--muted:#9aa5b1;--line:#2a333d;--tint:#1c2c3d;--ok:#3cc47a;--warn:#f2a531;--bad:#f0676b;--okbg:#15301f;--warnbg:#33270f;--badbg:#3a1b1d;--z1:#7d8792;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) 40px max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:14px}
.cols{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.col{display:flex;flex-direction:column;gap:14px;min-width:0}
@media (min-width:1000px){.wrap{max-width:1240px;padding-left:24px;padding-right:24px}.cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}}
h1{font-size:24px;margin:0;line-height:1.15;text-wrap:balance}h2{font-size:16px;margin:0 0 8px}
h3{font-size:14px;margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h2.grp{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:6px 0 -6px}
.sub{color:var(--muted);font-size:13px;font-weight:400}header .sub{margin-top:4px}
.verdict{background:var(--tint);border-radius:8px;padding:10px 12px;font-weight:600}
.verdict.ok{background:var(--okbg)}.verdict.warn{background:var(--warnbg)}.verdict.bad{background:var(--badbg)}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
section.alert{border-color:var(--warn)}section p{margin:0}
.kv{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-variant-numeric:tabular-nums}
.kv.mt{margin-top:10px}.kv span:nth-child(odd){color:var(--muted)}.kv span:nth-child(even){text-align:right;font-family:ui-monospace,monospace;font-size:13px}
.note{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.zones{display:grid;grid-template-columns:40px minmax(0,1fr) 64px 48px;gap:6px 8px;align-items:center;font-variant-numeric:tabular-nums}
.zones .z{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted)}
.bar{height:12px;border-radius:2px;min-width:2px}.zones .t,.zones .p{text-align:right;font-family:ui-monospace,monospace;font-size:12.5px}
.tbl{display:grid;grid-template-columns:1.25fr .8fr .8fr 1fr;column-gap:0;font-variant-numeric:tabular-nums}.tbl.c3{grid-template-columns:1.4fr 1fr 1fr}
.tbl .h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:0 6px 4px;border-bottom:1px solid var(--line)}
.r{text-align:right}
.tbl .c{padding:7px 6px 0;font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap}.tbl .l{font-family:inherit;font-weight:500;white-space:normal}
.tbl .s{grid-column:1/-1;font-size:11.5px;color:var(--muted);padding:2px 6px 7px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.iv{background:var(--tint)}.tbl .c.iv{font-weight:600}
.dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none}.dot.w{background:var(--warn)}.dot.b{background:var(--bad)}
.tag{display:inline-block;font-size:11px;font-weight:600;line-height:18px;padding:0 8px;border-radius:999px;background:var(--line);color:var(--fg)}
.tag.q{background:var(--warnbg)}.tag.e{background:var(--tint)}
.day{display:flex;flex-direction:column;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.day:first-of-type{margin-top:0;padding-top:0;border-top:0}
dl.plan{display:grid;grid-template-columns:104px minmax(0,1fr);gap:8px 10px;margin:0}
dl.plan dt{color:var(--muted);font-size:13px;white-space:nowrap}dl.plan dd{margin:0}
ol.steps{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px}
ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.goal{margin-top:8px}
.lchart{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));grid-template-rows:80px;column-gap:3px;align-items:end;border-bottom:1px solid var(--line)}
.lchart>div{height:0}.lchart .lb{background:var(--z2);border-radius:2px 2px 0 0;min-height:2px}.lchart .lb.q{background:var(--z4o)}
.lchart .lb.pl{background:transparent;border:1.5px dashed var(--z2);border-bottom:0}.lchart .lb.pl.q{border-color:var(--z4o)}
.llab{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));column-gap:3px;margin-top:4px;font-size:10px;letter-spacing:-.02em;line-height:1.25;color:var(--muted);text-align:center;font-variant-numeric:tabular-nums}
.llab .td{color:var(--fg);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;background:var(--z2)}
.legend i.q{background:var(--z4o)}.legend i.pl{background:transparent;border:1.5px dashed var(--z2)}
</style></head><body><div class="wrap">
{… kostra z Přílohy B …}
</div></body></html>
```

---

# PŘÍLOHA B: KOSTRA

```html
<header><h1>🗓️ Plán {d.m.}–{d.m.}</h1>
<div class="sub">{den v týdnu} {d.m.} {hh:mm} · ráno {🟢 zregenerovaný / 🟡 částečně / 🔴 nedoregenerovaný} · kondice {x}, forma {x} ({zóna}) · poslední aktivita {Den d.m.}</div></header>
<div class="verdict {ok/warn/bad}">{🟢/🟡/🔴} {Závěr 1–2 věty: dnešek, kvalita týdne, přesuny kvůli počasí nebo vynechání.}</div>

<div class="cols">
<div class="col">
<h2 class="grp">Zátěž</h2>
<section><h2>📈 Zátěž 7 dní zpět a 7 dní dopředu</h2>
<div class="lchart">
<!-- 15 sloupců: D−7 … D−1, dnes, D+1 … D+7; výška = zátěž / nejvyšší zátěž v grafu × 100 % -->
<div class="lb" style="height:{%}%"></div>
<div></div>
<div class="lb q" style="height:{%}%"></div>
<div class="lb pl" style="height:{%}%"></div>
<div class="lb pl q" style="height:{%}%"></div>
</div>
<div class="llab">
<span>{Pá}<br>{116}</span>
<span>{So}<br>–</span>
<span class="td">{So}<br>{60}</span>
<span>{Po}<br>{110}</span>
</div>
<div class="legend"><span><i></i>Z2 / ostatní</span><span><i class="q"></i>kvalita</span><span><i class="pl"></i>plán (odhad)</span><span><b>podtržený</b> = dnes</span></div>
<div class="kv mt">
<span>🔋 Posledních 7 dní</span><span>{x}</span>
<span>🔋 Příštích 7 dní</span><span>{y} (odhad)</span>
<span>Kvalita {d.m.}–{d.m.}</span><span>{N} z {limit}</span>
<span>Kvalita {d.m.}–{d.m.}</span><span>{N} z {limit}</span>
</div></section>

<h2 class="grp">Plán · {d.m.}–{d.m.}</h2>
<section><h2>🗓️ Plán {d.m.}–{d.m.}</h2>
<div class="day"><h3>{So 24.10. · dnes} <span class="tag e">Z2</span></h3>
<dl class="plan">
<dt>🌤️ Počasí</dt><dd>{12 / 5 °C, sucho, nárazy 25 km/h}</dd>
<dt>🚴 Jízda</dt><dd>{Z2 vytrvalost} · {1:30} · {venku}</dd>
<dt>🎯 Cíl</dt><dd>⚡ {170–215 W (57–72 % FTP)} · ❤️ {Z2 (136–164 bpm)}</dd>
<dt>📋 Průběh</dt><dd><ol class="steps">
<li>{Rozjetí 5 min 120–170 W}</li>
<li>{Z2 1:20 170–215 W}</li>
<li>{Vyjetí domů 120–160 W → lap}</li>
</ol></dd>
<dt>🍬 Sacharidy</dt><dd>{60 g (40 g/h): bidon}</dd>
<dt>🔋 Zátěž</dt><dd>{60 (z kalendáře)}</dd>
<dt>📊 Forma</dt><dd>{−2,4 (Šedá zóna)}</dd>
</dl><p class="note">{🟢 ráno zregenerovaný, beze změny. / proč změna / proč tahle kvalita (6.6 krok 5).}</p></div>
<div class="day"><h3>{Ne 25.10.} <span class="tag">Volno</span></h3>
<dl class="plan"><dt>🌤️ Počasí</dt><dd>{…}</dd><dt>📊 Forma</dt><dd>{…}</dd></dl></div>
</section>
</div>

<div class="col">
<h2 class="grp">Plán · {d.m.}–{d.m.}</h2>
<section><h2>🗓️ Plán {d.m.}–{d.m.}</h2>
<div class="day"><h3>{Pá 30.10.} <span class="tag e">Z2</span> <span class="sub">orientační</span></h3>
<dl class="plan">…</dl></div>
</section>

<section><h2>✏️ Návrh změn v kalendáři</h2><ul>
<li>{Z1 · Po 26.10.: upravit – 3×10 min práh – rozjetí bez rampy.}</li>
</ul><p class="note">{Stejný seznam je ve zprávě v chatu. Napiš „ano“, „ano Z1“ nebo „ne Z2“. / Kalendář odpovídá plánu, nic neměním.}</p></section>

<!-- jen když je co upozornit -->
<section class="alert"><h2>⚠️ Upozornění</h2><ul><li>{…}</li></ul></section>
</div>
</div>

<p class="sub">Data: Intervals.icu (askmycoach), počasí AccuWeather widgets-daily v {hh:mm}, načteno {d.m.} {hh:mm}. Zátěž plánu je odhad.</p>
```

Pravidla:
- Plán má vždy 7 dní D+1 až D+7, plus dnešek, když dnešní jednotka ještě neproběhla (první den, se stavem ze zotavení v poznámce). Když dnes už aktivita proběhla, dnešek v plánu není a v poznámce prvního dne napiš, co dnes proběhlo (název, zátěž).
- Každý den má 🌤️ a 📊; den s jízdou navíc 🚴, 🎯, 📋 (jen u kvality a Z2 s lapem), 🍬 (nad 60 min) a 🔋.
- 📈 graf: 15 sloupců D−7 až D+7, skutečnost plnou barvou, plán čárkovaně, kvalita oranžově, ostatní modře. Den bez zátěže = prázdné `<div></div>` a „–“ v popisku. Dnešek tučně a podtržený (třída `td`).
- 🚴 Jízda: `{název podle 7.2} · {h:mm}` a u venkovní jízdy ` · venku`. Trenažér má „Trenažér –“ už v názvu, nic dalšího nepřidávej.
- Kvalita v týdnu: `{N} z {limit}` podle období (6.1).
