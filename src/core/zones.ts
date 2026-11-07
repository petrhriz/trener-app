// Zóny a cílová pásma (kap. 6.2). Watty vždy z aktuálního FTP, zaokrouhlené na 5 W.

export const round5 = (x: number) => Math.round(x / 5) * 5;

/** Cílová pásma v % FTP (6.2). Z1 horní hranice 54 %, aby pro FTP 298 vyšlo 120–160 W jako v pravidlech. */
export const TARGET_PCT = {
  recovery: [40, 54] as const, // rozjetí/vyjetí/pauzy Z1
  warmupZ2: [40, 57] as const, // rozjetí 5 min u Z2 jízdy (příklad 120–170 W)
  warmupPre: [45, 70] as const, // rozjetí před intervaly Z1–Z2
  z2: [57, 72] as const,
};

export function pctRange(ftp: number, pct: readonly [number, number]): [number, number] {
  return [round5((ftp * pct[0]) / 100), round5((ftp * pct[1]) / 100)];
}

export interface PowerZone {
  z: number;
  lo: number;
  hi: number | null;
}

/** Zóny výkonu (Coggan, horní hranice Z1..Z6 v % FTP) */
export function powerZones(ftp: number, pct: number[] = [55, 75, 90, 105, 120, 150]): PowerZone[] {
  const out: PowerZone[] = [];
  let lo = 0;
  for (let i = 0; i < pct.length; i++) {
    const hi = Math.round((ftp * pct[i]!) / 100);
    out.push({ z: i + 1, lo, hi });
    lo = hi + 1;
  }
  out.push({ z: pct.length + 1, lo, hi: null });
  return out;
}

export interface HrZones {
  floors: number[]; // dolní hranice Z1..Z5
  max: number;
  lthr: number | null;
  rest: number | null;
}

/** Rozsah zóny tepu [od, do] */
export function hrZoneRange(hz: HrZones, z: number): [number, number] {
  const lo = hz.floors[z - 1]!;
  const hi = z < hz.floors.length ? hz.floors[z]! - 1 : hz.max;
  return [lo, hi];
}

export function hrZonesText(hz: HrZones): string {
  return hz.floors.map((_, i) => `Z${i + 1} ${hrZoneRange(hz, i + 1).join("–")}`).join(", ");
}
