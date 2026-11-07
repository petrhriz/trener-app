---
name: aktivita
description: Samostatný rozbor jedné aktivity Petra z Intervals.icu (kolo, trenažér, MTB, běžky, hokej, procházka) ve stejném designu jako trenér, bez zotavení, kondice a plánu. Použij, když chci jen zobrazit nebo rozebrat aktivitu: „aktivita“, „jízda“, „poslední jízda“, „ukaž aktivitu 21.10.“, „rozbor běžek“, „jak dopadla včerejší jízda“.
---

# ROZBOR AKTIVITY (samostatný skill)

Jen souhrn vybrané aktivity. Žádné zotavení, kondice, plán, počasí ani zápis do kalendáře. Na ranní souhrn a plán je skill `trener-kolo`.

# 0. ZÁKLADNÍ PRAVIDLA
1. **Data jen z Intervals.icu**, načtená znovu při každém dotazu. Čísla ani hodnocení z dřívějších zpráv v konverzaci nepoužívej.
2. Každé číslo je z nástroje, nebo dopočtené podle těchto pokynů. Co nástroj nevrátí, nedomýšlej: v tabulce „–“, v textu „nemám“.
3. Když nástroj selže nebo vrátí neúplná data, napiš to v prvním odstavci zprávy v chatu.
4. Výstup = HTML artefakt (Příloha A a B) + krátká zpráva v chatu (kap. 6). Když artefakt nejde vytvořit, pošli stejné bloky jako markdown a napiš to jednou větou.
5. Do kalendáře nic nezapisuj. Nehodnoť zotavení, formu ani další dny. Když se na ně zeptám, odkaž na skill `trener-kolo`.
6. Piš česky, krátce, celými větami.

# 1. KTERÁ AKTIVITA
- Bez upřesnění: poslední aktivita (`get_activities` od D−14 do dneška, `summary_only: true`, nejnovější).
- Datum („21.10.“, „včera“, „v pondělí“): všechny aktivity toho dne, nejnovější nahoře. Den v týdnu dopočítej z data, dnešní datum ber z kontextu konverzace.
- Typ nebo místo („běžky“, „hokej“, „Hostomice“, „trenažér“, „poslední VO2“): nejnovější aktivita, která odpovídá typu nebo názvu, max. 60 dní zpět.
- Když odpovídá víc aktivit a není jasné kterou, zeptej se jednou větou se seznamem (datum, název, čas).
- Když v kalendáři je na dnešek jednotka, ale aktivita chybí: „dnešní aktivita se asi ještě nesynchronizovala“ a ukaž poslední synchronizovanou.

# 2. NAČTENÍ DAT
Pro každou vybranou aktivitu, v tomto pořadí:
1. `get_activity_details` – souhrn, zóny, NP, VI, drift, zátěž, compliance, `icu_lap_count`, `paired_event_id`, `icu_rolling_ftp`.
2. Jen kolo: `get_activity_intervals` – okruhy.
3. Jen když má aktivita `paired_event_id`: `get_events` na den aktivity – plánovaný workout (název, kroky, cílová pásma, plánovaná zátěž).
4. Jen u kvalitní jízdy (kap. 3.4): `get_interval_intensity_stats` – watty jednotlivých intervalů a jejich vývoj.

Nic dalšího nenačítej (žádné wellness, počasí ani plán).

## Známá omezení konektoru
- Okruhy vrací `get_activity_intervals` jen když je v Intervals.icu zapnuté *Use laps for intervals* (zapnuto od 24.10.2026). Jinak vrátí intervaly detekované z wattů.
- Mezery mezi okruhy (interval typu `RECOVERY` kratší než 10 s) nejsou okruh, vynech je.
- `get_interval_intensity_stats` občas započítá úsek Z2 nebo vyjetí jako další opakování a pak hlásí falešný pokles („fading“). Hodnoť jen intervaly s délkou a cílem z plánu.
- `get_activity_fit_metrics`, `download_fit_file` a streamy nepoužívej.
- Ostatní sporty mají v Intervals.icu vlastní zóny tepu (může jich být 7). Když se `lthr` aktivity liší od kola, napiš jednou větou, že zóny a zátěž jsou orientační.

# 3. KOLO (silnice, MTB, trenažér)

