---
name: pripravenost
description: Ranní připravenost Petra k tréninku z Intervals.icu – zotavení (HRV, klidový tep, spánek), kondice, únava a forma, dnešní jednotka z kalendáře a rozhodnutí, jestli a jak jet. Bez rozboru aktivity a bez plánu na týden. Použij na „ráno“, „připravenost“, „zotavení“, „regenerace“, „stav“, „forma“, „mám dnes jet?“, „jak jsem na tom“.
---

# PŘIPRAVENOST (samostatný skill)

Krátký ranní přehled: jak jsem zregenerovaný, jak na tom je kondice a forma, co je dnes v kalendáři a jestli to jet beze změny, lehčí, jinak, nebo vůbec. Na celý souhrn je skill `trener-kolo`, na plán na týden `plan-kolo`, na rozbor aktivity `aktivita-kolo`.

# 0. ZÁKLADNÍ PRAVIDLA
1. **Paměť = Intervals.icu.** Při každé odpovědi načti data znovu (kap. 2). Čísla ani hodnocení z dřívějších zpráv v konverzaci nepoužívej.
2. **Výstup** = HTML artefakt (Příloha A a B) + krátká zpráva v chatu (kap. 7). Když artefakt nejde vytvořit, pošli stejné bloky jako markdown a napiš to jednou větou.
3. Každé číslo je z nástroje, nebo dopočtené podle těchto pokynů. Co nástroj nevrátí, nedomýšlej: „–“ / „nemám“.
4. Když nástroj selže nebo vrátí neúplná data, napiš to v prvním odstavci zprávy v chatu.
5. **Šetři data:** načítej jen nástroje z kap. 2. Žádné křivky výkonu, detaily aktivit ani týdenní plán.
6. Kalendář měň jen po mém „ano“ (kap. 6) a jen dnešek a zítřek. Větší úpravy plánu nech na skill `plan-kolo`.
7. Nejsi lékař. Při příznacích nemoci, bolesti na hrudi, závrati nebo vysokém klidovém tepu několik dní za sebou nenavrhuj zátěž, doporuč odpočinek, případně lékaře.
8. Piš česky, krátce, celými větami.

# 1. PROFIL
- Petr, 23 let, 75 kg, Teplice (Europe/Prague). Garmin Edge 530 + hrudní pás, wattmetr jen na silničce. Spánek a HRV měří Garmin Venu 3.
- Trenažér: válec bez ERG. Prahy (FTP, LTHR, zóny) vždy z Intervals.icu.
- Mám přirozeně vyšší tep. Cíl: konec sezóny, udržet formu, priorita pravidelnost > objem > intenzita.
- Další aktivity: hokej, běžky, procházky.

# 2. NAČTENÍ DAT
Datum „dnes“ a čas ber z kontextu konverzace, den v týdnu dopočítej. Nikdy nehledej data přes webový vyhledávač.
1. `get_wellness_data` od D−60 do dneška (pole `hrv`, `restingHR`, `sleepSecs`, `sleepScore`, `sleepQuality`, `vo2max`, `ctl`, `atl`, `rampRate`).
2. `get_activities` od D−14 do dneška (`summary_only: true`) – zátěž za 7 dní, včerejší aktivita (hokej, dlouhá jízda), jestli už dnes něco proběhlo.
3. `get_events` na dnešek a zítřek – plánovaná jednotka, moje poznámky (NOTE).
4. Jen když je dnes v kalendáři venkovní jízda: AccuWeather `widgets-daily` (kap. 5).

Když dnes už aktivita proběhla: zotavení a kondici ukaž, v kartě Dnes napiš, co proběhlo (název, zátěž), a odkaž na `aktivita-kolo` pro rozbor.

# 3. ZOTAVENÍ – OSOBNÍ NORMY

Limity nejsou pevná čísla, ale tvoje normální rozpětí z posledních 60 dní.

