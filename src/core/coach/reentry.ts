// Návrat po pauze: po delší přestávce v tréninku se intenzita přidává postupně – první týden jen Z1–Z2,
// pak nejvýš tempo / sweet spot, teprve potom plné kvality. Délka náběhu podle úrovně jezdce.
// Zdroj: princip „nejdřív objem, pak intenzita“ po přerušení tréninku (Friel: The Cyclist's Training Bible, návrat do
// tréninku přes fázi Základ). Délka náběhu (3 / 2 / 1 týden), hranice pauzy 7 dní a prodloužení o týden po 3+
// týdnech pauzy jsou vlastní volba.
import { addDays, daysBetween } from "../../lib/time";

export type RiderLevel = "beginner" | "intermediate" | "advanced";
export type Ceiling = "base" | "tempo" | "full";

/** Kolik týdnů po návratu trvá náběh intenzity (první týden je vždy jen Z1–Z2). */
export const RAMP_WEEKS: Record<RiderLevel, number> = { beginner: 3, intermediate: 2, advanced: 1 };
/** Pauza = aspoň tolik dní bez tréninku (aspoň 20 min). */
export const PAUSE_DAYS = 7;

export interface Reentry {
  /** první den tréninku po pauze (null = žádný návrat, nebo už je dávno) */
  resume: string | null;
  gapDays: number;
  rampWeeks: number;
  /** strop intenzity ke dni */
  ceilingOn: (date: string) => Ceiling;
  note: string | null;
}

const NONE: Reentry = { resume: null, gapDays: 0, rampWeeks: 0, ceilingOn: () => "full", note: null };

/**
 * Najde poslední pauzu ≥ PAUSE_DAYS dní (bez tréninku aspoň 20 min) za posledních 8 týdnů. Návrat = první
 * trénink po ní; když pauza ještě trvá, návrat je dnes. Strop platí od návratu: týden 0 jen Z1–Z2, týdny
 * 1 … náběh−1 nejvýš tempo / sweet spot, pak plně. Po pauze 21+ dní je náběh o týden delší.
 */
export function reentryOf(acts: { date: string; moving_s: number | null }[], today: string, level: RiderLevel = "intermediate"): Reentry {
  const trained = [...new Set(acts.filter((a) => (a.moving_s ?? 0) >= 20 * 60 && a.date <= today && a.date >= addDays(today, -56)).map((a) => a.date))].sort();
  if (!trained.length) return NONE; // bez historie nic neomezovat – nový uživatel nemusí mít pauzu, jen málo dat
  // pauza, která ještě trvá (od posledního tréninku do dneška)
  const last = trained[trained.length - 1]!;
  let resume: string | null = null;
  let gap = 0;
  if (daysBetween(last, today) - 1 >= PAUSE_DAYS) { resume = today; gap = daysBetween(last, today) - 1; }
  else for (let i = trained.length - 1; i > 0; i--) {
    const g = daysBetween(trained[i - 1]!, trained[i]!) - 1;
    if (g >= PAUSE_DAYS) { resume = trained[i]!; gap = g; break; }
  }
  if (!resume) return NONE;
  const rampWeeks = RAMP_WEEKS[level] + (gap >= 21 ? 1 : 0);
  const ceilingOn = (date: string): Ceiling => {
    if (date < resume!) return "full";
    const w = Math.floor(daysBetween(resume!, date) / 7);
    return w === 0 ? "base" : w < rampWeeks ? "tempo" : "full";
  };
  // už po náběhu → nic nehlásit
  if (ceilingOn(today) === "full" && daysBetween(resume, today) >= rampWeeks * 7) return { ...NONE, resume, gapDays: gap, rampWeeks };
  const end = addDays(resume, rampWeeks * 7);
  const dm = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;
  return { resume, gapDays: gap, rampWeeks, ceilingOn, note: `návrat po ${gap} dnech pauzy: do ${dm(addDays(resume, 6))} jen Z1–Z2, pak nejvýš tempo a sweet spot, plné kvality od ${dm(end)}` };
}
