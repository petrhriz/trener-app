// Kontrola týdne navrženého AI (podle kostry watt-mind/coach: návrh → kontrola → oprava se zpětnou vazbou →
// deterministické oříznutí). Čistá funkce nad dny plánu – vstupem je plán přepočítaný s návrhem AI.
import type { PlanDay } from "./plan";

export interface WeekRules {
  target: { lo: number; hi: number };
  /** max. kvalit v týdnu (sezóna 2, zima 1) */
  qualityLimit: number;
  /** max. dní tréninku za sebou */
  maxRun: number;
  /** tvrdý den těsně před plánem (včera kvalita / hokej) */
  hardBefore?: boolean;
}

export interface Violation {
  code: "load_low" | "load_high" | "quality_many" | "hard_hard" | "streak" | "too_long";
  msg: string;
  date?: string;
}

const isTrain = (d: PlanDay) => ["z2", "long", "quality", "recovery", "hockey", "xc_ski"].includes(d.kind as string);
const isHard = (d: PlanDay) => d.kind === "quality" || d.kind === "hockey";

export function checkWeek(days: PlanDay[], r: WeekRules): Violation[] {
  const out: Violation[] = [];
  const load = days.reduce((t, d) => t + (d.load || 0), 0);
  if (load < r.target.lo * 0.9) out.push({ code: "load_low", msg: `Zátěž týdne ${Math.round(load)} je pod cílem ${r.target.lo}–${r.target.hi}.` });
  if (load > r.target.hi * 1.1) out.push({ code: "load_high", msg: `Zátěž týdne ${Math.round(load)} je nad cílem ${r.target.lo}–${r.target.hi}.` });
  const q = days.filter((d) => d.kind === "quality");
  if (q.length > r.qualityLimit) out.push({ code: "quality_many", msg: `Kvalit je ${q.length}, povoleno ${r.qualityLimit}.` });
  days.forEach((d, i) => {
    const prevHard = i === 0 ? !!r.hardBefore : isHard(days[i - 1]!);
    if (isHard(d) && prevHard) out.push({ code: "hard_hard", msg: `${d.date}: dva tvrdé dny po sobě.`, date: d.date });
    if (d.kind === "quality" && (d.durationMin ?? 0) > 120) out.push({ code: "too_long", msg: `${d.date}: kvalita delší než 2 h.`, date: d.date });
  });
  let run = 0;
  for (const d of days) {
    run = isTrain(d) ? run + 1 : 0;
    if (run > r.maxRun) { out.push({ code: "streak", msg: `${d.date}: ${run} dní tréninku za sebou (max. ${r.maxRun}).`, date: d.date }); run = 0; }
  }
  return out;
}

export const violationsText = (v: Violation[]) => v.map((x) => `- ${x.msg}`).join("\n");