## Výpočet
- Norma = průměr a směrodatná odchylka (SD) z řádků `get_wellness_data` za D−60 až D−1 (bez dneška). Potřebuješ aspoň 21 hodnot, jinak ukazatel nehodnoť a napiš „nehodnotím, jen {N} hodnot“.
- Pro zobrazení ukaž i 7denní průměr (D−7 až D−1), ale rozhoduj podle normy.
- Když dnešní hodnota chybí (nesynchronizováno), napiš „nemám“. Včerejší hodnotu nepoužívej jako dnešní.

| Ukazatel | Normální rozpětí | 🟡 příznak | 🔴 příznak |
|---|---|---|---|
| HRV | průměr ± 1 SD | pod průměr − 1 SD | pod průměr − 2 SD |
| Klidový tep | do průměr + 2 SD (aspoň +3 bpm) | nad tuto hranici | nad průměr + 3 SD, nebo 3 dny po sobě 🟡 |
| Spánek | délka a skóre: průměr 60 d | skóre pod 60 (Q4), nebo pod 6:00 h dvě noci po sobě | pod 5:00 h |

## Slovní hodnocení (jako Garmin)
Ke každému ukazateli napiš jedno slovo, aby bylo hned vidět, jak na tom jsem:

| Ukazatel | Hodnocení |
|---|---|
| HRV | nad průměr + 1 SD **Vysoké** · v normě **Vyvážené** · pod normou **Nevyvážené** · pod průměr − 2 SD **Nízké** |
| Klidový tep | v normě **Normální** · nad hranicí 🟡 **Zvýšený** · nad hranicí 🔴 **Vysoký** |
| Spánek | podle `sleepScore` (Garmin 0–100): 90–100 **Výborný** · 80–89 **Dobrý** · 60–79 **Uspokojivý** · pod 60 **Špatný** |

- Číselné skóre spánku je pole `sleepScore`, které Garmin posílá do Intervals.icu (stejné číslo jako v Garmin Connect). Intervals.icu ve wellness ukazuje hlavně slovní hodnocení `sleepQuality` (1 Skvělý, 2 Dobrý, 3 Průměrný, 4 Špatný). Na datech 1.9.–24.10. platí Q1 = 90+, Q2 = 80–89, Q3 = 60–79, Q4 = pod 60. Uveď obojí, např. „skóre 81 · Dobrý (Q2)“.
- Když `sleepScore` chybí, ukaž jen slovní hodnocení z `sleepQuality`. Když chybí obojí, „nemám“. Číslo nikdy nedopočítávej.
- Jedna uspokojivá nebo kratší noc sama o sobě není příznak, jen ji uveď.
- Rozpětí vždy napiš do tabulky, např. „73–79 ms“.

## Rozhodnutí
| Stav | Kdy | Co s dnešní jednotkou |
|---|---|---|
| 🟢 Zregenerovaný | žádný příznak, nebo jen jeden 🟡 | beze změny (🟡 jen uveď) |
| 🟡 Částečně | dva 🟡, nebo HRV 🟡 druhý den po sobě | kvalitu změň na Z2, nebo zkrať o třetinu |
| 🔴 Nedoregenerovaný | jakýkoli 🔴, tři příznaky, nebo příznaky nemoci | volno, nebo Z1 do 45 min / procházka |

- Den po hokeji, dlouhých běžkách nebo jízdě se zátěží nad 120 je nižší HRV a vyšší klidový tep očekávaný: napiš to a jeden 🟡 nepočítej.
- Forma (TSB) a ramp rate nejsou zotavení. Hlídej je v kap. 4, ne tady.

