// Simulace po dnech: sportovec se chová podle vzorce (plní přesně, vynechává, přidává, přetahuje, nedotahuje,
// nezvládá / zvládá intervaly, onemocní, přesouvá, nechá týden úplně, zadává si vlastní volby…), trenér každý den
// plánuje znovu nad skutečností – stejně jako src/report/build.ts (pondělní plán, plnění minulého týdne, vyhodnocení
// kvalit, návrat po pauze). Každý den se kontrolují pravidla (check.ts) a pravidla rozběhnutého týdne.
import { type CoachPlan, type MondayPlan, runCoach } from "../../../src/core/coach/engine";
import { weekAdherence } from "../../../src/core/coach/adherence";
import { type KeyRecord, evaluateKeys, recordKeys } from "../../../src/core/coach/keys";
import { reentryOf } from "../../../src/core/coach/reentry";
import type { Fatigue } from "../../../src/core/coach/target";
import type { NLap } from "../../../src/datasource/types";
import type { Constraint } from "../../../src/core/plan";
import type { State } from "../../../src/core/recovery";
import { addDays, dow, mondayOf } from "../../../src/lib/time";
import { type Violation, checkPlan } from "./check";
import { type Act, type Athlete, historyOf, inputOf, metricsOf, rng } from "./gen";

export const BEHAVIOURS = ["perfect", "skipper", "extra", "overdo", "underdo", "failer", "succeeder", "sick", "mover", "lazyWeek", "chooser", "tired", "chaotic"] as const;
export type Behaviour = (typeof BEHAVIOURS)[number];

export interface DayLog {
  date: string;
  plan: CoachPlan;
  /** co sportovec opravdu udělal */
  did: { load: number; min: number; key: boolean } | null;
  recovery: State;
  ctl: number;
  form: number;
  adherenceFactor: number;
  /** tvoje volby platné ten den */
  cons: Constraint[];
}

export interface LoopResult {
  a: Athlete;
  behaviour: Behaviour;
  days: DayLog[];
  violations: { date: string; v: Violation }[];
  /** stupně kvalit po dnech (klíč sport:kategorie) */
  levels: { date: string; key: string; from: number; to: number; outcome: string }[];
  /** zátěž odjetá po týdnech */
  weeks: { weekStart: string; load: number; planned: number; ctlStart: number; ctlEnd: number }[];
  /** pondělí po vyhodnocení plnění: cíl týdne s úlevou za vynechání a bez ní */
  adherence: { date: string; with: number; without: number }[];
}

const lapsFor = (plan: { reps: number; work_s: number; lo: number; hi: number; sets?: number; blocks?: { reps: number; work_s: number; lo: number; hi: number; sets?: number }[] }, ok: boolean): NLap[] => {
  const blocks = plan.blocks?.length ? plan.blocks : [plan];
  const laps: NLap[] = [];
  let i = 0, t = 0;
  for (const b of blocks) {
    const n = b.reps * (b.sets ?? 1);
    const done = ok ? n : Math.max(0, n - 2);
    for (let k = 0; k < done; k++) {
      const pw = ok ? Math.round((b.lo + b.hi) / 2) : Math.round(b.lo - 15);
      laps.push({ i: i++, type: "WORK", label: null, start_s: t, moving_s: b.work_s, elapsed_s: b.work_s, distance_m: null, avg_power: pw, np: pw, avg_hr: 150, max_hr: 160, avg_cad: 90, elev_gain: null, avg_speed: null, decoupling: null } as NLap);
      t += b.work_s * 2;
    }
  }
  return laps;
};

