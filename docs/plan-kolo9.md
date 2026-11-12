# 9. kolo (12. 11. 2026)

Podnět: návrh a audit od ChatGPT (`screenshoty/Chatgpt navrh stranky/`). Závěr: aplikaci nepřepisovat
(Next.js / Supabase / FastAPI by znamenaly začít znovu a platit hosting), převzít jen pár věcí.

| # | Co | Stav |
|---|---|---|
| 1 | AI trenér: kontrola celého týdne po úpravě | hotovo |
| 2 | Zóny s datem platnosti | čeká |
| 3 | Editor tréninku s grafem intervalů | čeká |
| 4 | (volitelně) AI dostane jen tréninková čísla, bez zdravotních | čeká na rozhodnutí |

## 1. AI trenér: kontrola celého týdne po úpravě

**Problém:** `/coach/ask` po úpravách od AI hledal nová porušení pravidel jen na dnech, které AI změnila.
Přesun ale umí rozbít i jiný den: 4 dny tréninku za sebou (chyba padne na den, kterého se AI nedotkla),
kvalita den po nově dlouhém dni, propad formy pod hranici o pár dní později.

**Řešení:** čistá funkce `newViolations(before, after)` v `src/core/coach/validate.ts` porovná výsledek
závěrečné kontroly týdne před a po úpravě. Nové chyby nebo výjimky kdekoli v týdnu → upravené dny se vrátí.
U řady dní a propadu formy rozhoduje počet výskytů, ne datum (posun už existujícího porušení úpravu nezablokuje).
Upozornění (chybějící dlouhý, 80/20) úpravu nevrací. Testy v `test/coach/audit.test.ts`.

Platí jen pro Trenéra v2 (`settings.coach_v2`); původní plánovač má vlastní `checkWeek`.

## 2. Zóny s datem platnosti

**Cíl:** když se změní FTP, práh nebo tepové zóny, staré aktivity zůstanou vyhodnocené podle zón, které platily
v den aktivity (čas v zónách, zátěž, 80/20), a dnešní zóny se nepromítnou zpětně do historie.

Náčrt:
- tabulka historie zón (od kdy platí, sport, FTP / práh / LTHR, hranice) – nová migrace + `TENANT_TABLES`,
- při změně v Nastavení nebo při novém FTP z `ftpCheck` se uloží nový záznam místo přepsání,
- výpočty v `src/core/` dostanou zóny podle data aktivity (funkce „zóny k datu“),
- v Nastavení přehled: od kdy platily které hodnoty.

## 3. Editor tréninku s grafem intervalů

**Cíl:** u naplánovaného tréninku vidět průběh intervalů jako graf (sloupce podle intenzity a délky,
barvy zón), jak to má intervals.icu, a jednoduše upravit kroky (délka, intenzita, opakování).

Náčrt:
- graf ze struktury, kterou už dává knihovna (`buildWorkout`), v `public/app.js` jako SVG,
- úpravy kroků uložené jako omezení dne, kontrola stropů a délky v `src/core/`,
- zápis do intervals.icu stejně jako dnes (až po „Zapsat“).

## 4. (volitelně) Co AI dostane

Google AI Studio může na bezplatném tarifu použít data ke zlepšování služeb (`src/llm/providers.ts`).
Možnost: přepínač v Nastavení, který zdravotní hodnoty (HRV, spánek, klidový tep) do AI neposílá.
