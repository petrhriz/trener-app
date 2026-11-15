// Přehled po půlnoci: nový den začal, ale noc ještě neskončila – spánek ani VST za dnešek nejsou.
// Aby nebyl Přehled prázdný, ukážou se kroužky, dlaždice a spánek ze včerejška (označené).
// Jen zobrazení: dnešní zotavení, semafor a úpravy plánu dál čekají na skutečná ranní data.
import { addDays } from "../lib/time";

export interface CarryRow {
  date: string;
  hrv?: number | null;
  sleep_s?: number | null;
  rhr?: number | null;
}

const hasMorning = (w: CarryRow | undefined) => !!w && (w.sleep_s != null || w.hrv != null);
const hasAny = (w: CarryRow | undefined) => hasMorning(w) || (!!w && w.rhr != null);

/** Živá hodnota dne (kroky, stres, energie…): dnešní, jakmile je; jinak z přeneseného dne. */
export function liveOr<T extends object, K extends keyof T>(today: T | null | undefined, carried: T | null | undefined, k: K): T[K] | null {
  return today?.[k] ?? carried?.[k] ?? null;
}

/** Datum dne, jehož data se ukážou místo dneška, nebo null (dnešek má ranní data / včerejšek nic nemá). */
export function carryDay(well: readonly CarryRow[], T: string): string | null {
  if (hasMorning(well.find((w) => w.date === T))) return null;
  const y = addDays(T, -1);
  return hasAny(well.find((w) => w.date === y)) ? y : null;
}