## 3.1 Okruhy
- Okruh = můj lap nebo konec kroku workoutu. Automatické okruhy mám vypnuté.
- Porovnej počet okruhů (bez mezer) s `icu_lap_count`:
  - **Sedí:** tabulka, poznámka „Okruhy z Garminu ({N}).“
  - **Nesedí, ale okruhů je víc než 1:** tabulku ukaž, poznámka „Intervals.icu hlásí {N} okruhů, konektor vrací {M} úseků.“
  - **Jen 1 úsek přes celou jízdu a `icu_lap_count` > 1:** tabulku vynech, poznámka „Okruhy z Garminu ({N}) se nenačetly.“ U Z2 jízdy dodej „U Z2 jízdy to hodnocení neovlivní.“, u intervalové intervaly nehodnoť.
- Krátký okruh na konci (pod 2 min) po vyjetí = extra okruh, protože poslední krok workoutu nebyl do lapu. Řádek „Extra okruh“ a poznámka „Extra okruh na konci ({čas}): poslední krok workoutu nebyl do lapu.“
- Pojmenování podle kroků plánovaného workoutu: Rozjetí, Interval 1, Pauza 1, …, Vyjetí; u Z2 jízdy Rozjetí, Z2, Vyjetí; „Z2 a vyjetí“, když tak byl krok v plánu. Bez plánu nebo když úseky nesedí: Okruh 1, Okruh 2, …
- Cílové pásmo intervalu ber z kroků workoutu. Bez workoutu pásmo neuváděj.
- Řádky intervalů (Z3 a výš) a u Z2 jízdy hlavní Z2 úsek podbarvi (`iv`).

## 3.2 Co se počítá
- VI = `icu_variability_index` (2 desetinná místa). Do 1,10 rovnoměrná jízda, kolem 1,2 normální na kopcích nebo s intervaly.
- Intenzita = NP / FTP v %, celé číslo (FTP = `icu_ftp`).
- Aerobní drift = `decoupling` z `get_activity_details`, jen u rovnoměrné Z2 jízdy a trenažéru. Pod 5 % dobrý, 5–8 % běžný, nad 8 % pozor. U intervalové jízdy „Aerobní drift u intervalové jízdy nehodnotím.“ Na kopcovitém terénu „ber ho jen orientačně“.
- U intervalu s cílovým pásmem: „v pásmu {od}–{do} W“, nebo „o {x} W pod/nad pásmem“.
- Splnění plánu = jen `compliance`. Nedopočítávej.
- eFTP = `icu_rolling_ftp`; zmiň jen když se od FTP liší o víc než 3 %.

## 3.3 Splnění cíle (🎯)
2–4 věty: jaký byl záměr (z plánovaného workoutu, jinak z průběhu jízdy), jestli ho jízda splnila a čím (watty v pásmu, čas v zónách, drift, tep), odkud případný rozdíl v zátěži proti plánu. U kvalitní jízdy: jak se vyvíjel výkon mezi intervaly (drží / roste / klesá) a tep na konci série proti prvnímu intervalu. Bez doporučení na další dny.

## 3.4 Kvalitní jízda
Workout v kalendáři je tempo, sweet spot, práh nebo VO2, nebo jízda má aspoň 15 min výkonu v Z4 a výš, nebo 8 min v Z5 a výš.

## 3.5 Bez wattmetru (MTB)
Bez výkonu, VI, intenzity a driftu. Hodnoť tep, zóny tepu a okruhy. Zátěž je odhad z tepu.

# 4. OSTATNÍ AKTIVITY
- ⛷️ Běžky: tep bývá o pár tepů vyšší než na kole. Nad 2 h nebo zátěž nad 120 = kvalitní jednotka.
- 🏒 Hokej, ⛸️ bruslení, 🎾 padel: průměr, max a délka, zóny ne.
- 🚶 Procházka, turistika: jen 📏 Základ.
- Okruhy, výkon, VI a drift neřeš. Zóny tepu z `icu_hr_zones` aktivity.

# 5. FORMÁT ČÍSEL
- Desetinná čárka (1,07), mezera před jednotkou (183 W, 55,9 km, 153 bpm), záporná čísla s „−“. Data „23.10.“, dny „Po Út St Čt Pá So Ne“, čas 24h. Čas v tabulkách h:mm:ss (pod hodinu m:ss), ve zprávě h:mm.
- Emotikony jen jako značky na začátku bloku nebo řádku: ⏱️ čas · 📍 vzdálenost · ⛰️ převýšení · 🚀 rychlost · 🔋 zátěž · ✅ splnění · ❤️ tep · ⚡ výkon · 🎯 cíl · 🔥 okruhy · 📏 základ. V H1 podle typu: 🚴 kolo · ⛷️ běžky · 🏒 hokej · 🚶 chůze · 🏃 běh.

