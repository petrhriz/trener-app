// Generátor modelových sportovců a jejich historie pro zátěžové testy trenéra. Nic tu není vázané na jednoho
// uživatele: hlavní sport, objem, rozložení dní, wattmetr, věk, úroveň, další sporty i výpadky jsou náhodné.
// Vše je deterministické podle seedu – selhání jde vždy zopakovat (seed je ve zprávě).
import { type CoachInput } from "../../../src/core/coach/engine";
import { DEFAULT_PROFILE, type CoachProfile } from "../../../src/core/coach/profile";
import { type RiderLevel } from "../../../src/core/coach/reentry";
import { NO_FATIGUE } from "../../../src/core/coach/target";
import { EASY_LOAD_H } from "../../../src/core/coach/library";
import { computeMetrics, type Goal } from "../../../src/core/fitness";
import type { Constraint } from "../../../src/core/plan";
import type { DayWeather } from "../../../src/core/weather";
import { addDays, dow, mondayOf } from "../../../src/lib/time";

export type Act = CoachInput["acts"][number];

/** Násobek počtu případů: COACH_FUZZ=50 npx vitest run test/coach/fuzz → 50× víc variant (miliony). */
export const SCALE = Math.max(0.01, Number(process.env.COACH_FUZZ ?? 1) || 1);
export const n = (base: number) => Math.max(1, Math.round(base * SCALE));

/** mulberry32 – rychlý deterministický generátor. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
    real: (lo: number, hi: number) => lo + next() * (hi - lo),
  };
}
export type Rng = ReturnType<typeof rng>;

export interface Athlete {
  seed: number;
  primary: "ride" | "run";
  /** null = bez wattmetru */
  ftp: number | null;
  hrMax: number;
  /** obvyklá týdenní zátěž v historii (0 = nový uživatel bez historie) */
  weekLoad: number;
  /** dny týdne s tréninkem (1 = po … 7 = ne) */
  dows: number[];
  longDow: number | null;
  qualityDow: number | null;
  /** kolísání týdnů ±; nepravidelnost */
  noise: number;
  /** v historii každý 4. (nebo 3.) týden lehký */
  histRecovery: 0 | 3 | 4;
  /** pauza v historii: kolik dní před startem končí a jak dlouhá (0 = žádná) */
  pauseEnd: number;
  pauseLen: number;
  /** trend posledních 8 týdnů: rostoucí / klesající objem */
  trend: number;
  /** jak dlouho do minulosti historie sahá (dny) – nový uživatel má krátkou */
  histDays: number;
  /** podíl běhu v historii u cyklisty (a jízdy u běžce) */
  otherShare: number;
  profile: CoachProfile;
  goal: Goal;
  /** závod: posun od dneška ve dnech (jen pro cíl Závod) */
  raceOffset: number;
}

const DOWS_BY_N: number[][][] = [
  [[6], [7], [3]],
  [[3, 6], [2, 7], [6, 7]],
  [[2, 4, 6], [1, 3, 6], [2, 5, 7], [3, 6, 7]],
  [[2, 4, 6, 7], [1, 3, 5, 6], [2, 3, 5, 7]],
  [[1, 2, 4, 6, 7], [2, 3, 4, 6, 7], [1, 3, 4, 5, 6]],
  [[1, 2, 3, 4, 6, 7], [1, 2, 4, 5, 6, 7]],
  [[1, 2, 3, 4, 5, 6, 7]],
];

