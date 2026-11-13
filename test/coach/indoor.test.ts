// Trenažér / venku: tvoje volba u dne a jiná zátěž za hodinu (na trenažéru se šlape pořád, venku se z kopce nešlape).
import { describe, expect, it } from "vitest";
import { INDOOR_RATE, easyRate, fixedFromConstraints } from "../../src/core/coach/common";
import { type CoachInput, runCoach } from "../../src/core/coach/engine";
import { addDays } from "../../src/lib/time";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const sc = scenario("zima-pokles");
const MON = sc.start;
const act = (date: string, sport: "ride" | "indoor", perH: number, min = 60) => ({ id: `${date}${sport}`, date, sport, load: Math.round((perH * min) / 60), moving_s: min * 60, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: null }) as CoachInput["acts"][number];

describe("trenažér: zátěž za hodinu", () => {
  it("bez jízd na trenažéru: trenažér = venku × 1,3", () => {
    const acts = [1, 2, 3, 4].map((i) => act(addDays(MON, -i), "ride", 45));
    const out = easyRate(acts, MON, "ride", true, "outdoor"), inn = easyRate(acts, MON, "ride", true, "indoor");
    expect(out.rate).toBeCloseTo(45, 5);
    expect(inn.rate / out.rate).toBeCloseTo(INDOOR_RATE, 5);
  });
  it("tvoje jízdy na trenažéru i venku → tvůj poměr (v mezích 1,1–1,5)", () => {
    const acts = [...[1, 2, 3].map((i) => act(addDays(MON, -i), "ride", 40)), ...[4, 5, 6].map((i) => act(addDays(MON, -i), "indoor", 56))];
    expect(easyRate(acts, MON, "ride", true, "indoor").rate / easyRate(acts, MON, "ride", true, "outdoor").rate).toBeCloseTo(1.4, 5);
    const extreme = [...[1, 2, 3].map((i) => act(addDays(MON, -i), "ride", 35)), ...[4, 5, 6].map((i) => act(addDays(MON, -i), "indoor", 50))];
    expect(easyRate(extreme, MON, "ride", true, "indoor").rate / easyRate(extreme, MON, "ride", true, "outdoor").rate).toBeLessThanOrEqual(1.5 + 1e-9);
  });
  it("jen jízdy na trenažéru (zima): venku se dopočítá z nich", () => {
    const acts = [1, 2, 3].map((i) => act(addDays(MON, -i), "indoor", 52));
    expect(easyRate(acts, MON, "ride", true, "outdoor").rate).toBeCloseTo(52 / INDOOR_RATE, 5);
  });
  it("volba se čte z omezení dne", () => {
    const f = fixedFromConstraints([{ date: MON, kind: "trenazer", note: "1" }, { date: addDays(MON, 1), kind: "trenazer", note: "0" }]);
    expect(f.get(MON)?.indoor).toBe(true);
    expect(f.get(addDays(MON, 1))?.indoor).toBe(false);
  });
});

describe("trenažér v plánu (cíl Zima)", () => {
  const hist = simHistory(sc);
  const base = runCoach(simInput(sc, hist, MON));
  const z2 = base.coach.horizon[0]!.days.find((d) => d.role === "endurance" || d.role === "long")!;

  it("Z2 / dlouhý na trenažéru: kratší, zátěž zůstane podobná, den je označený jako trenažér", () => {
    const p = runCoach(simInput(sc, hist, MON, { constraints: [{ date: z2.date, kind: "trenazer", note: "1" }] }));
    const d = p.coach.horizon[0]!.days.find((x) => x.date === z2.date)!;
    expect(d.indoor).toBe(true);
    expect(p.days.find((x) => x.date === z2.date)?.indoorChoice).toBe(true);
    expect(d.minutes).toBeLessThan(z2.minutes);
    expect(Math.abs(d.load - z2.load)).toBeLessThanOrEqual(z2.load * 0.2);
    expect(d.why.join(" ")).toMatch(/trenažér/);
  });
  it("kvalita v zimě jde jinak na trenažér – volba „venku“ platí", () => {
    const key = base.coach.horizon[0]!.days.find((d) => d.role === "key")!;
    expect(key.indoor).toBe(true);
    const p = runCoach(simInput(sc, hist, MON, { constraints: [{ date: key.date, kind: "trenazer", note: "0" }] }));
    expect(p.coach.horizon[0]!.days.find((x) => x.date === key.date)!.indoor).toBe(false);
  });
  it("přepnutí během týdne (uložený pondělní plán): den se zkrátí, týden nepřeroste", () => {
    const mp = base.coach.mondayPlan!;
    const T = addDays(MON, 1);
    const acts: CoachInput["acts"] = [...hist];
    for (const d of mp.week.days) if (d.date < T && d.load > 0) acts.push({ id: d.date, date: d.date, sport: "ride", load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: null });
    const day = mp.week.days.find((d) => d.date >= T && (d.role === "endurance" || d.role === "long"))!;
    const before = runCoach({ ...simInput(sc, acts, T), mondayPlan: mp }).coach.horizon[0]!;
    const after = runCoach({ ...simInput(sc, acts, T, { constraints: [{ date: day.date, kind: "trenazer", note: "1" }] }), mondayPlan: mp }).coach.horizon[0]!;
    const b = before.days.find((x) => x.date === day.date)!, a = after.days.find((x) => x.date === day.date)!;
    expect(a.indoor).toBe(true);
    expect(a.minutes).toBeLessThan(b.minutes);
    expect(after.load).toBeLessThanOrEqual(before.load * 1.1 + 5);
  });
});
