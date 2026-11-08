import { describe, expect, it } from "vitest";
import { complianceTone, compliance, ctlPlan, efficiency, intensityVerdict, monotonyWeeks } from "../src/core/analytics";

describe("TrainingPeaks výpočty", () => {
  it("compliance: barvy jako TrainingPeaks", () => {
    expect(complianceTone(100)).toBe("good");
    expect(complianceTone(70)).toBe("warn");
    expect(complianceTone(160)).toBe("bad");
    const c = compliance(
      [{ date: "2026-11-02", kind: "z2", name: "Z2", target_load: 50, status: "planned" }, { date: "2026-11-03", kind: "quality", name: "Práh", target_load: 80, status: "planned" }, { date: "2026-11-04", kind: "z2", name: "Z2", target_load: 50, status: "skipped" }],
      [{ id: "a", date: "2026-11-02", sport: "ride", load: 55 }],
      "2026-11-08",
    );
    expect(c.count).toBe(2);
    expect(c.doneCount).toBe(1);
    expect(c.items.find((i) => i.date === "2026-11-03")!.missed).toBe(true);
  });
  it("80/20: moc šedé zóny", () => {
    const acts = [{ id: "a", date: "2026-11-05", sport: "ride", hr_z: [600, 3000, 2400, 200, 0] }];
    const v = intensityVerdict(acts, "2026-11-08")!;
    expect(v.greyPct).toBeGreaterThan(15);
    expect(v.tone).not.toBe("good");
  });
  it("kondice k cíli: potřebný růst za týden", () => {
    const p = ctlPlan(40, 60, "2027-01-03", "2026-11-08")!;
    expect(p.ramp).toBeGreaterThan(2);
    expect(p.ramp).toBeLessThan(3.5);
    expect(p.tone).toBe("good");
    expect(ctlPlan(40, 90, "2026-12-06", "2026-11-08")!.tone).toBe("bad");
    expect(ctlPlan(40, null, null, "2026-11-08")).toBeNull();
  });
  it("EF jen z lehkých jízd", () => {
    const e = efficiency([
      { id: "1", date: "2026-10-01", sport: "ride", moving_s: 3600, np: 180, avg_hr: 140, if_garmin: 0.6 },
      { id: "2", date: "2026-10-10", sport: "ride", moving_s: 3600, np: 280, avg_hr: 170, if_garmin: 0.95 },
      { id: "3", date: "2026-10-20", sport: "ride", moving_s: 3600, np: 190, avg_hr: 140, if_garmin: 0.62 },
    ], 300);
    expect(e.points.length).toBe(2);
    expect(e.trend).toBeGreaterThan(0);
  });
  it("monotónnost: stejná zátěž každý den = vysoká", () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, load: 60 + (i % 2) }));
    const m = monotonyWeeks(days, "2026-11-12", 2);
    expect(m.weeks[0]!.monotony).toBeGreaterThan(2);
    expect(m.tone).toBe("bad");
  });
});
