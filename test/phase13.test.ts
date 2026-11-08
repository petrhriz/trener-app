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

import { parseOwnRide } from "../src/core/ownRide";
import { parseConsent } from "../src/plan/proposals";
describe("ultrareview: vlastní jízda a souhlas", () => {
  const T = "2026-11-08"; // neděle
  it("dny s diakritikou", () => {
    expect(parseOwnRide("v pondělí pojedu 3 h", T)!.date).toBe("2026-11-09");
    expect(parseOwnRide("v úterý jedu 2 h", T)!.date).toBe("2026-11-10");
  });
  it("2.5 h není datum", () => {
    const r = parseOwnRide("v sobotu pojedu 2.5 h", T)!;
    expect(r.date).toBe("2026-11-14");
    expect(r.min).toBe(150);
  });
  it("čas startu není délka", () => {
    expect(parseOwnRide("zítra vyrážím v 9:00 na 3 h", T)!.min).toBe(180);
    expect(parseOwnRide("pozítří jedu 3:30 h", T)!.min).toBe(210);
  });
  it("„po“ jako předložka není pondělí", () => {
    expect(parseOwnRide("v sobotu pojedu po obědě 3 h", T)!.date).toBe("2026-11-14");
    expect(parseOwnRide("pojedu po práci 2 h", T)).toBeNull();
  });
  it("datum 21. 11.", () => {
    expect(parseOwnRide("21. 11. pojedu 4 h", T)!.date).toBe("2026-11-21");
  });
  it("souhlas s diakritikou", () => {
    expect(parseConsent("jasně", ["#1", "#2"])).toEqual(["#1", "#2"]);
    expect(parseConsent("zapiš #2", ["#1", "#2"])).toEqual(["#2"]);
  });
});

import { rewriteSql } from "../src/lib/tenant";
describe("ultrareview: server", () => {
  it("přejmenování tabulek nemění text v apostrofech", () => {
    const s = rewriteSql("INSERT INTO activities (id, name) VALUES ('1', 'Ride from gear shop')", "u3_");
    expect(s).toBe("INSERT INTO u3_activities (id, name) VALUES ('1', 'Ride from gear shop')");
    expect(rewriteSql("SELECT * FROM gear WHERE note = 'it''s on wellness'", "u3_")).toBe("SELECT * FROM u3_gear WHERE note = 'it''s on wellness'");
  });
});
