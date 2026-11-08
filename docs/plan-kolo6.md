# 6. kolo připomínek (8. 11. 2026) – plán

Zjištění před úpravami (ověřeno na živých datech):
- **Zátěž v Kondici (15)**: přehled bral `garmin_load` (body Garminu, EPOC) – např. 6. 11. 152 místo TSS 69. TSS = `load` (intervals.icu / Garmin, stejné číslo).
- **Body Battery (3, 12)**: Garmin Personal API dává jen 6–10 klíčových bodů za den; podrobný průběh po 3 min (`dailyStress`) vrací 404.
  Vlastní snímky dostávaly čas stažení, ne čas měření (hodinky se synchronizují cca po hodině, v noci vůbec) → body „hodinu po posledním“.
- **Moc tréninků (11)**: 9. a 11. 11. vznikly kliknutím na ikonu kola ve dni volna (přepínač sportu přidal trénink). Běh 10. 11. dostal Z4 intervaly.
- **Vybavení (19)**: v DB jsou odebrání uložená správně a server počítá dobře → chyba je v cache (prohlížeč / webová aplikace na ploše). Řešení: `no-store` na API + potvrzení v UI.

| # | Co | Jak |
|---|---|---|
| 1, 14 | mapa | výška mapy podle tvaru trasy, na PC mapa vedle zón (ne přes celou šířku), přiblížení po 0,25 stupně, tlumený podklad + tmavý lem trasy (jako Garmin), přepínač „Podklad: tlumený / plný“ |
| 2 | start na Přehledu | webová aplikace na ploše se po spuštění vždy otevře na Přehledu, manifest `start_url` |
| 3, 7, 4 | nový Přehled | stav (Aktivní / Nemocný / Zraněný / Dovolená, „na jak dlouho“), aktuální počasí, 3 kruhy **Zátěž · Zotavení · Spánek**, ranní / večerní zhodnocení „co tělo potřebuje“ (pravidla z dat, volitelně přeformulované LLM), Body Battery v jedné kartě, tep a stres zvlášť |
| 3 | skóre zotavení | vlastní % z VST, klidového tepu, tepu ve spánku, délky spánku proti potřebě, skóre spánku a dechu – vše proti tvé normě 60 dní (`core/readinessScore.ts`, testy) |
| 4 | stav | nemoc / zranění / dovolená = plán se zastaví (dny zablokované), zátěž se nehodnotí, po návratu 2 dny lehce |
| 5 | návrh vzhledu | jen obrázek / maketa, bez úprav aplikace |
| 6 | servis vybavení | díly (řetěz, vosk, …) s km od posledního servisu, tlačítko „Vyměněno / Navoskováno“, Telegram upozornění (řetěz 3000 km, pak každých 1000; vosk 250 / 50) |
| 6 | ikona běžek | ⛷️ (sjezdař) → vlastní ikona běžkaře, v Telegramu 🎿 |
| 8, 20 | spánek | detail spánku: dnešní noc celá + tabulka fází dnes / 7 / 30 dní, délky „1 h 10 min“, VST ve spodních dlaždicích |
| 9 | chat s AI | nová stránka Chat, kontext = plán, zotavení, poslední aktivity, spánek, zátěž; historie v prohlížeči |
| 10 | síla | z minima týdne pryč (přepínač v Nastavení) |
| 11 | trenér | zátěž po týdnech (4 minulé + tento + plán), plánovaná zátěž dnů, max. 2 dny tréninku za sebou (Zlepšit 3), běh bez intervalů, dokud neběháš pravidelně, tlačítka „Přesunout kvalitu“ / „Místo toho Z2“, ve dni volna jen „+ Přidat trénink“, vysvětlení cílů v číslech |
| 12, 22 | grafy | Body Battery: čas měření, plynulá křivka, čárkovaně kde chybí data; popisek „spánek“ nad grafem; hladké čáry (monotónní křivka) |
| 13, 16 | průběh aktivity | podbarvení pod tepem / výkonem barvou zóny, silnější čára, na mobilu užší osa Y |
| 17, 26 | iPhone | bezpečné okraje (výřez nahoře, na šířku po stranách), neprůhledný pruh pod stavovým řádkem (žádné rozmazání nadpisu), větší hlavní čísla |
| 18, 21 | PC | širší rozvržení pro 1920 a 2560 px, karty bez roztahování do prázdna |
| 23 | cíl tréninku | jedno nastavení (platí do změny), v Trenérovi všechny 4 cíle |
| 24 | kroky tréninku | schované, rozbalí se kliknutím |
| 25 | kalendář | měsíc: aktivity (proklik), skóre spánku, kroky, Body Battery, plán |