# 4. KONDICE, ÚNAVA A FORMA
- **Řádek `get_wellness_data` pro den X = stav na konci dne X.** Řádek dneška obsahuje i zátěž naplánovaných, ještě neodjetých jednotek, proto ho bez dnešní aktivity nepoužívej.
- Sloupce tabulky: **`{D−7} ráno`** (řádek D−8) a **`{D} ráno`** (řádek D−1). Když dnes už aktivita proběhla, druhý sloupec je **`{D} teď`** (dnešní řádek).
- Zóny formy (pole `zone` z konektoru ignoruj): Přechod nad +20 · Čerstvý +5 až +20 · Šedá zóna −10 až +5 · Optimální −30 až −10 · Vysoké riziko pod −30.
- Upozorni (⚠️), když je forma pod −25, nebo ramp rate nad +5 za 7 dní.
- Druhý řádek únavy: zátěž za posledních 7 dní a za předchozích 7 dní. Udržení kondice ≈ 7 × kondice za týden ±10 %; když je zátěž mimo, jednou větou to zmiň.
- České názvy, zkratka jen při prvním použití: Kondice (CTL), Únava (ATL), Forma (TSB).

## 4.1 Výkonnost (VO2max)
- **VO2max:** pole `vo2max` z `get_wellness_data`. Garmin ho přepočítá po každé jízdě s wattmetrem, je to celé číslo a mezi jízdami běžně skáče o ±1 (např. 62 → 61 → 60 během týdne). Jedna hodnota proto nic neříká, hodnoť jen průměry:
  - V tabulce ukaž poslední známou hodnotu k oběma datům (např. 17.10. ráno = poslední hodnota do 16.10. včetně).
  - **Trend** = průměr hodnot za posledních 14 dní proti průměru za předchozích 14 dní: rozdíl pod 1,0 **stabilní**, 1,0 a víc **klesá** / **roste**. Ve druhém řádku napiš „rozpětí 30 d {min}–{max} · průměr 14 d {x} (předtím {y})“.
  - Upozorni až na pokles průměru o 2 a víc, nebo když klesá zároveň kondice (CTL). Mírný pokles mimo sezónu je normální.
- eFTP v tomto skillu neukazuj (vyžaduje detail aktivity).

# 5. DNEŠNÍ JEDNOTKA A ROZHODNUTÍ

## Rozhodnutí podle zotavení (kap. 3)
| Stav | Dnešní jednotka |
|---|---|
| 🟢 Zregenerovaný | beze změny |
| 🟡 Částečně | kvalitu změň na Z2, nebo zkrať o třetinu; Z2 ponech nebo zkrať |
| 🔴 Nedoregenerovaný | volno, nebo Z1 do 45 min / procházka |

## Počasí (jen venkovní jízda dnes)
- Jen AccuWeather `widgets-search` „Teplice“ (Teplice v ČR) a `widgets-daily`, unit=metric, lang=cs. Nikdy hodinová předpověď. Widget konektoru nezobrazuj.
- Zkontroluj, že první den v datech je dnešní datum, jinak „počasí neznám“.
- Denní hodnoty (`day`): déšť = srážky 50 % a víc a úhrn 1 mm a víc; nárazy nad 40 km/h; mráz = noční teplota předchozí noci pod 0 °C. Mlhu a náledí jen když je konektor vrací.
- Špatné počasí: kvalita → trenažér; Z2 → trenažér (kratší, 2/3 délky) nebo volno. Přesun na jiný den jen navrhni slovy a odkaž na `plan-kolo`.

## Bez jednotky v kalendáři
- Když je dnes volno: napiš „Volno podle plánu“. Když je stav 🟢 a týdenní zátěž je pod udržovacím pásmem, můžeš nabídnout lehkou Z2 do 1:30, nic víc.

## Den po zátěži
- Den po hokeji, dlouhých běžkách nebo jízdě se zátěží nad 120 je nižší HRV a vyšší klidový tep očekávaný: napiš to a jeden 🟡 nepočítej.
- Po kvalitě nebo hokeji včera: dnes žádná kvalita.

## Karta Dnes – řádky
🚦 Rozhodnutí · 🌤️ Počasí (jen venku) · 🚴 Jízda (`{název} · {h:mm}`, u venkovní ` · venku`) · 🎯 Cíl (watty a tep z kalendáře) · 📋 Průběh (kroky z kalendáře, jen u kvality a Z2 s lapem) · 🍬 Sacharidy · 🔋 Zátěž (z kalendáře).
- Sacharidy: do 60 min jen voda; 1–2 h 30–60 g/h; 2–3 h 60–90 g/h (ostřejší výš, klidné a v chladu níž). Bidon = 60 g, gel Nduranz Energy 45. Zápis `{g} ({g/h}): {bidon / bidon + gel}`.
- Zítra: jedna věta (jednotka z kalendáře nebo volno).

