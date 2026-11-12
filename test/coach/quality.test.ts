// Běh a kolo bez wattmetru jako kvalita podle času v zónách tepu; strop běhu z runCapOf.
import { describe, expect, it } from "vitest";
import { HR_Q_MIN, classify, hrQuality } from "../../src/core/quality";
import { runCoach } from "../../src/core/coach/engine";
import { runCapOf } from "../../src/core/coach/common";
import { capsFor } from "../../src/core/coach/sport";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";
import { addDays } from "../../src/lib/time";

const min = (m: number) => m * 60;
const act = (sport: "run" | "ride", hr_z: number[] | null, pwr_z: number[] | null = null, np: number | null = null) => ({ sport, name: null, moving_s: 3600, load: 70, pwr_z, np, hr_z });

describe("kvalita podle tepu", () => {
  it("běh: 12 min v Z4 = práh, s 6 min v Z5 = VO2; 8 min v Z4 není kvalita", () => {
    expect(classify(act("run", [min(10), min(30), min(8), min(12), 0])).type).toBe("prah");
    expect(classify(act("run", [min(10), min(30), min(8), min(6), min(6)])).type).toBe("vo2");
    expect(classify(act("run", [min(10), min(35), min(7), min(8), 0])).isQuality).toBe(false);
    expect(hrQuality(null)).toBeNull();
    expect(HR_Q_MIN).toBe(10);
  });
  it("kolo bez wattmetru podle tepu; s wattmetrem rozhodují watty", () => {
    expect(classify(act("ride", [min(10), min(25), min(10), min(15), 0])).isQuality).toBe(true);
    const easyPower = [min(20), min(35), min(5), 0, 0, 0, 0];
    expect(classify(act("ride", [min(10), min(25), min(10), min(15), 0], easyPower, 180)).isQuality).toBe(false);
  });
  it("den po běžecké kvalitě (podle tepu) trenér kvalitu nedá", () => {
    const sc = scenario("zima-udrzet");
    // kvalitu by trenér jinak dal v úterý → v pondělí přidám běžeckou kvalitu
    const base = runCoach(simInput(sc, simHistory(sc), sc.start)).coach.horizon[0]!;
    const keyDay = base.days.find((d) => d.role === "key")!.date;
    const before = addDays(keyDay, -1);
    const acts = [...simHistory(sc), { id: "r", date: before, sport: "run" as const, load: 60, moving_s: 3000, quality: true, hr_z: [0, min(25), min(8), min(15), 0], pwr_z: null, laps: null, compliance: null }];
    const c = runCoach(simInput(sc, acts, keyDay)).coach;
    expect(c.horizon[0]!.days.find((d) => d.date === keyDay)!.role).not.toBe("key");
  });
});

describe("strop délky běhu = runCapOf (aspoň 60, nejvýš 180 min)", () => {
  const cap = (runLongest: number) => capsFor({ sport: "run", role: "long", winter: false, longest: 0, typical: 0, runLongest }).max;
  it("dřív 30–90 min, teď tvoje rozhodnutí", () => {
    expect(cap(0)).toBe(60);
    expect(cap(30)).toBe(60);
    expect(cap(100)).toBe(150);
    expect(cap(200)).toBe(180);
    for (const x of [0, 30, 100, 200]) expect(cap(x)).toBe(runCapOf(x));
  });
});
