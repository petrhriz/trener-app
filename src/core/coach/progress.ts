// Postup v žebříčcích: po čistě zvládnuté jednotce o stupeň výš, po nezvládnuté níž. Rozdělení intenzity za 28 dní.
import { BIKE_SPORTS, type NLap, type Sport } from "../../datasource/types";
import { addDays } from "../../lib/time";
import type { Goal } from "../fitness";
import { type Outcome, evaluatePast } from "../qualityDesign";

export interface DoneKey {
  date: string;
  /** cíl pracovních úseků z plánu (kolo s wattmetrem) */
  plan: { reps: number; work_s: number; lo: number; hi: number; sets?: number } | null;
  laps: NLap[] | null;
  /** splnění workoutu z intervals.icu v % */
  compliance: number | null;
}

/** Jak dopadla klíčová jednotka: podle okruhů (výkon proti pásmu, nárůst tepu), jinak podle splnění. */
export function outcomeOf(d: DoneKey): { outcome: Outcome; text: string } {
  if (d.plan && d.laps?.length) {
    const e = evaluatePast({ date: d.date, type: "prah", plan: d.plan, laps: d.laps });
    return { outcome: e.outcome, text: e.text };
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

export interface Distribution {
  /** podíly času v % (lehce = Z1–Z2, středně = Z3, intenzivně = Z4 a výš) */
  low: number;
  mid: number;
  high: number;
  hours: number;
  days: number;
}

/** Rozdělení intenzity za posledních `days` dní z času v zónách (kolo podle wattů, jinak podle tepu). */
export function distribution(acts: ZoneAct[], today: string, days = 28): Distribution | null {
  const from = addDays(today, -days);
  let low = 0, mid = 0, high = 0;
  for (const a of acts) {
    if (a.date <= from || a.date > today) continue;
    const pz = BIKE_SPORTS.includes(a.sport) && a.pwr_z && a.pwr_z.some((x) => x > 0) ? a.pwr_z : null;
    const z = pz ?? (a.hr_z && a.hr_z.some((x) => x > 0) ? a.hr_z : null);
    if (!z) continue;
    low += (z[0] ?? 0) + (z[1] ?? 0);
    mid += z[2] ?? 0;
    for (let i = 3; i < z.length; i++) high += z[i] ?? 0;
  }
  const t = low + mid + high;
  if (t < 3600) return null;
  const pc = (x: number) => Math.round((x / t) * 100);
  return { low: pc(low), mid: pc(mid), high: 100 - pc(low) - pc(mid), hours: Math.round((t / 3600) * 10) / 10, days };
}
