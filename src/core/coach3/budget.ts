// Trenér v3 – cíl zátěže a výhled kondice. Všechno se počítá od DNEŠNÍ kondice (ne od pondělí), takže cíl
// a výhled nikdy nejdou proti sobě: pokles kondici snižuje, udržet drží, zlepšit zvedá – pokud to nepustí omezení,
// a pak to výsledek řekne čísly.
import { K_CTL, type Goal } from "../fitness";
import { type Phase, PHASE_LABEL, isWinter, phaseFor, rampFor } from "../coach/target";
import { addDays, daysBetween, mondayOf } from "../../lib/time";

const A = 1 - K_CTL;

/** Celková zátěž za `n` dní (rovnoměrně rozložená), po které kondice přejde z `c0` na `c1`. */
export function loadToReach(c0: number, c1: number, n: number): number {
  if (n <= 0) return 0;
  const an = Math.pow(A, n);
  return Math.max(0, (n * (c1 - c0 * an)) / (1 - an));
}

/** Kondice po `n` dnech s celkovou zátěží `load` rozloženou rovnoměrně. */
export function ctlAfter(c0: number, load: number, n: number): number {
  if (n <= 0) return c0;
  const an = Math.pow(A, n);
  return c0 * an + (load / n) * (1 - an);
}

/** Historie posledních 4 ukončených týdnů (nejstarší první). */
export interface History {
  weekLoads: number[];
  weekSessions: number[];
  /** dny mimo (Nemocný / Zraněný / Dovolená) v týchž týdnech */
  weekOff: number[];
  /** typický (medián) růst kondice za týden za 4 měsíce; null = neznámý */
  provenRamp: number | null;
}

/**
 * Obvyklá týdenní zátěž: vážený průměr 4 týdnů (novější víc). Týdny s ≥ 3 dny mimo se nepočítají, jeden
 * ojedinělý propad (pod čtvrtinu ostatních) taky ne. Když nezbude nic, bere se skutečnost.
 */
export function usualLoad(h: Pick<History, "weekLoads" | "weekOff">): number {
  const off = (i: number) => (h.weekOff[i] ?? 0) >= 3;
  const max = (i: number) => Math.max(0, ...h.weekLoads.filter((_x, j) => j !== i && !off(j)));
  const low = h.weekLoads.map((x, i) => !off(i) && x < 0.25 * max(i));
  const outage = low.filter(Boolean).length === 1 ? low.indexOf(true) : -1;
  let idx = h.weekLoads.map((_x, i) => i).filter((i) => i !== outage && !off(i));
  if (!idx.length) idx = h.weekLoads.map((_x, i) => i);
  const w = idx.reduce((t, i) => t + (i + 1), 0);
  return w ? Math.round(idx.reduce((t, i) => t + h.weekLoads[i]! * (i + 1), 0) / w) : 0;
}

export interface WeekTarget {
  weekStart: string;
  /** první plánovaný den (u tohoto týdne dnešek / zítřek) */
  from: string;
  /** plánovaných dní */
  days: number;
  phase: Phase;
  phaseLabel: string;
  /** růst kondice za celý týden podle fáze */
  ramp: number;
  cycleIdx: number;
  recoveryWeek: boolean;
  winter: boolean;
  /** kondice na začátku plánovaného úseku (u tohoto týdne dnešní) */
  ctlStart: number;
  /** kam má kondice podle cíle dojít na konci týdne */
  ctlGoal: number;
  /** zátěž plánovaných dní potřebná na cíl */
  need: number;
  /** zátěž plánovaných dní po omezeních */
  load: number;
  /** už odjeto tento týden (před `from`) */
  done: number;
  /** odhad kondice na konci týdne s `load` */
  ctlEnd: number;
  /** co cíl omezilo (null = nic) */
  limit: "historie" | "únava" | "lehčí týden" | null;
  notes: string[];
}

export interface BudgetInput {
  goal: Goal;
  raceDate: string | null;
  /** první plánovaný den */
  from: string;
  /** kondice na konci dne před `from` */
  ctlNow: number;
  /** zátěž odjetá tento týden před `from` */
  doneLoad: number;
  history: History;
  /** únava: násobek zátěže pro tento týden (1 = bez únavy) */
  fatigue: number;
  /** kolik týdnů (včetně tohoto) */
  weeks: number;
}

/** Lehčí každý 4. týden bloku v Základu a Rozvoji – podle kalendářního týdne, ať je stabilní. */
export function cycleIndex(weekStart: string): number {
  const n = Math.floor(daysBetween("2024-01-01", weekStart) / 7);
  return (((n % 4) + 4) % 4) + 1;
}

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const n1 = (x: number) => x.toFixed(1).replace(".", ",");

/** Obvyklá zátěž a jestli je historie (sdílené pro všechny týdny). */
export const historyBase = (h: History) => ({ usual: usualLoad(h), hasHistory: h.weekLoads.some((x) => x > 0) });

