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
5. **Délky** ze zátěže dne a sazby sportu (zátěž za hodinu Z2 z historie uživatele). Změna sportu drží zátěž.
6. **Obsah** (jen tento a příští týden): kvalita z knihovny, Z2 a dlouhý ze zbylé zátěže, texty podle sportu.
7. **Kontrola formy**: výhled forma po dnech; pod −30 (konec pásma „Optimální“ v intervals.icu) se ubírá.
8. **Přizpůsobení**: ráno 🟡 → dnešek o stupeň lehčí a o čtvrtinu kratší, 🔴 → volno; minulý týden hodně vynechaný →
   tento týden ×0,85; vysoký strain (Foster) ×0,9; po pauze 7+ dní strop intenzity (Z1–Z2, pak tempo a sweet spot).
   Každá změna budoucích dnů se uloží jako verze s důvodem (Trenér → Plnění a změny plánu).
9. **AI**: testy v `test/ai.test.ts` – čísla jen z dat (druhý pokus, příznak „nekontrolováno“), soukromí, žádné
   klíče v promptu, bezpečnostní pravidla promptů; změna promptu musí projít revizí (hash v testu).

## Jak vyzkoušet

- Jen čtení: `GET /admin/coach?goal=udrzeni` (admin klíč) – plán nad uloženými daty i pro jiný cíl (nic neukládá).
  Testy: `test/coach/` (simulace 8 týdnů: `test/coach/sim.test.ts`).
- Pondělní plán týdne se ukládá jednou do `sync_state` pod klíčem `coach3_monday` (týden + cíl); rozběhnutý týden se
  z něj dopočítává.

## Simulace (modeloví sportovci)

`npx vite-node scripts/coach-sim.ts vystup.json` (logika ve `scripts/coach-sim-lib.ts`) – 7 situací po 8 týdnů (pokles, udržet, zlepšit v zimě i v sezóně,
závod, běh ve středu, návrat). Sportovec každý den odjede přesně plán, kondice se přepočítá, trenér plánuje znovu.
Kondice za 8 týdnů:

| Situace | Kondice | Týdny (zátěž) |
|---|---|---|
| Zima (cíl Zima) | 40 → 27,8 | 157 · 157 · 163 · 166 · 163 · 166 · 161 · 160 |
| Zima · Udržet | 40 → 40,4 | 298 · 281 · 279 · 293 · 278 · 277 · 273 · 276 |
| Zima · Zlepšit (Základ) | 40 → 52,0 | lehčí 164 · 377 · 410 · 457 · lehčí 222 · 429 · 455 · 439 |
| Sezóna · Zlepšit (Rozvoj) | 42,9 → 57,2 | lehčí 178 · 410 · 435 · 476 · lehčí 240 · 512 · 482 · 503 |
| Sezóna · Závod | 42,9 → 47,6 | lehčí 178 · 410 · 435 · 476 · 492 · ladění 337 · 207 · po závodě 280 (bez kvality) |
| Udržet + běh ve středu | 40 → 40,0 | 272–289, jeden běh týdně |
| Návrat · Zlepšit | 15,3 → 27,0 | 158 · 161 · 186 · 214 · 238 · lehčí 118 · 274 · 288 |

Lehčí týden přijde po 3 zátěžových týdnech z historie – modelová historie má 16 stejných týdnů bez lehkého, proto je
u Zlepšit lehčí hned první týden. Lehčí týdny mají 53–56 % průměru předchozích 3, závodní týden je o 58 % níž než
poslední běžný (Bosquet 41–60 %). Pravidla (nejvýš 3 dny za sebou, kvalita ne po těžkém dni) drží ve všech situacích.
