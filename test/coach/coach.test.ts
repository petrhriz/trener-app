import { describe, expect, it } from "vitest";
import { addDays, dow, mondayOf } from "../../src/lib/time";
import { step } from "../../src/core/fitness";
import type { Goal } from "../../src/core/fitness";
import type { State } from "../../src/core/recovery";
import type { Constraint } from "../../src/core/plan";
import { validate } from "../../src/core/workout";
import type { HrZones } from "../../src/core/zones";
import { NO_FATIGUE, ctlAfterWeek, fatigueFactor, loadForCtl, weekBudget } from "../../src/core/coach/budget";
import { type Anchor } from "../../src/core/coach/budget";
import { type EngineAct, type EngineInput, type ProgressRow, type StoredWeek, fixedFromConstraints, runEngine } from "../../src/core/coach/engine";
import { KEY_FAMILIES, RIDE_LADDER, type Zones, buildWorkout, keyCandidates, pickFamilies } from "../../src/core/coach/library";
import { type CoachProfile, DEFAULT_PROFILE, hoursFor, mixFor, profileFromHistory, profileSummary, validateProfile } from "../../src/core/coach/profile";
import { distribution, nextLevel, outcomeOf } from "../../src/core/coach/progress";
import { type PastDay, MAX_STREAK, sessionsFor, solveWeek } from "../../src/core/coach/week";

const HR: HrZones = { floors: [98, 135, 164, 185, 205], max: 215, lthr: 196, rest: 45 };
const ZONES: Zones = { ftp: 298, hr: HR, p5: 360 };
const prof = (x: Partial<CoachProfile> | Record<string, unknown>): CoachProfile => validateProfile(x).profile;

// ---------- profil ----------
describe("profil sportovce", () => {
  it("doplní výchozí hodnoty a odmítne nesmysly", () => {
    const r = validateProfile({ primary: "plavani", hours: { winter: { min: 5, max: 3 } }, days: { preferred: [5, 6, 7], long: 7 } });
    expect(r.errors.length).toBe(2);
    expect(r.profile.primary).toBe("ride");
    expect(r.profile.days.preferred).toEqual([5, 6, 7]);
    expect(r.profile.days.long).toBe(7);
    expect(r.profile.hours.winter).toEqual(DEFAULT_PROFILE.hours.winter);
  });
  it("hodiny podle období a sněhu, mix jen zapnutých sportů", () => {
    const p = prof({ sports: { run: { enabled: true, maxPerWeek: 1 }, xc_ski: { enabled: true } }, mix: [{ months: [11, 12, 1, 2], share: { run: 0.35, xc_ski: 0.15 } }], hours: { season: { min: 6, max: 10 }, winter: { min: 3, max: 4 }, snow: { min: 5, max: 7 } } });
    expect(hoursFor(p, "2026-07-01")).toEqual({ min: 6, max: 10 });
    expect(hoursFor(p, "2026-12-01")).toEqual({ min: 3, max: 4 });
    expect(mixFor(p, "2026-12-01")).toEqual({ run: 0.35 });
    expect(hoursFor({ ...p, snow: true }, "2026-12-01")).toEqual({ min: 5, max: 7 });
    expect(mixFor({ ...p, snow: true }, "2026-12-01")).toEqual({ run: 0.35, xc_ski: 0.15 });
    expect(mixFor(p, "2026-07-01")).toEqual({});
    expect(profileSummary(p).join(" ")).toContain("Běh: nejvýš 1× týdně");
  });
  it("profil z historie: běžec dostane hlavní sport běh", () => {
    const acts = [];
    for (let w = 1; w <= 12; w++) for (const d of [1, 3, 5]) acts.push({ date: addDays("2026-11-09", -7 * w + d), sport: "run" as const, moving_s: 3600 });
    const p = profileFromHistory(acts, "2026-11-11");
    expect(p.primary).toBe("run");
    expect(p.hours.season.min).toBeGreaterThanOrEqual(2);
    expect(p.hours.season.max).toBeLessThanOrEqual(4);
    expect(profileFromHistory([], "2026-11-11").primary).toBe("ride");
  });
});