export function randomAthlete(seed: number, o: Partial<Pick<Athlete, "goal" | "primary">> = {}): Athlete {
  const r = rng(seed);
  const primary = o.primary ?? (r.chance(0.2) ? "run" : "ride");
  const sessions = r.int(1, 7);
  const dows = r.pick(DOWS_BY_N[sessions - 1]!);
  // objem od úplného začátečníka po závodníka; občas nový uživatel bez historie
  const weekLoad = r.chance(0.05) ? 0 : Math.round(r.pick([40, 80, 120, 180, 250, 320, 400, 500, 650, 800]) * r.real(0.85, 1.15));
  const level: RiderLevel = r.pick(["beginner", "intermediate", "advanced"] as const);
  const other = primary === "ride" ? "run" : "ride";
  const profile: CoachProfile = {
    ...DEFAULT_PROFILE,
    primary,
    sports: {
      ride: { enabled: primary === "ride" || r.chance(0.5), quality: primary === "ride" || r.chance(0.3) },
      run: { enabled: primary === "run" || r.chance(0.3), quality: primary === "run" || r.chance(0.3) },
      xc_ski: { enabled: r.chance(0.2), quality: r.chance(0.2) },
      walk: { enabled: r.chance(0.1), quality: false },
    },
    birthYear: r.chance(0.3) ? null : r.int(1950, 2008),
    level,
  };
  profile.sports[other].quality = profile.sports[other].quality && profile.sports[other].enabled;
  const goal = o.goal ?? r.pick(["pokles", "udrzeni", "zvyseni", "zavod"] as const);
  return {
    seed,
    primary,
    ftp: primary === "ride" && r.chance(0.7) ? r.int(150, 380) : null,
    hrMax: r.int(170, 205),
    weekLoad,
    dows,
    longDow: r.chance(0.8) ? r.pick(dows) : null,
    qualityDow: r.chance(0.7) ? r.pick(dows) : null,
    noise: r.real(0, 0.35),
    histRecovery: r.pick([0, 0, 3, 4] as const),
    pauseEnd: r.chance(0.2) ? r.int(0, 50) : 0,
    pauseLen: r.int(7, 35),
    trend: r.real(-0.04, 0.04),
    histDays: r.chance(0.1) ? r.int(10, 60) : 200,
    otherShare: r.chance(0.3) ? r.real(0.05, 0.4) : 0,
    profile,
    goal,
    raceOffset: r.int(-10, 120),
  };
}

export const hrZonesOf = (max: number) => ({ floors: [Math.round(max * 0.27), Math.round(max * 0.66), Math.round(max * 0.8), Math.round(max * 0.89), Math.round(max * 0.97)], max, lthr: Math.round(max * 0.92), rest: 50 });

/** Zátěž za hodinu Z2 podle sportu (stejná teorie jako trenér). */
export const rateOf = (sport: "ride" | "run", power: boolean) => (sport === "run" ? EASY_LOAD_H.run : power ? EASY_LOAD_H.power : EASY_LOAD_H.hr);

/** Historie aktivit do dne před `start` podle profilu sportovce. */
export function historyOf(a: Athlete, start: string): Act[] {
  const r = rng(a.seed ^ 0x9e3779b9);
  const acts: Act[] = [];
  if (!a.weekLoad) return acts;
  const per = a.weekLoad / a.dows.length;
  for (let i = a.histDays; i >= 1; i--) {
    const d = addDays(start, -i);
    if (a.pauseEnd && i > a.pauseEnd && i <= a.pauseEnd + a.pauseLen) continue;
    const w = dow(d);
    if (!a.dows.includes(w)) continue;
    const weekIdx = Math.floor(i / 7);
    const rec = a.histRecovery && weekIdx % a.histRecovery === 0 ? 0.55 : 1;
    const trend = Math.max(0.3, 1 - a.trend * weekIdx);
    const isLong = w === a.longDow;
    const isKey = w === a.qualityDow && !isLong;
    const sport: "ride" | "run" = r.chance(a.otherShare) ? (a.primary === "ride" ? "run" : "ride") : a.primary;
    // zátěž za hodinu kolem teorie (±20 % podle člověka), délka z ní; nejvýš rozumná délka sportu (zátěž se pak nevejde)
    const rate = rateOf(sport, !!a.ftp) * (isKey ? 1.35 : 1) * (0.9 + (a.seed % 7) / 30);
    const maxMin = sport === "run" ? 180 : 360;
    const want = per * (isLong ? 1.4 : isKey ? 1.1 : 0.85) * rec * trend * (1 + r.real(-a.noise, a.noise));
    const min = Math.max(20, Math.min(maxMin, Math.round((want / rate) * 60)));
    const load = Math.max(5, Math.round((min / 60) * rate));
    acts.push({ id: `${d}-h`, date: d, sport, load, moving_s: min * 60, quality: isKey, hr_z: null, pwr_z: null, laps: null, compliance: null });
  }
  return acts;
}

