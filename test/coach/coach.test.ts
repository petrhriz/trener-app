import { describe, expect, it } from "vitest";
import { addDays, dow, mondayOf } from "../../src/lib/time";
import { step } from "../../src/core/fitness";
import type { Goal } from "../../src/core/fitness";
import type { State } from "../../src/core/recovery";
import type { Constraint } from "../../src/core/plan";
import { validate } from "../../src/core/workout";
import type { HrZones } from "../../src/core/zones";
import { type Recent, LOAD_PER_RAMP, NO_FATIGUE, ctlAfterWeek, fatigueFactor, loadForRamp, weekTarget } from "../../src/core/coach/target";
import { type EngineAct, type EngineInput, type ProgressRow, type StoredWeek, fixedFromConstraints, runEngine } from "../../src/core/coach/engine";
import { type Cat, type Zones, CATS, TIERS, buildWorkout, catCandidates, chooseCat, isCat, libById, pickLib, tierOf } from "../../src/core/coach/library";
import { type CoachProfile, DEFAULT_PROFILE, profileFromHistory, profileSummary, validateProfile } from "../../src/core/coach/profile";
import { distribution, nextLevel, outcomeOf } from "../../src/core/coach/progress";
import { type PastDay, MAX_STREAK, solveWeek } from "../../src/core/coach/week";
import { LIBRARY } from "../../src/core/coach/workouts.data";

const HR: HrZones = { floors: [98, 135, 164, 185, 205], max: 215, lthr: 196, rest: 45 };
const ZONES: Zones = { ftp: 298, hr: HR };
const prof = (x: Record<string, unknown>): CoachProfile => validateProfile(x).profile;
const RIDER = prof({});

// ---------- profil ----------
describe("profil sportovce", () => {
  it("je malý: hlavní sport, další sporty, sníh; starší podoba s hodinami a dny se přijme a zbytek zahodí", () => {
    const r = validateProfile({ primary: "plavani", sports: { run: { enabled: true, maxPerWeek: 1 } }, hours: { winter: { min: 3, max: 4 } }, days: { preferred: [5, 6, 7] } });
    expect(r.errors.length).toBe(1);
    expect(r.profile).toEqual({ ...DEFAULT_PROFILE, sports: { ...DEFAULT_PROFILE.sports, run: { enabled: true, quality: false } } });
    expect(profileSummary(r.profile).join(" ")).toContain("Občas taky: běh");
  });
  it("profil z historie: běžec dostane hlavní sport běh", () => {
    const acts = [];
    for (let w = 1; w <= 12; w++) for (const d of [1, 3, 5]) acts.push({ date: addDays("2026-11-09", -7 * w + d), sport: "run" as const, moving_s: 3600 });
    expect(profileFromHistory(acts, "2026-11-11").primary).toBe("run");
    expect(profileFromHistory([], "2026-11-11").primary).toBe("ride");
  });
});

// ---------- cíl zátěže týdne (modelové příklady) ----------
const REC: Recent = { weekLoads: [300, 310, 305, 300], weekSessions: [4, 4, 4, 4], longestMin: 150, typicalMin: 80, provenRamp: 2 };
const target = (x: Partial<Parameters<typeof weekTarget>[0]>) =>
  weekTarget({ weekStart: "2026-06-15", goal: "udrzeni", raceDate: null, ctl: 45, recent: REC, cycleIdx: 1, fatigue: NO_FATIGUE, easyRate: 45, ...x });