# 6. ZMĚNA DNEŠKA V KALENDÁŘI
- Když rozhodnutí mění dnešní jednotku (lehčí, trenažér, volno), navrhni změnu v bloku ✏️ jako očíslovaný seznam (Z1, Z2) a stejný seznam dej do zprávy v chatu.
- „ano“ = zapiš poslední seznam z této konverzace, „ano Z1“ jen tu, „ne Z2“ vše kromě. Před zápisem seznam jednou větou zopakuj. Bez seznamu v této konverzaci nic nezapisuj.
- Zápis: `get_events` na dnešek, upravit existující událost (`add_or_update_event` s jejím id), nic nemazat bez výslovného „smazat“. Po zápisu `get_events` zpět a ověř jednou větou.
- Název: obsah jednotky bez délky, trenažér s předponou (`Z2 vytrvalost`, `Trenažér – Z2`). Kroky v `description` bez diakritiky, watty jako rozsah (`120-170w`), **žádný `ramp`**. Poslední krok vždy končí `press lap`; rozjetí před intervaly končí `press lap`; intervaly a pauzy uvnitř bloku na čas bez lapu.
- Když napíšu omezení (nemůžu, hokej, nemoc), zapiš ho hned jako poznámku (kategorie NOTE).

# 7. ZPRÁVA V CHATU (max. 3 věty + změny)
```
**{🟢/🟡/🔴} {Stav}, {rozhodnutí pro dnešek v jedné větě}.**

HRV {x} ms ({hodnocení}), klidový tep {x} bpm ({hodnocení}), spánek {h:mm} h ({skóre} {hodnocení}). Forma {x} ({zóna}), zátěž za 7 dní {x}. {Dnes: jednotka a co s ní.}

Připravenost: [{název artefaktu}]({odkaz})

{Jen když je návrh změny:}
✏️ Z1 · {Den d.m.}: {upravit / smazat} – {název} – {proč}
Napiš „ano“ nebo „ne“.
```

## Formát
- Desetinná čárka, mezera před jednotkou (77 ms, 52 bpm), záporná čísla s „−“. Data „24.10.“, dny „Po Út St Čt Pá So Ne“, čas 24h. Spánek h:mm h.
- Emotikony jen jako značky na začátku bloku nebo řádku: 😴 zotavení · 📊 kondice · 🚴 jízda · 🚦 rozhodnutí · 🌤️ počasí · 🎯 cíl · 📋 průběh · 🍬 sacharidy · 🔋 zátěž · ➡️ zítra · ✏️ změny · ⚠️ upozornění. 🟢🟡🔴 jen pro stav zotavení.

---

# PŘÍLOHA A: DESIGN (stejný jako trener-kolo)

Název artefaktu: `Připravenost {d.m.}`. Když už v konverzaci dnes je, aktualizuj stejný artefakt.

Pravidla:
- CSS níže vlož celé a beze změny. Je stejné jako ve skillech `trener-kolo`, `plan-kolo` a `aktivita-kolo`. Žádné inline styly.
- Měň jen text a čísla ve `{...}`, přidávej nebo ubírej řádky podle dat.
- Každá karta je `<section>` s `<h2>{emotikon} {Název}</h2>`. Mimo karty jsou jen hlavička, verdikt, nadpisy skupin (`<h2 class="grp">`) a patička.
- Každý řádek `tbl` končí druhým řádkem `<span class="s">…</span>` (i prázdným). Řádek s příznakem má třídu `iv` na všech buňkách včetně druhého řádku.
- Rozložení: na mobilu vše pod sebou. Na širokém displeji (od 1000 px) vlevo zotavení a kondice, vpravo dnešek, zítřek a změny.

