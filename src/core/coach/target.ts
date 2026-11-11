// Cíl zátěže týdne (specifikace „AI Endurance Coach“, kap. 1–3.1, s opravami):
//  1) z KONDICE: zátěž = 7 × CTL + 45,6 × ramp (ramp = o kolik má kondice za týden růst / klesat podle fáze),
//  2) strop podle toho, co se v posledních 4 týdnech OPRAVDU jezdilo (novější týdny váží víc; přidává se postupně),
//  3) strop podle toho, co se vejde do rozumných délek jízd (v zimě krátké) a obvyklého počtu tréninků,
//  4) únava jen ubírá, 4. týden bloku je lehčí.
// Specifikaci chyběl bod 2: s kondicí 43 a posledními týdny po 50–150 by samotný bod 1 chtěl ~300 týdně.
import { num } from "../../lib/format";
import { daysBetween, month } from "../../lib/time";
import { K_CTL, type Goal } from "../fitness";

export type Phase = "offseason" | "maintain" | "base" | "build" | "taper";
export const PHASE_LABEL: Record<Phase, string> = { offseason: "Zimní pokles", maintain: "Udržování", base: "Základ", build: "Rozvoj", taper: "Ladění" };

/** CTL po 7 dnech stejné denní zátěže d: C·k7 + d·(1 − k7) */
export const K7 = Math.pow(1 - K_CTL, 7);
/** o kolik zátěže týdně víc je potřeba na +1 bod kondice za týden: 7 / (1 − k7) ≈ 45,6 */
export const LOAD_PER_RAMP = 7 / (1 - K7);
/** Zátěž týdne, po které kondice za 7 dní vzroste o `ramp` (přesný vzorec, ne odhad). */
export const loadForRamp = (ctl: number, ramp: number) => Math.max(0, 7 * ctl + LOAD_PER_RAMP * ramp);
/** Kondice po týdnu se zátěží `load`. */
export const ctlAfterWeek = (ctl: number, load: number) => ctl * K7 + (load / 7) * (1 - K7);
export const WINTER_MONTHS = [11, 12, 1, 2];
export const isWinter = (date: string) => WINTER_MONTHS.includes(month(date));

/** Fáze z cíle a ročního období (uživatel ji mění přepínačem cíle, nic dalšího se nenastavuje). */
export function phaseFor(goal: Goal, weekStart: string, raceDate: string | null): Phase {
  if (goal === "pokles") return "offseason";
  if (goal === "udrzeni") return "maintain";
  if (goal === "zavod" && raceDate) {
    const d = daysBetween(weekStart, raceDate);
    if (d >= 0 && d <= 14) return "taper";
    if (d > 84) return "base";
    if (d >= 0) return "build";
  }
  return isWinter(weekStart) ? "base" : "build";
}

/** Ramp kondice za týden podle fáze. Rozvoj je omezený tím, co sportovec v historii prokazatelně unesl. */
export function rampFor(phase: Phase, provenRamp: number | null): number {
  if (phase === "offseason") return -1;
  if (phase === "maintain") return 0;
  if (phase === "base") return 1;
  if (phase === "taper") return -2;
  return Math.max(1.5, Math.min(3, provenRamp ?? 2));
}
/** Nejnižší forma (TSB), pod kterou plán nesmí žádný den spadnout. */
export const tsbFloor = (phase: Phase): number | null => (phase === "build" ? -30 : phase === "taper" ? null : -20);

export interface Fatigue {
  /** forma (CTL − ATL) na konci včerejška */
  form: number | null;
  /** žlutá / červená rána za posledních 5 dní (včetně dneška) */
  badMornings: number;
  /** týdenní průměr VST pod osobní normou */
  hrvLow: boolean;
  /** dny nemoci za posledních 10 dní */
  illnessDays: number;
}
export const NO_FATIGUE: Fatigue = { form: null, badMornings: 0, hrvLow: false, illnessDays: 0 };

/** Únava jen ubírá: násobek zátěže a strop klíčových dnů. */
export function fatigueFactor(f: Fatigue): { factor: number; keysMax: number; notes: string[] } {
  let factor = 1, keysMax = 2;
  const notes: string[] = [];
  const cut = (x: number, why: string) => { if (x < factor) factor = x; notes.push(why); };
  if (f.form != null && f.form < -30) cut(0.8, `forma ${num(f.form, 0)} (pod −30)`);
  else if (f.form != null && f.form < -20) cut(0.9, `forma ${num(f.form, 0)} (pod −20)`);
  if (f.badMornings >= 3) cut(0.8, `${f.badMornings} horší rána za 5 dní`);
  else if (f.badMornings >= 2) cut(0.9, `${f.badMornings} horší rána za 5 dní`);
  if (f.hrvLow) cut(0.9, "VST týdenní průměr pod normou");
  if (f.illnessDays >= 4) { cut(0.7, "návrat po nemoci"); keysMax = 0; }
  else if (f.illnessDays >= 1) { cut(0.85, "po nemoci postupně"); keysMax = 1; }
  if (factor <= 0.8) keysMax = Math.min(keysMax, 1);
  if (f.form != null && f.form < -25) keysMax = Math.min(keysMax, 1);
  return { factor, keysMax, notes };
}

