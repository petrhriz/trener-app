import { describe, expect, it } from "vitest";
import { carryDay, liveOr } from "../src/core/carryDay";
import { coaching } from "../src/core/readinessScore";

describe("Přehled po půlnoci (ranní data ještě nejsou)", () => {
  const T = "2026-11-15";
  const y = { date: "2026-11-14", hrv: 70, sleep_s: 27000, rhr: 52 };

  it("dnešek bez spánku i VST → ukáže se včerejšek", () => {
    expect(carryDay([y, { date: T, hrv: null, sleep_s: null, rhr: null }], T)).toBe("2026-11-14");
    expect(carryDay([y], T)).toBe("2026-11-14"); // dnešní řádek ještě vůbec není
  });

  it("jakmile přijde spánek nebo VST, platí dnešek", () => {
    expect(carryDay([y, { date: T, hrv: null, sleep_s: 26000, rhr: null }], T)).toBeNull();
    expect(carryDay([y, { date: T, hrv: 65, sleep_s: null, rhr: null }], T)).toBeNull();
  });

  it("starší den než včerejšek se nepřenáší, prázdný včerejšek taky ne", () => {
    expect(carryDay([{ date: "2026-11-13", hrv: 70, sleep_s: 27000, rhr: 52 }], T)).toBeNull();
    expect(carryDay([{ date: "2026-11-14", hrv: null, sleep_s: null, rhr: null }], T)).toBeNull();
  });

  it("živé hodnoty (kroky, stres) jsou dnešní, jakmile jsou; včerejší jen místo chybějících", () => {
    const today = { date: T, steps: 120 as number | null, stress_avg: null as number | null };
    const yest = { date: "2026-11-14", steps: 9000 as number | null, stress_avg: 25 as number | null };
    expect(liveOr(today, yest, "steps")).toBe(120);
    expect(liveOr(today, yest, "stress_avg")).toBe(25);
    expect(liveOr(null, yest, "steps")).toBe(9000);
    expect(liveOr(today, null, "stress_avg")).toBeNull();
  });

  it("zhodnocení dne řekne, že kroužky a dlaždice jsou ze včerejška", () => {
    const c = coaching({
      hour: 1, status: "active", statusUntil: null, carried: true,
      semafor: { state: "green", reasons: [], missing: true },
      strain: { score: 0, load: 0, base: 50, basis: "plan" },
      sleepS: null, sleepNeedMin: null, nextNeedMin: null, wakeTypical: null, bbNow: 60, stressAvg: null, stressNorm: null, steps: null,
      plan: { name: null, kind: null, minutes: null, done: false }, remLow: false, deepLow: false,
    });
    expect(c.title).toBe("Ranní data zatím nemám");
    expect(c.text).toContain("včerejš");
  });
});
