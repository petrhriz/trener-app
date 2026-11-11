# Trenér v2 – posouzení zadání a návrh nového trenéra

## Kontext

Trenér je hlavní funkce aplikace, ale dnešní verze (`src/core/plan.ts`, 1136 řádků) plán skládá znovu při každém
otevření stránky jako klouzavých 7 dní. Proto se mění, dny nemají pevnou roli, „Řízený pokles“ pokles nepřinese
a sport i délky jsou ušité na vlastníka. Zadání `docs/trener-v2/README.md` (napsal slabší model) navrhuje
přestavbu podle 80/20 Endurance. Tento dokument je moje posouzení zadání a vlastní návrh. Kód začnu psát až po
schválení. Vzhled stránky se nemění.

Pevné vstupy, které držím: trenér je pro kohokoli s loginem, nic natvrdo podle vlastníka; data a zóny z Garminu,
z intervals.icu jen zátěž, kondice a zápis plánu; odpovědi z kap. 13 zadání.

---

## 1. Zóny: 80/20, nebo tvoje?

**Zůstávají tvoje zóny z Garminu (kolo 55–75–90–105–120–150 % FTP, tep podle Garminu).** Stupnici 80/20
nepřebírám.

| | Tvoje zóny (FTP 298 W, LTHR 196) | Stupnice 80/20 |
|---|---|---|
| Z2 výkon | 167–224 W (56–75 % FTP) | 209–247 W (70–83 % FTP) |
| Z2 tep | 135–163 bpm | 159–176 bpm (81–90 % LTHR) |
| Z1 tep | do 135 bpm | 141–159 bpm (72–81 % LTHR) |

Proč:

- 80/20 dělí intenzitu na „pod prvním prahem“ a „nad ním“. Jejich Z2 končí až těsně pod tímto prahem, takže
  horní polovina jejich Z2 je v běžném dělení **tempo (Z3)**. Je to strop lehké intenzity, ne cíl jízdy.
- Tři hodiny na 228 W dají zátěž asi 178, na 195 W asi 127. Lehké jízdy by stály o 40 % víc a při 3–10 h týdně
  by na kvalitní dny nezbyly síly.
- Tvoje pozorování (Z2 ve wattech = Z2 v tepu, práh ve wattech = Z4 v tepu) znamená, že FTP i LTHR máš
  nastavené dobře a obě stupnice u tebe sedí k sobě. To je lepší důkaz než cizí tabulka.
- Nic „ověřeného“ tím neměním. Jejich tréninky jsou postavené na prahu (FTP, LTHR), ne na číslech zón. Stačí
  je přeložit podle prahu: jejich Z1 → tvoje Z1, Z2 → Z2, X → Z3 (tempo), Z3 → Z4 (práh), Z4 → Z5 (VO2),
  Z5 → Z6.

Z 80/20 tedy beru **princip**, ne stupnici: většina času lehce (do vršku tvojí Z2), málo času intenzivně,
žádné „trochu rychlejší“ dny bez účelu, a stavbu jejich tréninků.

## 2. Je 80/20 správný model?

Jako kontrola ano, jako řídicí pravidlo ne. Při 3–10 h týdně vyjde „80 % lehce“ samo, když má týden 1–2
kvalitní dny a zbytek je Z2 (6 h týdně se dvěma kvalitami = asi 17 % času nad Z2). Hlídat procenta po týdnech
nedává smysl, jeden týden je moc krátký.

**Navrhuji model „rozpočet týdne + těžké dny“:**

1. Týden má rozpočet **hodin** (z tvého profilu) a z něj zátěž.
2. Týden má 0–2 **klíčové dny** (kvalita) podle hodin, období a únavy. Vše ostatní je Z1–Z2.
3. 80/20 je **pojistka**: plánovaný čas nad Z2 nejvýš 20 % týdne (25 % u týdnů pod 5 h), a ve Stavu uvidíš
   skutečné rozdělení za 28 dní z času v zónách z Garminu.

