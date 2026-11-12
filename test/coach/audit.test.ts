// Regresní testy z auditu Trenéra v2 (listopad 2026). Každý blok odpovídá jednomu nálezu z diagnostiky.
import { describe, expect, it } from "vitest";
import { addDays, dow, mondayOf } from "../../src/lib/time";
import { step } from "../../src/core/fitness";
import type { Goal } from "../../src/core/fitness";
import type { Constraint } from "../../src/core/plan";
import type { NLap } from "../../src/datasource/types";
import type { HrZones } from "../../src/core/zones";
import { NO_FATIGUE } from "../../src/core/coach/target";
import { type CoachDay, type EngineAct, type EngineInput, type PlanInputsFingerprint, type ProgressRow, type StoredWeek, ALGO_VERSION, EVAL_WAIT_DAYS, constraintNoteOk, fingerprintOf, fixedFromConstraints, isClosed, matchKey, runEngine } from "../../src/core/coach/engine";
import { type Cat, type Zones, CATS, buildWorkout, pickLib } from "../../src/core/coach/library";
import { type CoachProfile, profileFromHistory, validateProfile } from "../../src/core/coach/profile";
import { distribution, outcomeOf } from "../../src/core/coach/progress";
import { runReadiness } from "../../src/core/coach/run";
import { type ValDay, validateWeek } from "../../src/core/coach/validate";
import { type PastDay, type SolveInput, MAX_DAY_MIN, MAX_OWN_MIN, runCapOf, solveWeekFull } from "../../src/core/coach/week";
import { LIBRARY } from "../../src/core/coach/workouts.data";

const HR: HrZones = { floors: [98, 135, 164, 185, 205], max: 215, lthr: 196, rest: 45 };
const ZONES: Zones = { ftp: 298, hr: HR };
const prof = (x: Record<string, unknown>): CoachProfile => validateProfile(x).profile;
const RIDER = prof({});

const SOLVE: SolveInput = {
  weekStart: "2026-11-16", from: "2026-11-16", profile: RIDER, load: 400, doneLoad: 0, sessions: 5, keys: 1, long: true, rate: 45, runRate: 62,
  caps: { easy: 120, long: 240, key: 75 }, past: new Map(), fixed: new Map(), weatherBad: new Set(), prev: null, noKey: new Set(), easyOnly: new Set(), run: { experienced: false, longest: 40 },
};
const solve = (x: Partial<SolveInput>) => solveWeekFull({ ...SOLVE, ...x });

// ---------- simulace (stejná jako v coach.test.ts, navíc zpožděná synchronizace a aktivity navíc) ----------
interface SimOpts {
  start: string;
  days: number;
  goal: Goal;
  ctl: number;
  atl?: number;
  profile?: CoachProfile;
  zones?: Zones;
  /** aktivita dne se objeví až o tolik dní později (zpožděná synchronizace) */
  delay?: number;
  skip?: (d: string, role: string) => boolean;
  extra?: (d: string, day: CoachDay) => EngineAct[];
  winter?: boolean;
}
function simulate(o: SimOpts) {
  const profile = o.profile ?? RIDER;
  const acts: EngineAct[] = [];
  const pending: { a: EngineAct; at: string }[] = [];
  const metrics = new Map<string, { ctl: number; atl: number }>();
  const stored = new Map<string, StoredWeek>();
  const progress: Record<string, ProgressRow> = {};
  let m = { ctl: o.ctl, atl: o.atl ?? o.ctl };
  for (let i = 63; i >= 1; i--) {
    const d = addDays(o.start, -i);
    if ([2, 4, 6, 7].includes(dow(d))) acts.push({ id: `h${i}`, date: d, sport: profile.primary === "run" ? "run" : "ride", load: (o.ctl * 7) / 4, moving_s: ((o.ctl * 7) / 4 / 45) * 3600, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: null });
  }
  metrics.set(addDays(o.start, -1), m);
  const outs: { T: string; out: ReturnType<typeof runEngine> }[] = [];
  const log: (CoachDay & { trained: boolean })[] = [];
  const input = (T: string): EngineInput => {
    const mon = mondayOf(T);
    const weekLoads = [4, 3, 2, 1].map((w) => Math.round(acts.filter((a) => a.date >= addDays(mon, -7 * w) && a.date < addDays(mon, -7 * (w - 1))).reduce((t, a) => t + (a.load ?? 0), 0)));
    const weather = new Map<string, any>();
    for (let i = 0; i < 9; i++) { const d = addDays(T, i); weather.set(d, { date: d, bad: false, rain: false, gusty: false, frost: false, rainProb: 10, gustMax: 20, tmax: 12, tmin: 4, window: { from: 10, to: 13 }, text: "", hours: [], rainSum: 0, code: 0 }); }
    return { today: T, goal: o.goal, raceDate: null, profile, zones: o.zones ?? ZONES, acts: acts.filter((a) => a.date > addDays(T, -70)), power: [], metric: (d) => metrics.get(d) ?? null, calendar: [], constraints: [], weather, weatherOk: true, recovery: "green", fatigue: { ...NO_FATIGUE, form: m.ctl - m.atl }, weekLoads, stored, progress };
  };
  for (let i = 0; i < o.days; i++) {
    const T = addDays(o.start, i);
    for (const p of pending.filter((x) => x.at <= T)) { acts.push(p.a); pending.splice(pending.indexOf(p), 1); }
    const out = runEngine(input(T));
    outs.push({ T, out });
    for (const w of out.save) stored.set(w.weekStart, JSON.parse(JSON.stringify(w)));
    for (const pr of out.progress) progress[pr.key] = { level: pr.level, last: pr.last };
    const d = stored.get(mondayOf(T))!.days.find((x) => x.date === T)!;
    let load = 0, trained = false;
    if (d.role !== "rest" && !o.skip?.(T, d.role)) {
      const a: EngineAct = { id: `a${T}`, date: T, sport: d.sport === "ride" ? "ride" : d.sport, load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: 100 };
      if (o.delay) pending.push({ a, at: addDays(T, o.delay) }); else acts.push(a);
      load = d.load; trained = true;
    }
    for (const x of o.extra?.(T, d) ?? []) acts.push(x);
    m = step(m, load);
    metrics.set(T, m);
    log.push({ ...JSON.parse(JSON.stringify(d)), trained });
  }
  return { log, outs, stored, progress, input };
}

