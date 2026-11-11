// Rozpočet týdne Trenéra v2: hodiny z profilu + zátěž z trajektorie kondice (CTL), cyklus 3 + 1, pojistky, únava.
import { num } from "../../lib/format";
import { daysBetween } from "../../lib/time";
import { K_CTL, type Goal } from "../fitness";
import type { Phase } from "./library";
import { type CoachProfile, hoursFor, isWinter } from "./profile";

/** CTL po 7 dnech stejné denní zátěže d: C·k7 + d·(1 − k7) */
export const K7 = Math.pow(1 - K_CTL, 7);

/** Zátěž týdne, po které bude kondice za 7 dní `target` (uzavřený vzorec). */
export function loadForCtl(ctlNow: number, target: number): number {
  return Math.max(0, (7 * (target - ctlNow * K7)) / (1 - K7));
}
/** Kondice po týdnu se zátěží `load`. */
export function ctlAfterWeek(ctlNow: number, load: number): number {
  return ctlNow * K7 + (load / 7) * (1 - K7);
}

export interface Rate {
  /** zátěž za hodinu lehké jednotky (Z2) – z historie uživatele */
  easy: number;
  /** zátěž klíčové jednotky (celé, ~75 min) */
  key: number;
}
export const KEY_MIN = 75;

export function loadForHours(hours: number, keys: number, r: Rate): number {
  const keyH = Math.min(hours, (keys * KEY_MIN) / 60);
  return (keyH / (KEY_MIN / 60)) * r.key + Math.max(0, hours - keyH) * r.easy;
}
export function hoursForLoad(load: number, keys: number, r: Rate): number {
  const keyLoad = keys * r.key;
  if (load <= keyLoad) return (load / Math.max(1, r.key)) * (KEY_MIN / 60);
  return (keys * KEY_MIN) / 60 + (load - keyLoad) / Math.max(1, r.easy);
}

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

/** Únava jen ubírá: násobek rozpočtu a strop klíčových dnů. */
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

export interface Anchor {
  /** den, od kterého trajektorie běží (kdy byl cíl nastaven) */
  date: string;
  ctl: number;
  goal: Goal;
}

export interface BudgetInput {
  weekStart: string;
  goal: Goal;
  profile: CoachProfile;
  /** kondice na konci dne před týdnem */
  ctl: number;
  anchor: Anchor | null;
  raceDate: string | null;
  /** zátěž posledních ukončených týdnů (nejstarší první) */
  prevWeeks: number[];
  /** pozice v bloku 1–4 (4 = lehčí týden); jen Zlepšit a Závod */
  cycleIdx: number;
  fatigue: Fatigue;
  rate: Rate;
}

export interface Budget {
  /** cíl zátěže týdne a pásmo */
  load: number;
  lo: number;
  hi: number;
  hours: number;
  hoursBand: { min: number; max: number };
  keys: number;
  phase: Phase;
  recoveryWeek: boolean;
  cycleIdx: number;
  /** kam má kondice na konci týdne dojít */
  ctlTarget: number;
  /** násobek kvůli únavě (1 = bez úpravy) */
  factor: number;
  notes: string[];
}

export function phaseFor(goal: Goal, profile: CoachProfile, weekStart: string, raceDate: string | null): Phase {
  if (goal === "udrzeni" || goal === "pokles") return "udrzovani";
  if (goal === "zavod" && raceDate) {
    const d = daysBetween(weekStart, raceDate);
    if (d >= 0 && d <= 14) return "ladeni";
    if (d > 84) return "zaklad";
    if (d >= 0) return "rozvoj";
  }
  return isWinter(profile, weekStart) ? "zaklad" : "rozvoj";
}

const r0 = Math.round;
const h1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

