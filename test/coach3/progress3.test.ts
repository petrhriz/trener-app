// Trenér v3: uložení a vyhodnocení kvalit, posun stupně náročnosti.
import { describe, expect, it } from "vitest";
import { type KeyRecord, evaluateKeys, recordKeys } from "../../src/core/coach3/progress3";
import type { EngineAct } from "../../src/core/coach/engine";

const plan = { reps: 4, work_s: 480, lo: 240, hi: 255 };
const key = (date: string, level = 2): Omit<KeyRecord, "state"> => ({ date, sport: "ride", cat: "thr", level, plan, minutes: 60, name: "4×8 min práh" });
const lap = (i: number, w: number, hr = 160) => ({ i, type: "WORK", label: null, start_s: i * 700, moving_s: 480, elapsed_s: 480, distance_m: null, avg_power: w, np: w, avg_hr: hr, max_hr: hr + 5, avg_cad: 90, elev_gain: null, avg_speed: null });
const act = (date: string, laps: any[] | null): EngineAct => ({ id: date, date, sport: "ride", load: 70, moving_s: 3600, quality: true, hr_z: null, pwr_z: null, laps, compliance: null });

describe("kvality: uložení", () => {
  it("uloží dnešní kvalitu, budoucí ne; nevyhodnocenou přepíše novější plán, vyhodnocenou nechá", () => {
    let r = recordKeys([], [key("2026-11-12"), key("2026-11-15")], "2026-11-12");
    expect(r.map((x) => x.date)).toEqual(["2026-11-12"]);
    r = recordKeys(r, [{ ...key("2026-11-12"), cat: "ss" }], "2026-11-12");
    expect(r[0]!.cat).toBe("ss");
    const done = [{ ...r[0]!, state: "done" as const }];
    expect(recordKeys(done, [{ ...key("2026-11-12"), cat: "vo2" }], "2026-11-12")[0]!.cat).toBe("ss");
  });
});

describe("kvality: vyhodnocení a stupeň", () => {
  const rec = recordKeys([], [key("2026-11-10")], "2026-11-10");
  it("zvládnuto čistě → Zlepšit o stupeň výš; Udržet stupeň drží", () => {
    const acts = [act("2026-11-10", [1, 2, 3, 4].map((i) => lap(i, 248, 160 + i)))];
    const z = evaluateKeys(rec, acts, "2026-11-11", "zvyseni", {});
    expect(z.records[0]).toMatchObject({ state: "done", outcome: "posun", newLevel: 3 });
    expect(z.updates).toEqual([expect.objectContaining({ key: "ride:thr", level: 3 })]);
    expect(evaluateKeys(rec, acts, "2026-11-11", "udrzeni", {}).records[0]!.newLevel).toBe(2);
  });
  it("dokončeno 2 ze 4 → o stupeň níž", () => {
    const acts = [act("2026-11-10", [lap(1, 248), lap(2, 245)])];
    expect(evaluateKeys(rec, acts, "2026-11-11", "zvyseni", {}).records[0]).toMatchObject({ outcome: "ubrat", newLevel: 1 });
  });
  it("bez aktivity: čeká 3 dny, pak „neodjeto“ a stupeň beze změny", () => {
    expect(evaluateKeys(rec, [], "2026-11-12", "zvyseni", {}).records[0]!.state).toBe("pending");
    const m = evaluateKeys(rec, [], "2026-11-13", "zvyseni", {});
    expect(m.records[0]!.state).toBe("missed");
    expect(m.updates).toEqual([]);
  });
  it("stupeň se mezitím změnil jinou kvalitou → nepřičítá se dvakrát", () => {
    const acts = [act("2026-11-10", [1, 2, 3, 4].map((i) => lap(i, 248)))];
    const z = evaluateKeys(rec, acts, "2026-11-11", "zvyseni", { "ride:thr": { level: 3, last: "2026-11-09" } });
    expect(z.records[0]!.newLevel).toBe(3);
  });
});
