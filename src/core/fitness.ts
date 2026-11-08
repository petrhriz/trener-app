// Kondice / únava / forma (6.4).
import { addDays, dateRange } from "../lib/time";

export const K_CTL = 0.0235;
export const K_ATL = 0.1331;

export interface DayMetric {
  date: string;
  load: number;
  ctl: number; // konec dne
  atl: number; // konec dne
  form: number; // jako intervals.icu: CTL(D) − ATL(D)
  ramp: number | null; // CTL(D) − CTL(D−7)
}

export interface Anchor {
  ctl: number;
  atl: number;
  ramp: number | null;
}

export const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function step(prev: { ctl: number; atl: number }, load: number) {
  return {
    ctl: prev.ctl + (load - prev.ctl) * K_CTL,
    atl: prev.atl + (load - prev.atl) * K_ATL,
  };
}

/**
 * Celá řada od `from` do `to`. Dny bez aktivity mají zátěž 0.
 * `anchors` = hodnoty z intervals.icu (konec dne) – kde jsou, platí ony; jinde se pokračuje výpočtem.
 */
export function computeMetrics(
  loads: Map<string, number>,
  from: string,
  to: string,
  seed: { ctl: number; atl: number } = { ctl: 0, atl: 0 },
  anchors: Map<string, Anchor> = new Map(),
): DayMetric[] {
  const out: DayMetric[] = [];
  let prev = seed;
  const ctlHist: number[] = [];
  for (const d of dateRange(from, to)) {
    const load = loads.get(d) ?? 0;
    const an = anchors.get(d);
    const cur = an ? { ctl: an.ctl, atl: an.atl } : step(prev, load);
    ctlHist.push(cur.ctl);
    const ramp = an?.ramp != null ? an.ramp : ctlHist.length > 7 ? cur.ctl - ctlHist[ctlHist.length - 8]! : null;
    out.push({ date: d, load: r1(load), ctl: r2(cur.ctl), atl: r2(cur.atl), form: r2(cur.ctl - cur.atl), ramp: ramp == null ? null : r2(ramp) });
    prev = cur;
  }
  return out;
}

/** Výhled: start = stav na konci posledního ukončeného dne; loads = zátěž dalších dnů. Forma = CTL − ATL dne. */
export function project(start: { ctl: number; atl: number }, startDate: string, loads: number[]) {
  const out: { date: string; load: number; ctl: number; atl: number; form: number }[] = [];
  let prev = start;
  loads.forEach((load, i) => {
    const cur = step(prev, load);
    out.push({ date: addDays(startDate, i + 1), load, ctl: r1(cur.ctl), atl: r1(cur.atl), form: r1(cur.ctl - cur.atl) });
    prev = cur;
  });
  return out;
}

export type FormZone = "Přechod" | "Čerstvý" | "Šedá zóna" | "Optimální" | "Vysoké riziko";

export function formZone(f: number): FormZone {
  if (f > 20) return "Přechod";
  if (f >= 5) return "Čerstvý";
  if (f >= -10) return "Šedá zóna";
  if (f >= -30) return "Optimální";
  return "Vysoké riziko";
}

export const FORM_ZONE_RANGE: Record<FormZone, string> = {
  Přechod: "nad +20",
  Čerstvý: "+5 až +20",
  "Šedá zóna": "−10 až +5",
  Optimální: "−30 až −10",
  "Vysoké riziko": "pod −30",
};

export function rampLabel(ramp: number | null): string {
  if (ramp == null) return "–";
  if (ramp > 5) return "rychlý růst";
  if (ramp >= 1) return "mírný růst";
  if (ramp > -1) return "stabilní";
  return "pokles";
}

export type Goal = "udrzeni" | "zvyseni" | "pokles" | "zavod";

export const GOAL_LABEL: Record<Goal, string> = {
  zvyseni: "zlepšení kondice",
  udrzeni: "udržení formy",
  pokles: "řízený pokles (zima / odpočinek)",
  zavod: "příprava na závod",
};

/**
 * Udržení = 7 × CTL ± 10 %; zvýšení +5 až +10 % (ramp max +3 / týden);
 * pokles = 80–90 % z 7 × CTL (mimo sezónu je mírný pokles do −10 % v pořádku, ostrý propad ne).
 */
export function weeklyLoadTarget(ctl: number, goal: Goal): { lo: number; hi: number; mid: number } {
  const base = 7 * ctl;
  if (goal === "udrzeni") return { lo: Math.round(base * 0.9), hi: Math.round(base * 1.1), mid: Math.round(base) };
  if (goal === "pokles") return { lo: Math.round(base * 0.8), hi: Math.round(base * 0.9), mid: Math.round(base * 0.85) };
  // ramp +3 / týden ≈ denní zátěž o 3 / (1 − (1 − K)^7) nad CTL
  const maxWeekly = 7 * (ctl + 3 / (1 - Math.pow(1 - K_CTL, 7)));
  const lo = Math.round(base * 1.05);
  const hi = Math.round(Math.min(base * 1.1, maxWeekly));
  return { lo, hi: Math.max(lo, hi), mid: Math.round((lo + Math.max(lo, hi)) / 2) };
}
