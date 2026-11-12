// Zátěž aktivity – náhrada icu_training_load.
import { BIKE_SPORTS, type NActivity } from "../datasource/types";
import type { HrZones } from "./zones";

export type LoadSource = "garmin_tss" | "np_ftp" | "hr_zones" | "hr_avg" | "none";

/**
 * Hodinová zátěž (TSS/h) podle zóny tepu Z1..Z5 – jen záloha, když chybí LTHR / klidový tep.
 * Zkalibrováno proti icu_training_load (HRSS) z intervals.icu, monotónní fit.
 */
export const HR_ZONE_RATES = [11, 42, 42, 42, 109];

export function hrTssFromZones(hrZ: number[], rates = HR_ZONE_RATES): number {
  let t = 0;
  for (let i = 0; i < Math.min(hrZ.length, rates.length); i++) t += ((hrZ[i] ?? 0) / 3600) * rates[i]!;
  return t;
}

/** hrTSS z průměrného tepu: IF = (HRavg − klid) / (LTHR − klid); TSS = h × IF² × 100 */
export function hrTssFromAvg(movingS: number, avgHr: number, lthr: number, rest: number): number {
  const ifr = Math.max(0, Math.min(1.3, (avgHr - rest) / (lthr - rest)));
  return (movingS / 3600) * ifr * ifr * 100;
}

/** TSS = (s × NP × IF) / (FTP × 3600) × 100 */
export function tssFromPower(movingS: number, np: number, ftp: number): number {
  const ifv = np / ftp;
  return ((movingS * np * ifv) / (ftp * 3600)) * 100;
}

export function activityLoad(
  a: Pick<NActivity, "sport" | "moving_s" | "np" | "tss_garmin" | "hr_z" | "avg_hr">,
  ctx: { ftp: number | null; hr: HrZones | null },
): { load: number; source: LoadSource } {
  const secs = a.moving_s ?? 0;
  const bike = BIKE_SPORTS.includes(a.sport);
  if (bike && a.np) {
    // Garmin TSS počítá s FTP platným v den jízdy → historicky přesnější než dnešní FTP
    if (a.tss_garmin) return { load: r1(a.tss_garmin), source: "garmin_tss" };
    if (ctx.ftp) return { load: r1(tssFromPower(secs, a.np, ctx.ftp)), source: "np_ftp" };
  }
  // hrTSS z průměrného tepu a LTHR (kalibrace: MAE 13 proti intervals.icu HRSS), záloha zóny tepu
  if (a.avg_hr && ctx.hr?.lthr && ctx.hr.rest && secs > 0)
    return { load: r1(hrTssFromAvg(secs, a.avg_hr, ctx.hr.lthr, ctx.hr.rest)), source: "hr_avg" };
  if (a.hr_z && a.hr_z.some((x) => x > 0)) return { load: r1(hrTssFromZones(a.hr_z)), source: "hr_zones" };
  return { load: 0, source: "none" };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
