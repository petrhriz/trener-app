// Výživa na jízdu (kap. 9). Bidon = 60 g, gel Nduranz Energy 45 = 45 g.

export const BIDON_G = 60;
export const GEL_G = 45;

export type Sharpness = "quality" | "z2" | "easy";

export interface Carbs {
  total: number; // g
  perHour: number; // g/h
  pack: string; // „bidon + gel“
  text: string; // „105 g (60 g/h): bidon + gel“ / „jen voda“
}

/**
 * do 60 min jen voda; 1–2 h 30–60 g/h; 2–3 h 60–90 g/h (nad 3 h jako 2–3 h).
 * Ostřejší jednotky horní hranice, klidné spíš dolní, v chladu (< 5 °C) dolní.
 */
export function carbsFor(durationMin: number, sharp: Sharpness, cold = false): Carbs {
  if (durationMin <= 60) return { total: 0, perHour: 0, pack: "jen voda", text: "jen voda" };
  const long = durationMin > 120;
  const [lo, hi] = long ? [60, 90] : [30, 60];
  let perHour: number;
  if (cold || sharp === "easy") perHour = lo;
  else if (sharp === "quality") perHour = hi;
  else perHour = long ? 70 : 40; // klidná Z2: blíž dolní hranici
  const total = Math.round(((perHour * durationMin) / 60) / 5) * 5;
  const pack = packFor(total);
  return { total, perHour, pack, text: `${total} g (${perHour} g/h): ${pack}` };
}

/** Nejmenší kombinace bidonů a gelů, která pokryje množství (tolerance −10 g). */
export function packFor(total: number): string {
  // Základ jsou bidony, gel jako doplněk (zápis podle pravidel: bidon / bidon + gel / 2 bidony …)
  const options: [number, number][] = [];
  for (let b = 1; b <= 4; b++) for (let g = 0; g <= 1; g++) options.push([b, g]);
  options.sort((x, y) => x[0] * BIDON_G + x[1] * GEL_G - (y[0] * BIDON_G + y[1] * GEL_G));
  const pick = options.find(([b, g]) => b * BIDON_G + g * GEL_G >= total - 10) ?? [4, 1];
  const [b, g] = pick;
  return `${b === 1 ? "bidon" : `${b} bidony`}${g ? " + gel" : ""}`;
}