/** Co se o sportovci ví z historie (nic se nenastavuje). */
export interface Recent {
  /** zátěž posledních 4 ukončených týdnů, nejstarší první (týden bez tréninku = 0) */
  weekLoads: number[];
  /** počet tréninkových dnů v týchž týdnech */
  weekSessions: number[];
  /** kolik dní v týchž týdnech byl sportovec mimo (stav Nemocný / Zraněný / Dovolená) */
  weekOff?: number[];
  /** nejdelší trénink za poslední 4 týdny (min) */
  longestMin: number;
  /** obvyklá délka tréninku za 4 týdny (medián, min); null = bez historie */
  typicalMin: number | null;
  /** největší prokázaný růst kondice za týden (průměr přes 4 týdny) za poslední 4 měsíce */
  provenRamp: number | null;
}

export interface TargetInput {
  weekStart: string;
  goal: Goal;
  raceDate: string | null;
  /** kondice na konci dne před týdnem */
  ctl: number;
  recent: Recent;
  /** pozice v bloku 1–4 (4 = lehčí týden); jen Základ a Rozvoj */
  cycleIdx: number;
  fatigue: Fatigue;
  /** zátěž za hodinu lehké jízdy (z historie) */
  easyRate: number;
}

export interface Budget {
  /** cíl zátěže týdne a pásmo */
  load: number;
  lo: number;
  hi: number;
  /** zátěž, která by kondici udržela (7 × CTL), a průměr posledních 4 týdnů */
  keepLoad: number;
  recentLoad: number;
  /** zátěž podle kondice a fáze, než zasáhl strop */
  ctlLoad: number;
  ramp: number;
  phase: Phase;
  sessions: number;
  keys: number;
  /** dlouhý trénink v týdnu ano / ne */
  long: boolean;
  /** stropy délek (min): lehký den, dlouhý den, klíčový den */
  caps: { easy: number; long: number; key: number };
  recoveryWeek: boolean;
  cycleIdx: number;
  /** kondice na konci týdne, když se plán odjede */
  ctlTarget: number;
  tsbFloor: number | null;
  /** násobek kvůli únavě (1 = bez úpravy) */
  factor: number;
  notes: string[];
}

const r0 = Math.round;
const r15 = (x: number) => Math.round(x / 15) * 15;
/** nejmenší týden, který má smysl plánovat (dva krátké tréninky) */
const MIN_WEEK = 90;

