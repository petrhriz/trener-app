import { describe, expect, it } from "vitest";
import { energyDay } from "../src/core/energy";

const D0 = Date.parse("2026-11-03T00:00:00+01:00");
const H = 3600_000;
/** tep po 2 min: ve spánku 52, přes den kolem `day` (sudé / liché vzorky ±6) */
function hrDay(day = 75, sleepEnd = 8 * H): [number, number | null][] {
  const out: [number, number | null][] = [];
  for (let t = 0; t < 24 * H; t += 120_000) out.push([D0 + t, t < sleepEnd ? 52 : day + ((t / 120_000) % 2 ? 6 : -6)]);
  return out;
}
const sleep = (rec: number | null) => [{ start: D0, end: D0 + 8 * H, recovery: rec }];
const dist = { rest: 0.55, low: 0.25, med: 0.12, high: 0.04, act: 0.04 };

describe("energie", () => {
  it("lepší zotavení = víc nabito ve spánku", () => {
    const lo = energyDay({ hr: hrDay(), sleeps: sleep(15), acts: [], rhr: 54, dist, start: 30 });
    const hi = energyDay({ hr: hrDay(), sleeps: sleep(95), acts: [], rhr: 54, dist, start: 30 });
    const ev = (e: typeof lo) => e.events.find((x) => x.type === "SLEEP")!.impact;
    expect(ev(hi)).toBeGreaterThan(ev(lo) + 8);
    expect(ev(lo)).toBeGreaterThan(15); // i po špatné noci se nabije
  });
  it("nabíjení zpomaluje u plné baterie (nepřeteče přes 100)", () => {
    const e = energyDay({ hr: hrDay(), sleeps: sleep(100), acts: [], rhr: 54, dist, start: 85 });
    expect(e.max).toBeLessThanOrEqual(100);
    expect(e.events[0]!.impact).toBeLessThan(15);
  });
  it("přes den ubývá, u nízké hladiny pomaleji", () => {
    const hi = energyDay({ hr: hrDay(90, 0), sleeps: [], acts: [], rhr: 54, dist: { rest: 0.1, low: 0.4, med: 0.35, high: 0.15, act: 0 }, start: 80 });
    const lo = energyDay({ hr: hrDay(90, 0), sleeps: [], acts: [], rhr: 54, dist: { rest: 0.1, low: 0.4, med: 0.35, high: 0.15, act: 0 }, start: 15 });
    expect(hi.drained).toBeGreaterThan(lo.drained * 2.5);
    expect(lo.end).toBeGreaterThanOrEqual(0);
  });
  it("aktivita vybije víc než stejně dlouhý klid", () => {
    const act = [{ start: D0 + 14 * H, end: D0 + 15.5 * H }];
    const hr = hrDay().map(([t, h]) => [t, t >= act[0]!.start && t <= act[0]!.end ? 150 : h] as [number, number | null]);
    const a = energyDay({ hr, sleeps: sleep(50), acts: act, rhr: 54, dist, start: 40 });
    const b = energyDay({ hr: hrDay(), sleeps: sleep(50), acts: [], rhr: 54, dist, start: 40 });
    expect(a.end).toBeLessThan(b.end - 4);
    expect(a.events.find((e) => e.type === "ACTIVITY")!.impact).toBeLessThan(0);
  });
  it("klidný den (víc klidu) se vybije méně a ukáže klidné chvíle v liště", () => {
    const calm = energyDay({ hr: hrDay(), sleeps: sleep(50), acts: [], rhr: 54, dist: { rest: 0.8, low: 0.15, med: 0.04, high: 0.01, act: 0 }, start: 40 });
    const busy = energyDay({ hr: hrDay(), sleeps: sleep(50), acts: [], rhr: 54, dist: { rest: 0.36, low: 0.3, med: 0.22, high: 0.12, act: 0 }, start: 40 });
    expect(calm.end).toBeGreaterThan(busy.end + 5);
    const dur = (e: typeof calm) => e.rest.reduce((t, [a, b]) => t + b - a, 0);
    expect(dur(calm)).toBeGreaterThan(dur(busy) + 3 * H);
  });
  it("výpadek dat přes den: dál ubývá (ne držení hodnoty)", () => {
    const hr = hrDay().filter(([t]) => t < D0 + 10 * H || t > D0 + 14 * H);
    const e = energyDay({ hr, sleeps: sleep(50), acts: [], rhr: 54, dist, start: 40 });
    const at = (t: number) => e.pts.filter((p) => p[0] <= t).pop()![1];
    expect(at(D0 + 14.1 * H)).toBeLessThan(at(D0 + 10 * H) - 3);
  });
  it("bez rozpadu stresu odhad z tepu, bez tepu nic", () => {
    expect(energyDay({ hr: hrDay(), sleeps: sleep(50), acts: [], rhr: 54, dist: null, start: 40 }).stress.length).toBeGreaterThan(100);
    const empty = energyDay({ hr: [], sleeps: [], acts: [], rhr: 54, dist, start: 33 });
    expect(empty.pts).toHaveLength(0);
    expect(empty.end).toBe(33);
  });
});
