# 8. kolo připomínek (9. 11. 2026)

| Co | Jak |
|---|---|
| přihlášení pro víc lidí | účty jméno + heslo (pamatuje 1 rok), pozvánky, oddělená data – viz `docs/multi-user.md` |
| Body Battery a tep až po otevření Garmin Connect | není chyba aplikace: hodinky posílají data do Garminu přes telefon a iPhone aplikaci Connect na pozadí budí jen občas. Dokud data nejsou na serveru Garminu, API je nemá. Pomáhá: povolit Garmin Connect „Aktualizace na pozadí“, nevypínat ji přepínačem aplikací, mít zapnutý Bluetooth. |
| Zlepšit kratší než Udržet | přidaná jízda u Zlepšit dostane jen chybějící zátěž, ostatní jízdy se nezkracují (dřív se zátěž rozpočítala znovu → všední jízdy 75 min místo 90). Udržet doplňuje jízdu jen do spodní hranice cíle. Test v `phase11`. |
| Kondice – tabulka | pryč (stejná čísla jako grafy), upozornění zůstala |
| ikony VST a stresu | 🫀 VST, 😮‍💨 stres |
| výběr dne | klik na datum v hlavičce otevře kalendář; náhled na **kterýkoli den v historii** (D1 už má celou historii, starší den dočte wellness, aktivity a kondici od dne − 92; průběh dne z Garminu se ukládá do KV na 7 dní) |
| mobil | číslo v kroužku přesně uprostřed, dlaždice s názvem na jeden řádek a stavem pod ním, detail metriky hodnota vlevo / rozsah vpravo, popisek průměru grafu nezakrývá body, kalendář bez rámečků (ikony, hodnota, barva dne) |
| chat | okno se vejde na displej, řádek pro psaní je vždy vidět |
| AI na každé stránce | 🤖 vpravo nahoře – panel s chatem, AI dostane i obsah stránky („stranka_kterou_vidi“) |
| barvy wellness | vlastní barva pro každou metriku (`--m-hrv`, `--m-rhr`, `--m-sleep`, `--m-stress`, `--m-bb`, `--m-resp`) |
