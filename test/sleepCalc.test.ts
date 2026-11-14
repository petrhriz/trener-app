import { describe, expect, it } from "vitest";
import { recomputeSleepRows, shiftDay, sleepBankMin, sleepBaseMin, sleepNeedMin, sleepScoreCalc, SLEEP_BASE_DEFAULT, type SleepCalcRow } from "../src/core/sleepCalc";

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
const row = (date: string, s: number | null, d = 4200, r = 3600, a = 600, c = 1): SleepCalcRow => ({
  date, sleep_s: s, deep_s: s ? d : null, rem_s: s ? r : null, awake_s: s ? a : null, awake_count: s ? c : null, sleep_score_g: 70, sleep_need_g_min: 510, next_sleep_need_g_min: 510,
});
/** `n` nocí před 2026-11-02 se stejnou délkou (historie pro základ) + ukázkový týden */
const withHistory = (n: number, s: number): SleepCalcRow[] => [
  ...Array.from({ length: n }, (_, i) => row(shiftDay("2026-11-02", i - n), s)),
  ...NIGHTS.map(([date, s2, d, r, a, c]) => row(date, s2, d, r, a, c)),
];

describe("základ spánku (tvůj obvyklý spánek)", () => {
  it("medián nocí za 60 dní", () => {
    expect(sleepBaseMin([...Array(10).fill(6.5 * 3600), ...Array(10).fill(7 * 3600), 9 * 3600])).toBe(420);
    expect(sleepBaseMin(Array(30).fill(6.5 * 3600))).toBe(390); // kdo spí 6:30, má základ 6:30
  });
  it("málo nocí → 8 h; mezery v datech se nepočítají", () => {
    expect(sleepBaseMin(Array(13).fill(6 * 3600))).toBe(SLEEP_BASE_DEFAULT);
    expect(sleepBaseMin([...Array(14).fill(7 * 3600), null, null, 0])).toBe(420);
  });
  it("pojistka 6–9 h", () => {
    expect(sleepBaseMin(Array(20).fill(4 * 3600))).toBe(360);
    expect(sleepBaseMin(Array(20).fill(11 * 3600))).toBe(540);
  });
});

describe("bilance a potřeba", () => {
  it("noci podle zvyku = bilance 0, potřeba = základ", () => {
    expect(sleepBankMin(Array(7).fill(390 * 60), 390)).toBe(0);
    expect(sleepNeedMin(Array(7).fill(390 * 60), 390)).toBe(390);
  });
  it("novější noc váží víc (0,74^stáří)", () => {
    const short = 6 * 3600, ok = 480 * 60;
    expect(sleepBankMin([ok, ok, ok, ok, ok, ok, short], 480)).toBeCloseTo(-120, 5);
    expect(sleepBankMin([short, ok, ok, ok, ok, ok, ok], 480)).toBeCloseTo(-120 * 0.74 ** 6, 5);
  });
  it("potřebu zvedne čtvrtina dluhu, nejvýš +60 min; přebytek ji nesnižuje", () => {
    expect(sleepNeedMin([...Array(6).fill(480 * 60), 6 * 3600], 480)).toBe(510); // dluh 2 h → +30 min
    expect(sleepNeedMin(Array(7).fill(4 * 3600), 480)).toBe(540); // velký dluh → nejvýš +60
    expect(sleepNeedMin(Array(7).fill(10 * 3600), 480)).toBe(480);
  });
});

describe("skóre spánku", () => {
  it("krátká noc s minimem REM má nízké skóre (~47)", () => {
    const n = NIGHTS[7]!;
    const sc = sleepScoreCalc({ sleep_s: n[1], deep_s: n[2], rem_s: n[3], awake_s: n[4], awake_count: n[5] }, 538)!;
    expect(sc.score).toBeGreaterThanOrEqual(46);
    expect(sc.score).toBeLessThanOrEqual(48);
    expect(sc.rem).toBeLessThan(0.01); // 10 min REM
  });
  it("delší spánek proti potřebě = vyšší skóre, maximum 100", () => {
    const base = { deep_s: 70 * 60, rem_s: 60 * 60, awake_s: 600, awake_count: 1 };
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
  it("krátký spáč: noc podle zvyku má potřebu podle zvyku, ne 8 h + dluh", () => {
    const rows = [...Array.from({ length: 40 }, (_, i) => row(shiftDay("2026-11-10", i - 40), 6.5 * 3600)), row("2026-11-10", 6.5 * 3600)];
    const out = recomputeSleepRows(rows, "2026-11-10", "2026-11-10");
    expect(out[0]!.sleep_need_min).toBe(390);
    expect(out[0]!.next_sleep_need_min).toBe(390);
  });
  it("bez historie: základ 8 h + čtvrtina dluhu", () => {
    const rows = NIGHTS.map(([date, s, d, r, a, c]) => row(date, s, d, r, a, c));
    const out = recomputeSleepRows(rows, "2026-11-09", "2026-11-09");
    const prev7 = NIGHTS.slice(0, 7).map((n) => n[1]);
    expect(out[0]!.sleep_need_min).toBe(sleepNeedMin(prev7, 480));
    expect(out[0]!.sleep_need_min).toBeGreaterThan(480);
    expect(out[0]!.sleep_need_min).toBeLessThanOrEqual(540);
  });
  it("s historií se základ bere z ní", () => {
    const out = recomputeSleepRows(withHistory(50, 7 * 3600), "2026-11-09", "2026-11-09");
    expect(out[0]!.sleep_need_min).toBe(sleepNeedMin(NIGHTS.slice(0, 7).map((n) => n[1]), 420));
  });
  it("bez fází zůstane skóre Garminu, potřeba se spočítá", () => {
    const r = withHistory(50, 7 * 3600).map((x) => (x.date === "2026-11-09" ? { ...x, deep_s: null, rem_s: null } : x));
    const out = recomputeSleepRows(r, "2026-11-09", "2026-11-09");
    expect(out[0]!.sleep_score).toBe(70);
    expect(out[0]!.sleep_need_min).not.toBeNull();
  });
  it("den bez spánku: hodnoty Garminu", () => {
    const r = [...withHistory(50, 7 * 3600), { ...row("2026-11-10", null), sleep_score_g: null, sleep_need_g_min: 500, next_sleep_need_g_min: null }];
    const out = recomputeSleepRows(r, "2026-11-10", "2026-11-10");
    expect(out[0]).toEqual({ date: "2026-11-10", sleep_score: null, sleep_need_min: 500, next_sleep_need_min: null });
  });
});
