// Trenér v3: celý plán na simulované historii.
import { describe, expect, it } from "vitest";
import { type CoachInput, runCoach } from "../../src/core/coach/engine";
import { computeMetrics } from "../../src/core/fitness";
import { DEFAULT_PROFILE } from "../../src/core/coach/profile";
import { NO_FATIGUE } from "../../src/core/coach/target";
import { addDays, dow, mondayOf } from "../../src/lib/time";

const T = "2026-11-12"; // čtvrtek
const HZ = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 55 };

/** 10 týdnů historie: út Z2 75 min, čt kvalita 60 min, so dlouhá 150 min (ne dnes). */
function input(o: Partial<CoachInput> = {}, perWeek = 1): CoachInput {
  const acts: CoachInput["acts"] = [];
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
    // v pondělí (rozběhnutý týden bez dohánění porovnává test níž)
    const mon = (goal: "pokles" | "udrzeni" | "zvyseni") => { const x = input({ goal }); return runCoach({ ...x, today: "2026-11-09", acts: x.acts.filter((y) => y.date < "2026-11-09") }).coach; };
    const p = mon("pokles"), u = mon("udrzeni"), z = mon("zvyseni");
    // cíl týdne se měří od kondice na začátku týdne (neděle večer)
    expect(p.ctlTarget).toBeLessThan(p.ctlWeekStart);
    expect(Math.abs(u.ctlTarget - u.ctlWeekStart)).toBeLessThan(0.6);
    // Zlepšit: historie je 10 stejných týdnů bez lehkého → tento týden je lehčí (po 3 zátěžových, z historie);
    // růst se proto měří v dalším týdnu, ne v tomto (dřív lehčí týden podle kalendáře tento týden nepadl)
    expect(z.recoveryWeek).toBe(true);
    expect(z.horizon[1]!.ctlEnd).toBeGreaterThan(z.horizon[1]!.ctlStart);
    expect(z.horizon[1]!.ctlEnd).toBeGreaterThan(u.horizon[1]!.ctlEnd);
    expect(p.ctlWeekStart).toBe(u.ctlWeekStart);
  });
  it("4 týdny: tento a příští s tréninky, další dva orientačně; navazují kondicí", () => {
    const h = runCoach(input()).coach.horizon;
    expect(h).toHaveLength(4);
    expect(h.map((w) => w.detail)).toEqual([true, true, false, false]);
    expect(h[2]!.days.some((d) => d.role !== "rest" && d.minutes > 0 && d.load > 0)).toBe(true);
    // orientační týdny: náhled tréninku (název, kroky, graf) u každého tréninkového dne, volno bez náhledu
    for (const d of h[2]!.days) {
      if (d.role === "rest" || d.blocked) expect(d.workout).toBeNull();
      else expect(d.name && d.workout).toBeTruthy();
    }
    for (let i = 1; i < 4; i++) expect(h[i]!.ctlStart).toBeCloseTo(h[i - 1]!.ctlEnd, 0);
  });
  it("pravidla přes celý horizont: nejvýš 3 dny za sebou, kvalita ne po kvalitě ani po dlouhém", () => {
    for (const goal of ["pokles", "udrzeni", "zvyseni"] as const) {
      const days = runCoach(input({ goal }, 1.4)).coach.horizon.flatMap((w) => w.days);
      let run = 0;
      days.forEach((d, i) => {
        run = d.role === "rest" ? 0 : run + 1;
        expect(run, `${goal} ${d.date}`).toBeLessThanOrEqual(3);
        if (d.role === "key" && i > 0) expect(["key", "long"], `${goal} ${d.date}`).not.toContain(days[i - 1]!.role);
      });
    }
  });
  it("kolo → běh: den drží zátěž, délka se přepočítá podle běhu, texty jsou běžecké", () => {
    // profil bez běhu: se zapnutým během by trenér sám dal jeden Z2 den týdně jako běh – tady jde o tvou volbu
    const base = runCoach(input({ profile: DEFAULT_PROFILE }));
    const z2 = base.days.find((d) => d.kind === "z2" && !d.isToday)!;
    expect(z2).toBeTruthy();
    const swapped = runCoach(input({ profile: DEFAULT_PROFILE, constraints: [{ date: z2.date, kind: "sport", note: "run" }] }));
    const r = swapped.days.find((d) => d.date === z2.date)!;
    expect(r.sport).toBe("run");
    expect(r.durationMin!).toBeLessThan(z2.durationMin!);
    expect(Math.abs(r.load - z2.load) / z2.load).toBeLessThan(0.35);
    const txt = [r.name, ...r.steps].join(" ");
    expect(txt).not.toMatch(/Rozjetí|Vyjetí|jízda|dojezd/);
  });
  it("🔴 ráno: dnes nelze trénovat; 🟡: dnes o stupeň lehčí a o čtvrtinu kratší", () => {
    const red = runCoach(input({ recovery: "red" }));
    const t = red.days.find((d) => d.isToday);
    expect(!t || t.kind === "blocked" || t.kind === "rest").toBe(true);
    const g = runCoach(input()).days.find((d) => d.isToday)!;
    const y = runCoach(input({ recovery: "yellow" })).days.find((d) => d.isToday)!;
    expect(g.kind).toBe("quality");
    // kvalita o stupeň dolů (jiný druh kvality, nebo Z2), délka ~×0,75
    expect(y.kind === "z2" || y.qualityType !== g.qualityType || y.name !== g.name).toBe(true);
    expect(y.durationMin!).toBeLessThanOrEqual(Math.round(g.durationMin! * 0.75) + 10);
    expect(y.note).toMatch(/🟡 ráno: (o stupeň lehčí|místo)/);
  });
  it("🟡 stupně dolů: VO2 → práh → sweet spot → tempo → Z2", async () => {
    const { STEP_DOWN } = await import("../../src/core/coach/engine");
    expect(STEP_DOWN.vo2).toBe("thr");
    expect(STEP_DOWN.thr).toBe("ss");
    expect(STEP_DOWN.ss).toBe("tempo");
    expect(STEP_DOWN.tempo).toBeNull();
  });
  it("návrat po pauze: první týden bez kvality, pak nejvýš tempo a sweet spot", async () => {
    const { reentryOf } = await import("../../src/core/coach/reentry");
    // 14 dní bez tréninku, dnes se začíná znovu
    const x = input({ goal: "zvyseni" });
    const acts = x.acts.filter((a) => a.date < addDays(T, -14));
    const re = reentryOf(acts, T, "intermediate");
    expect(re.resume).toBe(T);
    expect(re.ceilingOn(T)).toBe("base");
    expect(re.ceilingOn(addDays(T, 7))).toBe("tempo");
    expect(re.ceilingOn(addDays(T, 14))).toBe("full");
    const p = runCoach({ ...x, acts, reentry: re });
    const days = p.coach.horizon.flatMap((w) => w.days);
    // první týden po návratu žádná kvalita
    expect(days.filter((d) => d.date < addDays(T, 7) && d.role === "key")).toEqual([]);
    // druhý týden kvalita jen tempo / sweet spot
    for (const d of days.filter((y) => y.date >= addDays(T, 7) && y.date < addDays(T, 14) && y.role === "key")) expect(d.name ?? "").toMatch(/tempo|sweet spot/i);
    expect(p.coach.reentry).toMatch(/návrat po \d+ dnech pauzy/);
  });
  it("podrobný plán končí nedělí příštího týdne (celá zátěž příštího týdne)", () => {
    const p = runCoach(input());
    const sunNext = addDays(mondayOf(T), 13);
    expect(p.to).toBe(sunNext);
    expect(p.days[p.days.length - 1]!.date).toBe(sunNext);
    // součet plánu příštího týdne = zátěž týdne z výhledu trenéra
    const next = p.days.filter((d) => d.date >= addDays(mondayOf(T), 7));
    expect(next).toHaveLength(7);
    expect(next.reduce((t, d) => t + d.load, 0)).toBe(Math.round(p.coach.horizon[1]!.load));
  });
  it("výstup sedí pro dashboard: dny do konce příštího týdne, cíl týdne, změny pro zápis, kontrola týdne", () => {
    const p = runCoach(input());
    expect(p.days.length).toBeGreaterThanOrEqual(7);
    expect(p.weeklyTarget.mid).toBe(p.coach.load);
    expect(p.changes.every((c) => c.action === "nová")).toBe(true);
    expect(p.coach.validation.items.filter((i) => i.level === "error")).toEqual([]);
    for (const d of p.days.filter((x) => x.name)) expect(d.durationMin! > 0 && d.load > 0 && !!d.workout).toBe(true);
  });
});

