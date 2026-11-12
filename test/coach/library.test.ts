import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/core/coach/workouts.data";

// běžné délky úseků jako v tréninkových plánech (scripts/build-workout-library.mjs tidy, docs/trener/zdroje.md)
const LONG_MIN = [10, 12, 15, 18, 20, 24, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
const SHORT_S = [5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 45];
const HARD = 76;

describe("knihovna tréninků", () => {
  it("pracovní úseky mají běžné délky (žádné 17 min, 6:18 nebo 33 s)", () => {
    const odd: string[] = [];
    for (const w of LIBRARY) {
      const segs = w.g.flatMap((x) => (typeof x[1] === "number" ? [x as [number, number]] : x[1]));
      for (const [s, p] of segs) {
        if (p < HARD) { if (s >= 60 && s % 30) odd.push(`${w.id} pauza ${s} s`); continue; }
        const ok = s >= 600 ? LONG_MIN.includes(s / 60) : s >= 240 ? s % 60 === 0 : s >= 60 ? s % 30 === 0 : SHORT_S.includes(s);
        if (!ok) odd.push(`${w.id} ${s} s`);
      }
    }
    expect(odd).toEqual([]);
  });
});
