// Sacharidy na trénink (kap. 9): jen odhad gramů podle délky a intenzity, bez balení.

export type Sharpness = "quality" | "z2" | "easy";

export interface Carbs {
  total: number; // g na celý trénink
  perHour: number; // g/h
}

/**
 * do 60 min nic (stačí voda); 1–2 h 30–60 g/h; 2–3 h 60–90 g/h (nad 3 h jako 2–3 h).
 * Ostřejší jednotky horní hranice, klidné spíš dolní, v chladu (< 5 °C) dolní. Celkem zaokrouhleno na 5 g.
 */
export function carbsFor(durationMin: number, sharp: Sharpness, cold = false): Carbs | null {
  if (durationMin <= 60) return null;
  const long = durationMin > 120;
  const [lo, hi] = long ? [60, 90] : [30, 60];
  let perHour: number;
  if (cold || sharp === "easy") perHour = lo;
  else if (sharp === "quality") perHour = hi;
  else perHour = long ? 70 : 40; // klidná Z2: blíž dolní hranici
  return { total: Math.round(((perHour * durationMin) / 60) / 5) * 5, perHour };
}
