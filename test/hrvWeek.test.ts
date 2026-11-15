// Týdenní VST pod normou: 7denní medián ln VST proti 7denním hodnotám předchozích 60 dní (K-06).
import { describe, expect, it } from "vitest";
import { hrvWeekLow } from "../src/core/recovery";
import { addDays } from "../src/lib/time";

const T = "2026-11-15";
// 60 nocí kolem 60 ms: pomalá vlna ±4 % a denní šum ±12 % (pevný seed – opakovatelné)
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const base = Array.from({ length: 61 }, (_, i) => 60 * (1 + 0.04 * Math.sin(i / 3.5)) * (1 + (rnd() - 0.5) * 0.24));
/** posledních 7 nocí (k = 0 dnes … 6) podle `f`, starší z `base` */
const rows = (f: (k: number) => number | null) => base.map((v, i) => ({ date: addDays(T, i - 60), hrv: 60 - i <= 6 ? f(60 - i) : v }));
const week = (level: number) => (k: number) => level * (1 + ((k * 37) % 11 - 5) / 50);

describe("týdenní VST pod normou", () => {
  it("běžný týden → ne", () => expect(hrvWeekLow(rows(week(60)), T)).toBe(false));
  it("týden o 8 % níž → ano; o 4 % níž zachytí i tam, kde stará hranice (průměr − 1 SD nocí) mlčela", () => {
    expect(hrvWeekLow(rows(week(60 * 0.92)), T)).toBe(true);
    const r = rows(week(60 * 0.96));
    expect(hrvWeekLow(r, T)).toBe(true);
    const night = r.slice(0, 54).map((x) => x.hrv!);
    const m = night.reduce((t, x) => t + x, 0) / night.length;
    const sd = Math.sqrt(night.reduce((t, x) => t + (x - m) ** 2, 0) / (night.length - 1));
    const w = r.slice(54).map((x) => x.hrv!);
    expect(w.reduce((t, x) => t + x, 0) / w.length).toBeGreaterThan(m - sd);
  });
  it("jedna velmi nízká noc v jinak normálním týdnu → ne (medián)", () => {
    expect(hrvWeekLow(rows((k) => (k === 0 ? 40 : week(60)(k))), T)).toBe(false);
  });
  it("málo nocí v týdnu nebo málo historie → nehodnotí", () => {
    expect(hrvWeekLow(rows((k) => (k < 3 ? 45 : null)), T)).toBe(false);
    expect(hrvWeekLow(rows(() => 45).slice(-20), T)).toBe(false);
  });
});
