// Připravenost na běh – zvlášť od kola. Kondice z kola neznamená, že šlachy, kosti a svaly unesou dlouhý
// nebo tvrdý běh. Rozhoduje jen běžecká historie: kolik běhů, jak pravidelně, jak dlouhé a kdy naposledy.
import type { Sport } from "../../datasource/types";
import { addDays, daysBetween } from "../../lib/time";

export type RunLevel = "none" | "occasional" | "regular" | "returning" | "experienced";

export interface RunAct {
  date: string;
  sport: Sport;
  moving_s: number | null;
}

export interface RunReadiness {
  level: RunLevel;
  /** smí běžecké intervaly (kvalitu) a běh dva dny po sobě */
  experienced: boolean;
  /** nejdelší běh za 4 týdny (min); po pauze 0 */
  longest: number;
  /** běhy za posledních 28 dní a 60 dní */
  runs28: number;
  runs60: number;
  /** dny od posledního běhu (null = žádný) */
  sinceLast: number | null;
}

/** Krátké „běhy“ (rozklus, přeběhnutí) se nepočítají. */
const MIN_RUN_S = 15 * 60;

/**
 * Úroveň běžce z historie:
 * - none: za 60 dní žádný běh,
 * - returning: běhal, ale poslední běh je víc než 21 dní zpátky (začíná se znovu opatrně),
 * - occasional: méně než 6 běhů za 60 dní,
 * - regular: aspoň 6 běhů za 60 dní a aspoň 3 za poslední 4 týdny,
 * - experienced: pravidelný a aspoň 8 běhů za 4 týdny, nebo běh je hlavní sport.
 * Intervaly smí jen regular a experienced (a hlavní sport běh).
 */
export function runReadiness(acts: RunAct[], today: string, primaryRun: boolean): RunReadiness {
  const runs = acts.filter((a) => a.sport === "run" && (a.moving_s ?? 0) >= MIN_RUN_S && a.date <= today);
  const r60 = runs.filter((a) => a.date > addDays(today, -60));
  const r28 = runs.filter((a) => a.date > addDays(today, -28));
  const last = runs.map((a) => a.date).sort().pop() ?? null;
  const sinceLast = last ? daysBetween(last, today) : null;
  const longest28 = Math.round(Math.max(0, ...r28.map((a) => (a.moving_s ?? 0) / 60)));
  let level: RunLevel;
  if (!r60.length) level = "none";
  else if (sinceLast != null && sinceLast > 21) level = "returning";
  else if (r60.length >= 6 && r28.length >= 8) level = "experienced";
  else if (r60.length >= 6 && r28.length >= 3) level = "regular";
  else level = "occasional";
  // hlavní sport běh: intervaly jako dosud, jen ne hned po pauze; vedlejší běh jen při pravidelném běhání
  const experienced = primaryRun ? level !== "returning" : level === "regular" || level === "experienced";
  // běžec, který běh má jako hlavní sport, ale historii nemá: opatrný začátek 40 min
  const longest = longest28 || (primaryRun && level === "none" ? 40 : 0);
  return { level, experienced, longest, runs28: r28.length, runs60: r60.length, sinceLast };
}
