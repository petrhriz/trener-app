// Trenér v3: cíl zátěže a výhled kondice od dnešní kondice.
import { describe, expect, it } from "vitest";
import { BLOCK_WEEKS, EMPTY_BLOCK, MIN_RECOVERY_LOAD, RECOVERY_SHARE, ctlAfter, loadToReach, pushWeek, usualLoad, weekHistory, weekTargets } from "../../src/core/coach/budget";
import { computeMetrics } from "../../src/core/fitness";
import { addDays } from "../../src/lib/time";

const hist = (weekLoads: number[]) => ({ weekLoads, weekSessions: weekLoads.map(() => 3), weekOff: weekLoads.map(() => 0) });

describe("rovnice kondice", () => {
  it("udržení = 7 × kondice za týden; výpočet souhlasí s denní řadou (jako intervals.icu)", () => {
    expect(loadToReach(40, 40, 7)).toBeCloseTo(280, 5);
    const L = loadToReach(40, 41.5, 5);
    const loads = new Map<string, number>();
    for (let i = 1; i <= 5; i++) loads.set(addDays("2026-11-12", i), L / 5);
    const s = computeMetrics(loads, "2026-11-12", "2026-11-17", { ctl: 40, atl: 40 });
    // první den řady je výchozí den (zátěž 0) → kondice v něm klesne; porovnávám od jeho konce
    const c0 = s[0]!.ctl;
    expect(ctlAfter(c0, loadToReach(c0, 41.5, 5), 5)).toBeCloseTo(41.5, 6);
  });
});

describe("cíl týdne od dnešní kondice (tvůj případ 12. 11.: v pondělí 44, dnes 40,8)", () => {
  const base = { raceDate: null, from: "2026-11-13", ctlNow: 40.8, doneLoad: 60, history: hist([330, 52, 150, 43]), fatigue: 1, weeks: 4 };
  it("s dostatečnou historií: pokles kondici snižuje, udržet drží, zlepšit zvedá – proti dnešní hodnotě", () => {
    const b = { ...base, history: hist([300, 300, 300, 300]) };
    const p = weekTargets({ ...b, goal: "pokles" })[0]!;
    const u = weekTargets({ ...b, goal: "udrzeni" })[0]!;
    const z = weekTargets({ ...b, goal: "zvyseni" })[0]!;
    expect(p.ctlStart).toBe(40.8);
    expect(p.ctlEnd).toBeLessThan(40.8);
    expect(u.ctlEnd).toBeCloseTo(40.8, 1);
    expect(z.ctlEnd).toBeGreaterThan(40.8);
    expect(p.load).toBeLessThan(u.load);
    expect(u.load).toBeLessThan(z.load);
  });
  it("tvoje skutečná historie (330 / 52 / 150 / 43): udržet nejde, výsledek to řekne; pokles nikdy neroste", () => {
    const p = weekTargets({ ...base, goal: "pokles" })[0]!;
    const u = weekTargets({ ...base, goal: "udrzeni" })[0]!;
    expect(p.ctlEnd).toBeLessThan(40.8);
    expect(u.ctlEnd).toBeLessThan(40.8);
    expect(u.limit).toBe("historie");
    expect(u.notes[0]).toContain("udržení kondice 40,8 by bylo potřeba");
    expect(u.notes[0]).toContain("→ kondice 40,0");
  });
  it("zbývající dny: růst se krátí poměrem dní (pá–ne = 3/7 týdne)", () => {
    const z = weekTargets({ ...base, goal: "zvyseni", history: hist([300, 300, 300, 300]) })[0]!;
    expect(z.days).toBe(3);
    // Základ: +3 za týden (TrainingPeaks: do kondice 45 nízké riziko do 3)
    expect(z.ctlGoal).toBeCloseTo(40.8 + (3 * 3) / 7, 1);
  });
  it("strop podle historie: když se cíl nevejde, poznámka říká potřebu, strop i výsledek", () => {
    const t = weekTargets({ ...base, goal: "udrzeni", history: hist([100, 100, 100, 100]), doneLoad: 0, from: "2026-11-16" })[0]!;
    expect(t.need).toBeGreaterThan(t.load);
    expect(t.limit).toBe("historie");
    expect(t.load).toBe(140);
    expect(t.notes[0]).toMatch(/potřeba \d+ zátěže.*140 → kondice/);
  });
  it("další týdny navazují: začínají kondicí, na kterou dojde předchozí", () => {
    const w = weekTargets({ ...base, goal: "udrzeni", history: hist([300, 300, 300, 300]) });
    expect(w).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(w[i]!.ctlStart).toBeCloseTo(w[i - 1]!.ctlEnd, 1);
    expect(w[1]!.from).toBe("2026-11-16");
    expect(w[1]!.days).toBe(7);
  });
  it("únava ubírá a říká to", () => {
    const t = weekTargets({ ...base, goal: "udrzeni", history: hist([300, 300, 300, 300]), fatigue: 0.8 })[0]!;
    expect(t.limit).toBe("únava");
    expect(t.notes.join(" ")).toMatch(/o 20 % lehčí/);
  });
});