export function metricsOf(acts: Act[], to: string) {
  const loads = new Map<string, number>();
  for (const x of acts) loads.set(x.date, (loads.get(x.date) ?? 0) + (x.load ?? 0));
  const m = computeMetrics(loads, addDays(to, -260), to, { ctl: 0, atl: 0 });
  return new Map(m.map((x) => [x.date, x]));
}

export function weekLoadsOf(acts: Act[], T: string): number[] {
  const W0 = mondayOf(T);
  return [4, 3, 2, 1].map((k) => { const f = addDays(W0, -7 * k); return Math.round(acts.filter((x) => x.date >= f && x.date < addDays(f, 7)).reduce((t, x) => t + (x.load ?? 0), 0)); });
}

export function badWeather(date: string): DayWeather {
  return { date, tmax: 8, tmin: 2, rainProb: 90, rainSum: 12, gustMax: 60, rain: true, gusty: true, frost: false, bad: true, hours: [], window: null, text: "déšť a vítr", code: 63 };
}
export function goodWeather(date: string): DayWeather {
  return { date, tmax: 20, tmin: 10, rainProb: 5, rainSum: 0, gustMax: 15, rain: false, gusty: false, frost: false, bad: false, hours: [], window: { from: 9, to: 18 }, text: "jasno", code: 0 };
}

/** Vstup trenéra pro den `T` (stejné skládání jako src/report/build.ts). */
export function inputOf(a: Athlete, acts: Act[], T: string, extra: Partial<CoachInput> = {}): CoachInput {
  const by = metricsOf(acts, T);
  return {
    today: T,
    goal: a.goal,
    raceDate: a.goal === "zavod" ? addDays(T, a.raceOffset) : null,
    profile: a.profile,
    zones: { ftp: a.ftp, hr: hrZonesOf(a.hrMax) },
    acts: acts.filter((x) => x.date > addDays(T, -90) && x.date <= T),
    power: [],
    metric: (d) => by.get(d) ?? null,
    calendar: [],
    constraints: [],
    weather: new Map(),
    weatherOk: false,
    recovery: "green",
    fatigue: NO_FATIGUE,
    weekLoads: weekLoadsOf(acts, T),
    offDays: [],
    progress: {},
    ...extra,
  };
}

/** Náhodná omezení dne od uživatele (všechny druhy, včetně nesmyslných hodnot, které se mají ignorovat). */
export function randomConstraints(r: Rng, T: string, count: number): Constraint[] {
  const out: Constraint[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(T, r.int(0, 13));
    const kind = r.pick(["nemoc", "nepojedu", "dovolena", "nemuzu", "bezky", "sport", "sport", "typ", "typ", "delka", "delka", "jizda", "kroky", "trenazer", "trenazer"] as const);
    let note: string | null = null;
    if (kind === "sport") note = r.pick(["ride", "run", "xc_ski", "walk", "rest", "rest", "hokej", ""]);
    else if (kind === "typ") note = r.pick(["z2", "quality", "quality", "auto", "xxx"]);
    else if (kind === "delka") note = String(r.pick([20, 30, 45, 60, 90, 120, 180, 240, 5, -10, 99999]));
    else if (kind === "jizda") note = r.chance(0.9) ? JSON.stringify({ min: r.pick([45, 90, 150, 240, 360]), km: null, with: r.chance(0.5) ? "parta" : null }) : "{rozbité";
    else if (kind === "trenazer") note = r.pick(["1", "0", "x"]);
    else if (kind === "kroky") note = r.chance(0.8) ? JSON.stringify({ reps: r.int(2, 8), work_s: r.pick([120, 240, 480, 600]), pct: r.int(85, 120) }) : "nesmysl";
    out.push({ date, kind, note });
  }
  return out;
}
