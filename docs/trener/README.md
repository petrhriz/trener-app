# Trenér v3

Nový trenér od nuly (13. 11. 2026), jediný trenér aplikace (v1 a v2 jsou smazané).
Kód: `src/core/coach/` (čisté funkce, testy v `test/coach/`). Z v2 převzaté jen ověřené kusy: knihovna tréninků
(`coach/library.ts`), fáze a rovnice kondice (`coach/target.ts`), únava, pravidla kontroly týdne (`coach/validate.ts`).

## Proč znovu

Hlášené chyby měly společnou příčinu – v2 míchal různé výchozí body a zdroje:

| Chyba | Příčina ve v2 | v3 |
|---|---|---|
| „Dnes Volno · 1 h 05 min“ | rozhodnutí dne z kalendáře intervals.icu, délka z plánu | dnešek jen z plánu trenéra |
| Pokles / Udržet / Zlepšit dávají skoro stejný růst | cíl týdne z kondice v pondělí (44), výhled od dneška (40,8) | cíl i výhled od dnešní kondice |
| „Na udržení kondice 44…“ | kondice ze začátku týdne | dnešní kondice, jasně napsaná |
| Kolo → běh: jiná zátěž | délka z minut, ne ze zátěže | den má cíl zátěže, délka se dopočítá ze sportu |
| „Rozjetí / Vyjetí“ u běhu | texty napevno pro kolo | slovník podle sportu |

## Princip

1. **Cíl** = kam má kondice dojít. Ze sportovcova cíle a fáze vychází růst za týden (Zima k zimnímu základu, udržet 0,
   Zlepšit +3, nad 45 +4, ladění −2) – zdroje v `zdroje.md`. Týden se plánuje vždy od pondělí.
2. **Potřebná zátěž** se spočítá přesně z rovnice kondice (stejná jako intervals.icu): kolik zátěže za zbývající
   dny dovede kondici z dnešní hodnoty na cíl.
3. **Omezení jen dolů**: poslední 4 týdny (+30 %, aspoň +40; lehčí týden a ladění se do nich nepočítají), únava,
   lehčí týden po 3 zátěžových (z historie, 55 % jejich průměru), týden po závodě, délky tréninků.
   Když omezení cíl nepustí, trenér to napíše čísly („potřeba 286, dáš 221 → kondice 40,8 → 39,9“).
4. **Kostra** (tento a příští týden + orientačně další dva): kolik tréninků, kolik kvalit, dlouhý; řešič vybere dny
   podle pravidel (max 3 dny za sebou, kvalita ne po kvalitě ani po dlouhém, dlouhý o víkendu, tvoje volby platí).
5. **Délky** ze zátěže dne a sazby sportu (zátěž za hodinu Z2 z tvé historie). Změna sportu drží zátěž.
6. **Obsah** (jen tento a příští týden): kvalita z knihovny, Z2 a dlouhý ze zbylé zátěže, texty podle sportu.
7. **Kontrola formy**: výhled forma po dnech; pod dnem (−20, v rozvoji −30) se ubírá.

## Etapy

| # | Co | Stav |
|---|---|---|
| 1 | Cíl a výhled od dnešní kondice, kostra, délky ze zátěže, texty podle sportu, dnešek z plánu | hotovo |
| 2 | Kalendář 4 týdny dopředu a 2 týdny zpětně, cíl zvlášť pro tento a příští týden | hotovo |
| 3 | Kratší „z čeho trenér vychází“ (3 řádky + souhrn), graf času v zónách za 28 dní, pravidla se zdroji | hotovo |
| 4 | Běžecké zóny (vlastní práh pro běh) | čeká |
| 5 | Vyhodnocení kvalit a stupně náročnosti, střídání kategorií přes týdny, ladění podle Bosqueta, den závodu, zdroje pravidel | hotovo |
| 6 | Smazat v1 a v2 | hotovo |
| 7 | Opravy (12. 11. 2026): lehčí týden z historie, týden po závodě, uložený pondělní plán, sporty z profilu, kvalita podle tepu, stupně a střídání tréninků, počasí u dlouhé | hotovo |

## Jak vyzkoušet

- Jen čtení: `GET /admin/coach?goal=udrzeni` (admin klíč) – plán na ostrých datech i pro jiný cíl (nic neukládá).
  Testy: `test/coach/` (simulace 8 týdnů: `test/coach/sim.test.ts`).
- Pondělní plán týdne se ukládá jednou do `sync_state` pod klíčem `coach3_monday` (týden + cíl); rozběhnutý týden se
  z něj dopočítává.

## Ostrá data 12. 11. 2026 (kondice 41,8, VST pod normou → únava −10 %)

| Cíl | Za 4 týdny | Týdny (zátěž) |
|---|---|---|
| Řízený pokles | 41,8 → 37,2 (−1,1 / týden) | 163 · 215 · 223 · 223 |
| Udržet | 41,8 → 40,6, od 3. týdne drží | 185 · 260 · 281 · 281 |
| Zlepšit | 41,8 → 40,8 (3. týden lehčí), pak roste | 209 · 295 · 189 · 328 |

Pokles kondici vždy snižuje, udržet drží, zlepšit zvedá – rozdíl proti cíli jen kvůli únavě a lehčímu týdnu, a to
souhrn v plánu říká.

## Simulace (modeloví sportovci)

`npx vite-node scripts/coach-sim.ts vystup.json` (logika ve `scripts/coach-sim-lib.ts`) – 7 situací po 8 týdnů (pokles, udržet, zlepšit v zimě i v sezóně,
závod, běh ve středu, návrat). Sportovec každý den odjede přesně plán, kondice se přepočítá, trenér plánuje znovu.
Výsledek 12. 11. 2026 (po opravách 1–7), kondice za 8 týdnů, v závorce před opravami:

| Situace | Kondice | Týdny (zátěž) |
|---|---|---|
| Zima (cíl Zima) | 40 → 27,8 (28,0) | 157 · 157 · 163 · 166 · 163 · 166 · 161 · 160 |
| Zima · Udržet | 40 → 40,4 (40,0) | 298 · 281 · 279 · 293 · 278 · 277 · 273 · 276 |
| Zima · Zlepšit (Základ) | 40 → 52,0 (43,3) | lehčí 164 · 377 · 410 · 457 · lehčí 222 · 429 · 455 · 439 |
| Sezóna · Zlepšit (Rozvoj) | 42,9 → 57,2 (47,6) | lehčí 178 · 410 · 435 · 476 · lehčí 240 · 512 · 482 · 503 |
| Sezóna · Závod 23. 5. | 42,9 → 47,6 (41,1) | lehčí 178 · 410 · 435 · 476 · 492 · ladění 337 · 207 · po závodě 280 (bez kvality) |
| Udržet + běh ve středu | 40 → 40,0 (39,8) | 272–289, jeden běh týdně |
| Návrat · Zlepšit | 15,3 → 27,0 (20,0) | 158 · 161 · 186 · 214 · 238 · lehčí 118 · 274 · 288 |

Lehčí týden přijde po 3 zátěžových týdnech z historie – modelová historie má 16 stejných týdnů bez lehkého, proto je
u Zlepšit lehčí hned první týden. Lehčí týdny mají 53–56 % průměru předchozích 3, závodní týden je o 58 % níž než
poslední běžný (Bosquet 41–60 %). Pravidla (nejvýš 3 dny za sebou, kvalita ne po těžkém dni) drží ve všech situacích.
