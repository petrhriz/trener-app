import { describe, expect, it } from "vitest";
import { recomputeSleepRows, sleepNeedMin, sleepScoreCalc, type SleepCalcRow } from "../src/core/sleepCalc";

// Ukázkový týden nocí (délka, hluboký, REM, bdění v s, počet probuzení); poslední noc je krátká.
const NIGHTS: [string, number, number, number, number, number][] = [
  ["2026-11-02", 28020, 3900, 2700, 1020, 1],
  ["2026-11-03", 29160, 4320, 2820, 180, 0],
  ["2026-11-04", 28440, 3780, 5220, 120, 0],
  ["2026-11-05", 24240, 5400, 3840, 0, 0],
  ["2026-11-06", 25620, 4620, 1320, 2340, 3],
  ["2026-11-07", 30240, 4080, 2880, 1200, 2],
  ["2026-11-08", 25440, 4200, 1680, 540, 1],
  ["2026-11-09", 21420, 4620, 600, 840, 1],
];
const rows: SleepCalcRow[] = NIGHTS.map(([date, s, d, r, a, c]) => ({
  date, sleep_s: s, deep_s: d, rem_s: r, awake_s: a, awake_count: c, sleep_score_g: 70, sleep_need_g_min: 510, next_sleep_need_g_min: 510,
}));
const GOAL = 494; // cíl 8:14

describe("potřeba spánku", () => {
  it("cíl + vážený dluh za 7 nocí (8:58)", () => {
    expect(sleepNeedMin(rows.slice(0, 7).map((r) => r.sleep_s), GOAL)).toBe(538);
  });
  it("bez deficitu = cíl, přebytek dluh nesnižuje pod cíl", () => {
    expect(sleepNeedMin(Array(7).fill(GOAL * 60), GOAL)).toBe(GOAL);
    expect(sleepNeedMin(Array(7).fill(10 * 3600), GOAL)).toBe(GOAL);
  });
  it("chybějící noc deficit nepřidá", () => {
    expect(sleepNeedMin([null, null, null, null, null, null, 6 * 3600], GOAL)).toBe(Math.round(GOAL + ((7 / 4) * (GOAL - 360)) / 7));
  });
  it("včerejší noc váží nejvíc", () => {
    const short = 6 * 3600, ok = GOAL * 60;
    expect(sleepNeedMin([ok, ok, ok, ok, ok, ok, short], GOAL)).toBeGreaterThan(sleepNeedMin([short, ok, ok, ok, ok, ok, ok], GOAL));
  });
});

describe("skóre spánku", () => {
  it("krátká noc s minimem REM má nízké skóre (~47)", () => {
    const sc = sleepScoreCalc(rows[7]!, 538)!;
    expect(sc.score).toBeGreaterThanOrEqual(46);
    expect(sc.score).toBeLessThanOrEqual(48);
    expect(sc.rem).toBeLessThan(0.01); // 10 min REM
    expect(sc.dur).toBeLessThan(0.35); // 5:57 z 8:58
  });
  it("delší spánek proti potřebě = vyšší skóre, maximum 100", () => {
    const base = { deep_s: 70 * 60, rem_s: 60 * 60, awake_s: 600, awake_count: 1 }; // typická noc (REM ~1 h)
    const a = sleepScoreCalc({ ...base, sleep_s: 7 * 3600 }, 500)!.score;
    const b = sleepScoreCalc({ ...base, sleep_s: 8.5 * 3600 }, 500)!.score;
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(100);
  });
  it("bez fází spánku nepočítá", () => {
    expect(sleepScoreCalc({ sleep_s: 28000, deep_s: null, rem_s: null, awake_s: null, awake_count: null }, 500)).toBeNull();
  });
});

describe("přepočet nocí", () => {
  it("dnešní potřeba, potřeba na další noc a skóre", () => {
    const out = recomputeSleepRows(rows, GOAL, "2026-11-09", "2026-11-09");
    expect(out).toHaveLength(1);
    expect(out[0]!.sleep_need_min).toBe(538);
    expect(out[0]!.next_sleep_need_min).toBe(562); // 9:22
    expect(out[0]!.sleep_score).toBeGreaterThanOrEqual(46);
  });
  it("bez fází zůstane skóre Garminu, potřeba se spočítá", () => {
    const r = rows.map((x) => (x.date === "2026-11-09" ? { ...x, deep_s: null, rem_s: null } : x));
    const out = recomputeSleepRows(r, GOAL, "2026-11-09", "2026-11-09");
    expect(out[0]!.sleep_score).toBe(70);
    expect(out[0]!.sleep_need_min).toBe(538);
  });
  it("den bez spánku: hodnoty Garminu", () => {
    const r = [...rows, { date: "2026-11-10", sleep_s: null, deep_s: null, rem_s: null, awake_s: null, awake_count: null, sleep_score_g: null, sleep_need_g_min: 500, next_sleep_need_g_min: null }];
    const out = recomputeSleepRows(r, GOAL, "2026-11-10", "2026-11-10");
    expect(out[0]).toEqual({ date: "2026-11-10", sleep_score: null, sleep_need_min: 500, next_sleep_need_min: null });
  });
  it("mezera v datech: noc před mezerou se do dluhu nepočítá dvakrát", () => {
    const r = rows.filter((x) => x.date !== "2026-11-06");
    const out = recomputeSleepRows(r, GOAL, "2026-11-09", "2026-11-09");
    expect(out[0]!.sleep_need_min).toBeLessThan(538);
  });
});