// ---------- rozpočet ----------
describe("rozpočet týdne", () => {
  it("vzorec zátěže z cílové kondice sedí s výpočtem po dnech", () => {
    const load = loadForCtl(45, 43);
    let c = { ctl: 45, atl: 45 };
    for (let i = 0; i < 7; i++) c = step(c, load / 7);
    expect(c.ctl).toBeCloseTo(43, 1);
    expect(ctlAfterWeek(45, load)).toBeCloseTo(43, 5);
  });
  it("hodiny z profilu jsou strop a trenér řekne, co to udělá s kondicí", () => {
    const p = prof({ hours: { winter: { min: 3, max: 4 } } });
    const b = weekBudget({ weekStart: "2026-11-16", goal: "udrzeni", profile: p, ctl: 45, anchor: { date: "2026-11-11", ctl: 45, goal: "udrzeni" }, raceDate: null, prevWeeks: [300, 310, 320, 315], cycleIdx: 1, fatigue: NO_FATIGUE, rate: { easy: 45, key: 80 } });
    expect(b.hours).toBeLessThanOrEqual(4);
    expect(b.load).toBeLessThan(45 * 7);
    expect(b.notes.join(" ")).toContain("se cíl nevejde");
    expect(b.keys).toBe(1);
  });
  it("únava jen ubírá", () => {
    expect(fatigueFactor(NO_FATIGUE).factor).toBe(1);
    expect(fatigueFactor({ ...NO_FATIGUE, form: -32 }).factor).toBe(0.8);
    expect(fatigueFactor({ ...NO_FATIGUE, badMornings: 2 }).factor).toBe(0.9);
    expect(fatigueFactor({ ...NO_FATIGUE, illnessDays: 5 }).keysMax).toBe(0);
  });
  it("Zlepšit: 4. týden bloku je lehčí (65 % předchozího)", () => {
    const p = prof({ hours: { season: { min: 6, max: 10 } } });
    const base = { goal: "zvyseni" as Goal, profile: p, ctl: 50, anchor: null, raceDate: null, fatigue: NO_FATIGUE, rate: { easy: 45, key: 80 } };
    const b3 = weekBudget({ ...base, weekStart: "2026-06-15", prevWeeks: [350, 370, 390], cycleIdx: 3 });
    const b4 = weekBudget({ ...base, weekStart: "2026-06-22", prevWeeks: [350, 370, 390, 400], cycleIdx: 4 });
    expect(b3.recoveryWeek).toBe(false);
    expect(b4.recoveryWeek).toBe(true);
    expect(b4.load).toBe(260);
    expect(b4.keys).toBe(1);
  });
});

// ---------- knihovna ----------
describe("knihovna tréninků", () => {
  it("všechny stupně všech rodin na kole dají platný workout s watty", () => {
    for (const f of KEY_FAMILIES)
      RIDE_LADDER[f].forEach((_, level) => {
        for (const indoor of [false, true]) {
          const b = buildWorkout({ sport: "ride", family: f, level, minutes: 75, indoor, zones: ZONES });
          expect(validate(b.workout), `${f} ${level}`).toEqual([]);
          expect(b.tizMin).toBeGreaterThan(0);
          expect(b.load).toBeGreaterThan(20);
        }
      });
    for (const f of ["rec", "end", "long", "ff"] as const) expect(validate(buildWorkout({ sport: "ride", family: f, level: 1, minutes: 120, indoor: false, zones: ZONES }).workout), f).toEqual([]);
  });
  it("Z2 na kole je v zónách uživatele, ne ve stupnici 80/20", () => {
    const b = buildWorkout({ sport: "ride", family: "end", level: 0, minutes: 90, indoor: false, zones: ZONES });
    const main = b.workout.blocks.find((x) => x.kind === "main")!.steps[0]!;
    expect(main.lo).toBeGreaterThanOrEqual(165);
    expect(main.hi).toBeLessThanOrEqual(224);
    expect(b.targetText).toContain("135–163 bpm");
  });
  it("běh má kroky v bpm ze zón Garminu a do intervals.icu jde % LTHR", () => {
    const b = buildWorkout({ sport: "run", family: "end", level: 0, minutes: 45, indoor: false, zones: ZONES });
    const main = b.workout.blocks.find((x) => x.kind === "main")!.steps[0]!;
    expect([main.hrLo, main.hrHi]).toEqual([135, 163]);
    expect(main.hr).toBe("69-83% LTHR");
    expect(b.name).toBe("Běh – Z2");
    const k = buildWorkout({ sport: "run", family: "vo2", level: 1, minutes: 50, indoor: false, zones: ZONES });
    expect(k.family).toBe("thr"); // běh VO2 podle tepu nemá → práh
    expect(k.workout.blocks.find((x) => x.kind === "work")!.steps[0]!.hrLo).toBe(185);
  });
  it("bez FTP a bez zón vyjde platný trénink podle tepu", () => {
    const b = buildWorkout({ sport: "ride", family: "thr", level: 1, minutes: 75, indoor: false, zones: { ftp: null, hr: null, p5: null } });
    expect(b.workout.blocks.find((x) => x.kind === "work")!.steps[0]!.hr).toBe("Z4 HR");
    expect(b.load).toBeGreaterThan(30);
  });
  it("rodiny klíčových dnů se střídají", () => {
    const c = keyCandidates("rozvoj", { recoveryWeek: false, decline: false, winter: false });
    expect(pickFamilies(c, 2, {})).toEqual(["thr", "vo2s"]);
    expect(pickFamilies(c, 1, { thr: "2026-06-10" })).toEqual(["vo2"]);
    expect(pickFamilies(keyCandidates("rozvoj", { recoveryWeek: true, decline: false, winter: false }), 1, {})).toEqual(["sp"]);
  });
});