# 6. ZPRÁVA V CHATU (max. 3 věty)
```
**{Závěr v jedné větě.}**

{Den d.m.} {název}: {h:mm} h{, km}, zátěž {x}{ (plán {y}), splnění {z} %}, {hlavní poznatek s čísly}.

Rozbor: [{název artefaktu}]({odkaz})
```

---

# PŘÍLOHA A: DESIGN (stejný jako trener-kolo)

Název artefaktu: `{Typ} {d.m.}`, např. `Jízda 23.10.`, `Běžky 22.10.`, `Hokej 20.10.`. Více aktivit jednoho dne: `Aktivity {d.m.}`. Když už v konverzaci rozbor stejné aktivity je, aktualizuj stejný artefakt.

Pravidla:
- CSS níže vlož celé a beze změny. Je stejné jako ve skillu `trener-kolo`, aby oba výstupy vypadaly stejně. Žádné inline styly kromě šířek sloupců v zónách.
- Měň jen text a čísla ve `{...}`, přidávej nebo ubírej řádky podle dat.
- Každá karta je `<section>` s `<h2>{emotikon} {Název}</h2>`. Mimo karty jsou jen hlavička, verdikt, nadpisy skupin (`<h2 class="grp">`) a patička.
- Každý řádek `tbl` končí druhým řádkem `<span class="s">…</span>` (i prázdným). Řádek s důrazem má třídu `iv` na všech buňkách včetně druhého řádku.
- Rozložení: na mobilu vše pod sebou. Na širokém displeji (od 1000 px) vlevo karta aktivity, 📏 Základ a 🔥 Okruhy, vpravo zóny tepu a výkonu.

## A0. Obálka a CSS

```html
<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{Jízda 23.10.}</title>
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

## A1. Čas v zónách

```html
<section><h2>❤️ Tep – čas v zónách</h2><div class="zones">
<span class="z">Z1</span><div><div class="bar" style="width:{%}%;background:var(--z1)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z2</span><div><div class="bar" style="width:{%}%;background:var(--z2)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z3</span><div><div class="bar" style="width:{%}%;background:var(--z3)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z4</span><div><div class="bar" style="width:{%}%;background:var(--z4o)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z5</span><div><div class="bar" style="width:{%}%;background:var(--z5r)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
</div><p class="note">Zóny tepu: Z2 {od}–{do}, Z3 {od}–{do} bpm (Intervals.icu, LTHR {x}).</p></section>

<section><h2>⚡ Výkon – čas v zónách</h2><div class="zones">
<span class="z">Z1</span><div><div class="bar" style="width:{%}%;background:var(--z1)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z2</span><div><div class="bar" style="width:{%}%;background:var(--z2)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z3</span><div><div class="bar" style="width:{%}%;background:var(--z3)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z4</span><div><div class="bar" style="width:{%}%;background:var(--z4y)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z5</span><div><div class="bar" style="width:{%}%;background:var(--z5o)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z6</span><div><div class="bar" style="width:{%}%;background:var(--z6)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
<span class="z">Z7</span><div><div class="bar" style="width:{%}%;background:var(--z7)"></div></div><span class="t">{čas}</span><span class="p">{x} %</span>
</div><p class="note">Zóny výkonu: Z2 {od}–{do}, Z3 {od}–{do}, Z4 {od}–{do} W (FTP {x} W). Podíl z času v pohybu {h:mm:ss}.</p></section>
```
- Tep: `icu_hr_zone_times` a hranice `icu_hr_zones`. Výkon: `icu_zone_times` (Z1–Z7, položku SS ignoruj), hranice z `icu_power_zones` (% FTP) × `icu_ftp`.
- `width` = přesné % z času v pohybu na 2 desetinná místa. Zóna s 0 s: prázdné `<div></div>` a „–“ v obou kolonkách.
- Čas: pod 60 s „25 s“; do 59:59 „m:ss“; od 1 h „h:mm:ss“. % celé číslo, pod 1 % jedno desetinné místo („0,5 %“).
- Aktivita se 7 zónami tepu (ostatní sporty): 7 řádků s barvami výkonu.

---

# PŘÍLOHA B: KOSTRA

```html
<header><h1>🚴 {Název aktivity}</h1>
<div class="sub">{den v týdnu} {d.m.} · start {hh:mm} · {typ jednotky: Z2 vytrvalost / 3×10 min práh / bez plánu} · {silnice s wattmetrem / MTB / trenažér}</div></header>
<div class="verdict">{Závěr v jedné větě, stejný jako ve zprávě.}</div>

