import { describe, expect, it } from "vitest";
import { coaching, normCdf, recoveryScore, strainScore, typicalWake, type NightRow } from "../src/core/readinessScore";
import { nextAlert, partKm, type Part } from "../src/api/gear";
import { addDays } from "../src/lib/time";

// 60 nocí kolem normy: VST 74 ± ~7, klidový tep 53 ± ~2, tep ve spánku 56, skóre 81, dech 11,4
function history(): NightRow[] {
  const out: NightRow[] = [];
  for (let i = 60; i >= 1; i--) {
    const k = i % 5;
    out.push({ date: addDays("2026-11-08", -i), hrv: 66 + k * 4, rhr: 51 + (k % 3) * 2, sleep_hr: 54 + (k % 3) * 2, sleep_s: 28800 + (k - 2) * 1200, sleep_need_min: 480, sleep_score: 74 + k * 3, sleep_resp: 11 + (k % 2) * 0.8 });
  }
  return out;
}

describe("skóre zotavení", () => {
  const h = history();
  it("noc jako 8. 11. (VST 67, tep 57, krátký spánek) → nízké zotavení", () => {
    const r = recoveryScore({ date: "2026-11-08", hrv: 67, rhr: 57, sleep_hr: 61, sleep_s: 25440, sleep_need_min: 510, sleep_score: 70, sleep_resp: 12 }, h);
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeLessThan(34);
    expect(r.band).toBe("low");
    expect(r.drags.length).toBeGreaterThan(0);
  });
  it("normální rozdělení", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normCdf(-2)).toBeCloseTo(0.0228, 3);
  });
  it("kratší spánek proti potřebě skóre sníží", () => {
    const n = { date: "2026-11-08", hrv: 74, rhr: 53, sleep_hr: 56, sleep_need_min: 500, sleep_score: 80, sleep_resp: 11.4 };
    const full = recoveryScore({ ...n, sleep_s: 30000 }, h).score!;
    const short = recoveryScore({ ...n, sleep_s: 21600 }, h).score!;
    expect(short).toBeLessThan(full - 5);
    expect(recoveryScore({ ...n, sleep_s: 21600 }, h).drags.map((c) => c.key)).toContain("sleepDur");
  });
  it("bez základny (méně než 20 nocí) nedává", () => {
    expect(recoveryScore({ date: "2026-11-08", hrv: 74, rhr: 53, sleep_hr: 56, sleep_s: 28800, sleep_need_min: 480, sleep_score: 80, sleep_resp: 11.4 }, h.slice(-10)).score).toBeNull();
  });
  it("skóre v rozsahu 0–100", () => {
    const r = recoveryScore({ date: "2026-11-08", hrv: 74, rhr: 53, sleep_hr: 56, sleep_s: 28800, sleep_need_min: 480, sleep_score: 80, sleep_resp: 11.4 }, h);
    expect(r.score!).toBeGreaterThanOrEqual(0);
    expect(r.score!).toBeLessThanOrEqual(100);
  });
  it("noc v normě → kolem středu", () => {
    const r = recoveryScore({ date: "2026-11-08", hrv: 74, rhr: 53, sleep_hr: 56, sleep_s: 28800, sleep_need_min: 480, sleep_score: 80, sleep_resp: 11.4 }, h);
    expect(r.score!).toBeGreaterThan(45);
    expect(r.score!).toBeLessThan(75);
  });
  it("výborná noc → vysoké zotavení", () => {
    const r = recoveryScore({ date: "2026-11-08", hrv: 88, rhr: 48, sleep_hr: 52, sleep_s: 30000, sleep_need_min: 480, sleep_score: 92, sleep_resp: 11 }, h);
    expect(r.band).toBe("high");
  });
  it("bez VST a tepu skóre nedává", () => {
    expect(recoveryScore({ date: "2026-11-08", hrv: null, rhr: null, sleep_hr: 55, sleep_s: 28000, sleep_need_min: 480, sleep_score: 80, sleep_resp: 11 }, h).score).toBeNull();
  });
});

describe("zátěž dne", () => {
  it("TSS proti plánu dne, bez plánu proti CTL", () => {
    expect(strainScore(0, 53, 40).score).toBe(0);
    expect(strainScore(69, 53, 40)).toMatchObject({ score: 130, basis: "plan", base: 53 });
    expect(strainScore(40, null, 40)).toMatchObject({ score: 100, basis: "ctl" });
  });
});

