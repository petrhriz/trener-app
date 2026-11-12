import { describe, expect, it } from "vitest";
import { trainingBalanceOf } from "../src/core/balance";




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
