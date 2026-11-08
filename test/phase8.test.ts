import { describe, expect, it } from "vitest";
import { otherWorkout, renderIcu, validate, workoutFromIcu } from "../src/core/workout";
import { chooseFocus } from "../src/core/qualityDesign";
import { sleepReport } from "../src/core/sleep";
import { parseSportChange } from "../src/telegram/bot";

describe("jiný sport místo kola", () => {
  it("běh Z2 a intervaly podle tepu, lapy podle pravidel", () => {
    const z2 = otherWorkout("run", "z2", 45);
    expect(renderIcu(z2.workout)).toContain("Z2 HR");
    expect(renderIcu(z2.workout)).not.toContain("press lap");
    const q = otherWorkout("run", "quality", 60);
    expect(q.workout.blocks[0]!.steps[0]!.lap).toBeFalsy(); // u běhu bez pravidla lapů
    expect(q.name).toBe("Běh – 5×4 min Z4");
    const xc = otherWorkout("xc_ski", "quality", 90);
    expect(xc.name).toBe("Běžky – kvalita naplno");
    expect(xc.workout.blocks).toHaveLength(1);
  });
  it("zpráva → sport a dny", () => {
    const T = "2026-11-07"; // sobota
    expect(parseSportChange("dnes ne kolo, běh", T)).toEqual({ sport: "run", dates: [T] });
    expect(parseSportChange("zítra běžky místo kola", T)).toEqual({ sport: "xc_ski", dates: ["2026-11-08"] });
    const w = parseSportChange("příští týden budu jen běhat", T)!;
    expect(w.sport).toBe("run");
    expect(w.dates).toHaveLength(7);
    expect(w.dates[0]).toBe("2026-11-09");
    expect(parseSportChange("jak jsem na tom s kolem?", T)).toBeNull();
    expect(parseSportChange("/sport kolo zítra", T)).toEqual({ sport: "ride", dates: ["2026-11-08"] });
  });
});

describe("workout z intervals.icu", () => {
  it("rozjetí, opakování a dojezd", () => {
    const w = workoutFromIcu(
      [
        { power: { start: 140, end: 220, units: "w" }, duration: 1947, until_lap_press: true },
        { reps: 5, steps: [{ power: { start: 330, end: 350, units: "w" }, duration: 240 }, { power: { start: 100, end: 160, units: "w" }, duration: 240 }] },
        { power: { start: 120, end: 220, units: "w" }, duration: 2136, until_lap_press: true },
      ],
      298,
    )!;
    expect(w.blocks.map((b) => b.kind)).toEqual(["warmup", "work", "cooldown"]);
    expect(w.blocks[1]!.reps).toBe(5);
    expect(w.blocks[1]!.steps[0]!.lo).toBe(330);
  });
});

describe("pestrost kvality", () => {
  it("zaměření z posledních dnů se vynechá", () => {
    const f = chooseFocus([], "2026-11-10", null, ["prah"]);
    expect(f.focus).not.toBe("prah");
  });
});

describe("spánek", () => {
  it("fáze proti optimu Garminu", () => {
    const r = sleepReport(
      { date: "2026-11-07", sleep_s: 30240, sleep_score: 77, deep_s: 4080, light_s: 23280, rem_s: 2880, awake_s: 1200, awake_count: 2, sleep_stress: 16, sleep_hr: 63, sleep_resp: 12, sleep_need_min: 540, sleep_feedback: "NEGATIVE_LONG_BUT_NOT_ENOUGH_REM", sleep_sub: null, sleep_start: "2026-11-07T00:09", wake_time: "2026-11-07T08:53" },
      [],
    )!;
    expect(r.stages.find((s) => s.key === "rem")!.pct).toBe(10);
    expect(r.stages.find((s) => s.key === "rem")!.tone).toBe("bad");
    expect(r.stages.find((s) => s.key === "deep")!.pct).toBe(13);
    expect(r.verdict).toContain("málo REM");
  });
});
