// Trenér v3: celý plán na simulované historii.
import { describe, expect, it } from "vitest";
import { type Coach3Input, runCoach3 } from "../../src/core/coach3/engine";
import { computeMetrics } from "../../src/core/fitness";
import { DEFAULT_PROFILE } from "../../src/core/coach/profile";
import { NO_FATIGUE } from "../../src/core/coach/target";
import { addDays, dow, mondayOf } from "../../src/lib/time";

const T = "2026-11-12"; // čtvrtek
const HZ = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 55 };

/** 10 týdnů historie: út Z2 75 min, čt kvalita 60 min, so dlouhá 150 min (ne dnes). */
function input(o: Partial<Coach3Input> = {}, perWeek = 1): Coach3Input {
  const acts: Coach3Input["acts"] = [];
  for (let i = 1; i <= 70; i++) {
    const d = addDays(T, -i);
    const w = dow(d);
    const mk = (min: number, load: number, quality = false) => acts.push({ id: d, date: d, sport: "ride", load: load * perWeek, moving_s: min * 60, quality, hr_z: null, pwr_z: null, laps: null, compliance: null });
    if (w === 2) mk(75, 55);
    if (w === 4) mk(60, 65, true);
    if (w === 6) mk(150, 105);
  }
  const loads = new Map<string, number>();
  for (const a of acts) loads.set(a.date, (loads.get(a.date) ?? 0) + (a.load ?? 0));
  const m = computeMetrics(loads, addDays(T, -200), T, { ctl: 30, atl: 30 });
  const by = new Map(m.map((x) => [x.date, x]));
  const W0 = mondayOf(T);
  const weekLoads = [4, 3, 2, 1].map((k) => { const f = addDays(W0, -7 * k); return Math.round(acts.filter((a) => a.date >= f && a.date < addDays(f, 7)).reduce((t, a) => t + (a.load ?? 0), 0)); });
  return {
    today: T, goal: "udrzeni", raceDate: null, profile: { ...DEFAULT_PROFILE, sports: { ...DEFAULT_PROFILE.sports, run: { enabled: true, quality: false } } },
    zones: { ftp: 250, hr: HZ }, acts, power: [], metric: (d) => by.get(d) ?? null, calendar: [], constraints: [], weather: new Map(), weatherOk: false,
    recovery: "green", fatigue: NO_FATIGUE, weekLoads, offDays: [], progress: {}, ...o,
  };
}

