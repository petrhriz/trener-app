# Trenér

Kód: `src/core/coach/` (čisté funkce, testy v `test/coach/`). Knihovna tréninků (`coach/library.ts`), fáze a rovnice
kondice (`coach/target.ts`), únava, pravidla kontroly týdne (`coach/validate.ts`). Zdroje pravidel: [`zdroje.md`](zdroje.md).

## Princip

1. **Cíl** = kam má kondice dojít. Ze sportovcova cíle a fáze vychází růst za týden (Zima k zimnímu základu, udržet 0,
   Zlepšit +3, nad 45 +4, ladění −2) – zdroje v `zdroje.md`. Týden se plánuje vždy od pondělí.
2. **Potřebná zátěž** se spočítá přesně z rovnice kondice (stejná jako intervals.icu): kolik zátěže za zbývající
   dny dovede kondici z dnešní hodnoty na cíl.
3. **Omezení jen dolů**: poslední 4 týdny (+30 %, aspoň +40; lehčí týden a ladění se do nich nepočítají), únava,
   lehčí týden po 3 zátěžových (z historie, 55 % jejich průměru), týden po závodě, délky tréninků.
   Když omezení cíl nepustí, trenér to napíše čísly („potřeba 286, dáš 221 → kondice 40,8 → 39,9“).
4. **Kostra** (tento a příští týden + orientačně další dva): kolik tréninků, kolik kvalit, dlouhý; řešič vybere dny
   podle pravidel (max 3 dny za sebou, kvalita ne po kvalitě ani po dlouhém, dlouhý o víkendu, volby uživatele platí).
   Dva tréninky za sebou jsou v pořádku (blok), mírně se penalizuje až třetí den v řadě. Aby týdny nebyly všechny
   stejné, řešič mírně penalizuje kvalitu ve stejný den jako minulý týden a úplně stejné tréninkové dny jako minulý
   týden (u prvního týdne podle skutečně odjetého minulého týdne).
5. **Délky** ze zátěže dne a sazby sportu (zátěž za hodinu Z2 z historie uživatele). Změna sportu drží zátěž.
   Kvalita má asi stejný čas jako Z2 den týdne (nejvýš strop kvality), Z2 den nikdy delší než strop dlouhého dne,
   běžecký Z2 do 1,2× typického běhu (aspoň hodina, ve stropu běhu). Tréninků nejvýš tolik, kolik se jich do zátěže
   týdne vejde v nejkratší délce; Z2 den, na který zbyde méně než půlka nejkratší délky, je volno.
6. **Obsah** (jen tento a příští týden): kvalita z knihovny, Z2 a dlouhý ze zbylé zátěže, texty podle sportu.
7. **Kontrola formy**: výhled forma po dnech; pod −30 (konec pásma „Optimální“ v intervals.icu) se ubírá.
8. **Rozběhnutý týden** drží pondělní plán: vynechané se nedohání, co se odjelo navíc, se odečte (Z2 den, na který
   nezbude zátěž, je volno), tvůj prodloužený trénink (délka, vlastní jízda) ubere ostatním dnům, trénink navíc, po kterém by byl další den z plánu 4. za sebou, ten den zruší. Tvoje volba
   zadaná během týdne platí i proti pondělnímu plánu. Dny z pondělí drží jeho zátěž (sazba za hodinu může mezi dny
   poskočit). Když tvoje volba (trénink, kvalita) pravidla poruší vždy, platí volba a pravidla hlídají ostatní dny.
9. **Trenažér / venku**: u jízdy si zvolíš místo (jinak trenažér při špatném počasí a u kvality v zimě). Na trenažéru
   se šlape pořád, takže hodina dá víc zátěže – trenér počítá zátěž za hodinu zvlášť venku a na trenažéru (tvůj poměr
   z jízd za 60 dní, bez dat 1,3) a pro stejnou zátěž dá kratší Z2 a dlouhou jízdu (kvalitu určuje stavba intervalů).
10. **Přizpůsobení**: ráno 🟡 → dnešek o stupeň lehčí a o čtvrtinu kratší (dlouhý → Z2 nejvýš strop Z2), 🔴 → volno; minulý týden hodně vynechaný →
   tento týden ×0,85; vysoký strain (Foster) ×0,9; po pauze 7+ dní strop intenzity (Z1–Z2, pak tempo a sweet spot).
   Každá změna budoucích dnů se uloží jako verze s důvodem (Trenér → Plnění a změny plánu).
11. **AI**: testy v `test/ai.test.ts` – čísla jen z dat (druhý pokus, příznak „nekontrolováno“), soukromí, žádné
   klíče v promptu, bezpečnostní pravidla promptů; změna promptu musí projít revizí (hash v testu).
12. **Vypnutý trenér** (`coach_on`, tlačítko na stránce Trenér): nic se neplánuje ani nenavrhuje, budoucí naplánované
   tréninky se při vypnutí smažou i v intervals.icu. Stránka ukáže tento týden proti zátěži na udržení kondice
   (7 × kondice z konce minulého týdne, pásmo ± 10 %, `freePlan` v `src/report/build.ts`) a zátěž po týdnech.

## Jak vyzkoušet

