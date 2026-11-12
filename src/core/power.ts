// Křivka výkonu, eFTP, čas od posledního podnětu (6.5, 6.6 krok 2).
import { addDays, daysBetween } from "../lib/time";

export interface ActPower {
  id: string;
  date: string;
  mmp: Record<string, number> | null;
  max20: number | null;
  pwr_z: number[] | null;
}

export function bestIn(acts: ActPower[], from: string, to: string, secs: number): { w: number; date: string } | null {
  let best: { w: number; date: string } | null = null;
  for (const a of acts) {
    if (a.date < from || a.date > to) continue;
    let w = a.mmp?.[String(secs)] ?? null;
    if (secs === 1200 && a.max20) w = Math.max(w ?? 0, a.max20);
    if (w && (!best || w > best.w)) best = { w, date: a.date };
  }
  return best;
}

/** eFTP = nejlepší 20min výkon za 42 dní × 0,95 */
export function eftp(acts: ActPower[], today: string): { w: number; date: string } | null {
  const b = bestIn(acts, addDays(today, -42), today, 1200);
  return b ? { w: Math.round(b.w * 0.95), date: b.date } : null;
}

export interface CurveRow {
  secs: number;
  now: number | null;
  prev: number | null;
  pct: number | null; // změna v % (záporná = pokles)
}

/** Posledních 42 dní vs. předchozích 42. Když předchozí okno nemá data: 21 vs. 42 (krátké srovnání). */
export function curveCompare(acts: ActPower[], today: string, secs = [30, 60, 300, 1200]) {
  let short = false;
  const win = (a: number, b: number) => (s: number) => bestIn(acts, addDays(today, -a), addDays(today, -b), s)?.w ?? null;
  let now = win(41, 0);
  let prev = win(83, 42);
  if (secs.every((s) => prev(s) == null)) {
    short = true;
    now = win(20, 0);
    prev = win(41, 0);
  }
  const rows: CurveRow[] = secs.map((s) => {
    const n = now(s);
    const p = prev(s);
    return { secs: s, now: n, prev: p, pct: n && p ? Math.round(((n - p) / p) * 1000) / 10 : null };
  });
  return { short, rows };
}

/** Kdy naposledy (21 dní): ≥10 min Z5+ (VO2), ≥20 min Z4 (práh), ≥30 s Z6–Z7 (anaerobní). */
export function lastStimulus(acts: ActPower[], today: string) {
  const from = addDays(today, -21);
  const res: { vo2: string | null; prah: string | null; anaer: string | null } = { vo2: null, prah: null, anaer: null };
  for (const a of [...acts].sort((x, y) => y.date.localeCompare(x.date))) {
    if (a.date < from || a.date > today || !a.pwr_z) continue;
    const z = a.pwr_z;
    if (!res.vo2 && (z[4] ?? 0) + (z[5] ?? 0) + (z[6] ?? 0) >= 600) res.vo2 = a.date;
    if (!res.prah && (z[3] ?? 0) >= 1200) res.prah = a.date;
    if (!res.anaer && (z[5] ?? 0) + (z[6] ?? 0) >= 30) res.anaer = a.date;
  }
  return res;
}

export const daysSince = (date: string | null, today: string) => (date ? daysBetween(date, today) : 99);
