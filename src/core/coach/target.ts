// Trenér – fáze z cíle a ročního období, zima a únava (společné pro cíl týdne v budget.ts a engine.ts).
import { num } from "../../lib/format";
import { daysBetween, month } from "../../lib/time";
import type { Goal } from "../fitness";

export type Phase = "offseason" | "maintain" | "base" | "build" | "taper" | "post";
export const WINTER_MONTHS = [11, 12, 1, 2];
export const isWinter = (date: string) => WINTER_MONTHS.includes(month(date));

/** Fáze z cíle a ročního období (uživatel ji mění přepínačem cíle, nic dalšího se nenastavuje). */
export function phaseFor(goal: Goal, weekStart: string, raceDate: string | null): Phase {
  if (goal === "pokles") return "offseason";
  if (goal === "udrzeni") return "maintain";
  if (goal === "zavod" && raceDate) {
    const d = daysBetween(weekStart, raceDate);
    if (d >= 0 && d <= 14) return "taper";
    // týden po závodním týdnu: přechod – lehce, bez kvality (Friel: zotavení po závodě 1 týden u kratších závodů)
    if (d >= -7 && d < 0) return "post";
    if (d > 84) return "base";
    if (d >= 0) return "build";
  }
  return isWinter(weekStart) ? "base" : "build";
}

/** Dno formy pro výhled plánu: −30 = spodní hranice pásma „Optimální“ (−10 až −30) v intervals.icu (stejná pásma
 *  jako stránka, src/core/fitness.ts formZone). Pod ním „Vysoké riziko“. Ladění dno nemá (forma tam stoupá). */
export const FORM_FLOOR = -30;
export const formFloor = (phase: Phase): number | null => (phase === "taper" ? null : FORM_FLOOR);

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
  // forma −10 až −30 je podle intervals.icu optimální trénink, sama o sobě neubírá; až pod −30 (Vysoké riziko)
  if (f.form != null && f.form < FORM_FLOOR) cut(0.8, `forma ${num(f.form, 0)} (pod −30, vysoké riziko)`);
  if (f.badMornings >= 3) cut(0.8, `${f.badMornings} horší rána za 5 dní`);
  else if (f.badMornings >= 2) cut(0.9, `${f.badMornings} horší rána za 5 dní`);
  if (f.hrvLow) cut(0.9, "VST týdenní průměr pod normou");
  if (f.illnessDays >= 4) { cut(0.7, "návrat po nemoci"); keysMax = 0; }
  else if (f.illnessDays >= 1) { cut(0.85, "po nemoci postupně"); keysMax = 1; }
  if (factor <= 0.8) keysMax = Math.min(keysMax, 1);
  if (f.form != null && f.form < FORM_FLOOR) keysMax = Math.min(keysMax, 1);
  return { factor, keysMax, notes };
}
