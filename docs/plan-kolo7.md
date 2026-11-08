# 7. kolo připomínek (8. 11. 2026)

Zjištění před úpravami (ověřeno na živých datech):
- **Cíl tréninku nic neměnil (9)**: po slabších týdnech (52 a 150) omezil strop „+10 % proti běžnému týdnu“ všechny cíle
  na stejné číslo (275) a Z2 ve všední den měla pevně max. 90 min → Zlepšit = Udržet. Navíc u dnů „běh místo kola“
  se počítala zátěž původní jízdy, takže Z2 vycházely krátké a týden byl pod cílem (206 místo 248–275).
- **Body Battery (12)**: Garmin Personal API dává jen 6–14 bodů denně, podrobný průběh nevrací (404). Víc dat nezískáme –
  nový návrh proto ukazuje jisté hodnoty (teď / ráno / minimum / nabito / vybito) a čáru jen mezi skutečnými body.

| # | Co | Jak |
|---|---|---|
| 1 | mapa | jemný podklad CARTO Voyager (ve tmavém režimu tmavý) jako výchozí; volitelně TomTom (klíč v Nastavení → Připojení); zesvětlení podkladu už není výchozí |
| 6 | mapa | tlačítko ⤢ = vycentrovat celou trasu |
| 2 | grafy wellness | čárkovaná čára „průměr 7 dní“ pryč |
| 3 | iPhone | neprůhledný pruh pod výřezem o 12 px vyšší (iOS rozmazává i kus pod stavovým řádkem) – **neověřeno na zařízení** |
| 4, 5 | spánek | dnešní noc nahoře, pryč tabulka „fáze dnes proti průměru“, dlaždice průměr 7/30/90 dní a „den po dni“ |
| 7 | bublina grafu | světlý režim: bílá se stínem, tmavý: tmavě šedá (ne černá / bílá) |
| 8 | názvy | „Kolo“ → „Silniční kolo“ (Garmin sem dává i gravel a obecnou cyklistiku), filtr „Cyklistika“ |
| 9 | cíl | strop podle cíle (Zlepšit +10 %, Udržet = běžný týden, Pokles −10 %), max. délka Z2 podle cíle, délka Z2 z odhadu zátěže, u Zlepšit jízda navíc, když se cíl nevejde, víkend delší; výhled kondice se tím mění taky |
| 10, 20 | prokliky | viz strom níže – každá metrika má proklik na stejný detail |
| 11 | FTP | kontrola FTP (`core/ftpCheck.ts`): 20 min × 0,95 nad FTP, eFTP ±, FTP beze změny 8 / 12 týdnů → doporučení testu v Kondici a v nedělním souhrnu; nové FTP z intervals.icu má přednost i před ručním |
| 12 | Body Battery | nový panel (kruh + čísla + čára mezi body + spánek / aktivity), detail s 30/90 dny |
| 13 | počasí | vlastní hranice v Nastavení (zima pod / vedro nad / ideální teplota), okno co nejblíž ideální teplotě a bez velkého rozdílu teplot, „chladné ráno v teplém dni“ zvlášť |
| 14 | vlastní jízda | „zítra jedu 4 h s Honzou“ v Telegramu (i `/jizda`), v chatu nebo tlačítkem u dne v Trenérovi → den pevně v plánu, zátěž (ve skupině +15 %) se počítá do týdne, ostatní dny se přepočítají |
| 15 | s kým | v detailu aktivity „👥 Jel jsem sám / ve skupině / s …“ → přetažená Z2 se nebere jako chyba; tabulka `activity_tags` (migrace 0007) |
| 16 | ikona | PNG ikony (180 / 192 / 512 / maskable) – Safari nebere SVG; ikonu na ploše je potřeba smazat a přidat znovu |
| 17 | Kondice | emoji u ukazatelů (💪 🥵 🎯 ⚡ 📈) |
| 18 | kalendář | souhrn měsíce v dlaždicích, sloupec týdne (km, h, zátěž), barva dne podle zátěže, barevný proužek sportu, pruh zátěže |
| 19 | ikony | barevný běžkař, VST 💓 místo černé vlnky |

## Strom stránek (po 7. kole)

```
Přehled ─┬─ 💓 VST ─────────────┐
         ├─ ❤️ Klidový tep ──────┤
         ├─ 🔋 Body Battery ─────┤      Detail metriky (jedna šablona):
         ├─ 🧠 Stres / Tep a stres ┤      hodnota + normální rozsah → graf 7/30/90 dní
         ├─ 😴 Spánek ───────────┤      → doplněk (semafor, skóre…) → „Co to znamená“
         ├─ 👣 Kroky → Chůze      │      přepínač metrik nahoře, „← Zpět“ = odkud jsem přišel
         ├─ 🎯 Forma → Kondice    │
         └─ Poslední aktivita → Aktivita
Zotavení ── semafor + 6 dlaždic ──┘ (VST, tep, spánek, stres, Body Battery, dech) + poslední noc
            (dlouhé grafy 60/30 dní přesunuty do detailů – jedno místo pro historii)
Trenér ── cíl, dnešní brána, plán (sport / volno / vlastní jízda / přesun kvality), návrh změn
Kondice ── CTL/ATL/forma + výhled, VO2max, zátěž, křivka výkonu, FTP a test
Aktivity ── seznam → Aktivita (mapa, zóny, průběh, okruhy, s kým, vybavení)
Více ── Kalendář, Chat, Vybavení, Tělo, Síla, Chůze, Výživa, Nastavení
```
