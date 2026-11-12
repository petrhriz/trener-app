// Trenér v3: kostra týdne.
import { describe, expect, it } from "vitest";
import { MAX_STREAK, type SkDay, solveWeek } from "../../src/core/coach/skeleton";
import { addDays } from "../../src/lib/time";

const MON = "2026-11-16";
const week = (x: Partial<SkDay>[] = []): SkDay[] => [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: addDays(MON, i), ...(x[i] ?? {}) }));
const tail = (trained: boolean[] = [false, false, false]) => trained.map((t, i) => ({ date: addDays(MON, i - 3), trained: t, hard: false }));
const roles = (r: Map<string, string>) => [...r.values()].join(" ");

describe("kostra týdne", () => {
  it("4 tréninky, 1 kvalita, dlouhý: kvalita po volnu, dlouhý o víkendu, nikdy 4 dny za sebou", () => {
    const r = solveWeek({ days: week(), tail: tail(), sessions: 4, keys: 1, long: true });
    expect(r.sessions).toBe(4);
    const v = [...r.roles.entries()];
    const key = v.find(([, x]) => x === "key")![0];
    const lg = v.find(([, x]) => x === "long")![0];
    expect(r.roles.get(addDays(key, -1)) ?? "rest").toBe("rest");
    expect(["2026-11-21", "2026-11-22"]).toContain(lg);
  });
  it("2 kvality: nikdy den po kvalitě ani po dlouhém (ani přes hranu týdne)", () => {
    for (let s = 3; s <= 6; s++) {
      const r = solveWeek({ days: week(), tail: [{ date: addDays(MON, -1), trained: true, hard: true }], sessions: s, keys: 2, long: true });
      const arr = [...r.roles.values()];
      expect(arr[0]).not.toBe("key");
      arr.forEach((x, i) => { if (x === "key" && i > 0) expect(["key", "long"]).not.toContain(arr[i - 1]); });
      let run = 0, mx = 0;
      for (const x of arr) { run = x === "rest" ? 0 : run + 1; mx = Math.max(mx, run); }
      expect(mx).toBeLessThanOrEqual(MAX_STREAK);
    }
  });
  it("tvoje volby platí: volno, vynucená kvalita, Z2", () => {
    const r = solveWeek({ days: week([{}, { type: "quality" }, {}, { rest: true }, { type: "z2" }, {}, {}]), tail: tail(), sessions: 4, keys: 1, long: true });
    expect(r.roles.get(addDays(MON, 1))).toBe("key");
    expect(r.roles.get(addDays(MON, 3))).toBe("rest");
    expect(r.roles.get(addDays(MON, 4))).toBe("endurance");
  });
  it("🟡 ráno: dnes kvalita ne, posune se jinam", () => {
    const r = solveWeek({ days: week([{ noKey: true }]).slice(0, 7), tail: tail(), sessions: 3, keys: 1, long: true });
    expect(r.roles.get(MON)).not.toBe("key");
    expect(r.keys).toBe(1);
  });
  it("málo dní (čt–ne, pátek blokovaný): ubírá se nejdřív Z2, kvalita a dlouhý zůstanou", () => {
    const d = week([{}, {}, {}, {}, { blocked: true }, {}, {}]).slice(3);
    const r = solveWeek({ days: d, tail: tail([true, false, true]), sessions: 4, keys: 1, long: true });
    expect(r.keys).toBe(1);
    expect(r.long).toBe(true);
    expect(r.sessions).toBe(3);
    expect(r.notes.join(" ")).toMatch(/Tréninků 3 místo 4/);
  });
  it("dlouhý se vyhne špatnému počasí, když může", () => {
    const r = solveWeek({ days: week([{}, {}, {}, {}, {}, { badWeather: true }, {}]), tail: tail(), sessions: 3, keys: 1, long: true });
    expect(r.roles.get(addDays(MON, 6))).toBe("long");
  });
});
