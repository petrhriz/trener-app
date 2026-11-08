// Tréninkové vyvážení (obdoba „zaměření zátěže“ v Garminu): zátěž 4 týdnů rozdělená na nízkou aerobní,
// vysokou aerobní a anaerobní. Garmin svoje čísla přes API nedává → odhad z času v zónách vážený intenzitou.

export interface BalanceAct {
  date: string;
  sport: string;
  load: number | null;
  garmin_load?: number | null;
  hr_z: number[] | null; // s v Z1..Z5 tepu
  pwr_z: number[] | null; // s v Z1..Z7 výkonu
}

export type BalanceKey = "low" | "high" | "ana";

export interface Balance {
  from: string;
  to: string;
  total: number;
  parts: { key: BalanceKey; label: string; load: number; pct: number; target: [number, number]; targetPts: [number, number]; status: "low" | "ok" | "high" }[];
  noZones: number; // zátěž aktivit bez zón (nezapočtená)
  verdict: string;
  garminPts: boolean;
}

/** Zátěž za hodinu v zóně (≈ IF² × 100) – váha, aby hodina Z1 neměla stejnou váhu jako hodina VO2max. */
const PWR_W = [20, 42, 69, 96, 128, 182, 250];
// podíl zóny do [nízká, vysoká, anaerobní] – nakalibrováno na Garmin (4 týdny do 7. 11. 2026: Garmin 1050/521/358, výpočet 1025/482/347)
const PWR_SPLIT: [number, number, number][] = [[1, 0, 0], [1, 0, 0], [0.5, 0.5, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1]];
const HR_W = [20, 42, 69, 96, 128];
const HR_SPLIT: [number, number, number][] = [[1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1]];
const KEYS: BalanceKey[] = ["low", "high", "ana"];

/**
 * Optimální rozmezí jako násobek celkové zátěže 4 týdnů – odečteno z Garmin Connect („Zaměření zátěže“
 * 10. 10.–7. 11. 2026: celkem 1929 bodů, rozmezí anaerobní ~210–640, vysoce aerobní ~640–1420, nízko aerobní ~550–1200).
 */
export const BALANCE_TARGET_X: Record<BalanceKey, [number, number]> = { low: [0.29, 0.62], high: [0.33, 0.74], ana: [0.11, 0.33] };
/** totéž v % celkové zátěže (pro popisky) */
export const BALANCE_TARGET: Record<BalanceKey, [number, number]> = { low: [29, 62], high: [33, 74], ana: [11, 33] };
export const BALANCE_LABEL: Record<BalanceKey, string> = { low: "Nízká aerobní", high: "Vysoká aerobní", ana: "Anaerobní" };

export function trainingBalanceOf(acts: BalanceAct[], from: string, to: string): Balance {
  const sum: Record<BalanceKey, number> = { low: 0, high: 0, ana: 0 };
  let noZones = 0;
  let garminPts = false;
  for (const a of acts) {
    // body zátěže Garminu (stejná stupnice jako „zaměření zátěže“ v Garminu), jinak naše zátěž
    const ld = a.garmin_load ?? a.load;
    if (a.date < from || a.date > to || !ld) continue;
    if (a.garmin_load != null) garminPts = true;
    const usePwr = a.pwr_z && a.pwr_z.some((x) => x > 0);
    const z = usePwr ? a.pwr_z! : a.hr_z && a.hr_z.some((x) => x > 0) ? a.hr_z : null;
    if (!z) {
      noZones += ld;
      continue;
    }
    const W = usePwr ? PWR_W : HR_W;
    const S = usePwr ? PWR_SPLIT : HR_SPLIT;
    const wsum = z.reduce((t, s, i) => t + s * (W[i] ?? 0), 0);
    if (!wsum) continue;
    z.forEach((s, i) => {
      const part = (ld * s * (W[i] ?? 0)) / wsum;
      (S[i] ?? [0, 0, 0]).forEach((f, k) => (sum[KEYS[k]!] += part * f));
    });
  }
  const total = sum.low + sum.high + sum.ana;
  const parts = (["low", "high", "ana"] as BalanceKey[]).map((key) => {
    const pct = total ? Math.round((sum[key] / total) * 100) : 0;
    const x = BALANCE_TARGET_X[key];
    const targetPts: [number, number] = [Math.round(total * x[0]), Math.round(total * x[1])];
    const v = sum[key];
    return { key, label: BALANCE_LABEL[key], load: Math.round(v), pct, target: BALANCE_TARGET[key], targetPts, status: (v < targetPts[0] ? "low" : v > targetPts[1] ? "high" : "ok") as "low" | "ok" | "high" };
  });
  return { from, to, total: Math.round(total), parts, noZones: Math.round(noZones), verdict: balanceVerdict(parts, total), garminPts };
}

function balanceVerdict(parts: Balance["parts"], total: number): string {
  if (total < 50) return "Za 4 týdny je zátěže málo na hodnocení.";
  const p = Object.fromEntries(parts.map((x) => [x.key, x])) as Record<BalanceKey, Balance["parts"][number]>;
  if (p.low.status === "low" && p.high.status === "high") return "Moc tempa a prahu, málo klidné Z2 – přidej delší klidné jízdy, intenzitu nezvyšuj.";
  if (p.low.status === "low") return "Málo nízké aerobní zátěže (Z1–Z2) – základ vytrvalosti staví hlavně klidné jízdy.";
  if (p.high.status === "low" && p.ana.status === "low") return "Skoro jen klidná zátěž – na udržení stačí, pro zlepšení chybí kvalita.";
  if (p.high.status === "low") return "Málo vysoce aerobní zátěže – přidej tempo, sweet spot nebo práh; postupně zlepší laktátový práh a VO2max.";
  if (p.ana.status === "high") return "Hodně anaerobní zátěže (sprinty, krátké tvrdé úseky) – na vytrvalce víc, než je potřeba.";
  if (p.ana.status === "low") return "Vyvážené, jen skoro bez anaerobní práce – krátké úseky 30 s – 2 min občas stačí.";
  return "Vyvážené rozložení zátěže.";
}