export function weekTarget(inp: TargetInput): Budget {
  const { ctl, recent } = inp;
  const notes: string[] = [];
  const phase = phaseFor(inp.goal, inp.weekStart, inp.raceDate);
  const cyc = phase === "base" || phase === "build";
  const cycleIdx = cyc ? Math.max(1, Math.min(4, inp.cycleIdx)) : 1;
  const recoveryWeek = cyc && cycleIdx === 4;
  const ft = fatigueFactor(inp.fatigue);
  const winter = isWinter(inp.weekStart);

  // 1) z kondice a fáze
  const ramp = rampFor(phase, recent.provenRamp);
  const keepLoad = r0(7 * ctl);
  const ctlLoad = r0(loadForRamp(ctl, ramp));
  let load = ctlLoad;

  // 2) strop podle skutečnosti posledních 4 týdnů: nejvýš +30 % (aspoň +40) proti jejich váženému průměru
  //    (váhy 1–2–3–4 od nejstaršího: když se objem před pár týdny změnil, plán to zachytí rychle)
  //    Jeden vypadlý týden mezi normálními (nemoc, cesta) se nepočítá; dva a víc slabých týdnů už je změna návyku.
  //    Týdny, kdy měl sportovec aspoň 3 dny stav Nemocný / Zraněný / Dovolená, se nepočítají vůbec.
  const off = (i: number) => (recent.weekOff?.[i] ?? 0) >= 3;
  const low = recent.weekLoads.map((x, i, all) => !off(i) && x < 0.25 * Math.max(0, ...all.filter((_y, j) => j !== i && !off(j))));
  const outage = low.filter(Boolean).length === 1 ? low.indexOf(true) : -1;
  const keep = recent.weekLoads.map((_x, i) => i !== outage && !off(i));
  // kdyby vypadly všechny týdny (měsíc mimo), bere se skutečnost – návrat musí být opatrný
  const use = keep.some(Boolean) ? keep : keep.map(() => true);
  const wl = recent.weekLoads.filter((_x, i) => use[i]);
  const ws = recent.weekSessions.filter((_x, i) => use[i]);
  const wavg = (v: number[]) => (v.length ? v.reduce((t, x, i) => t + x * (i + 1), 0) / v.reduce((t, _x, i) => t + i + 1, 0) : 0);
  const recentLoad = r0(wavg(wl));
  const hasHistory = wl.some((x) => x > 0);
  const cap = hasHistory ? Math.max(recentLoad * 1.3, recentLoad + 40) : Math.max(MIN_WEEK, 150);
  if (load > cap) {
    load = cap;
    if (hasHistory) notes.push(`Poslední týdny jezdíš kolem ${recentLoad} zátěže týdně, proto se přidává postupně, ne skokem.`);
  }
  load = Math.max(load, Math.min(ctlLoad, MIN_WEEK));

  // stropy délek: v zimě krátké jízdy; dlouhý den nejvýš o 15 % delší než nejdelší za poslední 4 týdny
  const typ = recent.typicalMin ?? 60;
  const caps = {
    easy: Math.max(45, Math.min(winter ? 75 : 120, r15(typ * 1.1))),
    long: Math.max(75, Math.min(winter ? 120 : 300, r15(Math.max(recent.longestMin, typ) * 1.15))),
    key: winter ? 60 : 75,
  };

  // 3) lehčí týden bloku
  if (recoveryWeek) { load *= 0.65; notes.push("Lehčí týden po 3 týdnech zátěže: asi o třetinu míň."); }
  // 4) únava ubírá
  if (ft.factor < 1) { load *= ft.factor; notes.push(`Únava (${ft.notes.join(", ")}): týden o ${r0((1 - ft.factor) * 100)} % lehčí${ft.keysMax < 2 ? `, kvalita nejvýš ${ft.keysMax}×` : ""}.`); }

  // kolik kvalit: rozvoj 2 (když je na ně zátěž), jinak 1; úplně malý týden žádnou
  let keys = phase === "build" && !recoveryWeek && load >= 300 ? 2 : load >= 110 ? 1 : 0;
  keys = Math.min(keys, ft.keysMax);
  const long = load >= 120;
  // kolik tréninků: nejvýš o jeden víc, než kolik jich v posledních týdnech obvykle bylo
  const keyLoad = (caps.key / 60) * inp.easyRate * 1.45;
  const longLoad = (caps.long / 60) * inp.easyRate;
  const easyLoad = (caps.easy / 60) * inp.easyRate;
  const maxN = Math.max(3, Math.min(6, r0(wavg(ws)) + 1));
  const rest = Math.max(0, load - keys * keyLoad - (long ? longLoad : 0));
  const sessions = Math.max(2, Math.min(maxN, keys + (long ? 1 : 0) + Math.ceil(rest / Math.max(20, easyLoad) - 0.25)));
  // 5) co se do těch tréninků a délek vejde – víc se nenabízí (žádné natahování jízd kvůli číslu)
  const fit = keys * keyLoad + (long ? longLoad : 0) + Math.max(0, sessions - keys - (long ? 1 : 0)) * easyLoad;
  if (load > fit * 1.03) {
    load = fit;
    notes.push(`Do ${sessions} tréninků s délkou do ${Math.floor(caps.long / 60)}:${String(caps.long % 60).padStart(2, "0")} h se víc nevejde${winter ? " (v zimě počítám s kratšími jízdami)" : ""}.`);
  }
  load = r0(load);

  // co to udělá s kondicí – říct na rovinu
  const after = ctlAfterWeek(ctl, load);
  if (ctl > 15 && after < ctl - 0.5) notes.push(`Na udržení kondice ${r0(ctl)} by bylo potřeba asi ${keepLoad} týdně. S ${load} klesne asi o ${num(ctl - after, 1)} za týden${winter ? " – v zimě je to v pořádku a počítá se s tím" : ""}.`);

  return {
    load,
    lo: r0(load * 0.85),
    hi: r0(load * 1.1),
    keepLoad,
    recentLoad,
    ctlLoad,
    ramp,
    phase,
    sessions,
    keys,
    long,
    caps,
    recoveryWeek,
    cycleIdx,
    ctlTarget: Math.round(after * 10) / 10,
    tsbFloor: tsbFloor(phase),
    factor: ft.factor,
    notes,
  };
}