// ---------- řešič týdne ----------
const noPast = new Map<string, PastDay>();
const solve = (x: Partial<Parameters<typeof solveWeek>[0]> & { profile: CoachProfile }) =>
  solveWeek({ weekStart: "2026-11-16", from: "2026-11-16", hours: 6, keys: 1, past: noPast, fixed: new Map(), weatherBad: new Set(), prev: null, noKey: new Set(), easyOnly: new Set(), run: { experienced: false, longest: 0 }, longestRide: 150, ...x });

describe("kostra týdne", () => {
  it("pá–so–ne v zimě: tři tréninky na oblíbené dny, kvalita po volnu, dlouhý v neděli", () => {
    const p = prof({ days: { preferred: [5, 6, 7] } });
    const d = solve({ profile: p, hours: 3.5 });
    expect(d.map((x) => x.role)).toEqual(["rest", "rest", "rest", "rest", "key", "endurance", "long"]);
    expect(d.reduce((t, x) => t + x.minutes, 0)).toBeGreaterThanOrEqual(3 * 60);
    expect(d.reduce((t, x) => t + x.minutes, 0)).toBeLessThanOrEqual(4.25 * 60);
  });
  it("řada přes hranu týdne: po pá–so–ne tréninku musí být pondělí volno", () => {
    const p = prof({ days: { preferred: [1, 2, 3] } });
    const past = new Map<string, PastDay>(["2026-11-13", "2026-11-14", "2026-11-15"].map((d) => [d, { trained: true, hard: false, key: false, minutes: 90, sport: "ride" as const }]));
    const d = solve({ profile: p, past, hours: 5 });
    expect(d[0]!.role).toBe("rest");
  });
  it("klíčový den nikdy den po klíčovém ani po dlouhém", () => {
    for (const hours of [4, 6, 8, 10]) for (const pref of [[], [5, 6, 7], [2, 4, 6], [1, 2, 3, 4]]) {
      const d = solve({ profile: prof({ days: { preferred: pref } }), hours, keys: 2 });
      d.forEach((x, i) => { if (x.role === "key" && i > 0) expect(["key", "long"], `${hours} ${pref}`).not.toContain(d[i - 1]!.role); });
      let run = 0;
      for (const x of d) { run = x.role === "rest" ? 0 : run + 1; expect(run).toBeLessThanOrEqual(MAX_STREAK); }
      expect(d.filter((x) => x.role !== "rest").length).toBe(sessionsFor(hours, prof({ days: { preferred: pref } })));
    }
  });
  it("dny, kdy nemůžeš, a tvoje úpravy mají přednost", () => {
    const p = prof({ days: { unavailable: [6, 7] } });
    const fixed = fixedFromConstraints([{ date: "2026-11-18", kind: "sport", note: "rest" }, { date: "2026-11-19", kind: "typ", note: "quality" }, { date: "2026-11-19", kind: "sport", note: "ride" }] as Constraint[]);
    const d = solve({ profile: p, fixed });
    expect(d[5]!.role).toBe("rest");
    expect(d[6]!.role).toBe("rest");
    expect(d[2]!.role).toBe("rest");
    expect(d[2]!.userRest).toBe(true);
    expect(d[3]!.role).toBe("key");
  });
  it("zimní mix: běh nejvýš 1× týdně, kvalita a dlouhý na kole", () => {
    const p = prof({ sports: { run: { enabled: true, maxPerWeek: 1, maxMin: 60 } }, mix: [{ months: [11, 12, 1, 2], share: { run: 0.35 } }] });
    const d = solve({ profile: p, hours: 5 });
    const runs = d.filter((x) => x.role !== "rest" && x.sport === "run");
    expect(runs.length).toBe(1);
    expect(runs[0]!.role).toBe("endurance");
    expect(runs[0]!.minutes).toBeLessThanOrEqual(60);
    expect(d.find((x) => x.role === "key")!.sport).toBe("ride");
    expect(d.find((x) => x.role === "long")!.sport).toBe("ride");
  });
  it("jen běh: vše běh, dlouhý běh nepřeroste 1,1× nejdelšího", () => {
    const p = prof({ primary: "run", sports: { ride: { enabled: false } } });
    const d = solve({ profile: p, hours: 4, run: { experienced: true, longest: 70 } });
    expect(d.filter((x) => x.role !== "rest").every((x) => x.sport === "run")).toBe(true);
    expect(d.find((x) => x.role === "long")!.minutes).toBeLessThanOrEqual(77);
  });
  it("drží se dřívější kostry, když se nic zásadního nezmění", () => {
    const p = prof({});
    const a = solve({ profile: p });
    const prev = new Map(a.map((x) => [x.date, x.role] as const));
    const b = solve({ profile: p, prev, weatherBad: new Set(["2026-11-19"]) });
    expect(b.map((x) => x.role)).toEqual(a.map((x) => x.role));
  });
});

