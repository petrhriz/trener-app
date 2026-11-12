import { describe, expect, it } from "vitest";
import { weekAdherence } from "../../src/core/coach/adherence";
import { reentryOf } from "../../src/core/coach/reentry";
import { NO_FATIGUE, fatigueFactor } from "../../src/core/coach/target";
import { diffDays, reasonOf, type Drivers } from "../../src/core/coach/versions";
import { fosterOf, fosterWeek } from "../../src/core/foster";
import { addDays } from "../../src/lib/time";

const WS = "2026-11-02"; // pondělí
const plan = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: addDays(WS, i), training: [1, 3, 5, 6].includes(i), load: 70 }));
const act = (i: number, min = 60, load = 70) => ({ date: addDays(WS, i), load, moving_s: min * 60 });

describe("nedělní vyhodnocení plnění", () => {
  it("vše odjeto (i jiný den) → beze změny", () => {
    const a = weekAdherence(WS, plan, [act(0), act(2), act(5), act(6)], new Set());
    expect(a).toMatchObject({ planned: 4, trained: 4, missed: 0, pct: 100, factor: 1, note: null });
  });
  it("2 vynechané → tento týden ×0,85", () => {
    const a = weekAdherence(WS, plan, [act(1), act(3)], new Set());
    expect(a.missed).toBe(2);
    expect(a.factor).toBe(0.85);
    expect(a.note).toMatch(/odjeto 2 z 4 tréninků/);
  });
  it("odjeto jen 50 % zátěže (krátké tréninky) → ×0,85", () => {
    const a = weekAdherence(WS, plan, [act(1, 30, 30), act(3, 30, 30), act(5, 30, 30), act(6, 30, 30)], new Set());
    expect(a.missed).toBe(0);
    expect(a.factor).toBe(0.85);
  });
  it("dny nemoci / volna od trenéra se nepočítají; týden bez plánu se nehodnotí", () => {
    const a = weekAdherence(WS, plan, [act(5), act(6)], new Set([addDays(WS, 1), addDays(WS, 3)]));
    expect(a).toMatchObject({ planned: 2, trained: 2, factor: 1 });
    const none = weekAdherence(WS, plan.map((d) => ({ ...d, training: false })), [], new Set());
    expect(none).toMatchObject({ planned: 0, pct: null, factor: 1 });
  });
  it("ubírá přes faktor únavy", () => {
    expect(fatigueFactor({ ...NO_FATIGUE, adherence: { factor: 0.85, note: "x" } }).factor).toBe(0.85);
    expect(fatigueFactor({ ...NO_FATIGUE, adherence: { factor: 1, note: null } }).factor).toBe(1);
  });
});

describe("návrat po pauze", () => {
  const acts = (days: number[]) => days.map((i) => ({ date: addDays("2026-11-12", -i), moving_s: 3600 }));
  it("bez pauzy nic neomezuje", () => {
    const r = reentryOf(acts([1, 3, 5, 7, 9, 11, 13, 15]), "2026-11-12");
    expect(r.resume).toBeNull();
    expect(r.ceilingOn("2026-11-12")).toBe("full");
  });
  it("pauza 10 dní, návrat před 3 dny: zbytek týdne jen Z1–Z2, pak tempo (středně pokročilý 2 týdny)", () => {
    const r = reentryOf(acts([3, 14, 16, 18]), "2026-11-12", "intermediate");
    expect(r.resume).toBe("2026-11-09");
    expect(r.gapDays).toBe(10);
    expect(r.ceilingOn("2026-11-12")).toBe("base");
    expect(r.ceilingOn("2026-11-16")).toBe("tempo");
    expect(r.ceilingOn("2026-11-23")).toBe("full");
  });
  it("úroveň mění náběh; pauza 3+ týdny přidá týden", () => {
    const a = reentryOf(acts([2, 12, 14]), "2026-11-12", "advanced");
    expect(a.rampWeeks).toBe(1);
    const b = reentryOf(acts([2, 12, 14]), "2026-11-12", "beginner");
    expect(b.rampWeeks).toBe(3);
    const c = reentryOf(acts([2, 30, 32]), "2026-11-12", "advanced");
    expect(c.rampWeeks).toBe(2);
  });
  it("pauza ještě trvá → návrat je dnes", () => {
    const r = reentryOf(acts([9, 11]), "2026-11-12");
    expect(r.resume).toBe("2026-11-12");
  });
});

describe("Foster: monotónnost a strain", () => {
  it("každý den stejně → vysoká monotónnost; střídání s volnem → nízká", () => {
    const same = new Map([0, 1, 2, 3, 4, 5, 6].map((i) => [addDays("2026-11-02", i), 60]));
    expect(fosterWeek(same, "2026-11-08").monotony).toBe(10);
    const mixed = new Map([[addDays("2026-11-02", 1), 80], [addDays("2026-11-02", 3), 60], [addDays("2026-11-02", 5), 150]]);
    expect(fosterWeek(mixed, "2026-11-08").monotony!).toBeLessThan(1);
    expect(fosterWeek(new Map(), "2026-11-08").monotony).toBeNull();
  });
  it("strain nad obvyklým jen při skutečné zátěži", () => {
    const acts: { date: string; load: number }[] = [];
    // 8 týdnů obvyklého: 3 tréninky týdně
    for (let w = 1; w <= 8; w++) for (const i of [1, 3, 5]) acts.push({ date: addDays("2026-11-12", -7 * w - i), load: 70 });
    // poslední týden: každý den 70
    for (let i = 1; i <= 7; i++) acts.push({ date: addDays("2026-11-12", -i), load: 70 });
    const f = fosterOf(acts, "2026-11-12");
    expect(f.strainHigh).toBe(true);
    expect(f.note).toMatch(/strain/);
    expect(fatigueFactor({ ...NO_FATIGUE, strain: f.note }).factor).toBe(0.9);
  });
});

describe("verze plánu", () => {
  const d = (date: string, role: string, minutes: number, name: string | null = null) => ({ date, role, sport: "ride", minutes, load: minutes, name });
  it("změněné dny od dneška, lidsky", () => {
    const prev = [d("2026-11-11", "key", 60, "2×8 min sweet spot"), d("2026-11-12", "key", 60, "2×8 min sweet spot"), d("2026-11-13", "endurance", 75)];
    const cur = [d("2026-11-11", "rest", 0), d("2026-11-12", "endurance", 45), d("2026-11-13", "endurance", 80)];
    expect(diffDays(prev, cur, "2026-11-12")).toEqual(["čt 12. 11.: 2×8 min sweet spot 1:00 → Z2 45 min"]);
  });
  it("důvod podle toho, co se změnilo na vstupu", () => {
    const base: Drivers = { week: "2026-11-09", goal: "udrzeni", recovery: "green", fatigue: 1, notes: [], reentry: null, mine: "", weatherBad: [], trained: [], profile: "" };
    expect(reasonOf(null, base)).toEqual(["první uložený plán"]);
    expect(reasonOf(base, { ...base, recovery: "yellow" })).toEqual(["ranní stav 🟡"]);
    expect(reasonOf(base, { ...base, mine: "x" })).toEqual(["tvoje úprava plánu (den, sport, délka, volno)"]);
    expect(reasonOf(base, { ...base, week: "2026-11-16" })).toContain("nový týden");
    expect(reasonOf(base, { ...base, fatigue: 0.85, notes: ["minulý týden odjeto 2 z 4 tréninků"] })).toEqual(["minulý týden odjeto 2 z 4 tréninků"]);
    expect(reasonOf(base, base)).toEqual(["přepočet podle nových dat (kondice, zátěž)"]);
  });
});
