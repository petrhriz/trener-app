import { describe, expect, it } from "vitest";
import { generatePlan, type PlanInput } from "../src/core/plan";
import { trainingBalanceOf } from "../src/core/balance";

function planInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    today: "2026-11-07",
    ftp: 298,
    hr: { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 54 },
    goal: "udrzeni",
    ridesPerWeek: 3,
    startYesterday: { ctl: 50, atl: 40 },
    startToday: null,
    acts: [],
    actsPower: [],
    past: () => null,
    calendar: [],
    constraints: [],
    weather: new Map(),
    weatherOk: false,
    recovery: "green",
    p5: 340,
    ...over,
  };
}

describe("plán: volba sportu ve dni volna", () => {
  it("běh ve dni volna přidá jednotku", () => {
    const base = generatePlan(planInput());
    const rest = base.days.find((d) => d.kind === "rest")!;
    const p = generatePlan(planInput({ constraints: [{ date: rest.date, kind: "sport", note: "run" }] }));
    const d = p.days.find((x) => x.date === rest.date)!;
    expect(d.name).toBeTruthy();
    expect(d.sport).toBe("run");
    expect(p.changes.some((c) => c.date === rest.date && c.action === "nová")).toBe(true);
  });
  it("volno zruší trénink a plán ho nezaplní", () => {
    const base = generatePlan(planInput());
    const ride = base.days.find((d) => d.name && d.kind === "z2")!;
    const p = generatePlan(planInput({ constraints: [{ date: ride.date, kind: "sport", note: "rest" }] }));
    const d = p.days.find((x) => x.date === ride.date)!;
    expect(d.kind).toBe("rest");
    expect(d.userRest).toBe(true);
  });
  it("chůze místo kvality = regenerace, ne Z4", () => {
    const base = generatePlan(planInput());
    const q = base.days.find((d) => d.kind === "quality")!;
    const p = generatePlan(planInput({ constraints: [{ date: q.date, kind: "sport", note: "walk" }] }));
    const d = p.days.find((x) => x.date === q.date)!;
    expect(d.kind).toBe("recovery");
    expect(d.targetText).toContain("Z1");
  });
});

describe("plán: změna cíle přepočítá i jednotky z kalendáře", () => {
  // kalendář = Z2 jednotky vytvořené pro „udržet“, záměrně s nesmyslnou délkou 200 min
  const base = generatePlan(planInput({ today: "2026-11-08" }));
  let id = 1;
  const calendar = base.days.filter((d) => d.kind === "z2" && d.date > "2026-11-08").map((d) => ({
    id: id++, date: d.date, kind: "z2", quality_type: null, name: "Z2 vytrvalost", indoor: 0, duration_min: 200, steps_json: null,
    target_load: 150, status: "planned", sport: "ride", goal: "udrzeni", reason: "", intervals_event_id: null,
  })) as any[];
  it("Z2 z kalendáře dostane novou délku podle týdenní zátěže", () => {
    const p = generatePlan(planInput({ today: "2026-11-08", goal: "zvyseni", calendar }));
    for (const c of calendar) {
      const d = p.days.find((x) => x.date === c.date)!;
      expect(d.changed).toBe("upravit");
      expect(d.durationMin).toBeLessThanOrEqual(180);
    }
  });
  it("řízený pokles = nižší zátěž přepočítaného týdne (počet jízd zůstává)", () => {
    const p = generatePlan(planInput({ today: "2026-11-08", goal: "pokles", calendar }));
    const load = (x: typeof p) => x.days.filter((d) => d.date > "2026-11-08" && d.date <= "2026-11-15").reduce((t, d) => t + d.load, 0);
    expect(load(p)).toBeLessThan(load(base));
  });
});

describe("tréninkové vyvážení", () => {
  it("zátěž podle zón výkonu vážená intenzitou", () => {
    const b = trainingBalanceOf(
      [
        { date: "2026-11-01", sport: "ride", load: 100, hr_z: null, pwr_z: [600, 3000, 0, 0, 0, 0, 0] },
        { date: "2026-11-03", sport: "ride", load: 80, hr_z: null, pwr_z: [600, 600, 600, 1200, 300, 60, 20] },
        { date: "2026-11-05", sport: "hockey", load: 60, hr_z: [300, 600, 900, 600, 100], pwr_z: null },
      ],
      "2026-10-11",
      "2026-11-07",
    );
    expect(b.total).toBe(240);
    expect(b.parts.reduce((t, p) => t + p.load, 0)).toBeGreaterThanOrEqual(239);
    const low = b.parts.find((p) => p.key === "low")!;
    expect(low.pct).toBeGreaterThan(40);
    expect(b.verdict).toBeTruthy();
  });
});
