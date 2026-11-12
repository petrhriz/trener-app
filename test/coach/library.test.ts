import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/core/coach/workouts.data";

describe("knihovna tréninků", () => {
  it("délky úseků jsou čitelné: od 10 min celé minuty, od 2 min půlminuty", () => {
    const odd: string[] = [];
    for (const w of LIBRARY) {
      const segs = w.g.flatMap((x) => (typeof x[1] === "number" ? [x[0]] : x[1].map((s) => s[0])));
      for (const s of segs) if ((s >= 600 && s % 60) || (s >= 120 && s % 30)) odd.push(`${w.id} ${s} s`);
    }
    expect(odd).toEqual([]);
  });
  it("název tvaru odpovídá délkám (žádné „17:03 min“)", () => {
    for (const w of LIBRARY) expect(w.n, w.id).not.toMatch(/\d+:(?!00|30)\d{2} min/);
  });
});
