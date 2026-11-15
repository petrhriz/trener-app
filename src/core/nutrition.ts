// Sacharidy na trénink: jen odhad gramů podle délky a intenzity, bez balení. Platí pro kolo i běh stejně
// (Jeukendrup 2014, Sports Med 44 Suppl 1: S25–S33; ACSM 2016) – u běhu bývá jen horší snášenlivost žaludku.

export type Sharpness = "quality" | "z2" | "easy";

export interface Carbs {
  total: number; // g na celý trénink
  perHour: number; // g/h (0 = jen malé množství)
  /** doplněk („malé množství nebo výplach úst“) */
  note?: string;
}

/** Ostrý trénink kolem hodiny: malé množství nebo výplach úst zlepší výkon (Jeukendrup 2014). */
const SHORT_HARD = { minMin: 45, grams: 20 };

/**
 * do 60 min klidně nic (stačí voda), ostrý trénink od 45 min malé množství (~20 g) nebo výplach úst; 1–2 h 30–60 g/h;
 * 2–3 h 60–90 g/h (nad 3 h jako 2–3 h). Ostřejší jednotky horní hranice, klidné spíš dolní, v chladu (< 5 °C) dolní.
 * Celkem zaokrouhleno na 5 g.
 */
export function carbsFor(durationMin: number, sharp: Sharpness, cold = false): Carbs | null {
  if (durationMin <= 60) {
    return sharp === "quality" && durationMin >= SHORT_HARD.minMin ? { total: SHORT_HARD.grams, perHour: 0, note: "malé množství nebo jen výplach úst" } : null;
  }
  const long = durationMin > 120;
  const [lo, hi] = long ? [60, 90] : [30, 60];
  let perHour: number;
  if (cold || sharp === "easy") perHour = lo;
  else if (sharp === "quality") perHour = hi;
  else perHour = long ? 70 : 40; // klidná Z2: blíž dolní hranici
  return { total: Math.round(((perHour * durationMin) / 60) / 5) * 5, perHour };
}
