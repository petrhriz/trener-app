// Simulace Trenéra v3 (sdílená pro scripts/coach-sim.ts, test/coach/sim.test.ts a test/bench.test.ts):
// modelový sportovec každý den odjede přesně plán, kondice se přepočítá, trenér plánuje znovu.
import { type CoachInput, runCoach } from "../src/core/coach/engine";
import { computeMetrics, type Goal } from "../src/core/fitness";
import { DEFAULT_PROFILE, type CoachProfile } from "../src/core/coach/profile";
import { NO_FATIGUE } from "../src/core/coach/target";
import { addDays, dow, mondayOf } from "../src/lib/time";

type Act = CoachInput["acts"][number];
export const SIM_HZ = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 55 };

export interface Scenario {
  id: string;
  title: string;
  who: string;
  goal: Goal;
  start: string; // pondělí
  weeks: number;
  /** historie: zátěž za týden, tréninků za týden */
  histLoad: number;
  histSessions: number;
  run?: boolean;
  /** tvoje volba: běh místo kola ve středu */
  runWed?: boolean;
  raceDate?: string;
}

export interface SimDay { date: string; kind: string; sport: string | null; name: string | null; min: number; load: number; ctl: number; atl: number; form: number; ctlBefore: number }
export interface SimWeek { weekStart: string; load: number; hours: number; sessions: number; keys: number; long: number; ride: number; run: number; ctlStart: number; ctlEnd: number; minForm: number; phase: string; recovery: boolean; pattern: string }

/** 16 týdnů pravidelné historie: rozložení út / čt / so / ne (+ po, st při víc trénincích). */
export function simHistory(sc: Pick<Scenario, "start" | "histLoad" | "histSessions">): Act[] {
  const acts: Act[] = [];
  const dows = [[6], [3, 6], [2, 4, 6], [2, 4, 6, 7], [1, 2, 4, 6, 7], [1, 2, 3, 4, 6, 7]][Math.min(5, sc.histSessions - 1)]!;
  const per = sc.histLoad / dows.length;
  for (let i = 1; i <= 112; i++) {
    const d = addDays(sc.start, -i);
    const w = dow(d);
    if (!dows.includes(w)) continue;
    const long = w === 6;
    const load = Math.round(per * (long ? 1.4 : w === 4 ? 1.1 : 0.85));
    const min = Math.round((load / 44) * 60);
    acts.push({ id: d, date: d, sport: "ride", load, moving_s: min * 60, quality: w === 4, hr_z: null, pwr_z: null, laps: null, compliance: null });
  }
  return acts;
}

/** Vstup trenéra pro den `T` nad aktivitami `acts` (stejně jako src/report/build.ts). */
export function simInput(sc: Scenario, acts: Act[], T: string, extra: Partial<CoachInput> = {}): CoachInput {
  const loads = new Map<string, number>();
  for (const a of acts) loads.set(a.date, (loads.get(a.date) ?? 0) + (a.load ?? 0));
  const m = computeMetrics(loads, addDays(sc.start, -200), T, { ctl: 0, atl: 0 });
  const by = new Map(m.map((x) => [x.date, x]));
  const W0 = mondayOf(T);
  const weekLoads = [4, 3, 2, 1].map((k) => { const f = addDays(W0, -7 * k); return Math.round(acts.filter((a) => a.date >= f && a.date < addDays(f, 7)).reduce((t, a) => t + (a.load ?? 0), 0)); });
  const constraints: CoachInput["constraints"] = [];
  if (sc.runWed) for (let i = 0; i < 10; i++) { const d = addDays(W0, 2 + 7 * i); constraints.push({ date: d, kind: "sport", note: "run" }); }
  const profile: CoachProfile = { ...DEFAULT_PROFILE, sports: { ...DEFAULT_PROFILE.sports, run: { enabled: !!sc.run, quality: false } } };
  return {
    today: T, goal: sc.goal, raceDate: sc.raceDate ?? null, profile, zones: { ftp: 260, hr: SIM_HZ }, acts: acts.filter((a) => a.date > addDays(T, -90)), power: [],
    metric: (d) => by.get(d) ?? null, calendar: [], constraints, weather: new Map(), weatherOk: false, recovery: "green", fatigue: NO_FATIGUE,
    weekLoads, offDays: [], progress: {}, ...extra,
  };
}

