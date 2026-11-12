import { describe, expect, it } from "vitest";
import { workoutFromIcu } from "../src/core/workout";
import { sleepReport } from "../src/core/sleep";

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