// ---------- postup a rozdělení ----------
describe("postup a rozdělení intenzity", () => {
  it("stupeň: posun jen u Zlepšit, ubrání vždy", () => {
    expect(nextLevel(2, "posun", "zvyseni")).toBe(3);
    expect(nextLevel(2, "posun", "udrzeni")).toBe(2);
    expect(nextLevel(2, "ubrat", "udrzeni")).toBe(1);
    expect(outcomeOf({ date: "2026-11-10", plan: null, laps: null, compliance: 97 }).outcome).toBe("posun");
    expect(outcomeOf({ date: "2026-11-10", plan: null, laps: null, compliance: 60 }).outcome).toBe("ubrat");
  });
  it("rozdělení z času v zónách", () => {
    const d = distribution([{ date: "2026-11-10", sport: "ride", moving_s: 7200, hr_z: null, pwr_z: [1800, 4000, 600, 600, 200, 0, 0] }], "2026-11-11");
    expect(d).toMatchObject({ low: 81, mid: 8, high: 11 });
    expect(distribution([], "2026-11-11")).toBeNull();
  });
});

// ---------- simulace ----------
interface SimOpts {
  start: string;
  days: number;
  profile: CoachProfile;
  goal: Goal;
  ctl: number;
  zones?: Zones;
  recovery?: (d: string) => State;
  bad?: (d: string) => boolean;
  extra?: (d: string) => { load: number; min: number; quality: boolean } | null;
  skip?: (d: string) => boolean;
  constraints?: Constraint[];
  seed?: boolean;
}
interface SimDay { date: string; role: string; sport: string; minutes: number; load: number; trained: boolean; key: boolean; ctl: number; indoor: boolean; why: string[] }

