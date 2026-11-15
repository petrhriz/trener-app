// Přesun tréninku kvůli počasí v rozběhnutém týdnu (src/core/coach/weatherMove.ts).
import { describe, expect, it } from "vitest";
import { type CoachInput, runCoach } from "../../src/core/coach/engine";
import { type MoveDay, weatherMoves } from "../../src/core/coach/weatherMove";
import type { DayWeather } from "../../src/core/weather";
import { addDays } from "../../src/lib/time";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const day = (date: string, role: MoveDay["role"], o: Partial<MoveDay> = {}): MoveDay => ({ date, role, sport: "ride", locked: false, bad: false, good: true, ...o });
const noTail = (first: string) => [1, 2, 3].map((i) => ({ date: addDays(first, -i), trained: false, hard: false }));

describe("přesun kvůli počasí – pravidla", () => {
  const FRI = "2026-11-20", SAT = "2026-11-21", SUN = "2026-11-22";
  it("sobota celý den déšť, neděle volná a hezky → přesun na neděli", () => {
    expect(weatherMoves([day(FRI, "rest"), day(SAT, "long", { bad: true, good: false }), day(SUN, "rest")], noTail(FRI))).toEqual([{ from: SAT, to: SUN }]);
  });
  it("bez dobrého dne, tvoje volba nebo běh: bez přesunu", () => {
    expect(weatherMoves([day(SAT, "long", { bad: true, good: false }), day(SUN, "rest", { good: false })], noTail(SAT))).toEqual([]);
    expect(weatherMoves([day(SAT, "long", { bad: true, good: false, locked: true }), day(SUN, "rest")], noTail(SAT))).toEqual([]);
    expect(weatherMoves([day(SAT, "endurance", { bad: true, good: false, sport: "run" }), day(SUN, "rest")], noTail(SAT))).toEqual([]);
  });
  it("přesun nesmí udělat 4 dny za sebou ani kvalitu po dlouhém", () => {
    const tail = [1, 2, 3].map((i) => ({ date: addDays(SAT, -i), trained: true, hard: false }));
    // st–pá trénink, sobota déšť: v sobotě by to byl 4. den za sebou, v neděli po volné sobotě je to v pořádku
    expect(weatherMoves([day(SAT, "endurance", { bad: true, good: false }), day(SUN, "rest")], tail)).toEqual([{ from: SAT, to: SUN }]);
    // dlouhý z neděle na pátek by dal kvalitu v sobotu den po dlouhém – nesmí
    expect(weatherMoves([day(FRI, "rest"), day(SAT, "key"), day(SUN, "long", { bad: true, good: false })], noTail(FRI))).toEqual([]);
  });
});

describe("přesun kvůli počasí v trenérovi", () => {
  const sc = scenario("zima-udrzet");
  const MON = sc.start, THU = addDays(MON, 3);
  const wx = (date: string, bad: boolean): DayWeather => ({ date, tmax: 10, tmin: 4, rainProb: bad ? 90 : 5, rainSum: bad ? 12 : 0, gustMax: 20, rain: bad, gusty: false, frost: false, bad, hours: [], window: bad ? null : { from: 10, to: 14 }, text: bad ? "déšť celý den" : "sucho", code: bad ? 63 : 1 });
  it("jízda v rozběhnutém týdnu se přesune z deštivého dne na volný hezký den", () => {
    const hist = simHistory(sc);
    const mp = runCoach(simInput(sc, hist, MON)).coach.mondayPlan!;
    const acts: CoachInput["acts"] = [...hist];
    for (const d of mp.week.days) if (d.date < THU && d.load > 0) acts.push({ id: d.date, date: d.date, sport: "ride", load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: null });
    // víkendová jízda z pondělního plánu a volný den po ní
    const src = mp.week.days.find((d) => d.date > THU && d.role !== "rest" && d.role !== "key" && mp.week.days.some((x) => x.date > THU && x.role === "rest" && x.date !== d.date))!;
    expect(src).toBeTruthy();
    const weather = new Map(mp.week.days.filter((d) => d.date >= THU).map((d) => [d.date, wx(d.date, d.date === src.date)] as const));
    const h = runCoach({ ...simInput(sc, acts, THU), mondayPlan: mp, weather, weatherOk: true }).coach.horizon[0]!;
    expect(h.days.find((d) => d.date === src.date)!.role).toBe("rest");
    const moved = h.days.find((d) => d.role === src.role && d.why.some((w) => w.startsWith("přesunuto z")));
    expect(moved).toBeTruthy();
    // zátěž se přesune s tréninkem, týden se nezkrátí
    expect(Math.abs(h.days.reduce((t, d) => t + d.load, 0) - mp.week.days.filter((d) => d.date >= THU).reduce((t, d) => t + d.load, 0))).toBeLessThan(25);
  });
});