/**
 * Cíl jednoho týdne. `k` = pořadí (0 = tento, od `from` do neděle), `ctl` = kondice na začátku plánovaných dní
 * (u dalších týdnů ta, na kterou opravdu dojde předchozí plán), `prevTotal` = zátěž předchozího normálního týdne
 * (strop: nejvýš +15 %, aspoň +30; u tohoto týdne strop z historie +30 %, aspoň +40).
 */
export function weekTarget(inp: BudgetInput, k: number, ctl: number, prevTotal: number): WeekTarget {
  const { usual, hasHistory } = historyBase(inp.history);
  const weekStart = addDays(mondayOf(inp.from), 7 * k);
  const from = k === 0 ? inp.from : weekStart;
  const days = daysBetween(from, addDays(weekStart, 7));
  const done = k === 0 ? inp.doneLoad : 0;
  const phase = phaseFor(inp.goal, weekStart, inp.raceDate);
  const cyc = phase === "base" || phase === "build";
  const cycleIdx = cyc ? cycleIndex(weekStart) : 1;
  const recoveryWeek = cyc && cycleIdx === 4;
  const ramp = rampFor(phase, inp.history.provenRamp);
  const notes: string[] = [];
  // cíl jen pro plánované dny: růst se krátí poměrem dní (ve čtvrtek zbývají 4 dny → 4/7 týdenního růstu)
  const ctlGoal = ctl + (ramp * days) / 7;
  const need = r0(loadToReach(ctl, ctlGoal, days));
  let load = need;
  let limit: WeekTarget["limit"] = null;
  // strop podle historie (celý týden včetně odjetého)
  // další týdny: z předchozího plánovaného (+15 %, aspoň +30), ale nikdy pod strop z historie – tento týden
  // bývá neúplný (část odjetá, část plán), nesmí stáhnout další týdny pod to, co obvykle jezdíš
  const histCap = hasHistory ? Math.max(usual * 1.3, usual + 40) : 150;
  const cap = k === 0 ? histCap : Math.max(histCap, prevTotal * 1.15, prevTotal + 30);
  if (done + load > cap) {
    load = Math.max(0, cap - done);
    limit = "historie";
  }
  if (recoveryWeek) {
    const easy = Math.max(0, r0(prevTotal * 0.65) - done);
    if (easy < load) { load = easy; limit = "lehčí týden"; }
  }
  const f = k === 0 ? inp.fatigue : k === 1 ? (1 + inp.fatigue) / 2 : 1;
  if (f < 1) { load = load * f; limit = "únava"; }
  load = r0(load);
  const ctlEnd = ctlAfter(ctl, load, days);
  const goalTxt = ramp < 0 ? `řízený pokles kondice na ${n1(ctlGoal)}` : ramp === 0 ? `udržení kondice ${n1(ctl)}` : `růst kondice na ${n1(ctlGoal)}`;
  const span = k === 0 && days < 7 ? " do neděle" : "";
  if (limit === "historie" && load < need)
    notes.push(`Na ${goalTxt} by bylo potřeba ${need} zátěže${span}. ${hasHistory && k === 0 ? `Poslední týdny jezdíš kolem ${usual} týdně a víc než o 30 % najednou nepřidávám` : k > 0 ? "Přidávám nejvýš o 15 % za týden" : "Bez historie začínám opatrně"}, takže ${load} → kondice ${n1(ctlEnd)}.`);
  if (limit === "lehčí týden") notes.push(`Lehčí 4. týden bloku: ${load} zátěže (asi 65 % běžného) → kondice ${n1(ctlEnd)}.`);
  if (limit === "únava") notes.push(`Únava: týden o ${r0((1 - f) * 100)} % lehčí → kondice ${n1(ctlEnd)}.`);
  return { weekStart, from, days, phase, phaseLabel: PHASE_LABEL[phase], ramp, cycleIdx, recoveryWeek, winter: isWinter(weekStart), ctlStart: r1(ctl), ctlGoal: r1(ctlGoal), need, load, done: r0(done), ctlEnd: r1(ctlEnd), limit, notes };
}

/** Cíle všech týdnů s rovnoměrným odhadem kondice (engine místo toho navazuje skutečným výhledem plánu). */
export function weekTargets(inp: BudgetInput): WeekTarget[] {
  const out: WeekTarget[] = [];
  let ctl = inp.ctlNow;
  let prev = historyBase(inp.history).usual;
  for (let k = 0; k < inp.weeks; k++) {
    const t = weekTarget(inp, k, ctl, prev);
    out.push(t);
    ctl = ctlAfter(ctl, t.load, t.days);
    // po lehčím týdnu se pokračuje z úrovně před ním (lehčí týden strop dalších nesnižuje)
    if (!t.recoveryWeek) prev = t.done + t.load;
  }
  return out;
}