## 3. Co je v zadání špatně nebo slabé

| # | Zadání | Problém | Moje řešení |
|---|---|---|---|
| 1 | Zátěž týdne jen z cílové kondice (CTL) | Odporuje tvým hodinám. 3–4 h týdně v zimě unese kondici kolem 27–30, „pokles o 15 % z 45“ chce 38. Zadání ten rozpor neřeší. | Zátěž se počítá z trajektorie kondice a pak se **ořízne hodinami z profilu**. Když se cíl do hodin nevejde, trenér to řekne („se 3,5 h týdně kondice klesne asi na 29; na udržení 45 potřebuješ kolem 5,5 h“). |
| 2 | Fáze Base 1–3, Build 1–2, Peak podle Friela | Zbytečně složité pro člověka bez závodu. Zadání samo cituje, že detaily periodizace mají malý vliv. | Čtyři režimy: **Základ, Rozvoj, Udržování, Ladění** (jen se závodem). Bloky 3 týdny + 1 lehčí. |
| 3 | Pevná tabulka dnů (po volno, út kvalita…) | Tobě se hodí pá–so–ne, tabulka by dala kvalitu na úterý. S pravidlem „kvalita nikdy vedle dlouhého dne“ nejde pá–so–ne vůbec složit. | Malý **řešič týdne**: projde všechny kombinace dnů a rolí (je jich pár desítek) a vybere nejlepší podle tvých dnů, pravidel a počasí. |
| 4 | Kostra týdne se nemění, mění se jen obsah dnů | Správná myšlenka, ale chybí jak. Dnes se plán mění proto, že se počítá při každém otevření. | Plán je **uložený v databázi**. Přepočítá se jen při události (kap. 4.6). Otevření stránky nic nemění. |
| 5 | Knihovna 430 tréninků jako data | Zbytečné. Příloha sama popisuje rodiny vzorcem (N × minuty v zóně). | 9 rodin jako **žebříčky** (stupeň = minuty v cílové zóně). Navazuje na dnešní `LADDER`. |
| 6 | Postup podle RPE | RPE aplikace nesbírá. | Postup podle okruhů (výkon proti pásmu, nárůst tepu) a splnění z intervals.icu. Funkce `evaluatePast` už existuje. |
| 7 | Zotavení upraví jen dnešek | Chtěl jsi trenéra dynamického podle zotavení a předchozích tréninků. | Kvalita se při 🟡 **prohodí** s pozdějším lehkým dnem, ne jen zruší. Víc špatných rán nebo hluboká únava ubere zbytek týdne (kap. 4.5). |
| 8 | „Aktivita mimo plán není nikdy klíčový den“ | Tvrdá skupinová jízda je těžký den. Kvalita hned po ní je chyba. | Každá odjetá aktivita se zařadí jako lehká / těžká podle času v zónách (obecně, bez pravidel pro konkrétní sport). Těžká se počítá do klíčových dnů. |
| 9 | Výkonnostní cíl 120 km / 4 h přes regresi rychlosti | Vítr, skupina a málo dlouhých jízd udělají z odhadu šum. | Odkládám do poslední etapy a zjednodušuji (kap. 6, etapa 5). Jádro na tom nestojí. |
| 10 | v1 a v2 vedle sebe za přepínačem | Dvě verze = dvojí údržba. | v2 vrací **stejný tvar dat** jako v1, takže stránka, Telegram i zápis do kalendáře fungují beze změny. Přepínač jen na přechod, pak v1 smažu. |
| 11 | Chybí | Nový uživatel bez FTP, bez zón nebo bez intervals.icu. | Bez FTP kroky podle tepu, bez zón odhad z max. tepu, bez historie opatrný začátek 3 h týdně. |
| 12 | „AI návrh týdne“ zůstává | Uložený plán a AI, která týden skládá jinak, půjdou proti sobě. | **Ruším AI návrh týdne.** Zůstává „Řekni trenérovi“ (text → úpravy dnů) a přibude text → profil. |

## 4. Jak bude nový trenér fungovat