export function weekBudget(inp: BudgetInput): Budget {
  const { goal, profile, ctl, rate } = inp;
  const notes: string[] = [];
  const band = hoursFor(profile, inp.weekStart);
  const phase = phaseFor(goal, profile, inp.weekStart, inp.raceDate);
  const cyc = goal === "zvyseni" || goal === "zavod";
  const cycleIdx = cyc ? Math.max(1, Math.min(4, inp.cycleIdx)) : 1;
  const wl = inp.prevWeeks.filter((x) => x > 0);
  const top = wl.length ? Math.max(...wl) : 0;
  const normal = wl.filter((x) => x >= top * 0.6);
  const ref = normal.length ? normal.reduce((a, b) => a + b, 0) / normal.length : 0;
  const recoveryWeek = cyc && cycleIdx === 4 && phase !== "ladeni";
  const ft = fatigueFactor(inp.fatigue);

  // 1) trajektorie kondice: přímka od kotvy, oprava nejvýš poloviny odchylky za týden
  const ramp = goal === "zvyseni" || goal === "zavod" ? profile.ramp : goal === "pokles" ? -1 : 0;
  const anchor = inp.anchor && inp.anchor.goal === goal ? inp.anchor : null;
  const weeksIn = anchor ? Math.max(0, daysBetween(anchor.date, inp.weekStart) / 7) : 0;
  // průměr přes blok 3 + 1 (zátěžové týdny rostou 1,5× rychleji, lehčí týden kousek vrátí) vychází na ~0,8 rampy
  const lineNow = anchor ? anchor.ctl + ramp * (cyc ? 0.8 : 1) * weeksIn : ctl;
  const dev = lineNow - ctl;
  let delta = (cyc ? ramp * 1.5 : ramp) + 0.5 * dev;
  delta = Math.max(-2.5, Math.min(3, delta));
  let load = loadForCtl(ctl, ctl + delta);

  // 2) lehčí týden / ladění
  if (recoveryWeek) {
    const last = wl.length ? wl[wl.length - 1]! : load;
    load = last * 0.65;
    notes.push(`Lehčí týden po 3 týdnech zátěže: ${r0(load)} (65 % minulého).`);
  } else if (phase === "ladeni" && inp.raceDate) {
    const d = daysBetween(inp.weekStart, inp.raceDate);
    load = (ref || load) * (d <= 7 ? 0.45 : 0.65);
    notes.push(`Ladění před závodem: objem dolů, krátké ostré úseky zůstávají.`);
  }

  // 3) klíčové dny podle hodin a režimu (počítá se s horní hranicí hodin)
  let keys = recoveryWeek || phase === "ladeni" || goal === "pokles" ? 1 : band.max < 4 ? 1 : band.max <= 7 ? (phase === "rozvoj" ? 2 : 1) : 2;
  keys = Math.min(keys, ft.keysMax);

  // 4) hodiny z profilu: strop vždy, spodní hranice mimo lehčí týden a ladění
  let hours = hoursForLoad(load, keys, rate);
  const light = recoveryWeek || phase === "ladeni";
  if (hours > band.max) {
    hours = band.max;
    load = loadForHours(hours, keys, rate);
    const sustain = load / 7;
    if (goal !== "pokles" && sustain < ctl - 2) notes.push(`Do ${h1(band.max)} h týdně se cíl nevejde: s tímto objemem se kondice ustálí kolem ${r0(sustain)} (teď ${r0(ctl)}). Na udržení ${r0(ctl)} potřebuješ asi ${h1(hoursForLoad(ctl * 7, keys, rate))} h týdně.`);
    else if (goal === "pokles") notes.push(`Řízený pokles: ${h1(band.max)} h týdně, kondice klesne k ${r0(sustain)}.`);
  } else if (!light && hours < band.min) {
    hours = band.min;
    load = loadForHours(hours, keys, rate);
    if (goal === "pokles") notes.push(`Pokles se zastavil na spodní hranici hodin (${h1(band.min)} h týdně) – kondice se ustálí kolem ${r0(load / 7)}.`);
  }

  // 5) pojistky: skok proti běžnému týdnu a poměr 7/28 dní
  // strop: +15 % proti běžnému týdnu, nebo +10 % proti poslednímu plnému týdnu (co je víc)
  const lastFull = normal.length ? normal[normal.length - 1]! : 0;
  const capLoad = Math.max(ref * 1.15, lastFull * 1.1);
  if (!light && ref > 0 && load > capLoad) {
    load = capLoad;
    notes.push(`Zátěž roste postupně: nejvýš ${r0(load)} (běžný týden ${r0(ref)}, poslední plný ${r0(lastFull)}).`);
  }
  if (ctl > 10 && load > ctl * 7 * 1.3) {
    load = ctl * 7 * 1.3;
    notes.push(`Zátěž omezena poměrem 7/28 dní 1,3 (${r0(load)}).`);
  }

  // 6) únava ubírá
  if (ft.factor < 1) {
    load *= ft.factor;
    notes.push(`Únava (${ft.notes.join(", ")}): týden o ${r0((1 - ft.factor) * 100)} % lehčí${ft.keysMax < 2 ? `, kvalita nejvýš ${ft.keysMax}×` : ""}.`);
  }
  hours = Math.min(band.max, hoursForLoad(load, keys, rate));
  load = r0(load);
  return {
    load,
    lo: r0(load * 0.9),
    hi: r0(load * 1.1),
    hours: Math.round(hours * 4) / 4,
    hoursBand: band,
    keys,
    phase,
    recoveryWeek,
    cycleIdx,
    ctlTarget: Math.round(ctlAfterWeek(ctl, load) * 10) / 10,
    factor: ft.factor,
    notes,
  };
}