describe("Trenér v3 – plán", () => {
  it("pokles snižuje, udržet drží, zlepšit zvedá kondici – proti dnešní hodnotě", () => {
    const p = runCoach3(input({ goal: "pokles" })).coach;
    const u = runCoach3(input({ goal: "udrzeni" })).coach;
    const z = runCoach3(input({ goal: "zvyseni" })).coach;
    expect(p.ctlTarget).toBeLessThan(p.ctlNow);
    expect(Math.abs(u.ctlTarget - u.ctlNow)).toBeLessThan(0.6);
    expect(z.ctlTarget).toBeGreaterThan(z.ctlNow);
    expect(p.ctlNow).toBe(u.ctlNow);
  });
  it("4 týdny: tento a příští s tréninky, další dva orientačně; navazují kondicí", () => {
    const h = runCoach3(input()).coach.horizon;
    expect(h).toHaveLength(4);
    expect(h.map((w) => w.detail)).toEqual([true, true, false, false]);
    expect(h[2]!.days.every((d) => d.name == null)).toBe(true);
    expect(h[2]!.days.some((d) => d.role !== "rest" && d.minutes > 0 && d.load > 0)).toBe(true);
    for (let i = 1; i < 4; i++) expect(h[i]!.ctlStart).toBeCloseTo(h[i - 1]!.ctlEnd, 0);
  });
  it("pravidla přes celý horizont: nejvýš 3 dny za sebou, kvalita ne po kvalitě ani po dlouhém", () => {
    for (const goal of ["pokles", "udrzeni", "zvyseni"] as const) {
      const days = runCoach3(input({ goal }, 1.4)).coach.horizon.flatMap((w) => w.days);
      let run = 0;
      days.forEach((d, i) => {
        run = d.role === "rest" ? 0 : run + 1;
        expect(run, `${goal} ${d.date}`).toBeLessThanOrEqual(3);
        if (d.role === "key" && i > 0) expect(["key", "long"], `${goal} ${d.date}`).not.toContain(days[i - 1]!.role);
      });
    }
  });
  it("kolo → běh: den drží zátěž, délka se přepočítá podle běhu, texty jsou běžecké", () => {
    const base = runCoach3(input());
    const z2 = base.days.find((d) => d.kind === "z2" && !d.isToday)!;
    expect(z2).toBeTruthy();
    const swapped = runCoach3(input({ constraints: [{ date: z2.date, kind: "sport", note: "run" }] }));
    const r = swapped.days.find((d) => d.date === z2.date)!;
    expect(r.sport).toBe("run");
    expect(r.durationMin!).toBeLessThan(z2.durationMin!);
    expect(Math.abs(r.load - z2.load) / z2.load).toBeLessThan(0.35);
    const txt = [r.name, ...r.steps].join(" ");
    expect(txt).not.toMatch(/Rozjetí|Vyjetí|jízda|dojezd/);
  });
  it("🔴 ráno: dnes nelze trénovat; 🟡: dnes bez kvality", () => {
    const red = runCoach3(input({ recovery: "red" }));
    const t = red.days.find((d) => d.isToday);
    expect(!t || t.kind === "blocked" || t.kind === "rest").toBe(true);
    const ye = runCoach3(input({ recovery: "yellow" }));
    expect(ye.days.find((d) => d.isToday)?.kind).not.toBe("quality");
  });
  it("výstup sedí pro dashboard: dny 7–8, cíl týdne, změny pro zápis, kontrola týdne", () => {
    const p = runCoach3(input());
    expect(p.days.length).toBeGreaterThanOrEqual(7);
    expect(p.weeklyTarget.mid).toBe(p.coach.load);
    expect(p.changes.every((c) => c.action === "nová")).toBe(true);
    expect(p.coach.validation.items.filter((i) => i.level === "error")).toEqual([]);
    for (const d of p.days.filter((x) => x.name)) expect(d.durationMin! > 0 && d.load > 0 && !!d.workout).toBe(true);
  });
});

import { horizonSummary } from "../../src/core/coach3/engine";
describe("souhrn za 4 týdny", () => {
  const wk = (ramp: number, planned: number, ctlEnd: number) => ({ planned, ctlEnd, target: { ramp, done: 0 } as any });
  it("udržet nejde hned: vyjmenuje jen omezení, která zasáhla, a kdy se kondice usadí", () => {
    const lim = (limit: string | null, load: number, need: number) => ({ planned: load, ctlEnd: 40, target: { ramp: 0, done: 0, limit, load, need } as any });
    const s = horizonSummary([lim("únava", 150, 170), lim("historie", 260, 288), lim(null, 284, 284), lim(null, 284, 284)], 41.8, 241);
    expect(s).toContain("kondice 41,8 → 40,0");
    expect(s).toContain("únava ubírá tento týden");
    expect(s).toContain("obvykle jezdíš kolem 241");
    expect(s).toContain("Od 4. týdne už zátěž cíli odpovídá");
    const only = horizonSummary([lim("únava", 150, 170), lim(null, 284, 284), lim(null, 284, 284), lim(null, 284, 284)], 41.8, 241);
    expect(only).not.toContain("obvykle jezdíš");
  });
  it("pokles a splněné udržení: krátce", () => {
    expect(horizonSummary([wk(-1, 150, 40), wk(-1, 150, 39), wk(-1, 150, 38), wk(-1, 150, 37)], 41, 200)).toMatch(/řízený pokles, asi 1,0 za týden/);
    expect(horizonSummary([wk(0, 290, 41.7), wk(0, 290, 41.7), wk(0, 290, 41.7), wk(0, 290, 41.7)], 41.8, 290)).toMatch(/drží se/);
  });
});
