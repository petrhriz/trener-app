// Hodnocení náročnosti (RPE): na co se stránka zeptá, únava z lehkých tréninků, stupeň kvality.
import { describe, expect, it } from "vitest";
import { RPE_KEY_MAX, hardEasyDays, rpeOk, rpeToAsk } from "../../src/core/rpe";
import { NO_FATIGUE, fatigueFactor } from "../../src/core/coach/target";
import { type KeyRecord, evaluateKeys, recordKeys } from "../../src/core/coach/keys";
import type { EngineAct } from "../../src/core/coach/common";

const T = "2026-11-12";
const a = (id: string, date: string, min: number, rpe?: number | null, start?: string) => ({ id, date, start_local: start ?? `${date} 17:00`, sport: "ride", name: id, moving_s: min * 60, rpe });

describe("na co se zeptat", () => {
  it("nejnovější neohodnocená aktivita aspoň 20 min za poslední 3 dny", () => {
    const acts = [a("stara", "2026-11-08", 60), a("vcera", "2026-11-11", 90), a("dnes-kratka", T, 15), a("dnes", T, 60, null, `${T} 07:00`)];
    expect(rpeToAsk(acts, T)!.id).toBe("dnes");
    expect(rpeToAsk([a("dnes", T, 60, 5), a("vcera", "2026-11-11", 90)], T)!.id).toBe("vcera");
    // 0 = přeskočeno → už se neptá
    expect(rpeToAsk([a("vcera", "2026-11-11", 90, 0)], T)).toBeNull();
    expect(rpeToAsk([a("stara", "2026-11-09", 90)], T)).toBeNull();
  });
  it("platné hodnoty z API", () => {
    expect([0, 1, 10, null].every(rpeOk)).toBe(true);
    expect([11, -1, 5.5, "7"].some(rpeOk)).toBe(false);
  });
});

describe("únava: lehké tréninky šly těžko", () => {
  const e = (date: string, rpe: number, quality = false, min = 75) => ({ date, rpe, quality, moving_s: min * 60 });
  it("dva dny z pěti se Z2 hodnocenou 7+ → týden o 10 % lehčí; kvalita, dlouhá jízda a starší dny se nepočítají", () => {
    expect(hardEasyDays([e("2026-11-10", 7), e("2026-11-12", 8)], T)).toBe(2);
    expect(hardEasyDays([e("2026-11-10", 9, true), e("2026-11-11", 8, false, 200), e("2026-11-06", 8), e("2026-11-12", 6)], T)).toBe(0);
    expect(fatigueFactor({ ...NO_FATIGUE, hardEasy: 2 }).factor).toBe(0.9);
    expect(fatigueFactor({ ...NO_FATIGUE, hardEasy: 1 }).factor).toBe(1);
  });
});

describe("kvalita zvládnutá, ale na hraně", () => {
  const plan = { reps: 4, work_s: 480, lo: 240, hi: 255 };
  const rec = recordKeys([], [{ date: "2026-11-10", sport: "ride", cat: "thr", level: 2, plan, minutes: 60, name: "4×8" } as Omit<KeyRecord, "state">], "2026-11-10");
  const lap = (i: number) => ({ i, type: "WORK", label: null, start_s: i * 700, moving_s: 480, elapsed_s: 480, distance_m: null, avg_power: 248, np: 248, avg_hr: 160 + i, max_hr: 170, avg_cad: 90, elev_gain: null, avg_speed: null });
  const act = (rpe: number | null): EngineAct => ({ id: "x", date: "2026-11-10", sport: "ride", load: 70, moving_s: 3600, quality: true, hr_z: null, pwr_z: null, laps: [1, 2, 3, 4].map(lap) as any, compliance: null, rpe });
  it("RPE " + RPE_KEY_MAX + "+ → stupeň drží; RPE 6 → o stupeň výš", () => {
    expect(evaluateKeys(rec, [act(9)], "2026-11-11", "zvyseni", {}).records[0]).toMatchObject({ outcome: "zopakovat", newLevel: 2 });
    expect(evaluateKeys(rec, [act(6)], "2026-11-11", "zvyseni", {}).records[0]).toMatchObject({ outcome: "posun", newLevel: 3 });
  });
  it("bez hodnocení počká den, pak se vyhodnotí podle okruhů", () => {
    expect(evaluateKeys(rec, [act(null)], "2026-11-11", "zvyseni", {}).records[0]!.state).toBe("pending");
    expect(evaluateKeys(rec, [act(null)], "2026-11-12", "zvyseni", {}).records[0]).toMatchObject({ state: "done", newLevel: 3 });
  });
});