describe("cíl zátěže týdne", () => {
  it("vzorec: zátěž = 7 × kondice + 45,6 × růst, ověřeno výpočtem po dnech", () => {
    expect(LOAD_PER_RAMP).toBeCloseTo(45.6, 0);
    for (const [ctl, ramp] of [[45, 0], [45, -1], [45, 2], [80, 3], [20, 1]]) {
      const load = loadForRamp(ctl!, ramp!);
      let c = { ctl: ctl!, atl: ctl! };
      for (let i = 0; i < 7; i++) c = step(c, load / 7);
      expect(c.ctl, `${ctl}/${ramp}`).toBeCloseTo(ctl! + ramp!, 1);
      expect(ctlAfterWeek(ctl!, load)).toBeCloseTo(ctl! + ramp!, 5);
    }
  });
  it("PŘÍKLAD 1 – skutečný stav (listopad, kondice 43, poslední týdny 330 / 52 / 150 / 43): žádných 300+, žádné 2–3h jízdy", () => {
    const petr: Recent = { weekLoads: [330, 52, 150, 43], weekSessions: [3, 2, 2, 1], longestMin: 98, typicalMin: 67, provenRamp: 2.4 };
    for (const goal of ["udrzeni", "pokles", "zvyseni"] as Goal[]) {
      const b = target({ weekStart: "2026-11-16", goal, ctl: 43, recent: petr });
      expect(b.keepLoad).toBe(301); // tolik by bylo potřeba na udržení kondice 43
      expect(b.recentLoad).toBe(106); // novější týdny váží víc: (330 + 2×52 + 3×150 + 4×43) / 10
      expect(b.load, goal).toBe(146); // strop: +40 proti posledním týdnům
      expect(b.sessions, goal).toBe(2);
      expect(b.keys, goal).toBe(1);
      expect(b.caps, goal).toEqual({ easy: 75, long: 120, key: 60 });
      expect(b.notes.join(" ")).toContain("Na udržení kondice 43 by bylo potřeba asi 301");
      expect(b.notes.join(" ")).toContain("v zimě je to v pořádku");
    }
  });
  it("PŘÍKLAD 2 – pravidelný jezdec v sezóně: Udržet = 7 × kondice, Zlepšit o 2 body týdně víc, Pokles míň", () => {
    const u = target({ ctl: 45 });
    expect(u.load).toBe(315);
    expect(u.phase).toBe("maintain");
    const z = target({ goal: "zvyseni", ctl: 45, recent: { ...REC, weekLoads: [330, 340, 335, 330] } });
    expect(z.phase).toBe("build");
    expect(z.load).toBe(Math.round(315 + 2 * LOAD_PER_RAMP));
    // kdo poslední měsíc jezdil míň, dostane nejvýš +30 % proti svému průměru
    expect(target({ goal: "zvyseni", ctl: 45 }).load).toBe(Math.round(304 * 1.3));
    expect(z.keys).toBe(2);
    expect(z.ctlTarget).toBeCloseTo(47, 0);
    const p = target({ goal: "pokles", ctl: 45 });
    expect(p.load).toBe(Math.round(315 - LOAD_PER_RAMP));
    expect(p.ctlTarget).toBeCloseTo(44, 0);
  });
  it("PŘÍKLAD 3 – zima a cíl Zlepšit: jen základ (+1 bod týdně), jedna kvalita, kratší jízdy", () => {
    const b = target({ weekStart: "2026-12-07", goal: "zvyseni", ctl: 45 });
    expect(b.phase).toBe("base");
    expect(b.keys).toBe(1);
    expect(b.caps.long).toBeLessThanOrEqual(120);
    expect(b.caps.easy).toBeLessThanOrEqual(75);
    expect(b.caps.key).toBe(60);
    expect(b.load).toBeLessThan(Math.round(315 + LOAD_PER_RAMP)); // do krátkých zimních jízd se víc nevejde
  });
  it("PŘÍKLAD 4 – lehčí týden: každý 4. týden bloku 65 % zátěže, jedna kvalita", () => {
    const b3 = target({ goal: "zvyseni", cycleIdx: 3 }), b4 = target({ goal: "zvyseni", cycleIdx: 4 });
    expect(b4.recoveryWeek).toBe(true);
    expect(b4.load / b3.load).toBeCloseTo(0.65, 1);
    expect(b4.keys).toBe(1);
    expect(target({ goal: "udrzeni", cycleIdx: 4 }).recoveryWeek).toBe(false); // udržování lehčí týden nepotřebuje
  });
  it("PŘÍKLAD 5 – návrat po pauze (kondice 50, tři týdny nic): začíná se malým týdnem, ne podle kondice", () => {
    const b = target({ ctl: 50, recent: { weekLoads: [340, 0, 0, 0], weekSessions: [4, 0, 0, 0], longestMin: 0, typicalMin: null, provenRamp: 2 } });
    expect(b.load).toBeLessThanOrEqual(100); // poslední týdny skoro nic → začíná se od nejmenšího týdne
    expect(b.sessions).toBeLessThanOrEqual(3);
    expect(b.caps.long).toBeLessThanOrEqual(90);
  });
  it("PŘÍKLAD 6 – začátečník bez historie: opatrný první týden", () => {
    const b = target({ ctl: 0, recent: { weekLoads: [], weekSessions: [], longestMin: 0, typicalMin: null, provenRamp: null } });
    expect(b.load).toBeLessThanOrEqual(150);
    expect(b.sessions).toBeLessThanOrEqual(3);
  });
  it("PŘÍKLAD 7 – únava jen ubírá; rozvoj je omezený tím, co sportovec v historii unesl", () => {
    expect(fatigueFactor(NO_FATIGUE).factor).toBe(1);
    expect(fatigueFactor({ ...NO_FATIGUE, form: -32 }).factor).toBe(0.8);
    expect(fatigueFactor({ ...NO_FATIGUE, illnessDays: 5 }).keysMax).toBe(0);
    expect(target({ fatigue: { ...NO_FATIGUE, form: -32 } }).load).toBe(Math.round(315 * 0.8));
    expect(target({ goal: "zvyseni", recent: { ...REC, provenRamp: 5 } }).ramp).toBe(3);
    expect(target({ goal: "zvyseni", recent: { ...REC, provenRamp: 0.4 } }).ramp).toBe(1.5);
    expect(target({ goal: "zvyseni" }).tsbFloor).toBe(-30);
    expect(target({}).tsbFloor).toBe(-20);
  });
});

