// Hodnocení náročnosti tréninku (RPE, stupnice Borg CR10 jako session-RPE podle Fostera 2001): 1 velmi lehce,
// 3 lehce, 5 středně, 7 těžce, 9 velmi těžce, 10 maximum; 0 = přeskočeno (už se neptat).
// Stránka se po otevření zeptá na poslední neohodnocenou aktivitu; trenér hodnocení použije u únavy a stupňů kvalit.
import { addDays } from "../lib/time";

/** Ptát se jen na aktivity aspoň 20 min za poslední 3 dny (starší si člověk už nepamatuje přesně). */
export const RPE_MIN_S = 20 * 60;
export const RPE_ASK_DAYS = 3;
/** Lehký trénink (Z2, bez kvality, do 2,5 h) s RPE 7+ je „těžký“ – Z2 má být v CR10 kolem 2–4. */
export const RPE_HARD_EASY = 7;
/** Kvalita s RPE 9+ byla na hraně – stupeň náročnosti se nezvyšuje, i když okruhy vyšly. */
export const RPE_KEY_MAX = 9;

export const RPE_LABEL: Record<number, string> = { 1: "velmi lehce", 2: "lehce", 3: "lehce", 4: "středně", 5: "středně", 6: "trochu těžce", 7: "těžce", 8: "těžce", 9: "velmi těžce", 10: "maximum" };

export interface RpeAct {
  id: string;
  date: string;
  start_local?: string | null;
  sport: string;
  name: string | null;
  moving_s: number | null;
  rpe?: number | null;
}

/** Na kterou aktivitu se zeptat (nejnovější neohodnocená za poslední 3 dny), nebo null. */
export function rpeToAsk<T extends RpeAct>(acts: T[], today: string): T | null {
  const from = addDays(today, -RPE_ASK_DAYS);
  const c = acts.filter((a) => a.date > from && a.date <= today && (a.moving_s ?? 0) >= RPE_MIN_S && a.rpe == null);
  c.sort((a, b) => (b.start_local ?? b.date).localeCompare(a.start_local ?? a.date));
  return c[0] ?? null;
}

/** Kolik dní za posledních 5 (včetně dneška) měl lehký trénink RPE 7+. */
export function hardEasyDays(acts: { date: string; rpe?: number | null; quality: boolean; moving_s: number | null }[], today: string): number {
  const from = addDays(today, -5);
  const days = new Set(acts.filter((a) => a.date > from && a.date <= today && !a.quality && (a.moving_s ?? 0) < 150 * 60 && (a.rpe ?? 0) >= RPE_HARD_EASY).map((a) => a.date));
  return days.size;
}

/** Platné hodnocení z API: 1–10, 0 = přeskočit, null = smazat. */
export const rpeOk = (x: unknown): x is number | null => x === null || (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 10);