describe("zhodnocení dne", () => {
  const base = {
    hour: 8, status: "active" as const, statusUntil: null, strain: { score: 0, load: 0, base: 53, basis: "plan" as const },
    sleepS: 25440, sleepNeedMin: 510, nextNeedMin: 510, wakeTypical: "07:30", bbNow: 80, stressAvg: 20, stressNorm: 25, steps: 500,
    plan: { name: "3×10 min práh", kind: "quality", minutes: 75, done: false }, remLow: false, deepLow: false,
  };
  it("červený semafor: lehký pohyb místo tréninku a čas spánku z potřeby Garminu", () => {
    const c = coaching({ ...base, semafor: { state: "red", reasons: ["VST pod normou"], missing: false } });
    expect(c.title).toContain("Nezotavený");
    expect(c.text).toContain("VST pod normou");
    expect(c.needs.join(" ")).toContain("3×10 min práh");
    expect(c.needs.join(" ")).toContain("22:45"); // 7:30 − 8:30 h − 15 min
  });
  it("nemoc: trénink stojí", () => {
    const c = coaching({ ...base, status: "sick", statusUntil: "2026-11-12", semafor: { state: "yellow", reasons: [], missing: false } });
    expect(c.title).toContain("Nemoc");
    expect(c.title).toContain("12. 11.");
  });
  it("medián probuzení", () => {
    expect(typicalWake(["2026-11-01T07:10:00", "2026-11-02T07:40:00", "2026-11-03T06:50:00", null])).toBe("7:10");
  });
});

/** potvrzený plán = kalendář (jako po „Zapsat vybrané“) */
function maxStreak(dates: string[]): number {
  let best = 0, cur = 0, prev: string | null = null;
  for (const d of [...dates].sort()) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}


describe("servis vybavení", () => {
  const gear = [{ id: 1, name: "Cube", kind: "bike" as const, default_for: "ride", from_date: null, to_date: null, start_km: 0, note: null }];
  const acts = [
    { id: "a", date: "2026-10-01", start_local: "2026-10-01 10:00:00", sport: "ride", distance_m: 50_000, moving_s: 0, elev_gain: 0 },
    { id: "b", date: "2026-10-05", start_local: "2026-10-05 10:00:00", sport: "ride", distance_m: 40_000, moving_s: 0, elev_gain: 0 },
    { id: "c", date: "2026-10-06", start_local: "2026-10-06 10:00:00", sport: "ride", distance_m: 30_000, moving_s: 0, elev_gain: 0 },
  ];
  const part: Part = { id: 1, gear_id: 1, name: "Řetěz", action: "Vyměněno", interval_km: 60, repeat_km: 20, since: "2026-10-02 00:00:00", start_km: 0, notified_km: 0 };
  it("km od servisu, odebraná aktivita se nepočítá", () => {
    expect(partKm(part, acts, gear, new Map())).toBe(70);
    expect(partKm(part, acts, gear, new Map([["c", null]]))).toBe(40);
  });
  it("upozornění na interval a pak po opakování", () => {
    expect(nextAlert(part, 70)).toBe(60);
    expect(nextAlert({ ...part, notified_km: 60 }, 70)).toBeNull();
    expect(nextAlert({ ...part, notified_km: 60 }, 81)).toBe(80);
  });
});

describe("semafor + zotavení v %", async () => {
  const { evaluateRecovery } = await import("../src/core/recovery");
  const rows = Array.from({ length: 40 }, (_, i) => ({ date: addDays("2026-11-08", i - 39), hrv: 70 + (i % 3), rhr: 52 + (i % 2), sleep_s: 28000 + (i % 3) * 600, sleep_score: 75, sleep_q: null }));
  const base = { date: "2026-11-08", rows, dayAfter: null, illness: false };
  it("bez skóre zůstává zelená", () => expect(evaluateRecovery(base).state).toBe("green"));
  it("pod 34 % → žlutá s důvodem", () => {
    const r = evaluateRecovery({ ...base, score: { score: 25, drags: ["VST 55 ms"], boosts: [] } });
    expect(r.state).toBe("yellow");
    expect(r.reasons.join(" ")).toContain("25 %");
    expect(r.score).toBe(25);
  });
  it("pod 15 % → červená", () => expect(evaluateRecovery({ ...base, score: { score: 10, drags: [], boosts: [] } }).state).toBe("red"));
  it("vysoké skóre nemoc nepřebije", () => expect(evaluateRecovery({ ...base, illness: true, score: { score: 95, drags: [], boosts: [] } }).state).toBe("red"));
});