### 4.1 Profil (každý si nastaví sám)

Uložený jako `coach_profile` v nastavení. Ručně v Nastavení i větou přes AI.

- **Sporty**: hlavní sport (kolo / běh), vedlejší sporty zapnout a omezit (např. běh nejvýš 1× týdně, do 60 min,
  bez intervalů), běžky jen se sněhem (přepínač „je sníh“).
- **Mix po měsících**: podíl času vedlejších sportů (zima víc běhu). Jen běh = hlavní sport běh, kolo vypnuté.
- **Dny**: kdy trénuješ nejraději, kdy nemůžeš, den dlouhého tréninku (nebo automaticky).
- **Hodiny týdně** po obdobích (sezóna / zima / zima se sněhem), od–do. Trenér je bere jako pásmo.
- **Cíl**: Zlepšit / Udržet / Řízený pokles / Závod s datem.

Nový uživatel dostane profil odhadnutý z historie: nejčastější sport, obvyklé dny, medián hodin za 12 týdnů,
cíl Udržet.

### 4.2 Rozpočet týdne

1. Hodinové pásmo z profilu pro dané období.
2. Cílová kondice na konci týdne z trajektorie: Zlepšit +1,5 bodu týdně (1–3), Udržet 0, Pokles −1 týdně až
   na dno dané hodinami, Závod růst a pak ladění 10–14 dní. Trajektorie má **pevný začátek** (den, kdy jsi cíl
   nastavil), každý týden se porovná skutečnost a opraví se nejvýš polovina odchylky. Tím pokles opravdu nastane.
3. Zátěž týdne vzorcem ze zadání (`7 × (C_cíl − C_teď × 0,845) / 0,155`), přepočet na hodiny podle tvé
   vlastní zátěže za hodinu (medián za 60 dní, zvlášť sport a lehká / kvalitní jednotka).
4. Cyklus 3 + 1 u Zlepšit a Závod: lehčí týden = 65 % předchozího, v něm krátká ostrá jednotka nebo test FTP.
   Udržet a Pokles jedou rovně.
5. Pojistky: nejvýš +15 % proti běžnému týdnu, poměr 7/28 dní do 1,3, strop hodin z profilu.
6. **Únava ubírá** (nikdy nepřidává): forma pod −20, dvě a víc žlutých / červených rán za 5 dní, VST týdenní
   průměr pod normou, spánkový dluh → rozpočet ×0,9 nebo ×0,8 a nejvýš 1 klíčový den.

Klíčové dny: pod 4 h týdně 1; 4–7 h 1 (Základ) nebo 2 (Rozvoj); nad 7 h 2. Lehčí týden a Pokles 1 krátký.

### 4.3 Kostra týdne (po–ne)

Role dne: volno, lehký (Z1), vytrvalost (Z2), klíčový, dlouhý.

Tvrdá pravidla: dny, kdy nemůžeš; nejvýš 3 tréninky za sebou **i přes hranu týdne** (počítá se skutečný konec
minulého týdne); klíčový den ne den po klíčovém ani den po dlouhém; tvoje ruční úpravy platí.
Měkká (bodují se): tvoje oblíbené dny, dlouhý o víkendu nebo ve zvoleném dni, klíčový po volnu, 2 dny mezi
klíčovými, počasí pro dlouhou jízdu venku.

Sport dne: klíčový a dlouhý v hlavním sportu, vedlejší sporty do vytrvalostních dnů podle mixu a stropu.
Běh ne dva dny po sobě, dokud neběháš pravidelně. Běh roste nejvýš o 10 % týdně a nejdelší běh nejvýš 1,1×
nejdelšího za 4 týdny.

Délky: klíčový podle tréninku (60–90 min), dlouhý 30–35 % času týdne, zbytek rovnoměrně. Pak kontrola zátěže
a podílu času nad Z2.

### 4.4 Tréninky (žebříčky)

