// Profil sportovce: skládá data z nastavení, Garminu a výpočtů.
import { describe, expect, it } from "vitest";
import { athleteProfile } from "../src/report/profile";
import { DEFAULTS } from "../src/lib/settings";

const T = "2026-11-12";
const ctx: any = {
  T,
  s: { ...DEFAULTS, ftp: 260, hr_zones: { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 50, source: "Garmin" }, coach_profile: { primary: "ride", birthYear: 1980, sports: {}, snow: false } },
  well: [{ date: "2026-11-10", weight_kg: 78.5, rhr: 48, vo2max: 52 }, { date: T, weight_kg: null, rhr: 50, vo2max: null }],
  acts: [{ id: "a", date: "2026-11-05", sport: "ride", mmp: { "5": 900, "60": 450, "300": 330, "1200": 280 }, max20: 280, pwr_z: null, vo2_fit: 54.4 }],
  metrics: [{ date: T, ctl: 40.8, atl: 45.2, form: -4.4 }],
  constraints: [],
};

describe("profil sportovce", () => {
  it("věk, W/kg, zóny výkonu a tepu (kolo i běh), nejlepší výkony, VO2max", () => {
    const p = athleteProfile(ctx);
    expect(p.age).toBe(46);
    expect(p.blockWeeks).toBe(2);
    expect(p.weight).toEqual({ kg: 78.5, date: "2026-11-10" });
    expect(p.wkg).toBe(3.31);
    expect(p.powerZones).toHaveLength(7);
    expect(p.powerZones![1]).toMatchObject({ name: "Z2 vytrvalost", hi: 195 });
    expect(p.hrBike![1]).toEqual({ name: "Z2 vytrvalost", lo: 135, hi: 164 });
    expect(p.hrRun![3]!.lo).toBe(Math.round(196 * 0.95));
    expect(p.best.m20).toMatchObject({ w: 280, wkg: 3.57 });
    expect(p.vo2.ride).toEqual({ v: 54, date: "2026-11-05" });
    expect(p.hr.rest).toBe(49);
    expect(p.fitness).toEqual({ ctl: 40.8, atl: 45.2, form: -4.4 });
  });
});
