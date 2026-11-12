# Trenér v3

Nový trenér od nuly (13. 11. 2026). Běží vedle v2, zapíná se v Nastavení → Trenér (`settings.coach_v3`).
Kód: `src/core/coach3/` (čisté funkce, testy v `test/coach3/`). Z v2 převzaté jen ověřené kusy: knihovna tréninků
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
3. **Omezení jen dolů**: poslední 4 týdny (+30 %, aspoň +40), únava, lehčí 4. týden, délky tréninků.
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
| 3 | Kratší „z čeho trenér vychází“, graf času v zónách za 28 dní | čeká |
| 4 | Běžecké zóny (vlastní práh pro běh) | čeká |
| 5 | Vyhodnocení kvalit a stupně náročnosti, střídání kategorií přes týdny | čeká |
| 6 | Smazat v1 a v2 | až v3 projde na ostrých datech |

## Jak vyzkoušet

- Zapnout: Nastavení → Trenér → „v3 – nový (zkušební)“ → Uložit. Vypnout stejně (v2 / původní).
- Bez přepnutí, jen čtení: `GET /admin/coach3?goal=udrzeni` (admin klíč) – plán v3 na ostrých datech
  i pro jiný cíl. Testy: `test/coach3/`.

## Ostrá data 12. 11. 2026 (kondice 41,8, VST pod normou → únava −10 %)

| Cíl | Za 4 týdny | Týdny (zátěž) |
|---|---|---|
| Řízený pokles | 41,8 → 37,2 (−1,1 / týden) | 163 · 215 · 223 · 223 |
| Udržet | 41,8 → 40,6, od 3. týdne drží | 185 · 260 · 281 · 281 |
| Zlepšit | 41,8 → 40,8 (3. týden lehčí), pak roste | 209 · 295 · 189 · 328 |

Pokles kondici vždy snižuje, udržet drží, zlepšit zvedá – rozdíl proti cíli jen kvůli únavě a lehčímu týdnu, a to
souhrn v plánu říká.

## Simulace (modeloví sportovci)

`npx vite-node scripts/coach3-sim.ts vystup.json` – 7 situací po 8 týdnů (pokles, udržet, zlepšit v zimě i v sezóně,
závod, běh ve středu, návrat). Sportovec každý den odjede přesně plán, kondice se přepočítá, trenér plánuje znovu.
Výsledek 12. 11. 2026 (po opravě „týden od pondělí“): pokles 40 → 32,5, udržet 40 → 40,0, zlepšit v zimě 40 → 38,6
(zimní délky nepustí víc), zlepšit v sezóně 42,9 → 48,2, pravidla drží ve všech situacích.
