// Co se počítá jako kvalita (kap. 5) a limity kvality podle měsíce (6.1).
import { BIKE_SPORTS, type Sport } from "../datasource/types";
import { month } from "../lib/time";

export type QualityType = "vo2" | "vo2short" | "prah" | "sweetspot" | "tempo";
export const QUALITY_TYPES: QualityType[] = ["vo2", "vo2short", "prah", "sweetspot", "tempo"];

export const QUALITY_NAME: Record<QualityType, string> = {
  vo2: "VO2",
  vo2short: "VO2 30/15",
  prah: "práh",
  sweetspot: "sweet spot",
  tempo: "tempo",
};

export interface ActLike {
  sport: Sport;
  name: string | null;
  moving_s: number | null;
  load: number | null;
  pwr_z: number[] | null;
  np: number | null;
  /** čas v zónách tepu (s), Z1–Z5 */
  hr_z?: number[] | null;
}

/** Kvalita podle tepu (běh, kolo bez wattmetru): aspoň 10 min v Z4+ (nad LT2 – „intenzivně“ v tříbodovém modelu
 *  Seilera), z toho aspoň 5 min v Z5 = VO2. Tep se v intervalech zpožďuje, takže čas nad prahem podle tepu je kratší
 *  než podle wattů (Sylta, Tønnessen & Seiler 2014) – proto 10 a 5 min místo 15 a 8 min u wattů (vlastní volba). */
export const HR_Q_MIN = 10, HR_VO2_MIN = 5;
export function hrQuality(hr_z: number[] | null | undefined): "vo2" | "prah" | null {
  if (!hr_z || !hr_z.length) return null;
  const z4plus = hr_z.slice(3).reduce((t, x) => t + (x ?? 0), 0);
  const z5plus = hr_z.slice(4).reduce((t, x) => t + (x ?? 0), 0);
  if (z4plus < HR_Q_MIN * 60) return null;
  return z5plus >= HR_VO2_MIN * 60 ? "vo2" : "prah";
}

export interface QualityInfo {
  isQuality: boolean;
  type: QualityType | "hockey" | "xc_ski" | "skate" | null;
  /** počítá se do týdenního limitu kvality */
  counts: boolean;
}

/**
 * plannedQuality: typ kvality z plánovaného workoutu stejného dne (pokud byl).
 */
export function classify(a: ActLike, plannedQuality?: QualityType | null): QualityInfo {
  if (BIKE_SPORTS.includes(a.sport)) {
    if (plannedQuality) return { isQuality: true, type: plannedQuality, counts: true };
    const z = a.pwr_z;
    if (z && a.np) {
      const z4plus = (z[3] ?? 0) + (z[4] ?? 0) + (z[5] ?? 0) + (z[6] ?? 0);
      const z5plus = (z[4] ?? 0) + (z[5] ?? 0) + (z[6] ?? 0);
      if (z5plus >= 8 * 60) return { isQuality: true, type: "vo2", counts: true };
      if (z4plus >= 15 * 60) return { isQuality: true, type: "prah", counts: true };
      return { isQuality: false, type: null, counts: false };
    }
    // bez wattmetru podle tepu
    const h = hrQuality(a.hr_z);
    return h ? { isQuality: true, type: h, counts: true } : { isQuality: false, type: null, counts: false };
  }
  if (a.sport === "run") {
    const h = hrQuality(a.hr_z);
    return h ? { isQuality: true, type: h, counts: true } : { isQuality: false, type: null, counts: false };
  }
  if (a.sport === "hockey") {
    const match = /z[aá]pas|match/i.test(a.name ?? "");
    const q = match || (a.load ?? 0) > 80;
    return { isQuality: q, type: q ? "hockey" : null, counts: q };
  }
  if (a.sport === "xc_ski") {
    const q = (a.moving_s ?? 0) > 2 * 3600 || (a.load ?? 0) > 120;
    return { isQuality: q, type: q ? "xc_ski" : null, counts: q };
  }
  if (a.sport === "skate" || a.sport === "padel") {
    const q = (a.load ?? 0) > 80;
    return { isQuality: q, type: q ? "skate" : null, counts: false };
  }
  return { isQuality: false, type: null, counts: false };
}

/** Říjen–únor max. 1, březen–září max. 2 kvalitní jednotky týdně. */
export function qualityLimit(date: string): number {
  const m = month(date);
  return m >= 3 && m <= 9 ? 2 : 1;
}

export function isOffSeason(date: string): boolean {
  return qualityLimit(date) === 1;
}

/** Jednotka v kalendáři je kvalita, když je to tempo, sweet spot, práh nebo VO2 – podle názvu. */
export function qualityFromName(name: string): QualityType | null {
  const n = name.toLowerCase();
  if (/30\/15|40\/20|30-15/.test(n)) return "vo2short";
  if (/vo2/.test(n)) return "vo2";
  if (/pr[aá]h|threshold|ftp/.test(n)) return "prah";
  if (/sweet|ss\b/.test(n)) return "sweetspot";
  if (/tempo/.test(n)) return "tempo";
  return null;
}