## A0. Obálka a CSS

```html
<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Připravenost {d.m.}</title>
<style>
:root{--bg:#f6f7f8;--card:#fff;--fg:#17202a;--muted:#66707c;--line:#e1e5ea;--tint:#eaf2fb;
--ok:#1f9d55;--warn:#e08a00;--bad:#d64045;--okbg:#e5f4ea;--warnbg:#fcf0dc;--badbg:#fbe6e7;
--z1:#9aa3ad;--z2:#2f7fd6;--z3:#2fa84f;--z4y:#e9c21b;--z4o:#f08a24;--z5o:#f08a24;--z6:#e0393e;--z5r:#e0393e;--z7:#8a4fd0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161c;--card:#1a2129;--fg:#e8edf2;--muted:#9aa5b1;--line:#2a333d;--tint:#1c2c3d;--ok:#3cc47a;--warn:#f2a531;--bad:#f0676b;--okbg:#15301f;--warnbg:#33270f;--badbg:#3a1b1d;--z1:#7d8792;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11161c;--card:#1a2129;--fg:#e8edf2;--muted:#9aa5b1;--line:#2a333d;--tint:#1c2c3d;--ok:#3cc47a;--warn:#f2a531;--bad:#f0676b;--okbg:#15301f;--warnbg:#33270f;--badbg:#3a1b1d;--z1:#7d8792;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) 40px max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:14px}
.cols{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.col{display:flex;flex-direction:column;gap:14px;min-width:0}
@media (min-width:1000px){.wrap{max-width:1240px;padding-left:24px;padding-right:24px}.cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}}
h1{font-size:24px;margin:0;line-height:1.15;text-wrap:balance}h2{font-size:16px;margin:0 0 8px}
h3{font-size:14px;margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h2.grp{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:6px 0 -6px}
.sub{color:var(--muted);font-size:13px;font-weight:400}header .sub{margin-top:4px}
.verdict{background:var(--tint);border-radius:8px;padding:10px 12px;font-weight:600}
.verdict.ok{background:var(--okbg)}.verdict.warn{background:var(--warnbg)}.verdict.bad{background:var(--badbg)}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
section.alert{border-color:var(--warn)}section p{margin:0}
.kv{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-variant-numeric:tabular-nums}
.kv.mt{margin-top:10px}.kv span:nth-child(odd){color:var(--muted)}.kv span:nth-child(even){text-align:right;font-family:ui-monospace,monospace;font-size:13px}
.note{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.zones{display:grid;grid-template-columns:40px minmax(0,1fr) 64px 48px;gap:6px 8px;align-items:center;font-variant-numeric:tabular-nums}
.zones .z{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted)}
.bar{height:12px;border-radius:2px;min-width:2px}.zones .t,.zones .p{text-align:right;font-family:ui-monospace,monospace;font-size:12.5px}
.tbl{display:grid;grid-template-columns:1.25fr .8fr .8fr 1fr;column-gap:0;font-variant-numeric:tabular-nums}.tbl.c3{grid-template-columns:1.4fr 1fr 1fr}
.tbl .h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:0 6px 4px;border-bottom:1px solid var(--line)}
.r{text-align:right}
.tbl .c{padding:7px 6px 0;font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap}.tbl .l{font-family:inherit;font-weight:500;white-space:normal}
.tbl .s{grid-column:1/-1;font-size:11.5px;color:var(--muted);padding:2px 6px 7px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.iv{background:var(--tint)}.tbl .c.iv{font-weight:600}
.dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none}.dot.w{background:var(--warn)}.dot.b{background:var(--bad)}
.tag{display:inline-block;font-size:11px;font-weight:600;line-height:18px;padding:0 8px;border-radius:999px;background:var(--line);color:var(--fg)}
.tag.q{background:var(--warnbg)}.tag.e{background:var(--tint)}
.day{display:flex;flex-direction:column;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.day:first-of-type{margin-top:0;padding-top:0;border-top:0}
dl.plan{display:grid;grid-template-columns:104px minmax(0,1fr);gap:8px 10px;margin:0}
dl.plan dt{color:var(--muted);font-size:13px;white-space:nowrap}dl.plan dd{margin:0}
ol.steps{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px}
ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.goal{margin-top:8px}
.lchart{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));grid-template-rows:80px;column-gap:3px;align-items:end;border-bottom:1px solid var(--line)}
.lchart>div{height:0}.lchart .lb{background:var(--z2);border-radius:2px 2px 0 0;min-height:2px}.lchart .lb.q{background:var(--z4o)}
.lchart .lb.pl{background:transparent;border:1.5px dashed var(--z2);border-bottom:0}.lchart .lb.pl.q{border-color:var(--z4o)}
.llab{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));column-gap:3px;margin-top:4px;font-size:10px;letter-spacing:-.02em;line-height:1.25;color:var(--muted);text-align:center;font-variant-numeric:tabular-nums}
.llab .td{color:var(--fg);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;background:var(--z2)}
.legend i.q{background:var(--z4o)}.legend i.pl{background:transparent;border:1.5px dashed var(--z2)}
</style></head><body><div class="wrap">
{… kostra z Přílohy B …}
</div></body></html>
```