// ---------- 6.1 / 6.3 validace vstupů ----------
describe("audit: validace vstupů", () => {
  it("neznámý sport v omezení plán neshodí, jen se ignoruje", () => {
    const f = fixedFromConstraints([{ date: "2026-11-18", kind: "sport", note: "kolobezka" }] as Constraint[]);
    expect(f.get("2026-11-18")?.sport).toBeUndefined();
    expect(() => solve({ fixed: f })).not.toThrow();
  });
  it("délka a vlastní jízda mají horní mez v jádře i při zápisu", () => {
    const f = fixedFromConstraints([{ date: "2026-11-18", kind: "delka", note: "5000" }, { date: "2026-11-19", kind: "jizda", note: JSON.stringify({ min: 5000 }) }] as Constraint[]);
    expect(f.get("2026-11-18")!.minutes).toBeLessThanOrEqual(Math.max(...Object.values(MAX_DAY_MIN)));
    expect(f.get("2026-11-19")!.own!.min).toBe(MAX_OWN_MIN);
    const d = solve({ fixed: f }).days.find((x) => x.date === "2026-11-18")!;
    expect(d.minutes).toBeLessThanOrEqual(MAX_DAY_MIN.ride);
    // běh má nižší strop
    const r = solve({ fixed: fixedFromConstraints([{ date: "2026-11-18", kind: "sport", note: "run" }, { date: "2026-11-18", kind: "delka", note: "400" }] as Constraint[]), profile: prof({ sports: { run: { enabled: true } } }) });
    expect(r.days.find((x) => x.date === "2026-11-18")!.minutes).toBeLessThanOrEqual(MAX_DAY_MIN.run);
  });
  it("constraintNoteOk: platné hodnoty projdou, nesmysly ne", () => {
    expect(constraintNoteOk("sport", "run")).toBe(true);
    expect(constraintNoteOk("sport", "rest")).toBe(true);
    expect(constraintNoteOk("sport", "kolobezka")).toBe(false);
    expect(constraintNoteOk("delka", "90")).toBe(true);
    expect(constraintNoteOk("delka", "0")).toBe(true);
    expect(constraintNoteOk("delka", "10")).toBe(false);
    expect(constraintNoteOk("delka", "5000")).toBe(false);
    expect(constraintNoteOk("delka", "abc")).toBe(false);
    expect(constraintNoteOk("jizda", JSON.stringify({ min: 240 }))).toBe(true);
    expect(constraintNoteOk("jizda", JSON.stringify({ min: 5000 }))).toBe(false);
    expect(constraintNoteOk("typ", "quality")).toBe(true);
    expect(constraintNoteOk("typ", "vo2")).toBe(false);
  });
  it("6.2 výsledek nezávisí na pořadí omezení; výslovný sport má přednost před běžkami", () => {
    const cons = [{ date: "2026-11-18", kind: "bezky", note: null }, { date: "2026-11-18", kind: "sport", note: "run" }, { date: "2026-11-19", kind: "delka", note: "90" }, { date: "2026-11-19", kind: "typ", note: "quality" }] as Constraint[];
    const a = fixedFromConstraints(cons), b = fixedFromConstraints([...cons].reverse());
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.get("2026-11-18")!.sport).toBe("run");
  });
});