describe("historie a lehčí týden", () => {
  it("ojedinělý propad (nemoc) se do obvyklé zátěže nepočítá, dva už ano", () => {
    expect(usualLoad({ weekLoads: [300, 300, 20, 300], weekOff: [0, 0, 0, 0] })).toBe(300);
    expect(usualLoad({ weekLoads: [300, 20, 20, 300], weekOff: [0, 0, 0, 0] })).toBeLessThan(300);
  });
  // Dřív: lehčí každý 4. kalendářní týden (cycleIndex). Teď pozice v bloku z historie – test kalendáře odpadl.
});

describe("pozice v bloku z historie (Oprava 1)", () => {
  const starts = (n: number, last = "2027-04-05") => Array.from({ length: n }, (_x, i) => addDays(last, -7 * (n - i)));
  const wh = (loads: number[], off = loads.map(() => 0), raceDate: string | null = null) => weekHistory({ starts: starts(loads.length), loads, off, raceDate });
  it("lehčí týden mezi zátěžovými se do obvyklé zátěže nepočítá → strop dalších týdnů navazuje na úroveň před ním", () => {
    const h = wh([300, 300, 300, 300, 400, 410, 420, 230]);
    expect(h.light).toEqual([false, false, false, false, false, false, false, true]);
    expect(h.skip.slice(-4)).toEqual([false, false, false, true]);
    const u = usualLoad({ weekLoads: [400, 410, 420, 230], weekOff: [0, 0, 0, 0], skip: h.skip.slice(-4) });
    expect(u).toBe(Math.round((400 * 1 + 410 * 2 + 420 * 3) / 6));
    expect(h.block.streak).toBe(0);
    expect(h.block.loads.slice(-3)).toEqual([400, 410, 420]);
  });
  it("dva lehké týdny za sebou mimo závod = změna návyku, do obvyklé zátěže se počítají", () => {
    const h = wh([300, 300, 300, 300, 150, 140, 150, 150]);
    expect(h.skip.slice(-4).some(Boolean)).toBe(false);
  });
  it("ladění a přechod po závodě se do obvyklé zátěže nepočítají ani dva týdny za sebou", () => {
    const h = wh([380, 390, 380, 390, 400, 280, 180, 150], undefined, "2027-03-28");
    expect(h.skip.slice(-3)).toEqual([true, true, true]);
  });
  it("týden nemoci / dovolené (≥ 3 dny mimo) je lehký a blok začíná znovu", () => {
    const h = wh([300, 300, 300, 300, 300, 300, 300, 300], [0, 0, 0, 0, 0, 0, 4, 0]);
    expect(h.light[6]).toBe(true);
    expect(h.block.streak).toBe(1);
  });
  const base = { goal: "zvyseni" as const, raceDate: null, from: "2027-04-05", ctlNow: 43, doneLoad: 0, fatigue: 1, weeks: 8 };
  it("lehčí týden až po 3 zátěžových, 55 % jejich průměru; mezi bloky zátěž roste", () => {
    const h = wh([300, 300, 300, 300, 300, 300, 300, 300]);
    const block = { ...h.block, streak: 0 };
    const w = weekTargets({ ...base, history: { ...hist([300, 300, 300, 300]), block } });
    expect(w.map((x) => x.recoveryWeek)).toEqual([false, false, false, true, false, false, false, true]);
    const avg = (w[0]!.load + w[1]!.load + w[2]!.load) / 3;
    expect(w[3]!.load).toBe(Math.round(avg * RECOVERY_SHARE));
    expect(w[3]!.notes[0]).toMatch(/Lehčí týden po 3 zátěžových: \d+ zátěže \(55 % jejich průměru/);
    // strop po lehčím týdnu z úrovně před ním: 5. týden ≥ 3. týden
    expect(w[4]!.load).toBeGreaterThanOrEqual(w[2]!.load);
    const blk1 = (w[0]!.load + w[1]!.load + w[2]!.load) / 3, blk2 = (w[4]!.load + w[5]!.load + w[6]!.load) / 3;
    expect(blk2).toBeGreaterThan(blk1);
  });
  it("s historií 3 zátěžových týdnů je lehčí hned tento týden; po 1 až za 2 týdny", () => {
    let b = EMPTY_BLOCK;
    for (const x of [300, 300, 300]) b = pushWeek(b, x);
    expect(b.streak).toBe(BLOCK_WEEKS);
    expect(weekTargets({ ...base, weeks: 1, history: { ...hist([300, 300, 300, 300]), block: b } })[0]!.recoveryWeek).toBe(true);
    const one = pushWeek(pushWeek(b, 160), 300);
    expect(weekTargets({ ...base, weeks: 3, history: { ...hist([300, 300, 160, 300]), block: one } }).map((x) => x.recoveryWeek)).toEqual([false, false, true]);
  });
  it("pod obvyklou zátěží " + MIN_RECOVERY_LOAD + " se lehčí týden nedělá", () => {
    let b = EMPTY_BLOCK;
    for (const x of [120, 120, 120, 120]) b = pushWeek(b, x);
    const w = weekTargets({ ...base, ctlNow: 17, weeks: 2, history: { ...hist([120, 120, 120, 120]), block: b } });
    expect(w.some((x) => x.recoveryWeek)).toBe(false);
  });
  it("lehčí týden ne těsně před laděním (ladění samo ubírá); po závodě týden přechodu, pak nový blok", () => {
    let b = EMPTY_BLOCK;
    for (const x of [300, 300, 300]) b = pushWeek(b, x);
    const w = weekTargets({ ...base, goal: "zavod", raceDate: "2027-04-25", ctlNow: 45, weeks: 5, history: { ...hist([300, 300, 300, 300]), block: b } });
    expect(w.map((x) => x.phase)).toEqual(["build", "taper", "taper", "post", "build"]);
    expect(w[0]!.recoveryWeek).toBe(false);
    expect(w[3]!.limit).toBe("po závodě");
    expect(w[3]!.load).toBe(Math.round(w[0]!.load * 0.55));
  });
  it("závodní týden: 45 % posledního běžného týdne před laděním, i když první týden ladění už je v historii", () => {
    let b = EMPTY_BLOCK;
    for (const x of [380, 390, 400, 280]) b = pushWeek(b, x, false);
    const w = weekTargets({ ...base, goal: "zavod", raceDate: "2027-04-11", ctlNow: 45, weeks: 1, history: { ...hist([380, 390, 400, 280]), block: b } })[0]!;
    expect(w.phase).toBe("taper");
    expect(w.base).toBe(400);
    expect(w.load).toBe(Math.round(400 * 0.45));
  });
});

describe("cíl od kondice na stránce (včera 41,8, dnes bez tréninku 40,8, čtvrtek)", () => {
  const b = { raceDate: null, from: "2026-11-12", ctlNow: 41.8, ctlRef: 40.8, doneLoad: 43, history: hist([300, 300, 300, 300]), fatigue: 1, weeks: 1 };
  it("pokles pod 40,8, udržet ~40,8, zlepšit nad 40,8 – změna se měří od čísla, které vidíš", () => {
    const p = weekTargets({ ...b, goal: "pokles" })[0]!;
    const u = weekTargets({ ...b, goal: "udrzeni" })[0]!;
    const z = weekTargets({ ...b, goal: "zvyseni" })[0]!;
    expect(p.ctlStart).toBe(40.8);
    expect(p.ctlEnd).toBeLessThan(40.8);
    expect(u.ctlEnd).toBeCloseTo(40.8, 1);
    expect(z.ctlEnd).toBeGreaterThan(40.8 + 0.4);
  });
});

import { WINTER_DROP, rampOf } from "../../src/core/coach/budget";
describe("zima: k zimnímu základu (vrchol − 42,5 %)", () => {
  it("vysoko nad základem klesá rychle (nejvýš 5 za týden), blízko pomalu, na základu drží", () => {
    const peak = 58.9, floor = peak * (1 - WINTER_DROP);
    expect(floor).toBeCloseTo(33.9, 1);
    expect(rampOf("offseason", 58.9, peak)).toBeCloseTo(-0.15 * (58.9 - floor), 5);
    expect(rampOf("offseason", 80, 80)).toBe(-5); // strop 5 za týden
    expect(rampOf("offseason", 40.8, peak)).toBeCloseTo(-0.15 * (40.8 - floor), 5);
    expect(rampOf("offseason", 33, peak)).toBe(0);
  });
  it("Základ +3, nad kondicí 45 +4; udržet 0", () => {
    expect(rampOf("base", 40, null)).toBe(3);
    expect(rampOf("build", 50, null)).toBe(4);
    expect(rampOf("maintain", 50, null)).toBe(0);
  });
});

describe("ladění před závodem (Bosquet 2007: −41 až −60 % objemu, intenzita a frekvence beze změny)", () => {
  it("týden před závodním 70 %, závodní týden 45 % běžného týdne", () => {
    const w = weekTargets({ goal: "zavod", raceDate: "2027-05-23", from: "2027-05-03", ctlNow: 47, doneLoad: 0, history: hist([380, 390, 380, 390]), fatigue: 1, weeks: 3 });
    const normal = w[0]!.done + w[0]!.load;
    expect(w[1]!.phase).toBe("taper");
    expect(w[1]!.load).toBe(Math.round(normal * 0.7));
    expect(w[2]!.load).toBe(Math.round(normal * 0.45));
  });
});

import { FORM_FLOOR, NO_FATIGUE, fatigueFactor, formFloor } from "../../src/core/coach/target";
describe("forma podle pásem intervals.icu (−10 až −30 optimální)", () => {
  it("forma −25 sama neubírá; pod −30 týden o 20 % lehčí a kvalita nejvýš 1×", () => {
    expect(fatigueFactor({ ...NO_FATIGUE, form: -25 })).toMatchObject({ factor: 1, keysMax: 2 });
    expect(fatigueFactor({ ...NO_FATIGUE, form: -32 })).toMatchObject({ factor: 0.8, keysMax: 1 });
    expect(FORM_FLOOR).toBe(-30);
    expect(formFloor("base")).toBe(-30);
    expect(formFloor("taper")).toBeNull();
  });
});

import { phaseFor } from "../../src/core/coach/target";
describe("fáze před závodem (Friel: Rozvoj 6–8 týdnů)", () => {
  it("Rozvoj 8 týdnů před laděním, dřív Základ", () => {
    const race = "2027-06-27"; // neděle
    const ph = (weeksBefore: number) => phaseFor("zavod", addDays("2027-06-21", -7 * weeksBefore), race);
    expect([0, 1, 2].map(ph)).toEqual(["taper", "taper", "build"]);
    expect(ph(9)).toBe("build");
    expect(ph(10)).toBe("base");
  });
});
