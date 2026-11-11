// Návrh týdne Trenéra v2: kolik hodin a kolik kvalit nabídnout. Vychází z toho, co uživatel obvykle jezdí
// (žádné nastavené hodiny), cíl objem posouvá a únava ho ubírá. Není to limit, který se „musí splnit“ –
// je to velikost nabídky; vynechaný trénink se nedohání.
import { num } from "../../lib/format";
import { daysBetween } from "../../lib/time";
import { K_CTL, type Goal } from "../fitness";
import { type Habit, isWinter } from "./profile";

export type Phase = "zaklad" | "rozvoj" | "udrzovani" | "ladeni";
export const PHASE_LABEL: Record<Phase, string> = { zaklad: "Základ", rozvoj: "Rozvoj", udrzovani: "Udržování", ladeni: "Ladění" };

/** CTL po 7 dnech stejné denní zátěže d: C·k7 + d·(1 − k7) */
export const K7 = Math.pow(1 - K_CTL, 7);
/** Zátěž týdne, po které bude kondice za 7 dní `target`. */
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

/** Únava jen ubírá: násobek objemu a strop klíčových dnů. */
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

export interface BudgetInput {
  weekStart: string;
  goal: Goal;
  /** obvyklý objem uživatele z historie */
  habit: Habit;
  /** kondice na konci dne před týdnem */
  ctl: number;
  raceDate: string | null;
  /** zátěž posledních ukončených týdnů (nejstarší první) */
  prevWeeks: number[];
  /** pozice v bloku 1–4 (4 = lehčí týden); jen Zlepšit a Závod */
  cycleIdx: number;
  fatigue: Fatigue;
  rate: Rate;
}

export interface Budget {
  /** orientační zátěž týdne a pásmo (když odjedeš vše, co trenér nabízí) */
  load: number;
  lo: number;
  hi: number;
  /** nabízené hodiny týdne */
  hours: number;
  /** obvyklé hodiny uživatele (z historie), null = bez historie */
  habitHours: number | null;
  /** nabízený počet tréninků */
  sessions: number;
  keys: number;
  phase: Phase;
  recoveryWeek: boolean;
  cycleIdx: number;
  /** kam se kondice dostane, když týden odjedeš */
  ctlTarget: number;
  /** násobek kvůli únavě (1 = bez úpravy) */
  factor: number;
  notes: string[];
}

export function phaseFor(goal: Goal, weekStart: string, raceDate: string | null): Phase {
  if (goal === "udrzeni" || goal === "pokles") return "udrzovani";
  if (goal === "zavod" && raceDate) {
    const d = daysBetween(weekStart, raceDate);
    if (d >= 0 && d <= 14) return "ladeni";
    if (d > 84) return "zaklad";
    if (d >= 0) return "rozvoj";
  }
  return isWinter(weekStart) ? "zaklad" : "rozvoj";
}

const r0 = Math.round;
const h1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
/** bez historie: opatrný začátek */
const START = { hours: 3.5, sessions: 3 };
/** Zlepšit: zátěžové týdny bloku přidávají proti obvyklému objemu */
const BUILD = [1.05, 1.1, 1.15];

export function weekBudget(inp: BudgetInput): Budget {
  const { goal, ctl, rate, habit } = inp;
  const notes: string[] = [];
  const phase = phaseFor(goal, inp.weekStart, inp.raceDate);
  const cyc = goal === "zvyseni" || goal === "zavod";
  const cycleIdx = cyc ? Math.max(1, Math.min(4, inp.cycleIdx)) : 1;
  const recoveryWeek = cyc && cycleIdx === 4 && phase !== "ladeni";
  const light = recoveryWeek || phase === "ladeni";
  const ft = fatigueFactor(inp.fatigue);
  const base = habit.hours ?? START.hours;
  const baseN = habit.sessions ?? START.sessions;

  // 1) objem: obvyklý × cíl
  let hours = base;
  if (recoveryWeek) { hours = base * 0.65; notes.push("Lehčí týden po 3 týdnech zátěže: asi o třetinu míň, jedna krátká ostrá jednotka."); }
  else if (phase === "ladeni") { hours = base * (inp.raceDate && daysBetween(inp.weekStart, inp.raceDate) <= 7 ? 0.45 : 0.65); notes.push("Ladění před závodem: objem dolů, krátké ostré úseky zůstávají."); }
  else if (cyc) hours = base * BUILD[cycleIdx - 1]!;
  else if (goal === "pokles") hours = Math.max(Math.min(base, 2), base * 0.8);

  // 2) počet tréninků a kvalit podle toho, jak často jezdíš
  let sessions = Math.max(2, Math.min(6, r0(baseN)));
  if (light || goal === "pokles") sessions = Math.max(2, sessions - 1);
  let keys = light || goal === "pokles" ? 1 : sessions >= 5 ? 2 : sessions >= 3 && phase === "rozvoj" ? 2 : 1;
  keys = Math.min(keys, ft.keysMax);

  // 3) pojistky proti skoku: +15 % proti běžnému týdnu (nebo +10 % proti poslednímu plnému), poměr 7/28 dní do 1,3
  let load = loadForHours(hours, keys, rate);
  const wl = inp.prevWeeks.filter((x) => x > 0);
  const top = wl.length ? Math.max(...wl) : 0;
  const normal = wl.filter((x) => x >= top * 0.6);
  const ref = normal.length ? normal.reduce((a, b) => a + b, 0) / normal.length : 0;
  const lastFull = normal.length ? normal[normal.length - 1]! : 0;
  const capLoad = Math.max(ref * 1.15, lastFull * 1.1);
  if (!light && ref > 0 && load > capLoad) { load = capLoad; notes.push(`Přidává se postupně: tento týden nejvýš zátěž ${r0(load)} (běžný týden ${r0(ref)}).`); }
  if (ctl > 10 && load > ctl * 7 * 1.3) { load = ctl * 7 * 1.3; notes.push(`Zátěž držím do 1,3násobku dlouhodobého průměru (${r0(load)}).`); }

  // 4) únava ubírá
  if (ft.factor < 1) {
    load *= ft.factor;
    notes.push(`Únava (${ft.notes.join(", ")}): týden o ${r0((1 - ft.factor) * 100)} % lehčí${ft.keysMax < 2 ? `, kvalita nejvýš ${ft.keysMax}×` : ""}.`);
  }
  hours = Math.min(hours, hoursForLoad(load, keys, rate));
  load = r0(load);
  const after = ctlAfterWeek(ctl, load);
  if (!light && ctl > 15) {
    if (goal === "zvyseni" && after < ctl - 0.3) notes.push(`S objemem kolem ${h1(hours)} h týdně kondice neroste (ustálí se u ${r0(load / 7)}). Na růst je potřeba jezdit o něco víc nebo častěji – trenér přidává postupně.`);
    if (goal === "udrzeni" && after < ctl - 1) notes.push(`Obvykle jezdíš kolem ${h1(base)} h týdně; s tím se kondice ustálí u ${r0(load / 7)} (teď ${r0(ctl)}).`);
  }
  return {
    load,
    lo: r0(load * 0.85),
    hi: r0(load * 1.1),
    hours: Math.round(hours * 4) / 4,
    habitHours: habit.hours,
    sessions,
    keys,
    phase,
    recoveryWeek,
    cycleIdx,
    ctlTarget: Math.round(after * 10) / 10,
    factor: ft.factor,
    notes,
  };
}
