# Knihovna kvalitních tréninků

Jak trenér vybírá a dávkuje kvalitní jednotky (intervaly), jak zohledňuje regeneraci a co platí pro ostatní sporty.
Odpovídá kódu v `src/core/qualityDesign.ts`, `src/core/plan.ts`, `src/core/quality.ts`, `src/core/recovery.ts`,
`src/core/workout.ts` (stav k 7. 11. 2026, FTP 298 W, zóny tepu Z1 < 135, Z2 135–164, Z3 165–183, Z4 184–201, Z5 ≥ 202).

## 1. Druhy kvality a cílový výkon

| Zaměření | Co rozvíjí | Cílový výkon (pásmo vždy ±10 W) | Při FTP 298 |
|---|---|---|---|
| **VO2** (3–5 min úseky) | maximální aerobní výkon, VO2max | 95 % nejlepšího 5min výkonu za 42 dní (bez dat 112 % FTP) | podle křivky, typicky ~325–345 W |
| **VO2 30/15** (krátké úseky) | VO2max + anaerobní kapacita, „rychlost nohou“ | 105 % 5min výkonu (bez dat 120 % FTP) | ~345–365 W |
| **Práh** (8–20 min) | laktátový práh, FTP | 97 % FTP | 280–300 W |
| **Sweet spot** (12–20 min) | práh s menší únavou, objem pod prahem | 91 % FTP | 260–280 W |
| **Tempo** | jen rozpoznání odjetých jízd, plán ho nenavrhuje | 82 % FTP | – |

Cíl se bere z **křivky výkonu**, ne jen z % FTP: když 5min výkon roste, rostou i watty VO2 intervalů.

## 2. Žebříček dávek (čas v cílové zóně roste odspodu nahoru)

**VO2**: 4×3 · 5×3 · **4×4** (start) · 5×4 · 6×4 · 5×5 · 6×5 min, pauza 3–4 min.
4×4 min je výzkumem ověřený protokol (Tier 1), ostatní formáty jsou jeho úpravy.

**Práh**: 2×10 · 3×8 · **3×10** (start) · 2×15 · 3×12 · 2×20 min, pauza 4–5 min.

**Sweet spot**: 2×12 · **2×15** (start) · 3×12 · 2×20 · 3×15 min, pauza 5 min.

**VO2 30/15**: 2×10 · 2×12 · **2×13** (start) · 3×10 · 3×12 opakování 30 s práce / 15 s volně, mezi sériemi 3 min.

Stavba jednotky: rozjetí 25 min venku / 15 min na trenažéru (končí stiskem lapu) → intervaly → u dvou dlouhých
bloků delší pauza 5 min (lapem) → „Z2 a dojezd“ do zbytku plánované délky (lapem). Lapy platí jen pro kolo (7.3).

## 3. Výběr zaměření (krok 2)

Skóre každého zaměření:
- **pokles výkonu** na rozhodující délce (5 min pro VO2, 20 min pro práh a sweet spot, 30 s a 1 min pro 30/15),
  posledních 42 dní proti předchozím 42 dnům, váha ×2 (sweet spot ×1,5),
- **dny od posledního podnětu** v dané zóně (max. 21 dní): čím déle, tím vyšší priorita.

Pravidla pestrosti:
- ne stejné zaměření jako minulý týden,
- ne stejné jako jiná kvalita v posledních ~10 dnech (odjetá i už naplánovaná),
- mimo sezónu (říjen–únor) jen VO2, práh a 30/15 (sweet spot ne – v zimě kvalita drží intenzitu, objem klesá).

## 4. Dávka podle minulé jednotky stejného zaměření (krok 3)

Hodnotí se lapy poslední jednotky stejného zaměření (jen pracovní úseky ±25 % délky z plánu):

| Výsledek | Kdy | Co dál |
|---|---|---|
| **posun** | všechny úseky v pásmu, výkon v posledním ≥ 98 % prvního, tep stoupl ≤ 5 bpm | o stupeň výš (jiný formát se stejným nebo vyšším časem v zóně) |
| **zopakovat** | poslední úsek pod pásmem, nebo tep +8 bpm a víc, nebo výkon nedržel | stejná dávka |
| **ubrat** | nedokončeno, nebo 2+ úseky pod pásmem | ~ −20 % času v zóně |
| **nové** | žádná předchozí jednotka nebo nebyla v plánu | výchozí stupeň (tučně výše) |