import { horizonSummary } from "../../src/core/coach/engine";
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
    const zw = (c: number) => ({ planned: 150, ctlEnd: c, target: { ramp: -1, done: 0, phase: "offseason", floor: 33.9 } as any });
    expect(horizonSummary([zw(40), zw(39), zw(38), zw(37)], 41, 200)).toMatch(/zimnímu základu 33,9/);
    expect(horizonSummary([wk(0, 290, 41.7), wk(0, 290, 41.7), wk(0, 290, 41.7), wk(0, 290, 41.7)], 41.8, 290)).toMatch(/drží se/);
  });
});

describe("kvalita a tvůj sport dne", () => {
  it("tvoje volba běžky + kvalita platí (žádná další kvalita v týdnu navíc)", () => {
    const w1 = runCoach(input()).coach.horizon[1]!;
    const d = w1.days.find((x) => x.role === "endurance")!.date;
    const out = runCoach(input({ constraints: [{ date: d, kind: "sport", note: "xc_ski" }, { date: d, kind: "typ", note: "quality" }] }));
    const day = out.days.find((x) => x.date === d) ?? null;
    const h = out.coach.horizon[1]!.days.find((x) => x.date === d)!;
    expect(h.role).toBe("key");
    expect(h.sport).toBe("xc_ski");
    if (day) expect(day.name).toMatch(/Běžky/);
    // stejná zátěž jako kvalita na kole, ne dvouhodinovka
    expect(h.minutes).toBeLessThanOrEqual(75);
    const rideKey = w1.days.find((x) => x.role === "key")!;
    // kvalita na kole se teď z knihovny vybírá podle data a střídá → její zátěž kolísá víc než dřív
    expect(Math.abs(h.load - rideKey.load) / rideKey.load).toBeLessThan(0.6);
  });
  it("den s běžkami (bez intervalů) kvalitu nedostane – přesune se na jiný den, týden ji má", () => {
    const base = runCoach(input());
    const w1 = base.coach.horizon[1]!;
    const key = w1.days.find((d) => d.role === "key")!;
    const out = runCoach(input({ constraints: [{ date: key.date, kind: "bezky", note: null }] }));
    const h1 = out.coach.horizon[1]!;
    expect(h1.days.find((d) => d.date === key.date)!.role).not.toBe("key");
    expect(h1.days.filter((d) => d.role === "key").length).toBe(w1.days.filter((d) => d.role === "key").length);
  });
});

