// Dlouhá při špatném počasí, strop počtu tréninků, podmínka pro dvě kvality.
import { describe, expect, it } from "vitest";
import { INDOOR_LONG_MAX, runCoach } from "../../src/core/coach/engine";
import { TWO_KEYS_MIN_H, usualSessions } from "../../src/core/coach/budget";
import type { DayWeather } from "../../src/core/weather";
import { addDays } from "../../src/lib/time";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const day = (date: string, bad: boolean): DayWeather => ({ date, tmax: 15, tmin: 8, rainProb: bad ? 90 : 5, rainSum: bad ? 12 : 0, gustMax: 20, rain: bad, gusty: false, frost: false, bad, hours: [], window: bad ? null : { from: 8, to: 18 }, text: bad ? "déšť" : "jasno", code: null });
const sc = scenario("sezona-zlepsit");
const MON = "2027-04-12", SAT = addDays(MON, 5), SUN = addDays(MON, 6);
const acts = simHistory({ ...sc, start: MON });
const wx = (badDays: string[]) => { const m = new Map<string, DayWeather | null>(); for (let i = 0; i < 35; i++) { const d = addDays(MON, i); m.set(d, day(d, badDays.includes(d))); } return m; };
const plan = (badDays: string[]) => runCoach({ ...simInput({ ...sc, start: MON }, acts, MON), weather: wx(badDays), weatherOk: true });

describe("dlouhá jízda a počasí", () => {
  it("bez deště v sobotu, s deštěm v sobotu v neděli", () => {
    const dry = plan([]).coach.horizon[0]!.days.find((d) => d.role === "long")!;
    expect(dry.date).toBe(SAT);
    const wet = plan([SAT]).coach.horizon[0]!.days.find((d) => d.role === "long")!;
    expect(wet.date).toBe(SUN);
  });
  it("prší celý víkend: dlouhá zůstane o víkendu na trenažéru, nejvýš " + INDOOR_LONG_MAX + " min", () => {
    const p = plan([SAT, SUN]);
    const lg = p.coach.horizon[0]!.days.find((d) => d.role === "long")!;
    expect([SAT, SUN]).toContain(lg.date);
    const pd = p.days.find((d) => d.date === lg.date)!;
    expect(pd.indoor).toBe(true);
    expect(pd.durationMin!).toBeLessThanOrEqual(INDOOR_LONG_MAX + 5);
    expect(pd.note).toMatch(/Z2 na trenažéru nejvýš 2 h/i);
  });
  it("když se dlouhý na prvním suchém víkendovém dni nevejde na trenažér, zkusí druhý suchý den", () => {
    // Zátěž odpovídá 3h+ dlouhé jízdě; sobota prší, neděle je suchá.
    const heavy = { ...sc, histLoad: 650 };
    const history = simHistory({ ...heavy, start: MON });
    const base = simInput({ ...heavy, start: MON }, history, MON);
    const weather = wx([SAT]);
    const p = runCoach({ ...base, weather, weatherOk: true }).coach.horizon[0]!;
    const lg = p.days.find((d) => d.role === "long")!;
    expect(lg.date).toBe(SUN);
  });
});

describe("počet tréninků a kvalit", () => {
  it("strop počtu tréninků z obvyklého počtu (vážený průměr), ne z maxima", () => {
    // dřív: max(4 týdny) + 1 = 7 → jeden výjimečný týden zvedl strop; teď vážený průměr
    expect(usualSessions({ weekLoads: [300, 300, 300, 300], weekOff: [0, 0, 0, 0], weekSessions: [6, 3, 3, 3] })).toBe(Math.round((6 + 6 + 9 + 12) / 10));
    expect(usualSessions({ weekLoads: [300, 300, 300, 300], weekOff: [0, 0, 0, 0], weekSessions: [3, 3, 3, 6], skip: [false, false, false, true] })).toBe(3);
  });
  it("dvě kvality jen při objemu aspoň " + TWO_KEYS_MIN_H + " h: Návrat (~3–4 h) jednu, Rozvoj (~9 h) dvě", () => {
    const low = scenario("malo-zlepsit");
    const l = runCoach(simInput(low, simHistory(low), "2027-04-05")).coach.horizon;
    for (const w of l) expect(w.days.filter((d) => d.role === "key").length).toBeLessThanOrEqual(1);
    const h = plan([]).coach.horizon;
    expect(h.some((w) => w.days.filter((d) => d.role === "key").length === 2)).toBe(true);
  });
});