- Jen čtení: `GET /admin/coach?goal=udrzeni` (admin klíč) – plán nad uloženými daty i pro jiný cíl (nic neukládá).
  Testy: `test/coach/` (simulace 8 týdnů: `test/coach/sim.test.ts`, zátěžové testy: `test/coach/fuzz/`, níž).
- Pondělní plán týdne se ukládá jednou do `sync_state` pod klíčem `coach3_monday` (týden + cíl); rozběhnutý týden se
  z něj dopočítává.

## Simulace (modeloví sportovci)

`npx vite-node scripts/coach-sim.ts vystup.json` (logika ve `scripts/coach-sim-lib.ts`) – 7 situací po 8 týdnů (pokles, udržet, zlepšit v zimě i v sezóně,
závod, běh ve středu, návrat). Sportovec každý den odjede přesně plán, kondice se přepočítá, trenér plánuje znovu.
Kondice za 8 týdnů:

| Situace | Kondice | Týdny (zátěž) |
|---|---|---|
| Zima (cíl Zima) | 40 → 27,8 | 157 · 157 · 163 · 166 · 163 · 161 · 164 · 160 |
| Zima · Udržet | 40 → 40,4 | 268 · 293 · 279 · 298 · 279 · 280 · 273 · 279 |
| Zima · Zlepšit (Základ) | 40 → 54,1 | lehčí 156 · 377 · 410 · 457 · lehčí 225 · 433 · 465 · 522 |
| Sezóna · Zlepšit (Rozvoj) | 42,9 → 57,2 | lehčí 167 · 408 · 433 · 472 · lehčí 240 · 499 · 488 · 513 |
| Sezóna · Závod | 42,9 → 48,0 | lehčí 167 · 408 · 433 · 472 · 492 · ladění 338 · 230 · po závodě 284 (bez kvality) |
| Udržet + běh ve středu | 40 → 41,0 | 275–295, jeden běh týdně |
| Návrat · Zlepšit | 15,3 → 26,7 | 149 · 152 · 178 · 204 · 229 · lehčí 98 · 281 · 298 |

Lehčí týden přijde po 3 zátěžových týdnech z historie – modelová historie má 16 stejných týdnů bez lehkého, proto je
u Zlepšit lehčí hned první týden. Lehčí týdny mají 54–55 % průměru předchozích 3, závodní týden je o 53 % níž než
poslední běžný (Bosquet 41–60 %). Pravidla (nejvýš 3 dny za sebou, kvalita ne po těžkém dni) drží ve všech situacích.

## Zátěžové testy (různí sportovci, miliony kombinací)

`test/coach/fuzz/` – nic není vázané na jednoho uživatele: generátor (`gen.ts`) mění hlavní sport (kolo / běh), objem
(0–900 zátěže týdně, i nový uživatel bez historie), počet a rozložení dní, wattmetr, věk (2+1 / 3+1), úroveň, další
sporty (i běžky), pauzy, nepravidelnost i trend. Seed je pevný – každé selhání jde zopakovat.

- `engine.fuzz.test.ts` – 3 000 náhodných plánů (den v roce × cíl × závod × tvoje volby včetně nesmyslných × ráno
  🟢🟡🔴 × únava × počasí × návrat po pauze × stupně kvalit); každý musí splnit pravidla z `check.ts` (tvar a čísla,
  blokované dny, tvoje volby, nejvýš 3 dny za sebou, kvalita ne po těžkém dni, týden po závodě, nemoc, strop
  intenzity po pauze, běh bez VO2 a ve stropu, plán ne nad cíl týdne, žádná chyba závěrečné kontroly) a být
  deterministický.
- `loop.fuzz.test.ts` – simulace po dnech (6 a 12 týdnů) s chováním: plní přesně, vynechává, přidává tréninky
  navíc, přetahuje (×1,2–1,5), nedotahuje (×0,5–0,8), nezvládá / zvládá intervaly, nemoc, přesouvá, týden pauzy,
  zadává volby během týdne, únava, chaos. Kontroluje: pravidla každý den, nic se nedohání (zbytek týdne nikdy nad
  pondělní plán), plán se bez důvodu nemění, úleva za vynechaný týden jen ubírá, stupně kvalit (nezvládnuto → dolů,
  Udržet / Zima po zvládnutí drží), směr kondice podle cíle (Zima ≤ Udržet ≤ Zlepšit, bezpečný nárůst do 6 za týden).
- `units.fuzz.test.ts` – miliony případů čistých funkcí: plnění týdne proti nezávislému výpočtu (přesun není
  vynechání, trénink navíc neuškodí), úplná mřížka únavy (víc únavy nikdy nepřidá), rovnice kondice, cíl týdne
  (strop přidávání, lehčí týden, ladění, pořadí cílů), kostra týdne, návrat po pauze, stupně kvalit, pořadí voleb,
  závěrečná kontrola týdne.

`npm test` je spouští v základním rozsahu (~2 min). Víc: `COACH_FUZZ=20 npx vitest run test/coach/fuzz` (20× víc).

Známé meze (testy je vynechávají a trenér je sám hlásí „do délek tréninků se víc zátěže nevejde“): kdo trénuje 6–7 dní
týdně, pravidlo nejvýš 3 dny za sebou mu nedovolí přidávat; Udržet v zimě s vysokou kondicí (zimní krátké délky) a
vysoká kondice s 1–2 tréninky týdně se do stropů délek nevejdou.