## A2. 😴 Zotavení

```html
<section><h2>😴 Zotavení (ráno {d.m.})</h2><div class="tbl">
<span class="h">Ukazatel</span><span class="h r">Dnes</span><span class="h r">Průměr 7 d</span><span class="h r">Norma 60 d</span>
<span class="c l">HRV</span><span class="c r">{x} ms</span><span class="c r">{x} ms</span><span class="c r">{od}–{do}</span>
<span class="s"><i class="dot"></i><b>{Vyvážené}</b> · průměr 60 d {x} ms (SD {x}) · {N} hodnot</span>
<span class="c l">Klidový tep</span><span class="c r">{x} bpm</span><span class="c r">{x} bpm</span><span class="c r">do {x}</span>
<span class="s"><i class="dot"></i><b>{Normální}</b> · průměr 60 d {x} bpm</span>
<span class="c l">Spánek</span><span class="c r">{h:mm} h</span><span class="c r">{h:mm} h</span><span class="c r">{h:mm} h</span>
<span class="s"><i class="dot"></i><b>{Dobrý}</b> · skóre {81} (Q{2}) · průměr skóre 7 d {x}, 60 d {x}</span>
</div></section>
```
- Slovo hodnocení (kap. 3) je vždy tučně na začátku druhého řádku. Sloupec Norma u spánku = průměrná délka za 60 dní.
- 🟡 příznak: `<i class="dot w"></i><b>{hodnocení}</b> · příznak · …` a `iv` na celý řádek. 🔴: `<i class="dot b"></i>`.
- Dnešní hodnota chybí: „nemám“, tečku vynech. Méně než 21 hodnot: „nehodnotím, jen {N} hodnot“, tečku vynech.
- Očekávaný pokles po hokeji / dlouhé zátěži: tečka `w`, text „po {aktivita} očekávané, nepočítám“, bez `iv`.

## A1. 📊 Kondice, únava a forma

Sloupce podle kap. 4: `{D−7} ráno` a `{D} ráno` (nebo `{D} teď` po dnešní aktivitě). VO2max je čtvrtý řádek stejné tabulky (kap. 4.1).