function simulate(o: SimOpts) {
  const acts: EngineAct[] = [];
  const metrics = new Map<string, { ctl: number; atl: number }>();
  const stored = new Map<string, StoredWeek>();
  const progress: Record<string, ProgressRow> = {};
  let anchor: Anchor | null = null;
  let m = { ctl: o.ctl, atl: o.ctl };
  // historie: 6 týdnů se 4 jízdami týdně, které drží výchozí kondici
  if (o.seed !== false) for (let i = 42; i >= 1; i--) {
    const d = addDays(o.start, -i);
    if ([2, 4, 6, 7].includes(dow(d))) acts.push({ id: `h${i}`, date: d, sport: o.profile.primary === "run" ? "run" : "ride", load: (o.ctl * 7) / 4, moving_s: ((o.ctl * 7) / 4 / 45) * 3600, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: null });
  }
  metrics.set(addDays(o.start, -1), m);
  const log: SimDay[] = [];
  const weeks: StoredWeek[] = [];
  const input = (T: string): EngineInput => {
    const mon = mondayOf(T);
    const weekLoads = [4, 3, 2, 1].map((w) => Math.round(acts.filter((a) => a.date >= addDays(mon, -7 * w) && a.date < addDays(mon, -7 * (w - 1))).reduce((t, a) => t + (a.load ?? 0), 0)));
    const weather = new Map<string, any>();
    for (let i = 0; i < 9; i++) { const d = addDays(T, i); const bad = !!o.bad?.(d); weather.set(d, { date: d, bad, rain: bad, gusty: false, frost: false, rainProb: bad ? 80 : 10, gustMax: 20, tmax: 12, tmin: 4, window: bad ? null : { from: 10, to: 13 }, text: "", hours: [], rainSum: 0, code: 0 }); }
    return { today: T, goal: o.goal, raceDate: null, anchor, profile: o.profile, zones: o.zones ?? ZONES, acts: acts.filter((a) => a.date > addDays(T, -70)), metric: (d) => metrics.get(d) ?? null, calendar: [], constraints: o.constraints ?? [], weather, weatherOk: true, recovery: o.recovery?.(T) ?? "green", fatigue: { ...NO_FATIGUE, form: m.ctl - m.atl }, weekLoads, stored, progress };
  };
  for (let i = 0; i < o.days; i++) {
    const T = addDays(o.start, i);
    const out = runEngine(input(T));
    for (const w of out.save) stored.set(w.weekStart, JSON.parse(JSON.stringify(w)));
    for (const pr of out.progress) progress[pr.key] = { level: pr.level, last: pr.last };
    if (out.anchor) anchor = out.anchor;
    const w0 = stored.get(mondayOf(T))!;
    if (dow(T) === 1) weeks.push(JSON.parse(JSON.stringify(w0)));
    const d = w0.days.find((x) => x.date === T)!;
    let load = 0, trained = false, key = false;
    if (d.role !== "rest" && !o.skip?.(T)) {
      acts.push({ id: `a${T}`, date: T, sport: d.sport === "ride" ? "ride" : d.sport, load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: 100 });
      load += d.load; trained = true; key = d.role === "key";
    }
    const ex = o.extra?.(T);
    if (ex) { acts.push({ id: `x${T}`, date: T, sport: "ride", load: ex.load, moving_s: ex.min * 60, quality: ex.quality, hr_z: null, pwr_z: null, laps: null, compliance: null }); load += ex.load; trained = true; key = key || ex.quality; }
    m = step(m, load);
    metrics.set(T, m);
    log.push({ date: T, role: d.role, sport: d.sport, minutes: d.minutes, load, trained, key, ctl: m.ctl, indoor: d.indoor, why: d.why });
  }
  return { log, weeks, stored, input, ctl: m.ctl };
}
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const weekSum = (log: SimDay[], mon: string, f: (d: SimDay) => number) => log.filter((d) => d.date >= mon && d.date < addDays(mon, 7)).reduce((t, d) => t + f(d), 0);

const WINTER = prof({ days: { preferred: [5, 6, 7] }, hours: { season: { min: 6, max: 10 }, winter: { min: 3, max: 4 } } });
const SEASON = prof({ hours: { season: { min: 6, max: 10 }, winter: { min: 3, max: 4 } } });