// ---------- P0.2 / 6.4 vyhodnocení aktivit ----------
describe("audit: vyhodnocení klíčových dnů", () => {
  const day = { sport: "ride" as const, minutes: 75, plan: { reps: 4, work_s: 480, lo: 280, hi: 300 } };
  const act = (x: Partial<EngineAct>): EngineAct => ({ id: "a", date: "2026-06-03", sport: "ride", load: 60, moving_s: 75 * 60, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: null, ...x });
  it("párování: ne podle největší zátěže; jiný trénink místo kvality, víc kandidátů = nejasné", () => {
    expect(matchKey(day, []).kind).toBe("none");
    expect(matchKey(day, [act({ load: 200, moving_s: 4 * 3600 })]).kind).toBe("other");
    const q = act({ id: "q", quality: true, load: 50 });
    const r = matchKey(day, [act({ id: "big", load: 200, moving_s: 4 * 3600 }), q]);
    expect(r.kind === "one" && r.act.id).toBe("q");
    expect(matchKey(day, [act({ id: "a", quality: true, moving_s: 30 * 60 }), act({ id: "b", quality: true, moving_s: 3 * 3600 })]).kind).toBe("many");
    // spárovaná s plánem v intervals.icu rozhodne
    const p = matchKey(day, [act({ id: "a", quality: true }), act({ id: "b", quality: true, compliance: 90 })]);
    expect(p.kind === "one" && p.act.id).toBe("b");
    // jiný sport se nepočítá
    expect(matchKey(day, [act({ sport: "run", quality: true })]).kind).toBe("none");
  });
  it("starší uložené plány: evaluated = true je uzavřené, nový stav čeká", () => {
    expect(isClosed({ evaluated: true })).toBe(true);
    expect(isClosed({ evaluated: false })).toBe(false);
    expect(isClosed({ evalState: "pending" })).toBe(false);
    expect(isClosed({ evaluated: true, evalState: "missed" })).toBe(true);
  });
  it("zpožděná synchronizace: kvalita se nezapomene, vyhodnotí se, až aktivita dorazí", () => {
    const base = simulate({ start: "2026-04-06", days: 21, goal: "zvyseni", ctl: 45 });
    const late = simulate({ start: "2026-04-06", days: 21, goal: "zvyseni", ctl: 45, delay: 2 });
    const n = (s: typeof base) => s.outs.reduce((t, o) => t + o.out.progress.length, 0);
    expect(n(base)).toBeGreaterThanOrEqual(4);
    expect(n(late)).toBeGreaterThanOrEqual(n(base) - 1);
    // mezitím stav „čeká“
    const pend = late.outs.flatMap((o) => o.out.save.flatMap((w) => w.days)).filter((d) => d.evalState === "pending");
    expect(pend.length).toBeGreaterThan(0);
  });
  it("aktivita nedorazí ani za 3 dny → vynechaná, stupeň beze změny; uzavřený den se už nepočítá znovu", () => {
    const base = simulate({ start: "2026-06-01", days: 7, goal: "zvyseni", ctl: 50 });
    const keyDay = [...base.stored.values()].flatMap((w) => w.days).find((d) => d.role === "key" && d.date >= "2026-06-01")!.date;
    const s = simulate({ start: "2026-06-01", days: 14, goal: "zvyseni", ctl: 50, skip: (d) => d === keyDay });
    const k = s.stored.get(mondayOf(keyDay))!.days.find((d) => d.date === keyDay)!;
    expect(k.evalState).toBe("missed");
    expect(s.outs.find((o) => o.T === addDays(keyDay, EVAL_WAIT_DAYS - 1))!.out.save.flatMap((w) => w.days).find((d) => d.date === keyDay)?.evalState ?? "pending").toBe("pending");
    // žádný den se nevyhodnotí dvakrát
    const keys = s.outs.flatMap((o) => o.out.progress.map((p) => p.last));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("dvě kvality stejného sportu v jednom dni → nejasné, stupeň se nemění", () => {
    const base = simulate({ start: "2026-06-01", days: 7, goal: "zvyseni", ctl: 50 });
    const keyDay = [...base.stored.values()].flatMap((w) => w.days).find((d) => d.role === "key" && d.date >= "2026-06-01")!.date;
    // druhá jízda stejně dlouhá a taky spárovaná – nedá se poznat, která byla plánovaná kvalita
    const s = simulate({ start: "2026-06-01", days: 10, goal: "zvyseni", ctl: 50, extra: (d, day) => (d === keyDay ? [{ id: "x", date: d, sport: "ride", load: 90, moving_s: day.minutes * 60, quality: true, hr_z: null, pwr_z: null, laps: null, compliance: 100 }] : []) });
    const k = s.stored.get(mondayOf(keyDay))!.days.find((d) => d.date === keyDay)!;
    expect(k.evalState).toBe("ambiguous");
    expect(s.outs.flatMap((o) => o.out.progress).some((p) => p.last === keyDay)).toBe(false);
  });
});

// ---------- P0.6 výběr z knihovny ----------
describe("audit: výběr z knihovny nepřekročí limity", () => {
  it("pickLib nikdy nevrátí trénink nad maxMain ani nad maxTiz; když nic nesedí, vrátí null", () => {
    for (const cat of CATS) for (const maxMain of [5, 10, 15, 25, 40, 60]) for (const maxTiz of [null, 2, 5, 10, 20]) {
      const w = pickLib({ cat, tier: 2, maxMain, maxTiz, avoidIds: [], avoidShapes: [], seed: "s" });
      const any = LIBRARY.some((x) => x.c === cat && x.m <= maxMain && (maxTiz == null || x.t <= maxTiz + 0.01));
      if (!any) expect(w, `${cat} ${maxMain} ${maxTiz}`).toBeNull();
      else { expect(w!.m).toBeLessThanOrEqual(maxMain); if (maxTiz != null) expect(w!.t).toBeLessThanOrEqual(maxTiz + 0.01); }
    }
  });
  it("buildWorkout: když se z knihovny nevejde nic, trénink se postaví podle tepu a délku drží", () => {
    const b = buildWorkout({ sport: "ride", family: "thr", level: 2, minutes: 30, indoor: false, zones: ZONES });
    expect(b.minutes).toBeLessThanOrEqual(40);
  });
  it("krátká kvalita, kterou si dáš sám: jiná kategorie, nebo Z2 s vysvětlením – nikdy delší den", () => {
    const s = simulate({ start: "2026-06-01", days: 3, goal: "zvyseni", ctl: 50 });
    const T = "2026-06-04";
    const out = runEngine({ ...s.input(T), constraints: [{ date: "2026-06-05", kind: "typ", note: "quality" }, { date: "2026-06-05", kind: "delka", note: "35" }] as Constraint[] });
    const d = out.save.flatMap((w) => w.days).find((x) => x.date === "2026-06-05")!;
    expect(d.minutes).toBeLessThanOrEqual(40);
    if (d.role !== "key") expect(d.why.join(" ")).toMatch(/nevejde/);
  });
});

// ---------- P0.4 hlášení řešiče ----------
describe("audit: řešič hlásí nesplněné požadavky", () => {
  it("dlouhý trénink, který se nevejde, se nahlásí; výstup sedí s plánem", () => {
    const fx = fixedFromConstraints(["2026-11-17", "2026-11-19", "2026-11-21", "2026-11-22"].map((date) => ({ date, kind: "delka", note: "60" })) as Constraint[]);
    for (const d of ["2026-11-16", "2026-11-18", "2026-11-20"]) fx.set(d, { rest: true });
    const r = solve({ fixed: fx });
    expect(r.days.some((x) => x.role === "long")).toBe(false);
    expect(r.report.fulfilled.long).toBe(false);
    expect(r.report.violations.map((v) => v.code)).toContain("long_missing");
    expect(r.report.fulfilled.keys).toBe(r.days.filter((x) => x.role === "key").length);
  });
  it("méně kvalit, než týden chce, se nahlásí", () => {
    const fx = new Map<string, { rest?: boolean }>();
    for (const d of ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]) fx.set(d, { rest: true });
    const r = solve({ fixed: fx as any, keys: 2, sessions: 2 });
    expect(r.report.fulfilled.keys).toBeLessThan(2);
    expect(r.report.violations.map((v) => v.code)).toContain("keys_short");
  });
  it("kvalita, kterou si dáš den po dlouhém, je výjimka (tvoje volba), ne chyba", () => {
    const past = new Map<string, PastDay>([["2026-11-15", { trained: true, hard: true, key: false, minutes: 200, sport: "ride", long: true }]]);
    const r = solve({ past, fixed: fixedFromConstraints([{ date: "2026-11-16", kind: "typ", note: "quality" }] as Constraint[]) });
    expect(r.days.find((x) => x.date === "2026-11-16")!.role).toBe("key");
    expect(r.report.exceptions.map((e) => e.code)).toContain("key_after_hard");
  });
  it("dlouhý trénink nezmizí, když počet tréninků vyčerpaly lehčí dny", () => {
    const past = new Map<string, PastDay>();
    for (const [d, key] of [["2026-11-17", true], ["2026-11-18", false], ["2026-11-20", true], ["2026-11-21", false]] as [string, boolean][]) past.set(d, { trained: true, hard: key, key, minutes: 75, sport: "ride" });
    const r = solve({ from: "2026-11-22", past, sessions: 4, keys: 2, load: 420, doneLoad: 280 });
    expect(r.days.find((x) => x.date === "2026-11-22")!.role).toBe("long");
  });
});

// ---------- P0.3 / P1.2 závěrečná kontrola týdne ----------
describe("audit: závěrečná kontrola týdne", () => {
  const D = (date: string, role: ValDay["role"], x: Partial<ValDay> = {}): ValDay => ({ date, role, sport: "ride", minutes: role === "rest" ? 0 : role === "long" ? 180 : 75, tiz: role === "key" ? 15 : 0, blocked: false, own: false, userQuality: false, userMinutes: false, downgraded: null, ...x });
  const V = (days: ValDay[], x: Record<string, unknown> = {}) => validateWeek({ weekStart: "2026-11-16", from: "2026-11-16", days, past: new Map(), keys: 1, long: true, caps: { easy: 120, long: 240, key: 75 }, runCap: 60, tsbFloor: -20, forms: [], ...x });
  const week = (roles: ValDay["role"][], x: Partial<ValDay>[] = []) => roles.map((r, i) => D(addDays("2026-11-16", i), r, x[i] ?? {}));
  it("v pořádku: kvalita po volnu, dlouhý o víkendu; dlouhý hned po kvalitě je dovolený", () => {
    expect(V(week(["rest", "key", "endurance", "rest", "endurance", "long", "rest"])).ok).toBe(true);
    expect(V(week(["rest", "endurance", "rest", "rest", "key", "long", "rest"])).ok).toBe(true);
  });
  it("kvalita den po dlouhém / po kvalitě = chyba v obou směrech sousedních dnů; tvoje volba = výjimka", () => {
    const a = V(week(["rest", "long", "key", "rest", "rest", "rest", "rest"]));
    expect(a.ok).toBe(false);
    expect(a.items.find((i) => i.code === "key_after_hard")!.level).toBe("error");
    expect(V(week(["rest", "key", "key", "rest", "rest", "long", "rest"])).ok).toBe(false);
    const u = V(week(["rest", "long", "key", "rest", "rest", "rest", "rest"], [{}, {}, { userQuality: true }]));
    expect(u.ok).toBe(true);
    expect(u.items.find((i) => i.code === "key_after_hard")!.level).toBe("exception");
    // přes hranu týdne: dlouhá neděle minulého týdne → pondělní kvalita je chyba
    const past = new Map<string, PastDay>([["2026-11-15", { trained: true, hard: true, key: false, minutes: 200, sport: "ride", long: true }]]);
    expect(V(week(["key", "rest", "rest", "rest", "rest", "long", "rest"]), { past }).ok).toBe(false);
  });
  it("víc než 3 dny za sebou, forma pod hranicí a délka nad strop jsou chyby", () => {
    expect(V(week(["key", "endurance", "endurance", "endurance", "rest", "long", "rest"])).items.map((i) => i.code)).toContain("streak");
    const t = V(week(["rest", "key", "rest", "rest", "endurance", "long", "rest"]), { forms: [{ date: "2026-11-21", form: -24 }] });
    expect(t.ok).toBe(false);
    expect(t.items.map((i) => i.code)).toContain("tsb_floor");
    const c = V(week(["rest", "key", "rest", "endurance", "rest", "long", "rest"], [{}, {}, {}, { minutes: 300 }]));
    expect(c.items.find((i) => i.code === "cap")!.level).toBe("error");
    const cu = V(week(["rest", "key", "rest", "endurance", "rest", "long", "rest"], [{}, {}, {}, { minutes: 300, userMinutes: true }]));
    expect(cu.items.find((i) => i.code === "cap")!.level).toBe("exception");
  });
  it("chybějící dlouhý: upozornění; když ho vědomě vzalo počasí, výjimka s důvodem", () => {
    expect(V(week(["rest", "key", "rest", "endurance", "rest", "endurance", "rest"])).items.find((i) => i.code === "long_missing")!.level).toBe("warn");
    const w = V(week(["rest", "key", "rest", "endurance", "rest", "endurance", "rest"], [{}, {}, {}, {}, {}, { downgraded: "počasí" }]));
    expect(w.items.find((i) => i.code === "long_missing")!.level).toBe("exception");
  });
  it("12 týdnů simulace: každý uložený týden projde závěrečnou kontrolou bez chyby", () => {
    for (const [start, goal, ctl, atl] of [["2026-04-06", "zvyseni", 45, 45], ["2026-11-16", "udrzeni", 45, 45], ["2026-04-06", "zvyseni", 50, 85], ["2026-06-01", "pokles", 30, 30]] as [string, Goal, number, number][]) {
      const s = simulate({ start, days: 56, goal, ctl, atl });
      for (const w of s.stored.values()) expect(w.validation?.items.filter((i) => i.level === "error") ?? [], `${goal} ${w.weekStart}`).toEqual([]);
      // a v datech: kvalita nikdy den po kvalitě ani po dlouhém
      s.log.forEach((d, i) => { if (d.trained && d.role === "key" && i > 0 && s.log[i - 1]!.trained) expect(["key", "long"], `${goal} ${d.date}`).not.toContain(s.log[i - 1]!.role); });
    }
  });
  it("upozornění formy odpovídá hranici plánu (−20), ne pevnému −25; výsledek je v plan.coach.validation", () => {
    const s = simulate({ start: "2026-11-16", days: 3, goal: "udrzeni", ctl: 50, atl: 50 });
    const out = runEngine(s.input("2026-11-19"));
    expect(out.plan.coach.validation).toBeTruthy();
    expect(typeof out.plan.coach.validation.ok).toBe("boolean");
    for (const x of out.plan.days) if (x.form != null && x.form < -20) expect(out.plan.warnings.join(" ")).toMatch(/pod hranicí|Vysokého rizika/);
  });
});

// ---------- P0.1 otisk vstupů ----------
describe("audit: otisk vstupů", () => {
  const FP: PlanInputsFingerprint = {
    v: ALGO_VERSION, from: "2026-11-16", recovery: "green", fixed: [], past: [], baseKey: "b", budget: { load: 300, keys: 1, sessions: 4, long: true, caps: { easy: 90, long: 150, key: 60 }, recoveryWeek: false, tsbFloor: -20, phase: "maintain" },
    doneLoad5: 0, skipKey: false, runRate: 62, weekOff: null, weatherBad: [], weatherOk: true, outside: [], zones: { ftp: 298, floors: HR.floors, lthr: 196 }, levels: [], calib: ["ride:20"], used: [], needs: [], state: [45, 45], run: { experienced: false, longest: 0 }, illness: [],
  };
  it("stejné vstupy = stejný otisk; každá podstatná změna ho změní (i verze pravidel)", () => {
    expect(fingerprintOf({ ...FP })).toBe(fingerprintOf(JSON.parse(JSON.stringify(FP))));
    const changes: Partial<PlanInputsFingerprint>[] = [
      { v: ALGO_VERSION + 1 }, { zones: { ...FP.zones, ftp: 300 } }, { zones: { ...FP.zones, lthr: 190 } }, { zones: { ...FP.zones, floors: [98, 136, 164, 185, 205] } },
      { outside: ["2026-11-18"] }, { weatherBad: ["2026-11-18"] }, { state: [45, 60] }, { needs: ["vo2:3"] }, { run: { experienced: true, longest: 40 } }, { calib: ["ride:21"] }, { illness: ["2026-11-15"] }, { from: "2026-11-17" },
    ];
    for (const c of changes) expect(fingerprintOf({ ...FP, ...c }), JSON.stringify(c)).not.toBe(fingerprintOf(FP));
  });
  it("v enginu: změna FTP nebo LTHR přepočítá uložený týden, stejné vstupy nic neukládají", () => {
    const s = simulate({ start: "2026-06-01", days: 5, goal: "zvyseni", ctl: 50 });
    const T = "2026-06-06";
    const a = runEngine(s.input(T));
    for (const w of a.save) s.stored.set(w.weekStart, JSON.parse(JSON.stringify(w)));
    for (const pr of a.progress) s.progress[pr.key] = { level: pr.level, last: pr.last };
    expect(runEngine(s.input(T)).save).toEqual([]);
    expect(runEngine({ ...s.input(T), zones: { ftp: 310, hr: HR } }).save.length).toBeGreaterThan(0);
    expect(runEngine({ ...s.input(T), zones: { ftp: 298, hr: { ...HR, lthr: 186 } } }).save.length).toBeGreaterThan(0);
  });
});

// ---------- P0.5 běh ----------
describe("audit: připravenost na běh", () => {
  const T = "2026-11-12";
  const runs = (dates: string[], min = 40) => dates.map((date, i) => ({ id: `r${i}`, date, sport: "run" as const, moving_s: min * 60 }));
  it("bez běžecké historie: žádné intervaly, kondice z kola nepomáhá; strop 1 h (tvoje volba)", () => {
    const rides = Array.from({ length: 40 }, (_, i) => ({ date: addDays(T, -i), sport: "ride" as const, moving_s: 3 * 3600 }));
    const r = runReadiness(rides, T, false);
    expect(r.level).toBe("none");
    expect(r.experienced).toBe(false);
    expect(r.longest).toBe(0);
    expect(runCapOf(r.longest)).toBe(60);
  });
  it("návrat po pauze (víc než 3 týdny bez běhu): opatrně, bez intervalů", () => {
    const r = runReadiness(runs([-30, -33, -36, -40, -44, -48, -52].map((d) => addDays(T, d))), T, false);
    expect(r.level).toBe("returning");
    expect(r.experienced).toBe(false);
    expect(r.longest).toBe(0);
  });
  it("občas a pravidelně: intervaly až při pravidelném běhání, délka roste postupně (1,5× nejdelšího)", () => {
    expect(runReadiness(runs([-3, -10, -17].map((d) => addDays(T, d))), T, false).experienced).toBe(false);
    const reg = runReadiness(runs([-2, -6, -12, -19, -26, -33, -40].map((d) => addDays(T, d)), 50), T, false);
    expect(reg.level).toBe("regular");
    expect(reg.experienced).toBe(true);
    expect(runCapOf(reg.longest)).toBe(75);
    expect(runCapOf(120)).toBe(180);
  });
  it("hlavní sport běh: intervaly hned, jen ne po pauze", () => {
    expect(runReadiness([], T, true).experienced).toBe(true);
    expect(runReadiness([], T, true).longest).toBe(40);
    expect(runReadiness(runs([addDays(T, -30)]), T, true).experienced).toBe(false);
  });
  it("cyklista s občasným během nedostane běžecké intervaly ani VO2 podle tepu", () => {
    const s = simulate({ start: "2026-06-01", days: 28, goal: "zvyseni", ctl: 50, profile: prof({ sports: { run: { enabled: true, quality: true } } }) });
    expect(s.log.filter((d) => d.sport === "run" && d.role === "key").length).toBe(0);
  });
});

// ---------- P1.3 skutečná zátěž ----------
describe("audit: zátěž tréninků proti cíli týdne", () => {
  it("plánovaná zátěž je součet skutečných tréninků a drží se v pásmu cíle", () => {
    const s = simulate({ start: "2026-04-06", days: 56, goal: "zvyseni", ctl: 45 });
    for (const w of s.stored.values()) {
      if (w.weekStart < "2026-04-06" || w.weekStart > "2026-05-25") continue;
      const planned = w.days.reduce((t, d) => t + d.load, 0);
      expect(planned, w.weekStart).toBeGreaterThanOrEqual(w.budget.lo);
      expect(planned, w.weekStart).toBeLessThanOrEqual(w.budget.hi);
    }
    const out = s.outs[s.outs.length - 1]!.out;
    expect(out.plan.coach.plannedLoad).toBeGreaterThan(0);
  });
});

// ---------- P1.4 struktura bloků ----------
describe("audit: úplná struktura intervalů", () => {
  const multi = LIBRARY.find((w) => {
    const b = buildWorkout({ sport: "ride", family: w.c as Cat, level: 2, wid: w.id, minutes: 90, indoor: false, zones: ZONES });
    return (b.plan?.blocks?.length ?? 0) >= 2;
  })!;
  const built = buildWorkout({ sport: "ride", family: multi.c as Cat, level: 2, wid: multi.id, minutes: 90, indoor: false, zones: ZONES });
  const blocks = built.plan!.blocks!;
  const lap = (i: number, s: number, w: number): NLap => ({ i, type: "WORK", label: null, start_s: 0, moving_s: s, elapsed_s: s, distance_m: null, avg_power: w, np: null, avg_hr: 150, max_hr: null, avg_cad: null } as NLap);
  const lapsFor = (skip: number | null, below = false) => blocks.flatMap((b, bi) => (bi === skip ? [] : Array.from({ length: b.reps * (b.sets ?? 1) }, (_, i) => lap(i, b.work_s, below && bi === blocks.length - 1 ? b.lo - 20 : (b.lo + b.hi) / 2))));
  it("trénink s víc druhy úseků uloží všechny bloky (první blok zůstává kvůli starším plánům)", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(built.plan!.work_s).toBe(blocks[0]!.work_s);
  });
  it("vyhodnotí se všechny bloky: celé = posun, vynechaný nebo slabý blok = ne posun", () => {
    expect(outcomeOf({ date: "2026-06-03", plan: built.plan, laps: lapsFor(null), compliance: null }).outcome).toBe("posun");
    expect(outcomeOf({ date: "2026-06-03", plan: built.plan, laps: lapsFor(blocks.length - 1), compliance: null }).outcome).toBe("ubrat");
    expect(outcomeOf({ date: "2026-06-03", plan: built.plan, laps: lapsFor(null, true), compliance: null }).outcome).not.toBe("posun");
    // jen první blok nestačí
    expect(outcomeOf({ date: "2026-06-03", plan: built.plan, laps: lapsFor(1), compliance: null }).outcome).not.toBe("posun");
  });
});