// ---------- knihovna ----------
describe("knihovna tréninků", () => {
  it("má všech 8 kategorií a každý trénink dá platný workout s watty (venku i na trenažéru)", () => {
    expect(LIBRARY.length).toBeGreaterThan(150);
    for (const c of CATS) expect(LIBRARY.filter((w) => w.c === c).length, c).toBeGreaterThanOrEqual(12);
    expect(new Set(LIBRARY.map((w) => w.id)).size).toBe(LIBRARY.length);
    for (const w of LIBRARY)
      for (const indoor of [false, true]) {
        const b = buildWorkout({ sport: "ride", family: w.c as Cat, level: 0, wid: w.id, minutes: 75, indoor, zones: ZONES });
        expect(validate(b.workout), w.id).toEqual([]);
        expect(b.wid).toBe(w.id);
        expect(b.tizMin).toBeGreaterThan(0);
        expect(b.load, w.id).toBeGreaterThan(15);
        expect(b.load, w.id).toBeLessThan(170);
      }
    for (const f of ["rec", "end", "long", "ff"] as const) expect(validate(buildWorkout({ sport: "ride", family: f, level: 1, minutes: 120, indoor: false, zones: ZONES }).workout), f).toEqual([]);
  });
  it("stupně náročnosti rostou a výběr se drží stupně a délky dne", () => {
    for (const c of CATS) {
      const avg = (t: number) => { const v = LIBRARY.filter((w) => w.c === c && tierOf(w) === t).map((w) => w.s); return v.reduce((a, b) => a + b, 0) / v.length; };
      for (let t = 1; t < TIERS; t++) expect(avg(t), `${c} ${t}`).toBeGreaterThanOrEqual(avg(t - 1));
      const w = pickLib({ cat: c, tier: 2, maxMain: 45, maxTiz: null, avoidIds: [], avoidShapes: [], seed: "2026-06-02" });
      expect(w.m).toBeLessThanOrEqual(45);
      expect(Math.abs(tierOf(w) - 2)).toBeLessThanOrEqual(2);
    }
  });
  it("pestrost: nedávno jeté tréninky a tvary se nevyberou znovu", () => {
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const w = pickLib({ cat: "thr", tier: 2, maxMain: 50, maxTiz: null, avoidIds: seen, avoidShapes: seen.slice(-4).map((id) => libById(id)!.n), seed: `d${i}` });
      expect(seen).not.toContain(w.id);
      seen.push(w.id);
    }
    expect(new Set(seen.map((id) => libById(id)!.n)).size).toBeGreaterThanOrEqual(4);
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
    expect(k.name).toContain("práh"); // běh VO2 podle tepu nemá → práh
    expect(k.workout.blocks.find((x) => x.kind === "work")!.steps[0]!.hrLo).toBe(185);
    expect(k.minutes).toBeLessThanOrEqual(60);
  });
  it("bez FTP a bez zón vyjde platný trénink podle tepu", () => {
    const b = buildWorkout({ sport: "ride", family: "thr", level: 1, minutes: 75, indoor: false, zones: { ftp: null, hr: null } });
    expect(b.workout.blocks.find((x) => x.kind === "work")!.steps[0]!.hr).toBe("Z4 HR");
    expect(b.load).toBeGreaterThan(30);
  });
  it("kategorie kvality: střídá se, dvakrát totéž po sobě nejde, data mají slovo", () => {
    const cands = catCandidates("build", { recoveryWeek: false, winter: false });
    const a = chooseCat({ cands, exclude: [], lastUse: {}, date: "2026-06-02", needs: {} });
    expect(a.cat).toBe("thr");
    const b = chooseCat({ cands, exclude: ["thr"], lastUse: { thr: "2026-06-02" }, date: "2026-06-05", needs: {} });
    expect(b.cat).not.toBe("thr");
    const same = Object.fromEntries(cands.map((x) => [x, "2026-05-20"]));
    const c = chooseCat({ cands, exclude: [], lastUse: same, date: "2026-06-02", needs: { vo2: { score: 6, text: "5min výkon za 6 týdnů klesl o 4 %" } } });
    expect(c.cat).toBe("vo2");
    expect(c.why).toContain("klesl o 4 %");
    expect(catCandidates("build", { recoveryWeek: true, winter: false })[0]).toBe("nm");
  });
});