describe("simulace trenéra", () => {
  it("řízený pokles při 3–4 h týdně: kondice opravdu klesá a hodiny drží strop", () => {
    const s = simulate({ start: "2026-11-16", days: 56, profile: WINTER, goal: "pokles", ctl: 45 });
    const byWeek = [0, 1, 2, 3, 4, 5, 6, 7].map((w) => s.log[w * 7 + 6]!.ctl);
    for (let i = 1; i < byWeek.length; i++) expect(byWeek[i]!).toBeLessThan(byWeek[i - 1]!);
    expect(s.ctl).toBeGreaterThan(28);
    expect(s.ctl).toBeLessThan(40);
    for (let w = 0; w < 8; w++) expect(weekSum(s.log, addDays("2026-11-16", 7 * w), (d) => (d.trained ? d.minutes : 0))).toBeLessThanOrEqual(4.5 * 60);
  });
  it("udržení v sezóně: kondice zůstane v ±3 bodech", () => {
    const s = simulate({ start: "2026-06-01", days: 56, profile: SEASON, goal: "udrzeni", ctl: 55 });
    for (const d of s.log.slice(14)) expect(Math.abs(d.ctl - 55)).toBeLessThan(3.5);
  });
  it("jízda navíc: další dny se zkrátí a do 2 týdnů je kondice zpět u plánu", () => {
    const base = simulate({ start: "2026-06-01", days: 28, profile: SEASON, goal: "udrzeni", ctl: 55 });
    const ex = simulate({ start: "2026-06-01", days: 28, profile: SEASON, goal: "udrzeni", ctl: 55, extra: (d) => (d === "2026-06-10" ? { load: 250, min: 330, quality: false } : null) });
    const after = (s: typeof base) => s.log.filter((d) => d.date > "2026-06-10" && d.date <= "2026-06-14").reduce((t, d) => t + d.minutes, 0);
    expect(after(ex)).toBeLessThan(after(base));
    expect(Math.abs(ex.log[27]!.ctl - base.log[27]!.ctl)).toBeLessThan(2.5);
  });
  it("12 týdnů s náhodným počasím, zotavením a vynechanými dny: pravidla platí pořád", () => {
    for (const [seed, profile, goal] of [[1, SEASON, "zvyseni"], [2, WINTER, "udrzeni"], [3, prof({ days: { preferred: [2, 4, 6, 7] }, maxSessions: 5 }), "zvyseni"]] as [number, CoachProfile, Goal][]) {
      const r = rng(seed);
      const table = new Map<string, number>();
      const v = (d: string, k: string) => { const key = d + k; if (!table.has(key)) table.set(key, r()); return table.get(key)!; };
      const s = simulate({ start: "2026-04-06", days: 84, profile, goal, ctl: 45, bad: (d) => v(d, "w") < 0.3, recovery: (d) => (v(d, "r") < 0.1 ? "red" : v(d, "r") < 0.3 ? "yellow" : "green"), skip: (d) => v(d, "s") < 0.1 });
      let run = 0;
      s.log.forEach((d, i) => {
        run = d.trained ? run + 1 : 0;
        expect(run, `${seed} řada ${d.date}`).toBeLessThanOrEqual(MAX_STREAK);
        if (d.key && i > 0) expect(s.log[i - 1]!.key, `${seed} kvalita po kvalitě ${d.date}`).toBe(false);
      });
    }
  });
  it("stejné vstupy = stejný plán, nic se neukládá znovu; přepočet ve čtvrtek nemění po–st", () => {
    const s = simulate({ start: "2026-06-01", days: 10, profile: SEASON, goal: "zvyseni", ctl: 50 });
    const T = "2026-06-11"; // čtvrtek 2. týdne, ráno
    const a = runEngine(s.input(T));
    for (const w of a.save) s.stored.set(w.weekStart, JSON.parse(JSON.stringify(w)));
    const before = JSON.stringify(s.stored.get("2026-06-08")!.days.filter((d) => d.date < T));
    const b = runEngine(s.input(T));
    expect(b.save).toEqual([]);
    expect(JSON.stringify(b.plan.days)).toBe(JSON.stringify(a.plan.days));
    // změna vstupu (🟡 ráno) přepočítá jen dny od čtvrtka
    const c = runEngine({ ...s.input(T), recovery: "yellow" });
    const w = c.save.find((x) => x.weekStart === "2026-06-08") ?? s.stored.get("2026-06-08")!;
    expect(JSON.stringify(w.days.filter((d) => d.date < T))).toBe(before);
  });
  it("Zlepšit: každý 4. týden je lehčí (zátěž 55–75 % předchozího) a kondice za 8 týdnů roste", () => {
    const s = simulate({ start: "2026-04-06", days: 56, profile: SEASON, goal: "zvyseni", ctl: 45 });
    expect(s.weeks.map((w) => w.budget.recoveryWeek)).toEqual([false, false, false, true, false, false, false, true]);
    const l3 = weekSum(s.log, "2026-04-20", (d) => d.load), l4 = weekSum(s.log, "2026-04-27", (d) => d.load);
    expect(l4 / l3).toBeGreaterThan(0.55);
    expect(l4 / l3).toBeLessThan(0.75);
    expect(s.ctl).toBeGreaterThan(48);
  });
  it("pojistka 80/20: plánovaný čas nad Z2 nejvýš 20 % (25 % pod 5 h)", () => {
    for (const [profile, goal, start] of [[SEASON, "zvyseni", "2026-04-06"], [WINTER, "udrzeni", "2026-11-16"], [prof({ hours: { season: { min: 3, max: 4 } } }), "zvyseni", "2026-05-04"]] as [CoachProfile, Goal, string][]) {
      const s = simulate({ start, days: 42, profile, goal, ctl: 45 });
      for (const w of s.weeks) {
        const min = w.days.reduce((t, d) => t + d.minutes, 0), tiz = w.days.reduce((t, d) => t + d.tiz, 0);
        if (min > 0) expect(tiz / min, `${goal} ${w.weekStart}`).toBeLessThanOrEqual(min < 300 ? 0.26 : 0.21);
      }
    }
  });
  it("🟡 ráno v klíčový den: kvalita se přesune, týden jich má stejně", () => {
    const s = simulate({ start: "2026-06-01", days: 7, profile: SEASON, goal: "zvyseni", ctl: 50 });
    const w = s.stored.get("2026-06-08")!;
    const keyDay = w.days.find((d) => d.role === "key")!;
    const morning = s.input(keyDay.date);
    // dny před klíčovým dnem jako odjeté podle plánu
    for (const d of w.days.filter((x) => x.date < keyDay.date && x.role !== "rest")) morning.acts.push({ id: `p${d.date}`, date: d.date, sport: "ride", load: d.load, moving_s: d.minutes * 60, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: 100 });
    const out = runEngine({ ...morning, recovery: "yellow" });
    const nw = out.save.find((x) => x.weekStart === "2026-06-08")!;
    expect(nw.days.find((d) => d.date === keyDay.date)!.role).not.toBe("key");
    expect(nw.days.filter((d) => d.role === "key").length).toBe(w.days.filter((d) => d.role === "key").length);
    expect(out.plan.days.find((d) => d.date === keyDay.date)!.note).toContain("🟡");
  });
  it("🔴 ráno: dnes nejvýš Z1 do 45 min", () => {
    const s = simulate({ start: "2026-06-01", days: 7, profile: SEASON, goal: "zvyseni", ctl: 50 });
    const day = s.stored.get("2026-06-08")!.days.find((d) => d.role === "key" || d.role === "long")!;
    const out = runEngine({ ...s.input(day.date), recovery: "red" });
    const t = out.plan.days.find((d) => d.date === day.date);
    if (t) { expect(["recovery", "rest"]).toContain(t.kind); expect(t.durationMin ?? 0).toBeLessThanOrEqual(45); }
  });
  it("špatné počasí: kvalita na trenažér, Z2 mimo déšť nebo trenažér na 2/3", () => {
    const s = simulate({ start: "2026-06-01", days: 14, profile: SEASON, goal: "udrzeni", ctl: 50, bad: (d) => d >= "2026-06-08" && d <= "2026-06-14" });
    const wk = s.log.filter((d) => d.date >= "2026-06-08" && d.trained);
    expect(wk.length).toBeGreaterThan(0);
    expect(wk.every((d) => d.indoor)).toBe(true);
    expect(wk.some((d) => d.why.some((x) => x.includes("trenažér")))).toBe(true);
  });
  it("nový uživatel bez FTP, bez zón a bez historie dostane platný plán podle tepu", () => {
    const s = simulate({ start: "2026-06-01", days: 14, profile: profileFromHistory([], "2026-06-01"), goal: "udrzeni", ctl: 0, zones: { ftp: null, hr: null, p5: null }, seed: false });
    const trained = s.log.filter((d) => d.trained);
    expect(trained.length).toBeGreaterThanOrEqual(4);
    const out = runEngine(s.input("2026-06-15"));
    const first = out.plan.days.find((d) => d.name)!;
    expect(first.workout!.blocks.every((b) => b.steps.every((st) => !!st.hr))).toBe(true);
    expect(out.plan.changes.length).toBeGreaterThan(0);
    expect(out.plan.coach.version).toBe(2);
  });
  it("nemoc: plán stojí, po návratu dva dny jen lehce a bez kvality", () => {
    const cons = ["2026-06-09", "2026-06-10"].map((date) => ({ date, kind: "nemoc", note: "stav" })) as Constraint[];
    const s = simulate({ start: "2026-06-01", days: 14, profile: SEASON, goal: "zvyseni", ctl: 50, constraints: cons });
    const by = (d: string) => s.log.find((x) => x.date === d)!;
    expect(by("2026-06-09").trained || by("2026-06-10").trained).toBe(false);
    for (const d of ["2026-06-11", "2026-06-12"]) { expect(by(d).key).toBe(false); expect(by(d).minutes).toBeLessThanOrEqual(60); }
  });
});