// ---------- P1.5, P2.2, P2.3, P1.1 ----------
describe("audit: drobnosti", () => {
  it("P1.5 běžec nedostane „VO2“, které je ve skutečnosti práh podle tepu", () => {
    const runner = prof({ primary: "run", sports: { ride: { enabled: false } } });
    const s = simulate({ start: "2026-05-04", days: 56, goal: "zvyseni", ctl: 45, profile: runner, zones: { ftp: null, hr: HR } });
    const keys = s.log.filter((d) => d.role === "key" && d.sport === "run");
    expect(keys.length).toBeGreaterThan(3);
    for (const k of keys) expect(["vo2", "vo2s"], k.date).not.toContain(k.family);
  });
  it("P2.2 rozdělení intenzity zvlášť pro kolo (watty) a běh (tep); celek jen orientačně", () => {
    const d = distribution([
      { date: "2026-11-10", sport: "ride", moving_s: 7200, hr_z: null, pwr_z: [1800, 4000, 600, 600, 200, 0, 0] },
      { date: "2026-11-09", sport: "run", moving_s: 3600, hr_z: [600, 1200, 1200, 600, 0], pwr_z: null },
    ], "2026-11-11")!;
    expect(d.ride).toMatchObject({ low: 81, mid: 8, high: 11, method: "power" });
    expect(d.run).toMatchObject({ low: 50, mid: 33, high: 17, method: "hr" });
    expect(d.low + d.mid + d.high).toBe(100);
  });
  it("P2.3 profil: hodně krátkých nebo nárazových běhů ≠ intervaly; kolo běh nepřidává; pravidelný běžec ano", () => {
    const T = "2026-11-12";
    const rides = Array.from({ length: 30 }, (_, i) => ({ date: addDays(T, -i * 2), sport: "ride" as const, moving_s: 2 * 3600 }));
    const burst = Array.from({ length: 14 }, (_, i) => ({ date: addDays(T, -i), sport: "run" as const, moving_s: 25 * 60 }));
    expect(profileFromHistory([...rides, ...burst], T).sports.run).toEqual({ enabled: true, quality: false });
    expect(profileFromHistory(rides, T).sports.run.enabled).toBe(false);
    const regular = Array.from({ length: 12 }, (_, i) => ({ date: addDays(T, -i * 7 - 1), sport: "run" as const, moving_s: 45 * 60 }));
    expect(profileFromHistory([...rides, ...regular], T).sports.run).toEqual({ enabled: true, quality: true });
  });
  it("P1.1 růst kondice podle typického (medián), ne výjimečného bloku z historie", () => {
    const s = simulate({ start: "2026-06-01", days: 1, goal: "zvyseni", ctl: 50 });
    // jeden 4týdenní blok s růstem 4 body týdně před 2 měsíci, jinak rovně
    const metric = (d: string) => ({ ctl: d < "2026-04-01" ? 30 : d < "2026-04-29" ? 30 + ((Date.parse(d) - Date.parse("2026-04-01")) / 864e5 / 7) * 4 : 46, atl: 46 });
    const out = runEngine({ ...s.input("2026-06-01"), metric });
    expect(out.plan.coach.ramp).toBeLessThanOrEqual(2);
  });
});