describe("rozběhnutý týden: plán z pondělí, nedohání se", () => {
  it("odjeto míň než v pondělním plánu → zbytek týdne stejný jako v pondělí, ne víc", () => {
    const x = input({ goal: "udrzeni" });
    const monday = runCoach({ ...x, today: "2026-11-09", acts: x.acts.filter((y) => y.date < "2026-11-09") }).coach.horizon[0]!;
    const planRest = monday.days.filter((d) => d.date >= "2026-11-12").reduce((t, d) => t + d.load, 0);
    // čtvrtek: od pondělí odjeto jen úterý (55)
    const thu = runCoach({ ...x, acts: x.acts.filter((y) => y.date < "2026-11-09" || y.date === "2026-11-10") }).coach.horizon[0]!;
    expect(Math.abs(thu.load - planRest)).toBeLessThanOrEqual(planRest * 0.1);
  });
});

describe("závod", () => {
  it("den závodu je rezervovaný, žádný trénink", () => {
    const race = addDays(T, 4);
    const p = runCoach(input({ goal: "zavod", raceDate: race }));
    const d = p.days.find((x) => x.date === race)!;
    expect(d.kind).toBe("blocked");
    expect(d.note).toMatch(/Závod/);
  });
  // Dřív cíl Závod s datem v minulosti spadl hned v pondělí do Rozvoje se 2 kvalitami
  it("týden po závodě: přechod – lehce, bez kvality; pak zase normálně", () => {
    // závod minulou neděli (v aktivitách není), dnes čtvrtek týdne po závodě
    const c = runCoach(input({ goal: "zavod", raceDate: "2026-11-08" })).coach;
    expect(c.phase).toBe("post");
    expect(c.phaseLabel).toBe("Po závodě");
    expect(c.horizon[0]!.days.filter((d) => d.role === "key")).toEqual([]);
    expect(c.horizon[0]!.limit).toBe("po závodě");
    expect(c.horizon[0]!.notes.join(" ")).toMatch(/Týden po závodě: lehce a bez kvality, \d+ zátěže \(55 %/);
    expect(c.horizon[0]!.load).toBeLessThan(c.horizon[1]!.load * 0.75);
    expect(c.horizon[1]!.phaseLabel).not.toBe("Po závodě");
  });
  it("den po závodě nikdy kvalita, i když závod v aktivitách není (závod uprostřed týdne)", () => {
    for (const race of ["2026-11-17", "2026-11-18", "2026-11-19"]) {
      const c = runCoach(input({ goal: "zavod", raceDate: race })).coach;
      const after = c.horizon.flatMap((w) => w.days).filter((d) => d.date > race && d.date <= addDays(race, 7));
      expect(after.filter((d) => d.role === "key"), race).toEqual([]);
    }
  });
});