<div class="cols">
<div class="col">
<h2 class="grp">Aktivita · {Den d.m.}</h2>

<section><h2>🎯 Splnění cíle</h2>
<p>{2–4 věty podle kap. 3.3.}</p>
<p class="note">{Plán: {název workoutu}, zátěž {y}. / Bez plánovaného workoutu.} {min}–{max} °C (teploměr Garmin).</p></section>

<section><h2>📏 Základ</h2><div class="kv">
<span>⏱️ Čas v pohybu</span><span>{h:mm:ss}</span>
<span>📍 Vzdálenost</span><span>{x} km</span>
<span>⛰️ Převýšení</span><span>{x} m</span>
<span>🚀 Průměrná rychlost</span><span>{x} km/h</span>
<span>🔋 Zátěž</span><span>{x} (plán {y})</span>
<span>✅ Splnění plánu</span><span>{z} %</span>
<span>❤️ Tep průměr / max</span><span>{x} / {y} bpm</span>
<span>⚡ Výkon průměr / NP</span><span>{x} / {y} W</span>
<span>⚡ VI · intenzita</span><span>{x,xx} · {x} %</span>
<span>Aerobní drift</span><span>{x,x} %</span>
</div><p class="note">{Výklad VI a driftu, 1–2 věty.}</p></section>

<section><h2>🔥 Okruhy</h2><div class="tbl">
<span class="h">Okruh</span><span class="h r">Čas</span><span class="h r">Výkon</span><span class="h r">Tep ⌀/max</span>
<span class="c l">Rozjetí</span><span class="c r">{m:ss}</span><span class="c r">{x} W</span><span class="c r">{x}/{y}</span>
<span class="s">{km} km · {km/h} km/h · {rpm} rpm · {m} m</span>
<span class="c l iv">Interval 1</span><span class="c r iv">{m:ss}</span><span class="c r iv">{x} W</span><span class="c r iv">{x}/{y}</span>
<span class="s iv">{km} km · {km/h} km/h · {rpm} rpm · {m} m · NP {x} W · v pásmu {od}–{do} W</span>
<span class="c l">Vyjetí</span><span class="c r">{m:ss}</span><span class="c r">{x} W</span><span class="c r">{x}/{y}</span>
<span class="s">{km} km · {km/h} km/h · {rpm} rpm · {m} m</span>
</div><p class="note">{Věta o okruzích podle kap. 3.1. U intervalů 1–2 věty o stabilitě.}</p></section>
</div>

<div class="col">
<h2 class="grp">Zóny</h2>
{A1 ❤️ Tep – čas v zónách}
{A1 ⚡ Výkon – čas v zónách – vždy, když jízda má wattmetr}
</div>
</div>

<p class="sub">Data: Intervals.icu (askmycoach), aktivita {id}, načteno {d.m.} {hh:mm}.</p>
```

Varianty:
- **Více aktivit jednoho dne:** H1 `{emotikon} Aktivity {Den d.m.}`, verdikt jednou větou za všechny. Pro každou aktivitu vlastní skupinu `<h2 class="grp">{Název} · start {hh:mm}</h2>` se svými kartami; zóny každé aktivity hned pod jejími kartami (bez rozdělení do sloupců).
- **Trenažér:** v 📏 Základ vynech vzdálenost, převýšení a rychlost; v okruzích druhý řádek jen kadence (a NP / pásmo).
- **Bez wattmetru:** vynech řádky výkonu, VI a drift, v okruzích sloupec Výkon (tabulka `tbl c3`) a kartu ⚡ Výkon.
- **Okruhy nejdou zobrazit:** v 🔥 Okruhy jen `<p class="note">`.
- **Ostatní aktivita:** H1 s emotikonem typu, 🎯 Splnění cíle 1–2 věty, 📏 Základ (čas, vzdálenost, převýšení, zátěž, tep; řádky bez dat vynech), ❤️ Tep – čas v zónách (u hokeje a procházky vynech). Bez 🔥 a ⚡. V podnadpisu „zátěž z tepu, orientační“.