export function simulate(sc: Scenario) {
  const acts = simHistory(sc);
  const days: SimDay[] = [];
  const weekPlans: any[] = [];
  const end = addDays(sc.start, 7 * sc.weeks);
  for (let T = sc.start; T < end; T = addDays(T, 1)) {
    const inp = simInput(sc, acts, T);
    const plan = runCoach(inp);
    if (dow(T) === 1) weekPlans.push({ weekStart: T, coach: { phaseLabel: plan.coach.phaseLabel, recoveryWeek: plan.coach.recoveryWeek, notes: plan.coach.notes, horizon: plan.coach.horizon.map((h) => ({ weekStart: h.weekStart, load: h.load, target: h.target, need: h.need, ctlStart: h.ctlStart, ctlEnd: h.ctlEnd })) }, days: plan.days.filter((x) => x.date < addDays(T, 7)).map((x) => ({ date: x.date, kind: x.kind, sport: x.sport, name: x.name, min: x.durationMin, load: x.load, steps: x.steps, indoor: x.indoor, note: x.note })) });
    const today = plan.days.find((x) => x.date === T);
    const ctlBefore = inp.metric(addDays(T, -1))?.ctl ?? 0;
    if (today && today.name && today.durationMin) {
      acts.push({ id: T, date: T, sport: today.sport === "run" ? "run" : today.sport === "xc_ski" ? "xc_ski" : "ride", load: today.load, moving_s: today.durationMin * 60, quality: today.kind === "quality", hr_z: null, pwr_z: null, laps: null, compliance: null });
    }
    const loads2 = new Map<string, number>();
    for (const a of acts) loads2.set(a.date, (loads2.get(a.date) ?? 0) + (a.load ?? 0));
    const after = computeMetrics(loads2, addDays(sc.start, -200), T, { ctl: 0, atl: 0 }).slice(-1)[0]!;
    days.push({ date: T, kind: today?.name ? today.kind : "rest", sport: today?.sport ?? null, name: today?.name ?? null, min: today?.name ? today.durationMin! : 0, load: today?.name ? today.load : 0, ctl: Math.round(after.ctl * 10) / 10, atl: Math.round(after.atl * 10) / 10, form: Math.round((after.ctl - after.atl) * 10) / 10, ctlBefore });
  }
  const weeks: SimWeek[] = [];
  for (let k = 0; k < sc.weeks; k++) {
    const ws = addDays(sc.start, 7 * k);
    const dd = days.filter((d) => d.date >= ws && d.date < addDays(ws, 7));
    const tr = dd.filter((d) => d.load > 0);
    const prev = days.filter((d) => d.date < ws);
    weeks.push({
      weekStart: ws,
      load: tr.reduce((t, d) => t + d.load, 0),
      hours: Math.round((tr.reduce((t, d) => t + d.min, 0) / 60) * 10) / 10,
      sessions: tr.length,
      keys: tr.filter((d) => d.kind === "quality").length,
      long: tr.filter((d) => d.kind === "long").length,
      ride: tr.filter((d) => d.sport === "ride").length,
      run: tr.filter((d) => d.sport === "run").length,
      ctlStart: k === 0 ? Math.round(dd[0]!.ctlBefore * 10) / 10 : prev[prev.length - 1]!.ctl,
      ctlEnd: dd[dd.length - 1]!.ctl,
      minForm: Math.min(...dd.map((d) => d.form)),
      phase: weekPlans[k]?.coach.phaseLabel,
      recovery: !!weekPlans[k]?.coach.recoveryWeek,
      pattern: dd.map((d) => (d.load ? (d.kind === "quality" ? "K" : d.kind === "long" ? "D" : d.sport === "run" ? "B" : d.sport === "xc_ski" ? "L" : "Z") : "·")).join(""),
    });
  }
  // kontroly pravidel
  let streak = 0, maxStreak = 0, keyAfterHard = 0;
  days.forEach((d, i) => {
    streak = d.load ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak);
    if (d.kind === "quality" && i > 0 && ["quality", "long"].includes(days[i - 1]!.kind) && days[i - 1]!.load) keyAfterHard++;
  });
  return { ...sc, weeks, days, firstWeek: weekPlans[0], checks: { maxStreak, keyAfterHard, minForm: Math.min(...days.map((d) => d.form)) } };
}

const W = "2026-11-16", S = "2027-04-05";
export const SCENARIOS: Scenario[] = [
  { id: "zima-po-sezone", title: "Zima hned po sezóně (vrchol ~58)", who: "Silná sezóna, ~400 zátěže / 5 tréninků týdně, od 5. 10. cíl Zima", goal: "pokles", start: "2026-10-05", weeks: 20, histLoad: 400, histSessions: 5 },
  { id: "zima-pokles", title: "Zima (cíl Zima)", who: "Pravidelný cyklista, ~280 zátěže / 4 tréninky týdně", goal: "pokles", start: W, weeks: 8, histLoad: 280, histSessions: 4 },
  { id: "zima-udrzet", title: "Zima · Udržet", who: "Stejný cyklista", goal: "udrzeni", start: W, weeks: 8, histLoad: 280, histSessions: 4 },
  { id: "zima-zlepsit", title: "Zima · Zlepšit (Základ)", who: "Stejný cyklista", goal: "zvyseni", start: W, weeks: 8, histLoad: 280, histSessions: 4 },
  { id: "sezona-zlepsit", title: "Sezóna · Zlepšit (Rozvoj)", who: "Stejný cyklista na jaře", goal: "zvyseni", start: S, weeks: 8, histLoad: 300, histSessions: 4 },
  { id: "sezona-zavod", title: "Sezóna · Závod 23. 5.", who: "Stejný cyklista, závod za 7 týdnů", goal: "zavod", start: S, weeks: 8, histLoad: 300, histSessions: 4, raceDate: "2027-05-23" },
  { id: "zima-udrzet-beh", title: "Zima · Udržet + běh ve středu", who: "Cyklista, každou středu si zvolí běh", goal: "udrzeni", start: W, weeks: 8, histLoad: 280, histSessions: 4, run: true, runWed: true },
  { id: "malo-zlepsit", title: "Návrat · Zlepšit", who: "Málo jezdí: ~100 zátěže / 2 tréninky týdně", goal: "zvyseni", start: S, weeks: 8, histLoad: 100, histSessions: 2 },
];

export const scenario = (id: string): Scenario => SCENARIOS.find((s) => s.id === id)!;

export function simText(s: ReturnType<typeof simulate>): string {
  const n1 = (x: number) => String(x);
  const out = [`=== ${s.title} | ${s.checks.maxStreak} dny za sebou max, kvalita po těžkém ${s.checks.keyAfterHard}, min forma ${s.checks.minForm}`];
  for (const w of s.weeks) out.push(`  ${w.weekStart.slice(5)} ${w.phase}${w.recovery ? " lehčí" : ""} | ${w.pattern} | zátěž ${w.load} ${w.hours} h | tr ${w.sessions} K${w.keys} D${w.long} běh ${w.run} | CTL ${n1(w.ctlStart)}→${n1(w.ctlEnd)} | forma min ${w.minForm}`);
  return out.join("\n");
}