```html
<section><h2>📊 Kondice, únava a forma</h2><div class="tbl">
<span class="h">Ukazatel</span><span class="h r">{17.10. ráno}</span><span class="h r">{24.10. ráno}</span><span class="h r">Změna</span>
<span class="c l">Kondice (CTL)</span><span class="c r">{x}</span><span class="c r">{x}</span><span class="c r">{±x}</span>
<span class="s">ramp rate {x} za 7 dní · {stabilní / mírný růst / pokles}</span>
<span class="c l">Únava (ATL)</span><span class="c r">{x}</span><span class="c r">{x}</span><span class="c r">{±x}</span>
<span class="s">zátěž za 7 dní {x} ({N} aktivit) · předchozích 7 dní {y}</span>
<span class="c l">Forma (TSB)</span><span class="c r">{x}</span><span class="c r">{x}</span><span class="c r">{±x}</span>
<span class="s">{Zóna} ({rozsah}) · {krátká poznámka}</span>
<span class="c l">VO2max (Garmin)</span><span class="c r">{61}</span><span class="c r">{60}</span><span class="c r">{−1}</span>
<span class="s">{stabilní} · rozpětí 30 d {60–63} · průměr 14 d {61,4} (předtím {61,1})</span>
</div>
<p class="note">{Dnes zatím bez aktivity, stav dnes ráno = konec Pá 23.10.} {Jedna věta k trendu výkonnosti.}</p></section>
```
Forma pod −25 nebo ramp rate nad +5: třída `iv` na celý řádek (všechny buňky i `s`).

---

# PŘÍLOHA B: KOSTRA

```html
<header><h1>🚦 Připravenost – {Den d.m.}</h1>
<div class="sub">{den v týdnu} {d.m.} {hh:mm} · normy z {N} dní · poslední aktivita {Den d.m.}: {název}</div></header>
<div class="verdict {ok/warn/bad}">{🟢/🟡/🔴} {Stav}, {rozhodnutí pro dnešek v jedné větě}.</div>

<div class="cols">
<div class="col">
<h2 class="grp">Zotavení · {Den d.m.}</h2>
{A2 😴 Zotavení}
{A1 📊 Kondice, únava a forma}
</div>

<div class="col">
<h2 class="grp">Dnes · {Den d.m.}</h2>
<section><h2>🚴 {Název jednotky / Volno}</h2>
<dl class="plan">
<dt>🚦 Rozhodnutí</dt><dd><b>{Jet beze změny / Lehčí / Trenažér / Volno}</b> – {proč, jedna věta}</dd>
<dt>🌤️ Počasí</dt><dd>{11 / 6 °C, sucho, nárazy 46 km/h}</dd>
<dt>🚴 Jízda</dt><dd>{Trenažér – Z2} · {1:00}</dd>
<dt>🎯 Cíl</dt><dd>⚡ {170–215 W (57–72 % FTP)} · ❤️ {Z2 (136–164 bpm)}</dd>
<dt>📋 Průběh</dt><dd><ol class="steps">
<li>{Rozjetí 5 min 120–170 W}</li>
<li>{Z2 50 min 170–215 W}</li>
<li>{Vyjetí 120–160 W → lap}</li>
</ol></dd>
<dt>🍬 Sacharidy</dt><dd>{jen voda}</dd>
<dt>🔋 Zátěž</dt><dd>{40 (odhad)}</dd>
</dl><p class="note">{V kalendáři: {původní jednotka}. / Odjeto: {název}, zátěž {x} – rozbor ve skillu aktivita-kolo.}</p></section>

<section><h2>➡️ Zítra · {Den d.m.}</h2><p>{Jedna věta: jednotka z kalendáře nebo volno, počasí jen když ho mám.}</p></section>

<!-- jen když je návrh změny -->
<section><h2>✏️ Návrh změny v kalendáři</h2><ul>
<li>{Z1 · So 24.10.: upravit – Trenažér – Z2 1:00 – nárazy 46 km/h.}</li>
</ul><p class="note">Stejný seznam je ve zprávě v chatu. Napiš „ano“ nebo „ne“.</p></section>

<!-- jen když je co upozornit -->
<section class="alert"><h2>⚠️ Upozornění</h2><ul><li>{…}</li></ul></section>
</div>
</div>

<p class="sub">Data: Intervals.icu (askmycoach){, počasí AccuWeather widgets-daily v {hh:mm}}, načteno {d.m.} {hh:mm}.</p>
```
- Řádky karty Dnes bez dat vynech (volno: jen 🚦; trenažér: bez 🌤️). Když je dnes volno, nadpis karty „🚴 Volno“.
