// Postup v žebříčcích: po čistě zvládnuté jednotce o stupeň výš, po nezvládnuté níž. Rozdělení intenzity za 28 dní.
import { BIKE_SPORTS, type NLap, type Sport } from "../../datasource/types";
import { addDays } from "../../lib/time";
import type { Goal } from "../fitness";
import { type Outcome, evaluatePast } from "../qualityDesign";
import type { WorkPlan, WorkTarget } from "./library";

export interface DoneKey {
  date: string;
  /** cíl pracovních úseků z plánu (kolo s wattmetrem); `blocks` = všechny druhy úseků */
  plan: WorkPlan | null;
  laps: NLap[] | null;
  /** splnění workoutu z intervals.icu v % */
  compliance: number | null;
}

const WORSE: Record<Outcome, number> = { posun: 0, nove: 1, zopakovat: 2, ubrat: 3 };

/**
 * Jak dopadla klíčová jednotka: podle okruhů (výkon proti pásmu, nárůst tepu), jinak podle splnění.
 * Trénink s víc druhy úseků se hodnotí po blocích: každý okruh patří k bloku se stejnou délkou a nejbližším
 * pásmem, výsledek je ten nejhorší (vynechaný blok = ubrat). Jen podle prvního bloku se nehodnotí.
 */
export function outcomeOf(d: DoneKey): { outcome: Outcome; text: string } {
  if (d.plan && d.laps?.length) {
    const blocks: WorkTarget[] = d.plan.blocks?.length ? d.plan.blocks : [d.plan];
    if (blocks.length === 1) {
      const e = evaluatePast({ date: d.date, type: "prah", plan: blocks[0]!, laps: d.laps });
      return { outcome: e.outcome, text: e.text };
    }
    const fits = (l: NLap, b: WorkTarget) => l.moving_s >= b.work_s * 0.75 && l.moving_s <= b.work_s * 1.25;
    const mine: NLap[][] = blocks.map(() => []);
    for (const l of d.laps) {
      let bi = -1, bd = Infinity;
      blocks.forEach((b, i) => {
        if (!fits(l, b)) return;
        const dist = Math.abs((l.avg_power ?? 0) - (b.lo + b.hi) / 2);
        if (dist < bd) { bd = dist; bi = i; }
      });
      if (bi >= 0) mine[bi]!.push(l);
    }
    const res = blocks.map((b, i) => {
      const expected = b.reps * (b.sets ?? 1);
      if (!mine[i]!.length) return { outcome: "ubrat" as Outcome, text: `blok ${i + 1}: dokončeno 0 z ${expected}` };
      const e = evaluatePast({ date: d.date, type: "prah", plan: b, laps: mine[i]! });
      return { outcome: e.outcome, text: `blok ${i + 1}: ${e.text}` };
    });
    const worst = res.reduce((a, b) => (WORSE[b.outcome] > WORSE[a.outcome] ? b : a));
    return { outcome: worst.outcome, text: res.map((r) => r.text).join("; ") };
  }
  if (d.compliance != null) {
    if (d.compliance >= 95) return { outcome: "posun", text: `splněno ${Math.round(d.compliance)} %` };
    if (d.compliance >= 75) return { outcome: "zopakovat", text: `splněno ${Math.round(d.compliance)} %` };
    return { outcome: "ubrat", text: `splněno jen ${Math.round(d.compliance)} %` };
  }
  return { outcome: "zopakovat", text: "bez okruhů a splnění – stejný stupeň" };
}

/** Nový stupeň: Udržet a Pokles nahoru neposouvají. */
export function nextLevel(level: number, outcome: Outcome, goal: Goal): number {
  if (outcome === "posun") return goal === "udrzeni" || goal === "pokles" ? level : level + 1;
  if (outcome === "ubrat") return Math.max(0, level - 1);
  return level;
}

export interface ZoneAct {
  date: string;
  sport: Sport;
  moving_s: number | null;
  hr_z: number[] | null;
  pwr_z: number[] | null;
}

export interface SportDistribution {
  /** podíly času v % (lehce = Z1–Z2, středně = Z3, intenzivně = Z4 a výš) */
  low: number;
  mid: number;
  high: number;
  hours: number;
  /** z čeho: watty, tep, nebo obojí (kolo bez wattmetru) */
  method: "power" | "hr" | "mixed";
}

export interface Distribution extends Omit<SportDistribution, "method"> {
  days: number;
  /** Celek je jen orientační: zóny wattů na kole a tepu v běhu nejsou totéž. Řídit podle sportů zvlášť. */
  ride: SportDistribution | null;
  run: SportDistribution | null;
}

interface Acc { low: number; mid: number; high: number; power: boolean; hr: boolean }
const acc = (): Acc => ({ low: 0, mid: 0, high: 0, power: false, hr: false });
function finish(a: Acc, minS: number): SportDistribution | null {
  const t = a.low + a.mid + a.high;
  if (t < minS) return null;
  const pc = (x: number) => Math.round((x / t) * 100);
  return { low: pc(a.low), mid: pc(a.mid), high: 100 - pc(a.low) - pc(a.mid), hours: Math.round((t / 3600) * 10) / 10, method: a.power && a.hr ? "mixed" : a.power ? "power" : "hr" };
}

/** Rozdělení intenzity za posledních `days` dní z času v zónách (kolo podle wattů, jinak podle tepu), celkem i zvlášť kolo a běh. */
export function distribution(acts: ZoneAct[], today: string, days = 28): Distribution | null {
  const from = addDays(today, -days);
  const all = acc(), ride = acc(), run = acc();
  for (const a of acts) {
    if (a.date <= from || a.date > today) continue;
    const bike = BIKE_SPORTS.includes(a.sport);
    const pz = bike && a.pwr_z && a.pwr_z.some((x) => x > 0) ? a.pwr_z : null;
    const z = pz ?? (a.hr_z && a.hr_z.some((x) => x > 0) ? a.hr_z : null);
    if (!z) continue;
    const add = (t: Acc) => {
      t.low += (z[0] ?? 0) + (z[1] ?? 0);
      t.mid += z[2] ?? 0;
      for (let i = 3; i < z.length; i++) t.high += z[i] ?? 0;
      if (pz) t.power = true; else t.hr = true;
    };
    add(all);
    if (bike) add(ride);
    else if (a.sport === "run") add(run);
  }
  const t = finish(all, 3600);
  if (!t) return null;
  return { low: t.low, mid: t.mid, high: t.high, hours: t.hours, days, ride: finish(ride, 1800), run: finish(run, 1800) };
}
