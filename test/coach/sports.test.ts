// Další sporty z profilu engine opravdu používá (dřív přepínače v Nastavení nic nedělaly).
import { describe, expect, it } from "vitest";
import { runCoach } from "../../src/core/coach/engine";
import { runCapOf } from "../../src/core/coach/common";
import { DEFAULT_PROFILE, type CoachProfile, profileSummary } from "../../src/core/coach/profile";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const sc = scenario("zima-udrzet");
const acts = simHistory(sc);
const prof = (o: { run?: boolean; xc?: boolean; primary?: "ride" | "run" } = {}): CoachProfile => ({
  ...DEFAULT_PROFILE,
  primary: o.primary ?? "ride",
  sports: { ...DEFAULT_PROFILE.sports, ride: { enabled: (o.primary ?? "ride") === "ride", quality: true }, run: { enabled: !!o.run || o.primary === "run", quality: false }, xc_ski: { enabled: !!o.xc, quality: false } },
});
const weeks = (profile: CoachProfile, extra = {}) => runCoach({ ...simInput(sc, acts, sc.start, extra), profile }).coach.horizon;
const count = (w: ReturnType<typeof weeks>[number], s: string) => w.days.filter((d) => d.role !== "rest" && d.sport === s).length;

describe("další sporty z profilu", () => {
  it("bez dalších sportů jen kolo", () => {
    for (const w of weeks(prof())) expect(count(w, "run") + count(w, "xc_ski")).toBe(0);
  });
  it("běh zapnutý: nejvýš (a tady právě) jeden vytrvalostní den týdně, ve stropech běhu", () => {
    for (const w of weeks(prof({ run: true }))) {
      const runs = w.days.filter((d) => d.role !== "rest" && d.sport === "run");
      expect(runs.length).toBe(1);
      expect(runs[0]!.role).toBe("endurance");
      expect(runs[0]!.minutes).toBeLessThanOrEqual(runCapOf(0));
    }
  });
  it("tvůj běh ve středu se počítá – další běh trenér nepřidá", () => {
    const wed = "2026-11-18";
    const w = weeks(prof({ run: true }), { constraints: [{ date: wed, kind: "sport", note: "run" }] })[0]!;
    expect(w.days.filter((d) => d.role !== "rest" && d.sport === "run").map((d) => d.date)).toEqual([wed]);
  });
  it("běžky zapnuté: jeden vytrvalostní den týdně", () => {
    for (const w of weeks(prof({ xc: true }))) expect(count(w, "xc_ski")).toBe(1);
    const both = weeks(prof({ xc: true, run: true }))[1]!;
    expect([count(both, "run"), count(both, "xc_ski")]).toEqual([1, 1]);
  });
  it("hlavní sport běh + občas kolo: jeden vytrvalostní den týdně na kole", () => {
    for (const w of weeks(prof({ primary: "run" }))) expect(count(w, "ride")).toBe(0);
    const p = prof({ primary: "run" });
    p.sports.ride.enabled = true;
    const ws = weeks(p);
    for (const w of ws) expect(count(w, "ride")).toBeLessThanOrEqual(1);
    expect(ws.filter((w) => count(w, "ride") === 1).length).toBeGreaterThanOrEqual(3);
  });
  it("shrnutí profilu říká, co trenér opravdu dělá", () => {
    expect(profileSummary(prof({ run: true })).join(" ")).toMatch(/Běh: nejvýš jeden vytrvalostní den týdně/);
    expect(profileSummary(prof({ xc: true })).join(" ")).toMatch(/Běžky: jeden vytrvalostní den týdně/);
  });
});