| Rodina | Cíl (tvoje zóny) | Kdy |
|---|---|---|
| Regenerace | Z1 | lehký den, 🔴 |
| Vytrvalost / Dlouhá | Z2 | pořád |
| Rychlý závěr | Z2 + 10–20 min Z3 na konci | Základ, dlouhý den |
| Tempo | 2×15 → 1×40 min Z3 (76–88 %) | Základ, zima |
| Sweet spot | 2×12 → 3×15 min (88–94 %) | Základ, Udržování |
| Práh | 3×8 → 2×20 min (95–100 %) | Rozvoj, Udržování |
| VO2 | 4×3 → 6×5 min (z 5min výkonu) | Rozvoj |
| VO2 30/15 | 2×10 → 3×12 opakování | Rozvoj |
| Krátké ostré | 6×1 min Z5 | lehčí týden, ladění, Pokles |

Běh má stejné rodiny podle tepu (tempo, práh v Z4, rovinky), intervaly jen když je máš v profilu povolené
a běháš pravidelně. Kroky dostanou watty (kolo) nebo **bpm ze zón Garminu** (běh, běžky, kolo bez wattmetru).
Postup o stupeň výš jen po čistě zvládnuté jednotce; po nezvládnuté stejný stupeň; po nemoci o 1–2 níž.
Uloženo v tabulce `coach_progress`.

### 4.5 Denní úpravy (dynamika)

| Situace | Co trenér udělá |
|---|---|
| 🟢 | nic |
| 🟡 | klíčový den prohodí s nejbližším pozdějším vytrvalostním; když to nejde, o 2 stupně lehčí nebo Z2. Dlouhý −25 %. |
| 🔴 | volno nebo Z1 do 45 min; klíčový se posune aspoň o den, jinak propadá |
| Víc špatných rán / forma pod −25 | zbytek týdne −15 %, nejvýš 1 klíčový |
| Těžká aktivita mimo plán | počítá se jako klíčový den; nejbližší kvalita do 48 h se zruší nebo posune |
| Týden přes rozpočet o 15 % | zbylé vytrvalostní dny se zkrátí; nic se nepřidává |
| Zmeškaný klíčový | přesun, když zbývají 2 dny a pravidla to dovolí; jinak propadá. Nic se nedohání. |
| Nemoc | plán stojí; 1–3 dny pauzy → 2 lehké dny; 4–7 → týden na 70 % bez kvality; nad 14 → blok od začátku |
| Špatné počasí | kvalita na trenažér; Z2 prohodit v týdnu, jinak trenažér na 2/3 délky |

Každá úprava má u dne napsaný důvod.

### 4.6 Kdy se plán přepočítá

Plán tohoto a příštího týdne je uložený (`coach_weeks`). Při čtení se spočítá otisk vstupů (dnešní zotavení,
aktivity týdne, tvoje úpravy, profil a cíl, špatné počasí ve zbylých dnech, stav nemoci). Stejný otisk = vrátí
se uložený plán. Jiný otisk = upraví se jen **dny od dneška**, minulé a tvoje úpravy zůstávají. Od nuly se
týden staví jen při novém týdnu, změně profilu nebo cíle a po „Vrátit moje úpravy“.

Návrh změn a „Zapsat do intervals.icu“ zůstává jako dnes.

## 5. Kód

Nová složka `src/core/coach/` (čisté funkce, testy v `test/coach/`):

| Soubor | Obsah |
|---|---|
| `profile.ts` | typ profilu, výchozí hodnoty, kontrola, odhad z historie |
| `budget.ts` | rozpočet týdne (4.2) |
| `week.ts` | řešič kostry, sport a délky dnů (4.3) |
| `library.ts` | rodiny, žebříčky, kroky ve W / bpm (4.4) |
| `adapt.ts` | denní úpravy (4.5) |
| `progress.ts` | vyhodnocení odjeté jednotky → stupeň |
| `distribution.ts` | čas lehce / středně / intenzivně za 28 dní |
| `engine.ts` | složí vše, vrací dnešní `PlanResult` |