// ---------- kostra týdne ----------
const noPast = new Map<string, PastDay>();
const solve = (x: Partial<Parameters<typeof solveWeek>[0]>) =>
  solveWeek({ weekStart: "2026-11-16", from: "2026-11-16", profile: RIDER, load: 300, doneLoad: 0, sessions: 4, keys: 1, long: true, rate: 45, caps: { easy: 90, long: 150, key: 60 }, past: noPast, fixed: new Map(), weatherBad: new Set(), prev: null, noKey: new Set(), easyOnly: new Set(), run: { experienced: false, longest: 0 }, ...x });
const shape = (d: ReturnType<typeof solve>) => d.map((x) => x.role[0]).join("");

describe("kostra týdne", () => {
  it("délky vycházejí ze zátěže týdne a drží stropy: malý týden = krátké jízdy", () => {
    const small = solve({ load: 187, sessions: 3, caps: { easy: 75, long: 105, key: 60 } });
    for (const x of small.filter((y) => y.role !== "rest")) expect(x.minutes, x.role).toBeLessThanOrEqual(105);
    expect(small.reduce((t, x) => t + x.minutes, 0)).toBeLessThanOrEqual(4 * 60);
    const big = solve({ load: 450, sessions: 5, caps: { easy: 120, long: 240, key: 75 } });
    expect(big.find((x) => x.role === "long")!.minutes).toBeGreaterThan(small.find((x) => x.role === "long")!.minutes);
    expect(big.find((x) => x.role === "long")!.minutes).toBeLessThanOrEqual(240);
  });
  it("bez nastavení dnů: kvalita po volnu, dlouhý o víkendu, pondělí volno", () => {
    const d = solve({});
    expect(d.filter((x) => x.role !== "rest").length).toBe(4);
    expect(d[0]!.role).toBe("rest");
    expect(dow(d.find((x) => x.role === "long")!.date)).toBeGreaterThanOrEqual(6);
    const k = d.findIndex((x) => x.role === "key");
    expect(d[k - 1]!.role).toBe("rest");
  });
  it("řada přes hranu týdne: po pá–so–ne tréninku musí být pondělí volno", () => {
    const past = new Map<string, PastDay>(["2026-11-13", "2026-11-14", "2026-11-15"].map((d) => [d, { trained: true, hard: false, key: false, minutes: 90, sport: "ride" as const }]));
    expect(solve({ past, sessions: 6, load: 450 })[0]!.role).toBe("rest");
  });
  it("klíčový den nikdy den po klíčovém ani po dlouhém, nejvýš 3 dny za sebou", () => {
    for (const sessions of [2, 3, 4, 5, 6]) for (const keys of [1, 2]) {
      const d = solve({ sessions, keys, load: sessions * 70 });
      d.forEach((x, i) => { if (x.role === "key" && i > 0) expect(["key", "long"], `${sessions}/${keys}`).not.toContain(d[i - 1]!.role); });
      let run = 0;
      for (const x of d) { run = x.role === "rest" ? 0 : run + 1; expect(run).toBeLessThanOrEqual(MAX_STREAK); }
      expect(d.filter((x) => x.role !== "rest").length).toBe(sessions);
    }
  });
  it("když zbývá málo dnů, zůstane to důležité: kvalita a dlouhý, vytrvalost propadne", () => {
    // pátek, v týdnu se zatím nic nejelo
    const d = solve({ from: "2026-11-20", sessions: 4, keys: 1 });
    expect(d.map((x) => x.role).sort()).toEqual(["endurance", "key", "long"].sort());
    const d2 = solve({ from: "2026-11-21", sessions: 4, keys: 1 });
    expect(d2.map((x) => x.role).sort()).toEqual(["key", "long"]);
  });
  it("tvoje úpravy mají přednost a zbytek se přeskládá kolem nich", () => {
    const base = solve({});
    const keyDay = base.find((x) => x.role === "key")!.date;
    const other = base.find((x) => x.role === "rest" && x.date > keyDay && x.date !== addDays(keyDay, 1))?.date ?? addDays(keyDay, 2);
    // přetažení kvality na jiný den + volno na původním
    const fixed = fixedFromConstraints([{ date: keyDay, kind: "sport", note: "rest" }, { date: other, kind: "sport", note: "ride" }, { date: other, kind: "typ", note: "quality" }] as Constraint[]);
    const d = solve({ fixed, prev: new Map(base.map((x) => [x.date, x.role] as const)) });
    expect(d.find((x) => x.date === keyDay)!.userRest).toBe(true);
    expect(d.find((x) => x.date === other)!.role).toBe("key");
    expect(d.filter((x) => x.role === "key").length).toBe(1);
    d.forEach((x, i) => { if (x.role === "key" && i > 0) expect(d[i - 1]!.role).not.toBe("long"); });
    let run = 0;
    for (const x of d) { run = x.role === "rest" ? 0 : run + 1; expect(run).toBeLessThanOrEqual(MAX_STREAK); }
  });
  it("občas běh: jednou týdně místo vytrvalosti, kvalita a dlouhý na kole", () => {
    const d = solve({ profile: prof({ sports: { run: { enabled: true } } }), sessions: 4, run: { experienced: false, longest: 40 } });
    const runs = d.filter((x) => x.role !== "rest" && x.sport === "run");
    expect(runs.length).toBe(1);
    expect(runs[0]!.role).toBe("endurance");
    expect(runs[0]!.minutes).toBeLessThanOrEqual(45);
    expect(d.find((x) => x.role === "key")!.sport).toBe("ride");
    expect(d.find((x) => x.role === "long")!.sport).toBe("ride");
    // tři tréninky týdně: běh nevezme kolu poslední vytrvalostní den
    expect(solve({ profile: prof({ sports: { run: { enabled: true } } }), sessions: 3, load: 200 }).filter((x) => x.sport === "run" && x.role !== "rest").length).toBe(0);
  });
  it("jen běh: vše běh, dlouhý běh nepřeroste 1,1× nejdelšího", () => {
    const d = solve({ profile: prof({ primary: "run", sports: { ride: { enabled: false } } }), load: 220, sessions: 4, run: { experienced: true, longest: 70 } });
    expect(d.filter((x) => x.role !== "rest").every((x) => x.sport === "run")).toBe(true);
    expect(d.find((x) => x.role === "long")!.minutes).toBeLessThanOrEqual(77);
  });
  it("drží se dřívější kostry, když se nic zásadního nezmění", () => {
    const a = solve({});
    const b = solve({ prev: new Map(a.map((x) => [x.date, x.role] as const)), weatherBad: new Set(["2026-11-19"]) });
    expect(shape(b)).toBe(shape(a));
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
  profile?: CoachProfile;
  goal: Goal;
  ctl: number;
  zones?: Zones;
  recovery?: (d: string) => State;
  bad?: (d: string) => boolean;
  extra?: (d: string) => { load: number; min: number; quality: boolean } | null;
  skip?: (d: string, role: string) => boolean;
  constraints?: Constraint[];
  seed?: boolean;
}
interface SimDay { date: string; role: string; sport: string; minutes: number; load: number; trained: boolean; key: boolean; ctl: number; indoor: boolean; why: string[]; name: string | null; family: string | null; wid: string | null; reason: string }

function simulate(o: SimOpts) {
  const profile = o.profile ?? RIDER;
  const acts: EngineAct[] = [];
  const metrics = new Map<string, { ctl: number; atl: number }>();
  const stored = new Map<string, StoredWeek>();
  const progress: Record<string, ProgressRow> = {};
  let m = { ctl: o.ctl, atl: o.ctl };
  // historie: 8 týdnů se 4 tréninky týdně, které drží výchozí kondici
  if (o.seed !== false) for (let i = 63; i >= 1; i--) {
    const d = addDays(o.start, -i);
    if ([2, 4, 6, 7].includes(dow(d))) acts.push({ id: `h${i}`, date: d, sport: profile.primary === "run" ? "run" : "ride", load: (o.ctl * 7) / 4, moving_s: ((o.ctl * 7) / 4 / 45) * 3600, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: null });
  }
  metrics.set(addDays(o.start, -1), m);
  const log: SimDay[] = [];
  const weeks: StoredWeek[] = [];
  const input = (T: string): EngineInput => {
    const mon = mondayOf(T);
    const weekLoads = [4, 3, 2, 1].map((w) => Math.round(acts.filter((a) => a.date >= addDays(mon, -7 * w) && a.date < addDays(mon, -7 * (w - 1))).reduce((t, a) => t + (a.load ?? 0), 0)));
    const weather = new Map<string, any>();
    for (let i = 0; i < 9; i++) { const d = addDays(T, i); const bad = !!o.bad?.(d); weather.set(d, { date: d, bad, rain: bad, gusty: false, frost: false, rainProb: bad ? 80 : 10, gustMax: 20, tmax: 12, tmin: 4, window: bad ? null : { from: 10, to: 13 }, text: "", hours: [], rainSum: 0, code: 0 }); }
    return { today: T, goal: o.goal, raceDate: null, profile, zones: o.zones ?? ZONES, acts: acts.filter((a) => a.date > addDays(T, -70)), power: [], metric: (d) => metrics.get(d) ?? null, calendar: [], constraints: o.constraints ?? [], weather, weatherOk: true, recovery: o.recovery?.(T) ?? "green", fatigue: { ...NO_FATIGUE, form: m.ctl - m.atl }, weekLoads, stored, progress };
  };
  for (let i = 0; i < o.days; i++) {
    const T = addDays(o.start, i);
    const out = runEngine(input(T));
    for (const w of out.save) stored.set(w.weekStart, JSON.parse(JSON.stringify(w)));
    for (const pr of out.progress) progress[pr.key] = { level: pr.level, last: pr.last };
    const w0 = stored.get(mondayOf(T))!;
    if (dow(T) === 1) weeks.push(JSON.parse(JSON.stringify(w0)));
    const d = w0.days.find((x) => x.date === T)!;
    let load = 0, trained = false, key = false;
    if (d.role !== "rest" && !o.skip?.(T, d.role)) {
      acts.push({ id: `a${T}`, date: T, sport: d.sport === "ride" ? "ride" : d.sport, load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: 100 });
      load += d.load; trained = true; key = d.role === "key";
    }
    const ex = o.extra?.(T);
    if (ex) { acts.push({ id: `x${T}`, date: T, sport: "ride", load: ex.load, moving_s: ex.min * 60, quality: ex.quality, hr_z: null, pwr_z: null, laps: null, compliance: null }); load += ex.load; trained = true; key = key || ex.quality; }
    m = step(m, load);
    metrics.set(T, m);
    log.push({ date: T, role: d.role, sport: d.sport, minutes: d.minutes, load, trained, key, ctl: m.ctl, indoor: d.indoor, why: d.why, name: d.name, family: d.family, wid: d.wid, reason: d.reason });
  }
  return { log, weeks, stored, input, ctl: m.ctl };
}
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const weekSum = (log: SimDay[], mon: string, f: (d: SimDay) => number) => log.filter((d) => d.date >= mon && d.date < addDays(mon, 7)).reduce((t, d) => t + f(d), 0);
const WITH_RUN = prof({ sports: { run: { enabled: true } } });

describe("simulace trenéra", () => {
  it("kvality jsou pestré: nikdy dvakrát stejná kategorie po sobě ani stejný trénink brzy znovu", () => {
    for (const [goal, start] of [["zvyseni", "2026-04-06"], ["udrzeni", "2026-11-16"], ["pokles", "2026-11-16"]] as [Goal, string][]) {
      const s = simulate({ start, days: 70, goal, ctl: 45 });
      const keys = s.log.filter((d) => d.role === "key" && d.trained);
      expect(keys.length, goal).toBeGreaterThanOrEqual(8);
      keys.forEach((k, i) => {
        expect(isCat(k.family)).toBe(true);
        if (i > 0) expect(k.family, `${goal} ${k.date}`).not.toBe(keys[i - 1]!.family);
        expect(keys.slice(Math.max(0, i - 5), i).map((x) => x.wid), `${goal} ${k.date}`).not.toContain(k.wid);
      });
      expect(new Set(keys.map((k) => k.family)).size, goal).toBeGreaterThanOrEqual(3);
      expect(new Set(keys.map((k) => k.name)).size, goal).toBeGreaterThanOrEqual(keys.length - 1);
    }
  });
  it("každý trénink má napsaný účel", () => {
    const s = simulate({ start: "2026-06-01", days: 14, goal: "zvyseni", ctl: 50 });
    for (const d of s.log.filter((x) => x.role !== "rest")) expect(d.reason.length, `${d.date} ${d.role}`).toBeGreaterThan(15);
    const out = runEngine(s.input("2026-06-15"));
    const k = out.plan.days.find((d) => d.kind === "quality")!;
    expect(k.note).toMatch(/zvedá|učí|svalová|krátký|sprint|hodně času/);
  });
  it("vynechaná kvalita se sama posune na další vhodný den, vytrvalost propadne", () => {
    const base = simulate({ start: "2026-06-01", days: 14, goal: "udrzeni", ctl: 50 });
    const keyDay = base.log.find((d) => d.date >= "2026-06-08" && d.role === "key")!.date;
    const s = simulate({ start: "2026-06-01", days: 14, goal: "udrzeni", ctl: 50, skip: (d) => d === keyDay });
    const wk = s.log.filter((d) => d.date >= "2026-06-08");
    const moved = wk.find((d) => d.date > keyDay && d.role === "key" && d.trained);
    expect(moved, "kvalita se přesunula").toBeTruthy();
    expect(wk.filter((d) => d.key).length).toBe(1);
  });
  it("řízený pokles: nabídka je menší a kondice opravdu klesá", () => {
    const s = simulate({ start: "2026-11-16", days: 56, goal: "pokles", ctl: 45 });
    const byWeek = [0, 1, 2, 3, 4, 5, 6, 7].map((w) => s.log[w * 7 + 6]!.ctl);
    for (let i = 1; i < byWeek.length; i++) expect(byWeek[i]!).toBeLessThan(byWeek[i - 1]! + 0.05);
    expect(s.ctl).toBeLessThan(41);
    expect(s.ctl).toBeGreaterThan(25);
    expect(s.weeks[0]!.budget.load).toBeLessThan(45 * 7);
    expect(s.weeks[0]!.budget.phase).toBe("offseason");
  });
  it("udržení: kondice zůstane zhruba stejná", () => {
    const s = simulate({ start: "2026-06-01", days: 56, goal: "udrzeni", ctl: 50 });
    for (const d of s.log.slice(14)) expect(Math.abs(d.ctl - 50)).toBeLessThan(6);
  });
  it("jízda navíc: další dny se zkrátí", () => {
    const base = simulate({ start: "2026-06-01", days: 21, goal: "udrzeni", ctl: 50 });
    const ex = simulate({ start: "2026-06-01", days: 21, goal: "udrzeni", ctl: 50, extra: (d) => (d === "2026-06-10" ? { load: 250, min: 330, quality: false } : null) });
    const after = (s: typeof base) => s.log.filter((d) => d.date > "2026-06-10" && d.date <= "2026-06-14").reduce((t, d) => t + d.minutes, 0);
    expect(after(ex)).toBeLessThan(after(base));
  });
  it("12 týdnů s náhodným počasím, zotavením a vynechanými dny: pravidla platí pořád", () => {
    for (const [seed, profile, goal] of [[1, RIDER, "zvyseni"], [2, WITH_RUN, "udrzeni"], [3, RIDER, "pokles"]] as [number, CoachProfile, Goal][]) {
      const r = rng(seed);
      const table = new Map<string, number>();
      const v = (d: string, k: string) => { const key = d + k; if (!table.has(key)) table.set(key, r()); return table.get(key)!; };
      const s = simulate({ start: "2026-04-06", days: 84, profile, goal, ctl: 45, bad: (d) => v(d, "w") < 0.3, recovery: (d) => (v(d, "r") < 0.1 ? "red" : v(d, "r") < 0.3 ? "yellow" : "green"), skip: (d) => v(d, "s") < 0.15 });
      let run = 0;
      s.log.forEach((d, i) => {
        run = d.trained ? run + 1 : 0;
        expect(run, `${seed} řada ${d.date}`).toBeLessThanOrEqual(MAX_STREAK);
        if (d.key && i > 0) expect(s.log[i - 1]!.key, `${seed} kvalita po kvalitě ${d.date}`).toBe(false);
      });
    }
  });
  it("stejné vstupy = stejný plán, nic se neukládá znovu; přepočet ve čtvrtek nemění po–st", () => {
    const s = simulate({ start: "2026-06-01", days: 10, goal: "zvyseni", ctl: 50 });
    const T = "2026-06-11"; // čtvrtek 2. týdne, ráno
    const a = runEngine(s.input(T));
    for (const w of a.save) s.stored.set(w.weekStart, JSON.parse(JSON.stringify(w)));
    const before = JSON.stringify(s.stored.get("2026-06-08")!.days.filter((d) => d.date < T));
    const b = runEngine(s.input(T));
    expect(b.save).toEqual([]);
    expect(JSON.stringify(b.plan.days)).toBe(JSON.stringify(a.plan.days));
    const c = runEngine({ ...s.input(T), recovery: "yellow" });
    const w = c.save.find((x) => x.weekStart === "2026-06-08") ?? s.stored.get("2026-06-08")!;
    expect(JSON.stringify(w.days.filter((d) => d.date < T))).toBe(before);
  });
  it("Zlepšit: každý 4. týden je lehčí a kondice za 8 týdnů neklesne", () => {
    const s = simulate({ start: "2026-04-06", days: 56, goal: "zvyseni", ctl: 45 });
    expect(s.weeks.map((w) => w.budget.recoveryWeek)).toEqual([false, false, false, true, false, false, false, true]);
    const l3 = weekSum(s.log, "2026-04-20", (d) => d.load), l4 = weekSum(s.log, "2026-04-27", (d) => d.load);
    expect(l4 / l3).toBeGreaterThan(0.5);
    expect(l4 / l3).toBeLessThan(0.8);
    expect(s.log[48]!.ctl).toBeGreaterThan(45.5);
  });
  it("pojistka 80/20: plánovaný čas nad Z2 nejvýš 20 % (25 % pod 5 h)", () => {
    for (const [goal, start, ctl] of [["zvyseni", "2026-04-06", 45], ["udrzeni", "2026-11-16", 45], ["udrzeni", "2026-05-04", 22]] as [Goal, string, number][]) {
      const s = simulate({ start, days: 42, goal, ctl });
      for (const w of s.weeks) {
        const min = w.days.reduce((t, d) => t + d.minutes, 0), tiz = w.days.reduce((t, d) => t + d.tiz, 0);
        if (min > 0) expect(tiz / min, `${goal} ${w.weekStart}`).toBeLessThanOrEqual(min < 300 ? 0.27 : 0.22);
      }
    }
  });
  it("🟡 ráno v klíčový den: kvalita se přesune, týden jich má stejně", () => {
    const s = simulate({ start: "2026-06-01", days: 7, goal: "zvyseni", ctl: 50 });
    const w = s.stored.get("2026-06-08")!;
    const keyDay = w.days.find((d) => d.role === "key")!;
    const morning = s.input(keyDay.date);
    for (const d of w.days.filter((x) => x.date < keyDay.date && x.role !== "rest")) morning.acts.push({ id: `p${d.date}`, date: d.date, sport: "ride", load: d.load, moving_s: d.minutes * 60, quality: false, hr_z: null, pwr_z: null, laps: null, compliance: 100 });
    const out = runEngine({ ...morning, recovery: "yellow" });
    const nw = out.save.find((x) => x.weekStart === "2026-06-08")!;
    expect(nw.days.find((d) => d.date === keyDay.date)!.role).not.toBe("key");
    expect(nw.days.filter((d) => d.role === "key").length).toBe(w.days.filter((d) => d.role === "key").length);
    expect(out.plan.days.find((d) => d.date === keyDay.date)!.note).toContain("🟡");
  });
  it("🔴 ráno: dnes nejvýš Z1 do 45 min", () => {
    const s = simulate({ start: "2026-06-01", days: 7, goal: "zvyseni", ctl: 50 });
    const day = s.stored.get("2026-06-08")!.days.find((d) => d.role === "key" || d.role === "long")!;
    const out = runEngine({ ...s.input(day.date), recovery: "red" });
    const t = out.plan.days.find((d) => d.date === day.date);
    if (t) { expect(["recovery", "rest"]).toContain(t.kind); expect(t.durationMin ?? 0).toBeLessThanOrEqual(45); }
  });
  it("špatné počasí: kvalita na trenažér, Z2 na trenažér na 2/3", () => {
    const s = simulate({ start: "2026-06-01", days: 14, goal: "udrzeni", ctl: 50, bad: (d) => d >= "2026-06-08" && d <= "2026-06-14" });
    const wk = s.log.filter((d) => d.date >= "2026-06-08" && d.trained);
    expect(wk.length).toBeGreaterThan(0);
    expect(wk.every((d) => d.indoor)).toBe(true);
    expect(wk.some((d) => d.why.some((x) => x.includes("trenažér")))).toBe(true);
  });
  it("nový uživatel bez FTP, bez zón a bez historie dostane platný plán podle tepu", () => {
    const s = simulate({ start: "2026-06-01", days: 14, profile: profileFromHistory([], "2026-06-01"), goal: "udrzeni", ctl: 0, zones: { ftp: null, hr: null }, seed: false });
    expect(s.log.filter((d) => d.trained).length).toBeGreaterThanOrEqual(4);
    const out = runEngine(s.input("2026-06-15"));
    const first = out.plan.days.find((d) => d.name)!;
    expect(first.workout!.blocks.every((b) => b.steps.every((st) => !!st.hr))).toBe(true);
    expect(out.plan.changes.length).toBeGreaterThan(0);
    expect(out.plan.coach.version).toBe(2);
  });
  it("nemoc: plán stojí, po návratu dva dny jen lehce a bez kvality", () => {
    const cons = ["2026-06-09", "2026-06-10"].map((date) => ({ date, kind: "nemoc", note: "stav" })) as Constraint[];
    const s = simulate({ start: "2026-06-01", days: 14, goal: "zvyseni", ctl: 50, constraints: cons });
    const by = (d: string) => s.log.find((x) => x.date === d)!;
    expect(by("2026-06-09").trained || by("2026-06-10").trained).toBe(false);
    for (const d of ["2026-06-11", "2026-06-12"]) { expect(by(d).key).toBe(false); expect(by(d).minutes).toBeLessThanOrEqual(60); }
  });
});
