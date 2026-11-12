// Pondělní plán týdne se uloží jednou a rozběhnutý týden se z něj dopočítává. Únava a nová omezení
// mění jen dnešek a budoucí dny – ne odjeté dny a ne dvakrát.
import { describe, expect, it } from "vitest";
import { type CoachInput, runCoach } from "../../src/core/coach/engine";
import { NO_FATIGUE } from "../../src/core/coach/target";
import { addDays } from "../../src/lib/time";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const sc = scenario("zima-udrzet");
const MON = sc.start, THU = addDays(MON, 3), SAT = addDays(MON, 5);

/** Pondělní plán a aktivity po–st přesně podle něj. */
function setup() {
  const hist = simHistory(sc);
  const mon = runCoach(simInput(sc, hist, MON));
  const mp = mon.coach.mondayPlan!;
  const acts: CoachInput["acts"] = [...hist];
  for (const d of mp.week.days) if (d.date < THU && d.load > 0) acts.push({ id: d.date, date: d.date, sport: "ride", load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: null });
  const planRest = mp.week.days.filter((d) => d.date >= THU).reduce((t, d) => t + d.load, 0);
  return { mp, acts, planRest };
}

describe("uložený pondělní plán", () => {
  it("v pondělí ráno je pondělním plánem samotný plán (smí se do prvního tréninku přepsat)", () => {
    const { mp } = setup();
    expect(mp.weekStart).toBe(MON);
    expect(mp.monday).toBe(true);
    expect(mp.fatigue).toBe(1);
    expect(mp.week.days[0]!.date).toBe(MON);
  });
  it("bez únavy a změn: zbytek týdne přesně podle pondělního plánu (dny, druh, délky)", () => {
    const { mp, acts } = setup();
    const thu = runCoach({ ...simInput(sc, acts, THU), mondayPlan: mp }).coach;
    expect(thu.mondayPlan).toEqual(mp);
    for (const d of thu.horizon[0]!.days) {
      const m = mp.week.days.find((x) => x.date === d.date)!;
      expect([d.date, d.role, d.minutes]).toEqual([m.date, m.role, m.minutes]);
    }
  });
  it("vyšší skutečná zátěž kvality zkrátí budoucí Z2 úměrně přebytku", () => {
    const { mp, acts } = setup();
    const key = mp.week.days.find((d) => d.role === "key")!;
    const future = mp.week.days.find((d) => d.role === "endurance" && d.date > key.date)!;
    expect(key).toBeTruthy();
    expect(future).toBeTruthy();
    const throughKey = acts.filter((a) => a.date <= key.date);
    const over = throughKey.map((a) => a.date === key.date ? { ...a, load: Math.round((a.load ?? 0) * 1.25) } : a);
    const base = runCoach({ ...simInput(sc, throughKey, key.date), mondayPlan: mp }).coach.horizon[0]!;
    const actual = runCoach({ ...simInput(sc, over, key.date), mondayPlan: mp }).coach.horizon[0]!;
    const shortened = actual.days.find((d) => d.date === future.date);
    const original = base.days.find((d) => d.date === future.date);
    expect(shortened, JSON.stringify({ future: future.date, days: actual.days.map((d) => d.date) })).toBeTruthy();
    expect(shortened!.minutes).toBeLessThan(original!.minutes);
    expect(actual.notes.join(" ")).toMatch(/Od pondělí odjeto .* víc, než bylo v plánu/);
  });
  it("únava od čtvrtka ubere ze zbylých dní jen svůj násobek, ne víc (a ne z odjetých)", () => {
    const { mp, acts, planRest } = setup();
    const fatigue = { ...NO_FATIGUE, badMornings: 3 }; // × 0,8
    const thu = runCoach({ ...simInput(sc, acts, THU), mondayPlan: mp, fatigue }).coach;
    const h = thu.horizon[0]!;
    expect(h.target).toBe(Math.round(planRest * 0.8));
    expect(h.load).toBeGreaterThanOrEqual(Math.round(planRest * 0.8 * 0.93));
    expect(h.notes.join(" ")).toContain("Únava: zbytek týdne o 20 % lehčí");
    expect(h.notes.join(" ")).not.toMatch(/nestihlo|nedohání; zbytek/);
  });
  it("únava, se kterou se pondělní plán už počítal, se nepočítá znovu", () => {
    const { mp, acts, planRest } = setup();
    const tired = { ...mp, fatigue: 0.8 };
    const thu = runCoach({ ...simInput(sc, acts, THU), mondayPlan: tired, fatigue: { ...NO_FATIGUE, badMornings: 3 } }).coach;
    expect(thu.horizon[0]!.target).toBe(planRest);
  });
  it("zablokování soboty ve čtvrtek: sobota volno, ostatní dny beze změny, žádné „nestihlo se“", () => {
    const { mp, acts, planRest } = setup();
    const satLoad = mp.week.days.find((d) => d.date === SAT)!.load;
    expect(satLoad).toBeGreaterThan(0);
    const thu = runCoach({ ...simInput(sc, acts, THU, { constraints: [{ date: SAT, kind: "nepojedu", note: null }] }), mondayPlan: mp }).coach;
    const h = thu.horizon[0]!;
    expect(h.days.find((d) => d.date === SAT)!.role).toBe("rest");
    expect(h.notes.join(" ")).not.toMatch(/nestihlo/);
    expect(h.notes.join(" ")).toMatch(/odpadá \(−\d+ zátěže\), nedohání se/);
    expect(h.target).toBe(planRest - satLoad);
    for (const d of h.days.filter((x) => x.date !== SAT)) expect(d.minutes).toBe(mp.week.days.find((x) => x.date === d.date)!.minutes);
  });
  it("uložený plán jiného týdne nebo cíle se nepoužije", () => {
    const { mp, acts } = setup();
    const thu = runCoach({ ...simInput(sc, acts, THU), mondayPlan: { ...mp, goal: "zvyseni" } }).coach;
    expect(thu.mondayPlan!.goal).toBe("udrzeni");
    expect(thu.mondayPlan!.monday).toBe(false);
  });
});
