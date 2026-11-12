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

/**
 * Zóny tepu pro BĚH. Při běhu je tep na stejné úsilí výš než na kole (víc svalů, nese se váha), takže zóny kola
 * by z každého běhu dělaly Z3–Z4. Běžecké zóny podle prahu (Friel): Z1 pod 85 % LTHR, Z2 85–89 %, Z3 90–94 %,
 * Z4 95–99 %, Z5 od 100 %. Práh (LTHR) je uživatelův z Garminu; bez něj zůstanou zóny beze změny.
 */
export function runHrZones(hz: HrZones | null): HrZones | null {
  if (!hz || !hz.lthr || hz.lthr < 100) return hz;
  const f = (p: number) => Math.round(hz.lthr! * p);
  return { ...hz, floors: [Math.min(hz.floors[0] ?? f(0.6), f(0.7)), f(0.85), f(0.9), f(0.95), f(1)], max: Math.max(hz.max, f(1.06)) };
}

export function hrZonesText(hz: HrZones): string {
  return hz.floors.map((_, i) => `Z${i + 1} ${hrZoneRange(hz, i + 1).join("–")}`).join(", ");
}

// ---------- FTP a zóny s datem platnosti (9. kolo) ----------

/** Řádek historie: hodnoty platí od `date` do dalšího řádku; null = beze změny proti předchozímu řádku. */
export interface ZoneHistRow {
  date: string;
  ftp: number | null;
  hr: HrZones | null;
}

export interface ZonesOfDay {
  ftp: number | null;
  hr: HrZones | null;
}

/**
 * FTP a zóny tepu platné v den `date`. Každá hodnota zvlášť: poslední řádek s hodnotou nejpozději v ten den;
 * před prvním záznamem nejstarší známá hodnota (dnešní by byla ještě dál od pravdy); bez historie dnešní.
 * `hist` musí být seřazená podle data.
 */
export function zonesAt(hist: ZoneHistRow[], date: string, current: ZonesOfDay): ZonesOfDay {
  const pick = <K extends "ftp" | "hr">(k: K): ZonesOfDay[K] => {
    let v: ZoneHistRow[K] | null = null;
    let first: ZoneHistRow[K] | null = null;
    for (const r of hist) {
      if (r[k] == null) continue;
      if (first == null) first = r[k];
      if (r.date <= date) v = r[k];
      else break;
    }
    return (v ?? first ?? current[k]) as ZonesOfDay[K];
  };
  return { ftp: pick("ftp"), hr: pick("hr") };
}

/**
 * Body FTP z jednotlivých jízd (v den jízdy) → řádky historie jen tam, kde se FTP změnilo.
 * Rozdíl do ±2 W (zaokrouhlení, dorovnání) se za další změnu nepovažuje, jen upraví poslední hodnotu.
 */
export function ftpChanges(points: { date: string; ftp: number }[]): { date: string; ftp: number }[] {
  const out: { date: string; ftp: number }[] = [];
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!(p.ftp > 0)) continue;
    const last = out[out.length - 1];
    if (!last || Math.abs(last.ftp - p.ftp) > 2) out.push({ date: p.date, ftp: Math.round(p.ftp) });
    else last.ftp = Math.round(p.ftp); // 297 → 298: jedna změna, platí novější číslo
  }
  return out;
}

/** Je potřeba nový řádek historie? (dnešní nastavení se liší od hodnot platných dnes) */
export function zonesChanged(hist: ZoneHistRow[], today: string, current: ZonesOfDay): { ftp: boolean; hr: boolean } {
  if (!hist.length) return { ftp: current.ftp != null, hr: current.hr != null };
  const at = zonesAt(hist, today, { ftp: null, hr: null });
  const sameHr = (a: HrZones | null, b: HrZones | null) => JSON.stringify(a ? [a.floors, a.max, a.lthr] : null) === JSON.stringify(b ? [b.floors, b.max, b.lthr] : null);
  return { ftp: current.ftp != null && at.ftp !== current.ftp, hr: current.hr != null && !sameHr(at.hr, current.hr) };
}
