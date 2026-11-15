// Co se počítá jako kvalita (kap. 5) a limity kvality podle měsíce (6.1).
import { BIKE_SPORTS, type Sport } from "../datasource/types";
import type { Step, Workout } from "./workout";

export type QualityType = "vo2" | "vo2short" | "prah" | "sweetspot" | "tempo";

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
/** Krátké intervaly (30/15, 1 min): tep nestihne vystoupat a čas v Z4+ je krátký. Čas v zónách tepu podhodnocuje
 *  intenzivní trénink asi 3× proti hodnocení podle cíle tréninku (Sylta, Tønnessen & Seiler 2014, IJSPP 9(1):100–107),
 *  proto s hodnocením náročnosti RPE 7+ („velmi těžké“ v Borg CR10, session-RPE Foster 2001) stačí 5 min v Z4+.
 *  Hranice 7 a 5 min jsou vlastní volba. */
export const HR_Q_RPE = 7, HR_Q_RPE_MIN = 5;
export function hrQuality(hr_z: number[] | null | undefined, rpe?: number | null): "vo2" | "prah" | null {
  if (!hr_z || !hr_z.length) return null;
  const z4plus = hr_z.slice(3).reduce((t, x) => t + (x ?? 0), 0);
  const z5plus = hr_z.slice(4).reduce((t, x) => t + (x ?? 0), 0);
  if (z4plus >= HR_Q_MIN * 60) return z5plus >= HR_VO2_MIN * 60 ? "vo2" : "prah";
  if (rpe != null && rpe >= HR_Q_RPE && z4plus >= HR_Q_RPE_MIN * 60) return z5plus * 2 >= z4plus ? "vo2" : "prah";
  return null;
}

export interface QualityInfo {
  isQuality: boolean;
  type: QualityType | "xc_ski" | "skate" | null;
  /** počítá se do týdenního limitu kvality */
  counts: boolean;
}

/** Plánovaná kvalita dne: typ a rozpis tréninku (kroky s cílem ve W nebo v zóně tepu) a FTP, ze kterého je rozpis. */
export interface PlannedQ {
  type: QualityType;
  workout?: Workout | null;
  ftp?: number | null;
}

/** Horní hranice zón výkonu Z1–Z6 v % FTP (Coggan, stejné jako powerZones v zones.ts). */
const PWR_BOUNDS = [55, 75, 90, 105, 120, 150];

/**
 * Intenzivní úseky plánu (nad Z2): nejnižší jejich zóna (výkon Z1–Z7 podle FTP, tep Z1–Z5) a plánovaný čas v ní a výš.
 * null = rozpis chybí, nemá úseky nad Z2 nebo k wattům chybí FTP.
 */
export function plannedIntensity(w: Workout | null | undefined, ftp: number | null | undefined): { power: boolean; zone: number; secs: number } | null {
  // rozpis z databáze nemusí mít očekávaný tvar – vadný krok se přeskočí, sync kvůli němu nespadne
  const blocks = Array.isArray(w?.blocks) ? w!.blocks : [];
  const steps = blocks.flatMap((b) => (Array.isArray(b?.steps) ? b.steps : []).filter((s) => Number.isFinite(s?.dur_s) && s.dur_s > 0).map((s) => ({ s, n: Number.isFinite(b.reps) && b.reps! > 0 ? b.reps! : 1 })));
  if (!steps.length) return null;
  const power = steps.some(({ s }) => s.lo != null && s.hi != null);
  if (power && !ftp) return null;
  const pz = (w: number) => 1 + PWR_BOUNDS.filter((p) => w > (ftp! * p) / 100).length;
  // intenzivní = střed kroku nad Z2; zóna pro kontrolu podle spodní hranice kroku (aspoň Z3) – sweet spot 88–94 % FTP
  // odjetý u spodní hranice zůstane kvalitou, tempo 76–86 % se zaokrouhlenou spodní hranicí taky
  const zoneOf = (s: Step): { hard: number; req: number } | null => {
    if (!power) return s.z != null ? { hard: s.z, req: s.z } : null;
    if (s.lo == null || s.hi == null) return null;
    return { hard: pz((s.lo + s.hi) / 2), req: Math.max(3, pz(s.lo)) };
  };
  const hard = steps.map((x) => ({ ...x, z: zoneOf(x.s) })).filter((x) => x.z != null && x.z.hard >= 3);
  if (!hard.length) return null;
  return { power, zone: Math.min(...hard.map((x) => x.z!.req)), secs: hard.reduce((t, x) => t + x.s.dur_s * x.n, 0) };
}

/** Plánovaná kvalita se počítá, jen když ji data doloží: aspoň polovina plánovaného času intenzivních úseků v jejich
 *  zóně a výš (sprinty v Z7, 30/15 v Z5, tempo v Z3). Polovina kvůli rozjetí do úseku, zpoždění tepu a hranicím zón –
 *  vlastní volba. */
export const PLANNED_Q_SHARE = 0.5;
/** Bez rozpisu plánu (nebo když jízda nemá data stejného druhu jako plán): aspoň tolik minut v Z3 a výš – tempo
 *  a sweet spot leží hlavně v Z3. Minuty jsou vlastní volba (stejné jako u kvality podle wattů / tepu). */
export const PLANNED_Q_MIN = { power: 15, hr: HR_Q_MIN };

const sumFrom = (z: number[], i: number) => z.slice(i).reduce((t, x) => t + (x ?? 0), 0);

/** Odjela jízda plánovanou kvalitu? Bez zón v aktivitě (nejsou data) platí plán. */
function plannedDone(a: ActLike, pl: PlannedQ): boolean {
  const pz = a.np && a.pwr_z?.some((x) => x > 0) ? a.pwr_z : null;
  const hz = a.hr_z?.some((x) => x > 0) ? a.hr_z : null;
  const p = plannedIntensity(pl.workout, pl.ftp);
  if (p?.power && pz) return sumFrom(pz, p.zone - 1) >= PLANNED_Q_SHARE * p.secs;
  if (p && !p.power && hz) return sumFrom(hz, p.zone - 1) >= PLANNED_Q_SHARE * p.secs;
  if (pz) return sumFrom(pz, 2) >= PLANNED_Q_MIN.power * 60;
  if (hz) return sumFrom(hz, 2) >= PLANNED_Q_MIN.hr * 60;
  return true;
}

/**
 * planned: plánovaná kvalita stejného dne (typ, ideálně s rozpisem) – typ z plánu platí, jen když ji jízda
 * opravdu odjela (plannedDone); jinak rozhodují data.
 */
export function classify(a: ActLike, planned?: QualityType | PlannedQ | null): QualityInfo {
  if (BIKE_SPORTS.includes(a.sport)) {
    const pl: PlannedQ | null = typeof planned === "string" ? { type: planned } : planned ?? null;
    if (pl && plannedDone(a, pl)) return { isQuality: true, type: pl.type, counts: true };
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
