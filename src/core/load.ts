// Zátěž aktivity – náhrada icu_training_load.
import { BIKE_SPORTS, type NActivity } from "../datasource/types";
import type { HrZones } from "./zones";

export type LoadSource = "garmin_tss" | "np_ftp" | "hr_zones" | "hr_avg" | "hr_indoor" | "none";

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
  const pw = powerLoad(a, ctx.ftp);
  const hr = hrLoad(a, ctx.hr);
  // Trenažér: platí vyšší z TSS a hrTSS. Uvnitř chybí proudění vzduchu a pauzy ve šlapání → při stejném výkonu vyšší tep
  // a únava, kterou TSS z výkonu nezachytí (Z2). U intervalů tep reaguje pozdě a hrTSS je podhodnocuje → tam vyhraje výkon.
  if (a.sport === "indoor" && pw && hr && hr.load > pw.load) return { load: hr.load, source: "hr_indoor" };
  return pw ?? hr ?? { load: 0, source: "none" };
}

/** TSS z wattmetru (jen kolo); Garmin TSS počítá s FTP platným v den jízdy → historicky přesnější než dnešní FTP. */
export function powerLoad(a: Pick<NActivity, "sport" | "moving_s" | "np" | "tss_garmin">, ftp: number | null): { load: number; source: LoadSource } | null {
  if (!BIKE_SPORTS.includes(a.sport) || !a.np) return null;
  if (a.tss_garmin) return { load: r1(a.tss_garmin), source: "garmin_tss" };
  if (ftp) return { load: r1(tssFromPower(a.moving_s ?? 0, a.np, ftp)), source: "np_ftp" };
  return null;
}

/** hrTSS z průměrného tepu a LTHR (kalibrace: MAE 13 proti intervals.icu HRSS), záloha zóny tepu. */
function hrLoad(a: Pick<NActivity, "moving_s" | "hr_z" | "avg_hr">, hz: HrZones | null): { load: number; source: LoadSource } | null {
  const secs = a.moving_s ?? 0;
  if (a.avg_hr && hz?.lthr && hz.rest && secs > 0) return { load: r1(hrTssFromAvg(secs, a.avg_hr, hz.lthr, hz.rest)), source: "hr_avg" };
  if (a.hr_z && a.hr_z.some((x) => x > 0)) return { load: r1(hrTssFromZones(a.hr_z)), source: "hr_zones" };
  return null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