Znovu použiju: `Workout`, `renderIcu`, `humanSteps` (`src/core/workout.ts`, rozšířím krok o bpm), `LADDER`,
`evaluatePast`, `bandFor` (`qualityDesign.ts`), `classify` (`quality.ts`), `project`, `step` (`fitness.ts`),
`dayWeather` (`weather.ts`), `evaluateRecovery` (`recovery.ts`), `ftpCheck`, `powerZones`, `hrZoneRange`
(`zones.ts`), `applyChanges`, `saveProposal` (`src/plan/proposals.ts`).

Úpravy mimo jádro:
- `migrations/0011_coach_v2.sql`: tabulky `coach_weeks`, `coach_progress`; zápis do `TENANT_TABLES`
  a `TENANT_MIGRATIONS` v `src/lib/tenant.ts`.
- `src/lib/settings.ts`: `coach_profile`, `coach_v2`, kotva trajektorie cíle.
- `src/report/build.ts` → `planFor` volá nový engine, když je `coach_v2` zapnuté.
- `src/api/coach.ts`: profil (čtení, uložení, text → JSON přes AI s kontrolou a potvrzením), pryč `ai-week`.
- `public/app.js`: karta profilu v Nastavení; v Trenérovi řádek „Rozvoj · týden 2 ze 3 · lehčí týden od …“,
  u cíle trajektorie a věta o hodinách, ve Stavu rozdělení intenzity. Stávající třídy a rozložení beze změny.
- `docs/jak-funguje-trener.md` přepsat, `docs/trener-v2/review.md` = toto posouzení.

## 6. Etapy

0. Uložit posouzení do `docs/trener-v2/review.md`.
1. Jádro (`src/core/coach/`) a testy včetně simulace 12 týdnů.
2. Migrace, uložení týdnů, engine, napojení za přepínačem `coach_v2`.
3. Profil: API, karta v Nastavení, text přes AI. Nové řádky v Trenérovi.
4. Telegram, dokumentace, zrušení AI návrhu týdne. Po týdnu ostrého provozu smazat v1 (`plan.ts`,
   `weekCheck.ts`).
5. Výkonnostní cíl (120 km / 4 h): zjednodušeně jako sledování nejlepšího výkonu na 3–4 h a FTP proti cíli.
   Upřesním s tebou, až poběží jádro.

Po každé etapě commit; push na GitHub až na konci dne.

## 7. Ověření

- `npm run typecheck && npm test`, `node --check public/app.js`.
- Testy, které musí projít:
  - Pokles z kondice 45 při 3–4 h týdně: po 8 simulovaných týdnech kondice klesá podle trajektorie (±2).
  - Jízda navíc 150 km: další dny se zkrátí, do 2 týdnů zpět na trajektorii.
  - 12 týdnů s náhodným počasím a zotavením: nikdy 4 tréninky za sebou, ani přes hranu týdne; nikdy kvalita
    den po kvalitě.
  - Stejné vstupy dvakrát = stejný plán; přepočet ve čtvrtek nemění pondělí–středu.
  - Profil pá–so–ne: tréninky padnou hlavně na tyto dny a pravidla platí.
  - Profil „jen běh“ a „kolo + běh 1× týdně v zimě“: správné sporty, běh ne dva dny po sobě, kvalita na kole.
  - Plánovaný čas nad Z2 nejvýš 20 % (25 % pod 5 h).
  - Lehčí týden každý 4. týden u Zlepšit, zátěž 60–70 %.
  - 🟡 ráno v klíčový den: kvalita se prohodí, týden má stejný počet klíčových dnů.
  - Nový uživatel bez FTP a bez historie dostane platný plán podle tepu.
- Ručně: `npm run dev`, stránka Trenér na šířce mobilu (stejný vzhled, nové řádky), uložení profilu, zápis
  jednoho tréninku do intervals.icu a kontrola kroků s bpm v Garminu. Zápis rozsahu tepu v intervals.icu
  ověřím v jejich dokumentaci; záloha je zápis v % LTHR.
