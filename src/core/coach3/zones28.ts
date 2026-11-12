// Trenér v3 – čas v zónách za posledních 28 dní (součet aktivit), zvlášť kolo s wattmetrem, kolo podle tepu a běh.
// Zóny různých sportů a metod nejsou totéž, proto se nesčítají dohromady. Rozdělení na lehce / středně / intenzivně
// je tříbodový model Seilera (pod 1. prahem = Z1–Z2, mezi prahy = Z3, nad 2. prahem = Z4 a výš), na kterém stojí
// pravidlo 80/20 – zdroj v docs/trener-v3/zdroje.md.
import { BIKE_SPORTS, type Sport } from "../../datasource/types";
import { addDays } from "../../lib/time";
import { HR_COLORS, PWR_COLORS, type ZoneRow, zoneRows } from "../activity";

export interface ZoneAct { date: string; sport: Sport; hr_z: number[] | null; pwr_z: number[] | null }

export interface ZoneGroup {
  key: "ride_power" | "ride_hr" | "run_hr";
  label: string;
  /** čas v zónách celkem (h) */
  hours: number;
  rows: ZoneRow[];
  /** Seiler: lehce (Z1–Z2), středně (Z3), intenzivně (Z4+), % času */
  low: number;
  mid: number;
  high: number;
}

export function zones28(acts: ZoneAct[], today: string, days = 28): ZoneGroup[] {
  const from = addDays(today, -days);
  const sum = { ride_power: [] as number[], ride_hr: [] as number[], run_hr: [] as number[] };
  const add = (t: number[], z: number[]) => z.forEach((v, i) => { t[i] = (t[i] ?? 0) + (v ?? 0); });
  for (const a of acts) {
    if (a.date <= from || a.date > today) continue;
    const bike = BIKE_SPORTS.includes(a.sport);
    if (bike && a.pwr_z?.some((x) => x > 0)) add(sum.ride_power, a.pwr_z);
    else if (bike && a.hr_z?.some((x) => x > 0)) add(sum.ride_hr, a.hr_z);
    else if (a.sport === "run" && a.hr_z?.some((x) => x > 0)) add(sum.run_hr, a.hr_z);
  }
  const LABEL = { ride_power: "Kolo · výkon", ride_hr: "Kolo · tep", run_hr: "Běh · tep" };
  const out: ZoneGroup[] = [];
  for (const key of ["ride_power", "ride_hr", "run_hr"] as const) {
    const z = sum[key];
    const tot = z.reduce((t, x) => t + x, 0);
    if (tot < 20 * 60) continue;
    const pct = (a: number, b?: number) => Math.round((z.slice(a, b).reduce((t, x) => t + x, 0) / tot) * 100);
    out.push({ key, label: LABEL[key], hours: Math.round((tot / 3600) * 10) / 10, rows: zoneRows(z, tot, key === "ride_power" ? PWR_COLORS : HR_COLORS), low: pct(0, 2), mid: pct(2, 3), high: pct(3) });
  }
  return out;
}