export function simulateLoop(a: Athlete, behaviour: Behaviour, start: string, weeks: number, seed: number): LoopResult {
  const r = rng(seed);
  const acts: Act[] = historyOf(a, start);
  const res: LoopResult = { a, behaviour, days: [], violations: [], levels: [], weeks: [], adherence: [] };
  const constraints: Constraint[] = [];
  const recHist = new Map<string, State>();
  let stored: MondayPlan | null = null;
  const mondays = new Map<string, MondayPlan>();
  let keys: KeyRecord[] = [];
  const progress: Record<string, { level: number; last: string | null }> = {};
  let adherence: { factor: number; note: string | null } | null = null;
  const lazyWeek = 1 + r.int(0, Math.max(0, weeks - 3));
  const end = addDays(start, 7 * weeks);
  let moved: { load: number; min: number; key: boolean } | null = null;

  for (let T = start; T < end; T = addDays(T, 1)) {
    const W0 = mondayOf(T);
    // --- ráno ---
    const recovery: State = behaviour === "tired" ? r.pick(["green", "yellow", "yellow", "red"] as const) : behaviour === "chaotic" ? r.pick(["green", "green", "yellow", "red"] as const) : r.chance(0.06) ? "yellow" : "green";
    recHist.set(T, recovery);
    // nemoc: 2–6 dní, zadá se ráno prvního dne na celé období
    if ((behaviour === "sick" || behaviour === "chaotic") && r.chance(0.05) && !constraints.some((c) => c.kind === "nemoc" && c.date >= T)) {
      const len = r.int(2, 6);
      for (let i = 0; i < len; i++) constraints.push({ date: addDays(T, i), kind: "nemoc", note: null });
    }
    // vlastní volby na další dny (zadané během týdne – pondělní plán je ještě neznal)
    if ((behaviour === "chooser" || behaviour === "chaotic") && r.chance(0.25)) {
      const date = addDays(T, r.int(0, 6));
      const kind = r.pick(["sport", "typ", "delka", "jizda", "nepojedu", "sport"] as const);
      const note = kind === "sport" ? r.pick(["ride", "run", "rest", "xc_ski"]) : kind === "typ" ? r.pick(["z2", "quality"]) : kind === "delka" ? String(r.pick([45, 60, 90, 150])) : kind === "jizda" ? JSON.stringify({ min: r.pick([90, 180, 300]), km: null, with: null }) : null;
      // stejná volba na den se přepíše (jako v aplikaci)
      for (let i = constraints.length - 1; i >= 0; i--) if (constraints[i]!.date === date && constraints[i]!.kind === kind) constraints.splice(i, 1);
      constraints.push({ date, kind, note });
    }
    const illness = new Set(constraints.filter((c) => c.kind === "nemoc" && c.date > addDays(T, -10) && c.date <= T).map((c) => c.date)).size;
    let bad = 0;
    for (let i = 0; i < 5; i++) { const st = recHist.get(addDays(T, -i)); if (st && st !== "green") bad++; }
    const metric = metricsOf(acts, T);
    const y = metric.get(addDays(T, -1));
    // nedělní vyhodnocení plnění minulého týdne (v pondělí)
    if (dow(T) === 1) {
      const prev = mondays.get(addDays(W0, -7));
      if (prev) {
        const skip = new Set([...constraints.filter((c) => ["nemoc", "nepojedu"].includes(c.kind)).map((c) => c.date), ...[...recHist.entries()].filter(([, s]) => s === "red").map(([d]) => d)]);
        const ad = weekAdherence(prev.weekStart, prev.week.days.map((x) => ({ date: x.date, training: x.role !== "rest" && !x.blocked, load: x.load })), acts, skip);
        adherence = ad.factor < 1 ? { factor: ad.factor, note: ad.note } : null;
      } else adherence = null;
    }
    const fatigue: Fatigue = { form: y ? y.ctl - y.atl : null, badMornings: bad, hrvLow: false, illnessDays: illness, hardEasy: 0, adherence, strain: null };
    const ev = evaluateKeys(keys, acts, T, a.goal, progress);
    for (const u of ev.updates) {
      const from = progress[u.key]?.level ?? -1;
      res.levels.push({ date: T, key: u.key, from, to: u.level, outcome: u.outcome });
      progress[u.key] = { level: u.level, last: u.last };
    }
    const inp = inputOf(a, acts, T, {
      // závod má pevné datum (od začátku simulace)
      raceDate: a.goal === "zavod" ? addDays(start, a.raceOffset) : null,
      constraints: constraints.slice(), recovery, fatigue, progress: { ...progress },
      reentry: reentryOf(acts, T, a.profile.level ?? "intermediate"),
      mondayPlan: stored && stored.weekStart === W0 ? stored : null,
      keyHistory: ev.records.filter((k) => k.state === "done").map((k) => ({ date: k.date, cat: k.cat })),
      recentWids: ev.records.filter((k) => !!k.wid).map((k) => ({ date: k.date, sport: k.sport, cat: k.cat, wid: k.wid! })),
    });
    const plan = runCoach(inp);
    keys = recordKeys(ev.records, plan.coach.keyDays, T);
    const mp = plan.coach.mondayPlan;
    if (mp && (!stored || stored.weekStart !== mp.weekStart || stored.goal !== mp.goal || (mp.monday && JSON.stringify(mp) !== JSON.stringify(stored)))) { stored = mp; mondays.set(mp.weekStart, mp); }
    for (const v of checkPlan(inp, plan)) res.violations.push({ date: T, v });
    if (dow(T) === 1 && adherence) {
      const alt = runCoach({ ...inp, fatigue: { ...fatigue, adherence: null } });
      res.adherence.push({ date: T, with: plan.coach.horizon[0]!.target, without: alt.coach.horizon[0]!.target });
    }

    // --- den: co sportovec udělá ---
    const today = plan.days.find((x) => x.date === T);
    const planned = today && today.name && today.durationMin ? { load: today.load, min: today.durationMin, key: today.kind === "quality", plan: plan.coach.keyDays.find((k) => k.date === T)?.plan ?? null, sport: today.sport } : null;
    let did: DayLog["did"] = null;
    let ok = true;
    const inLazy = behaviour === "lazyWeek" && T >= addDays(start, 7 * lazyWeek) && T < addDays(start, 7 * lazyWeek + 9);
    if (moved && !planned) { did = moved; moved = null; }
    else if (planned && !inLazy && !constraints.some((c) => c.date === T && ["nemoc", "nepojedu"].includes(c.kind))) {
      let f = 1;
      if (behaviour === "skipper" && r.chance(0.35)) f = 0;
      if (behaviour === "overdo") f = r.real(1.2, 1.5);
      if (behaviour === "underdo") f = r.real(0.5, 0.8);
      if (behaviour === "chaotic") f = r.chance(0.2) ? 0 : r.real(0.6, 1.4);
      if (behaviour === "mover" && r.chance(0.3)) { moved = { load: planned.load, min: planned.min, key: planned.key }; f = 0; }
      if (behaviour === "failer") ok = false;
      if (behaviour === "chaotic") ok = r.chance(0.5);
      if (f > 0) did = { load: Math.round(planned.load * f), min: Math.max(20, Math.round(planned.min * f)), key: planned.key };
      if (did && planned.key && planned.plan && a.ftp) {
        const laps = lapsFor(planned.plan, ok);
        acts.push({ id: `${T}-k`, date: T, sport: planned.sport === "run" ? "run" : planned.sport === "xc_ski" ? "xc_ski" : "ride", load: did.load, moving_s: did.min * 60, quality: true, hr_z: null, pwr_z: null, laps, compliance: null, rpe: ok ? 6 : 9 });
      } else if (did) {
        acts.push({ id: `${T}-a`, date: T, sport: planned.sport === "run" ? "run" : planned.sport === "xc_ski" ? "xc_ski" : planned.sport === "walk" ? "walk" : "ride", load: did.load, moving_s: did.min * 60, quality: did.key, hr_z: null, pwr_z: null, laps: null, compliance: did.key ? (ok ? 100 : 60) : null, rpe: did.key ? (ok ? 6 : 9) : null });
      }
    } else if (!planned && (behaviour === "extra" || behaviour === "chaotic") && r.chance(0.4) && !constraints.some((c) => c.date === T && c.kind === "nemoc")) {
      // trénink navíc v den volna
      did = { load: r.int(30, 90), min: r.int(40, 120), key: false };
    }
    if (did && !acts.some((x) => x.date === T)) acts.push({ id: `${T}-x`, date: T, sport: a.primary, load: did.load, moving_s: did.min * 60, quality: did.key, hr_z: null, pwr_z: null, laps: null, compliance: did.key ? 100 : null, rpe: null });
    const m2 = metricsOf(acts, T).get(T)!;
    res.days.push({ date: T, plan, did, recovery, ctl: m2.ctl, form: m2.form, adherenceFactor: adherence?.factor ?? 1, cons: constraints.slice() });
  }
  for (let k = 0; k < weeks; k++) {
    const ws = addDays(start, 7 * k);
    const dd = res.days.filter((d) => d.date >= ws && d.date < addDays(ws, 7));
    const before = res.days.filter((d) => d.date < ws);
    res.weeks.push({
      weekStart: ws,
      load: dd.reduce((t, d) => t + (d.did?.load ?? 0), 0),
      planned: dd[0]!.plan.coach.horizon[0]!.done + dd[0]!.plan.coach.horizon[0]!.load,
      ctlStart: before.length ? before[before.length - 1]!.ctl : metricsOf(acts, addDays(ws, -1)).get(addDays(ws, -1))?.ctl ?? 0,
      ctlEnd: dd[dd.length - 1]!.ctl,
    });
  }
  return res;
}