Cíl tréninku mění progresi:
- **Zlepšit**: posun podle tabulky,
- **Udržet**: místo posunu jen zopakovat,
- **Řízený pokles**: dávka −30 % a o jízdu méně týdně.

## 5. Regenerace a stav (kap. 4) – jak mění dnešek

Ranní semafor z VST, klidového tepu a spánku proti tvé 60denní normě (průměr ± SD):
- 🟢 **zregenerovaný** – jednotka beze změny,
- 🟡 **částečně** – kvalita se mění na Z2, Z2 zkrácena o třetinu (min. 45 min); dávka kvality, pokud zůstane, −30 %,
- 🔴 **nedoregenerovaný** – volno nebo Z1 do 45 min.

Další pravidla:
- den po hokeji, dlouhých běžkách nebo zátěži nad 120 se jeden 🟡 (VST nebo tep) nepočítá (očekávaná reakce),
- VST pod normou dva dny po sobě = 🟡 i bez dalšího důvodu,
- po nemoci 2 dny jen Z2 do 60 min, nic se nedohání.

## 6. Týdenní rámec

- **Limit kvality**: březen–září 2× týdně, říjen–únor 1× týdně; hokej se počítá jako kvalita.
- Ne dvě kvality po sobě, ne den po hokeji.
- Preferované dny kvality: út, st, čt, so, pá, po, ne (v tomto pořadí).
- **Týdenní zátěž**: Udržet 7 × CTL ± 10 %, Zlepšit +5 až +10 % (max. ramp +3 CTL/týden), Pokles −10 až −20 %.
  Navíc nejvýš +10 % proti běžnému týdnu a po 3 týdnech růstu lehčí týden (−30 %).
- Vynechaná kvalita se v tomtéž týdnu přesune výměnou za Z2; vynechaná Z2 se nedohání (jen když by týden měl 1 jízdu, +20 min k nejbližší Z2).
- Výhled formy: varování pod −25 a při vstupu do „Vysokého rizika“ (< −30).

## 7. Počasí

- Kvalita při špatném počasí nebo v zimě bez dobrého okna → trenažér.
- Z2 při špatném počasí → přesun na volný den téhož týdne s dobrým počasím, jinak trenažér 2/3 délky.
- Den, který sis sám zvolil (sport / volno), se kvůli počasí nepřesouvá – jen upozornění.
- „Vhodná hodina“: srážky ≤ 30 %, nárazy ≤ 40 km/h, pocitově ≥ 3 °C; okno = nejlepší 3 hodiny po sobě.

## 8. Ostatní sporty (náhrada kola)

| Sport | Z2 | Kvalita | Pravidla |
|---|---|---|---|
| **Běh** | 10 min Z1 rozběh, Z2 tep (135–164), 5 min Z1 | 15 min Z2 rozběh, 5×4 min Z4 tep (184–201), pauzy 3 min Z1, výklus | délka ≈ 60 % jízdy (30–75 min), **bez pravidla lapů** |
| **Běžky** | „pocitově lehce, ať se dá mluvit“ | „kvalita naplno – úseky do kopce, bez hlídání hodinek“ | bez struktury a bez zón (zima, hodinky pod bundou) |
| **Chůze** | vždy regenerace (Z1) | – (kvalitu chůzí nesplníš) | v plánu se nevybírá, jen přes Telegram |

## 9. Vyhodnocení po jízdě

- Splnění: % plnění z intervals.icu, u intervalů kolik úseků bylo v pásmu.
- Z2: aerobní drift (Pw:HR) pod 5 % dobrý, 5–8 % běžný, nad 8 % pozor (horko, únava, málo jídla).
- Decoupling 1. vs. 2. poloviny a výkon na konci Z2 (Pw:HR v Z2 × 164 bpm) – trend vytrvalosti.
- Tréninkové vyvážení (4 týdny, Garminovy body): nízká aerobní Z1–Z2 + půl Z3, vysoká aerobní půl Z3 + Z4,
  anaerobní Z5–Z7 (výkon nad 105 % FTP); optimum jako v Garmin Connect (podíl celkové zátěže: 29–62 % / 33–74 % / 11–33 %).
