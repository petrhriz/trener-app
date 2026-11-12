// Trenér v3 – skládá plán: cíl týdnů od dnešní kondice (budget.ts) → kostra (skeleton.ts) → zátěž a délka dnů
// (sport.ts) → obsah (knihovna z v2) → kontrola formy. Tento a příští týden s konkrétními tréninky, další dva
// orientačně (dny, druh, délka, zátěž). Výstup má stejný tvar jako plán v2, ať dashboard a zápis fungují beze změny.
import { BIKE_SPORTS, type PlanSport, type Sport } from "../../datasource/types";
import { dayDm, num } from "../../lib/format";
import { addDays, dow, mondayOf } from "../../lib/time";
import { type Goal, formZone, project } from "../fitness";
import { carbsFor } from "../nutrition";
import { type OwnRide, ownRideName } from "../ownRide";
import type { CalItem, Change, Constraint, Kind, Payload, PlanDay, PlanResult } from "../plan";
import type { ActPower } from "../power";
import type { QualityType } from "../quality";
import type { State } from "../recovery";
import type { DayWeather } from "../weather";
import { type Workout, renderIcu } from "../workout";
import { type EngineAct, type ProgressRow, easyRate, fixedFromConstraints } from "../coach/engine";
import { type Built, type Cat, type Zones, START_TIER, applyStepEdit, buildWorkout, catCandidates, catNeeds, chooseCat, isCat } from "../coach/library";
import type { CoachProfile } from "../coach/profile";
import { type Distribution, distribution } from "../coach/progress";
import { runReadiness } from "../coach/run";
import { type Fatigue, fatigueFactor } from "../coach/target";
import { type WeekValidation, validateWeek } from "../coach/validate";
import type { Fixed, PastDay as V2Past } from "../coach/week";
import { type WeekTarget, historyBase, weekTarget } from "./budget";
import { type PastDay, type SkDay, solveWeek } from "./skeleton";
import { type Role, capsFor, loadFor, minutesFor, nameFor, relabel, stepsText } from "./sport";

export interface Coach3Input {
  today: string;
  goal: Goal;
  raceDate: string | null;
  profile: CoachProfile;
  zones: Zones;
  /** aktivity za posledních ≥ 60 dní */
  acts: EngineAct[];
  power: ActPower[];
  metric: (date: string) => { ctl: number; atl: number } | null;
  calendar: CalItem[];
  constraints: Constraint[];
  weather: Map<string, DayWeather | null>;
  weatherOk: boolean;
  recovery: State | null;
  fatigue: Fatigue;
  /** zátěž posledních 4 ukončených týdnů (nejstarší první) */
  weekLoads: number[];
  offDays?: string[];
  progress: Record<string, ProgressRow>;
}

/** Den plánu (i orientační). */
export interface Day3 {
  date: string;
  role: Role;
  sport: PlanSport;
  minutes: number;
  load: number;
  /** jen tento a příští týden */
  name: string | null;
  workout: Workout | null;
  steps: string[];
  targetText: string | null;
  indoor: boolean;
  qualityType: QualityType | null;
  cat: Cat | null;
  /** minuty nad Z2 */
  tiz: number;
  /** zátěž, kterou by den měl podle cíle týdne (před stropy délek) */
  want: number;
  why: string[];
  blocked: string | null;
  own: OwnRide | null;
  /** tvoje volba (sport, druh, délka, vlastní jízda, úprava kroků) */
  mine: boolean;
  userRest: boolean;
}

export interface Week3 {
  weekStart: string;
  /** konkrétní tréninky (tento a příští týden), jinak jen kostra */
  detail: boolean;
  target: WeekTarget;
  sessions: number;
  keys: number;
  long: boolean;
  /** zátěž plánovaných dní po sestavení */
  planned: number;
  /** odhad kondice na konci týdne po sestavení */
  ctlEnd: number;
  days: Day3[];
  notes: string[];
}

export interface CoachInfo3 {
  version: 3;
  phase: string;
  phaseLabel: string;
  cycleIdx: number;
  cycle: boolean;
  recoveryWeek: boolean;
  nextRecovery: string | null;
  /** zátěž tohoto týdne celkem (odjeto + plán) */
  load: number;
  keepLoad: number;
  recentLoad: number;
  ramp: number;
  hours: number;
  tsbFloor: number | null;
  sessions: number;
  keys: number;
  /** dnešní kondice a kam dojde na konci týdne */
  ctlNow: number;
  ctlTarget: number;
  notes: string[];
  distribution: Distribution | null;
  plannedHard: number;
  plannedLoad: number;
  validation: WeekValidation;
  horizon: { weekStart: string; detail: boolean; load: number; done: number; need: number; ctlStart: number; ctlEnd: number; ctlGoal: number; phaseLabel: string; recoveryWeek: boolean; days: { date: string; role: Role; sport: PlanSport; minutes: number; load: number; name: string | null; blocked: boolean }[] }[];
}

export type Plan3 = PlanResult & { coach: CoachInfo3 };

const KIND: Record<Role, Kind> = { rest: "rest", easy: "recovery", endurance: "z2", key: "quality", long: "long" };
const isBike = (s: Sport) => BIKE_SPORTS.includes(s);
const planSport = (s: Sport): PlanSport | null => (isBike(s) ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };
const SPORT_WORD: Record<PlanSport, string> = { ride: "kolo", run: "běh", xc_ski: "běžky", walk: "chůze" };
const SPORT_GEN: Record<PlanSport, string> = { ride: "kola", run: "běhu", xc_ski: "běžek", walk: "chůze" };

export function runCoach3(inp: Coach3Input): Plan3 {
  const T = inp.today;
  const p = inp.profile;
  const actsOn = (d: string) => inp.acts.filter((a) => a.date === d);
  const trainedOn = (d: string) => actsOn(d).some((a) => (a.moving_s ?? 0) >= 20 * 60);
  const todayDone = trainedOn(T);
  const from = todayDone ? addDays(T, 1) : T;
  const W0 = mondayOf(T);
  const startState = inp.metric(addDays(from, -1)) ?? inp.metric(addDays(T, -1)) ?? { ctl: 0, atl: 0 };
  const doneLoad = inp.acts.filter((a) => a.date >= W0 && a.date < from).reduce((t, a) => t + (a.load ?? 0), 0);
  const off = new Set(inp.offDays ?? []);
  const power = !!inp.zones.ftp;

  // ---- historie ----
  const weekStarts4 = [4, 3, 2, 1].map((w) => addDays(W0, -7 * w));
  const sessionsIn = (ws: string) => new Set(inp.acts.filter((a) => a.date >= ws && a.date < addDays(ws, 7) && (a.moving_s ?? 0) >= 20 * 60).map((a) => a.date)).size;
  const history = {
    weekLoads: inp.weekLoads,
    weekSessions: weekStarts4.map(sessionsIn),
    weekOff: weekStarts4.map((ws) => [0, 1, 2, 3, 4, 5, 6].filter((i) => off.has(addDays(ws, i))).length),
    provenRamp: null,
  };
  const rides28 = inp.acts.filter((a) => a.date > addDays(T, -28) && planSport(a.sport) === p.primary && (a.moving_s ?? 0) >= 20 * 60).map((a) => (a.moving_s ?? 0) / 60);
  const longest = Math.round(Math.max(60, ...rides28));
  const typical = Math.round(median(rides28) ?? 60);
  const run = runReadiness(inp.acts, T, p.primary === "run");
  const rateOf = (s: PlanSport) => easyRate(inp.acts, T, s, s === "ride" && power);
  const fat = fatigueFactor(inp.fatigue);

  const binp = { goal: inp.goal, raceDate: inp.raceDate, from, ctlNow: startState.ctl, doneLoad, history, fatigue: fat.factor, weeks: 4 };
  let prevTotal = historyBase(history).usual;
  const fixed = fixedFromConstraints(inp.constraints);
  const needs = catNeeds(inp.power, T);
  // kategorie kvalit v horizontu → střídání (odjeté kvality zatím kategorii nemají – etapa 5)
  const usedCats: { date: string; cat: Cat }[] = [];

  const weeks: Week3[] = [];
  let prevDays: Day3[] = [];
  let state = { ctl: startState.ctl, atl: startState.atl };
  let stateDate = addDays(from, -1);
  const doneKeys0 = inp.acts.filter((a) => a.date >= W0 && a.date < from && a.quality).length;
  const doneLong0 = inp.acts.some((a) => a.date >= W0 && a.date < from && (a.moving_s ?? 0) >= Math.max(110, typical * 1.5) * 60);

  for (let k = 0; k < binp.weeks; k++) {
    // cíl týdne od kondice, na kterou opravdu dojde plán předchozího týdne
    const tg = weekTarget(binp, k, state.ctl, prevTotal);
    const detail = k <= 1;
    const dates: string[] = [];
    for (let d = tg.from; d < addDays(tg.weekStart, 7); d = addDays(d, 1)) dates.push(d);
    const winter = tg.winter;
    const rate = rateOf(p.primary).rate;
    const capsOf = (sport: PlanSport, role: Role) => capsFor({ sport, role, winter, longest, typical, runLongest: run.longest });

    // kolik tréninků, kvalit a jestli dlouhý
    const capE = capsOf(p.primary, "endurance");
    const sessionLoad = rate * Math.min(capE.max, Math.max(capE.min, typical)) / 60;
    const nDays = dates.length;
    // aspoň tolik tréninků, kolik je potřeba, aby se zátěž vešla do stropů délek (v zimě krátké jízdy)
    const capLoad = rate * capsOf(p.primary, "long").max / 60 * 0.5 + rate * capE.max / 60 * 0.5;
    let sessions = tg.load <= 15 ? 0 : Math.max(1, Math.round(tg.load / sessionLoad), Math.ceil(tg.load / capLoad));
    const maxSess = Math.max(3, Math.max(...history.weekSessions) + 1);
    sessions = Math.min(sessions, nDays, maxSess, 6);
    const phaseKeys = tg.phase === "build" && sessions >= 4 ? 2 : 1;
    let keys = sessions >= 3 ? phaseKeys : sessions === 2 ? 1 : 0;
    if (k === 0) keys = Math.max(0, Math.min(keys, fat.keysMax) - doneKeys0);
    else if (k === 1) keys = Math.min(keys, Math.max(1, fat.keysMax));
    const hasWeekend = dates.some((d) => dow(d) >= 6);
    // dlouhý jen když na něj po kvalitách zbyde zátěž aspoň na jeho minimální délku (jinak je to jen Z2)
    const keyLoad = loadFor(capsOf(p.primary, "key").max, rate, "key");
    const longMin = loadFor(capsOf(p.primary, "long").min, rate, "long");
    const long = sessions >= 2 && hasWeekend && !(k === 0 && doneLong0) && tg.load - keys * keyLoad >= longMin + (sessions - keys - 1) * loadFor(capE.min, rate, "endurance");

    // kostra
    const skDays: SkDay[] = dates.map((d) => {
      const f: Fixed | undefined = fixed.get(d);
      const w = inp.weather.get(d) ?? null;
      return {
        date: d,
        blocked: !!f?.blocked || (d === T && inp.recovery === "red"),
        rest: !!f?.rest,
        type: f?.type,
        must: !!(f?.sport || f?.minutes || f?.own || f?.edit),
        ownLong: !!f?.own && f.own.min >= 120,
        noKey: d === T && inp.recovery === "yellow",
        badWeather: !!w?.bad,
      };
    });
    const tail: PastDay[] = [1, 2, 3].map((i) => {
      const d = addDays(tg.from, -i);
      const pd = prevDays.find((x) => x.date === d);
      if (pd) return { date: d, trained: pd.role !== "rest", hard: pd.role === "key" || pd.role === "long" };
      const acts = actsOn(d);
      const mins = acts.reduce((t, a) => t + (a.moving_s ?? 0) / 60, 0);
      return { date: d, trained: mins >= 20, hard: acts.some((a) => a.quality) || mins >= Math.max(110, typical * 1.5) };
    });
    const habit: Record<number, number> = {};
    for (let i = 1; i <= 56; i++) { const d = addDays(T, -i); if (trainedOn(d)) habit[dow(d)] = (habit[dow(d)] ?? 0) + 1 / 8; }
    const sk = solveWeek({ days: skDays, tail, sessions, keys, long, habit });
    const notes = [...tg.notes, ...sk.notes];

    // dny: sport, cíl zátěže, délka
    const days: Day3[] = dates.map((d) => {
      const f = fixed.get(d);
      const role = sk.roles.get(d) ?? "rest";
      const sport: PlanSport = role === "rest" ? p.primary : (f?.sport ?? p.primary);
      return { date: d, role, sport, minutes: 0, load: 0, want: 0, name: null, workout: null, steps: [], targetText: null, indoor: false, qualityType: null, cat: null, tiz: 0, why: [], blocked: f?.blocked ?? (d === T && inp.recovery === "red" ? "🔴 ráno: volno, nebo Z1 do 45 min / procházka." : null), own: f?.own ?? null, mine: !!(f && (f.sport || f.type || f.minutes || f.own || f.edit)), userRest: !!f?.rest };
    });
    const train = days.filter((x) => x.role !== "rest");
    const rOf = (x: Day3) => rateOf(x.sport).rate;
    const setMinutes = (x: Day3, m: number) => { x.minutes = m; x.load = loadFor(m, rOf(x), x.role); };
    // pevné dny: vlastní jízda a tvoje délka
    for (const x of train) {
      const f = fixed.get(x.date);
      if (x.own) { x.minutes = x.own.min; x.load = Math.round(loadFor(x.own.min, rOf(x), x.role === "key" ? "endurance" : x.role) * (x.own.with ? 1.15 : 1)); }
      else if (f?.minutes) setMinutes(x, f.minutes);
    }
    // kvalita: typická délka dne kvality
    for (const x of train) if (x.role === "key" && !x.own && !fixed.get(x.date)?.minutes) { setMinutes(x, capsOf(x.sport, "key").max); x.want = loadFor(capsOf(p.primary, "key").max, rate, "key"); }
    const spread = () => {
      const flex = train.filter((x) => (x.role === "endurance" || x.role === "long" || x.role === "easy") && !x.own && !fixed.get(x.date)?.minutes);
      const fixedLoad = train.filter((x) => !flex.includes(x)).reduce((t, x) => t + x.load, 0);
      let rest = Math.max(0, tg.load - fixedLoad);
      const weight = (x: Day3) => (x.role === "long" ? 1.6 : x.role === "easy" ? 0.5 : 1);
      let pool = flex.slice();
      for (let it = 0; it < 3 && pool.length; it++) {
        const W = pool.reduce((t, x) => t + weight(x), 0);
        const next: Day3[] = [];
        for (const x of pool) {
          const c = capsOf(x.sport, x.role);
          if (it === 0) x.want = Math.round((rest * weight(x)) / W);
          const m = minutesFor((rest * weight(x)) / W, rOf(x), x.role, x.sport, c);
          setMinutes(x, m);
        }
        const used = pool.reduce((t, x) => t + x.load, 0);
        const left = rest - used;
        // přebytek / nedostatek rozdělit mezi dny, které nejsou na stropu
        for (const x of pool) { const c = capsOf(x.sport, x.role); if ((left > 0 && x.minutes < c.max) || (left < 0 && x.minutes > c.min)) next.push(x); }
        if (Math.abs(left) < 10 || !next.length) break;
        rest = next.reduce((t, x) => t + x.load, 0) + left;
        pool = next;
      }
    };
    spread();

    // obsah: konkrétní tréninky tento a příští týden
    if (detail) {
      const build = (x: Day3) => {
        const f = fixed.get(x.date);
        const w = inp.weather.get(x.date) ?? null;
        const calib = rateOf(x.sport).calib;
        x.indoor = false;
        if (x.sport === "ride" && !x.own) {
          if (x.role === "key") {
            const goodOutside = inp.weatherOk && !!w && !w.bad && !!w.window;
            if (!inp.weatherOk || !!w?.bad || (winter && !goodOutside)) { x.indoor = true; if (w?.bad) x.why.push(`${w.text} → trenažér`); }
          } else if (w?.bad && !x.mine) { x.indoor = true; x.why.push(`${w.text} → trenažér`); }
        }
        let b: Built;
        if (x.role === "key") {
          const quality = x.sport === p.primary ? true : p.sports[x.sport]?.quality && (x.sport !== "run" || run.experienced);
          if (!quality) {
            x.role = "endurance";
            x.why.push(`${SPORT_WORD[x.sport]}: bez intervalů (v profilu nebo zatím málo běhání) → Z2`);
          }
        }
        if (x.role === "key") {
          let cands = catCandidates(tg.phase, { recoveryWeek: tg.recoveryWeek, winter });
          if (x.sport === "run") cands = cands.filter((c) => c !== "vo2" && c !== "vo2s");
          if (!cands.length) cands = ["thr"];
          const before = usedCats.filter((u) => u.date < x.date);
          const lastUse: Partial<Record<Cat, string>> = {};
          for (const u of before) lastUse[u.cat] = u.date;
          const inWeek = usedCats.filter((u) => u.date >= tg.weekStart && u.date < x.date).map((u) => u.cat);
          const ch = chooseCat({ cands, exclude: [...inWeek, ...(before.length ? [before[before.length - 1]!.cat] : [])], lastUse, date: x.date, needs: x.sport === "ride" && power ? needs : {} });
          const lvl0 = inp.progress[`${x.sport}:${ch.cat}`]?.level ?? START_TIER;
          const level = Math.max(0, tg.phase === "offseason" || tg.recoveryWeek ? lvl0 - 1 : lvl0);
          b = buildWorkout({ sport: x.sport, family: ch.cat, level, wid: null, minutes: x.minutes, indoor: x.indoor, zones: inp.zones, calib });
          if (f?.edit) { b = applyStepEdit(b, f.edit, x.sport === "ride" ? inp.zones.ftp : null, calib, x.sport === "run"); x.why.push("tvoje úprava kroků"); }
          x.cat = isCat(b.family) ? b.family : ch.cat;
          usedCats.push({ date: x.date, cat: x.cat });
          if (ch.why) x.why.push(ch.why);
        } else {
          const family = x.own ? (x.own.min >= 120 ? "long" : "end") : x.role === "easy" ? "rec" : x.role === "long" ? "long" : "end";
          b = buildWorkout({ sport: x.sport, family, level: 0, wid: null, minutes: x.minutes, indoor: x.indoor, zones: inp.zones, calib });
        }
        const wk = relabel(b.workout, x.sport);
        x.workout = wk;
        x.steps = x.sport === "xc_ski" || x.role === "easy" ? [] : stepsText(wk, x.sport);
        x.name = x.own ? ownRideName(x.own) : nameFor(b.name, x.sport);
        x.targetText = b.targetText;
        x.qualityType = x.role === "key" ? b.qualityType : null;
        x.tiz = b.tizMin;
        if (!x.own) { x.minutes = b.minutes; x.load = b.load; }
      };
      for (const x of train.filter((y) => y.role === "key")) build(x);
      // zbylá zátěž po skutečných kvalitách → znovu délky Z2 a dlouhého
      spread();
      for (const x of train.filter((y) => y.role !== "key")) build(x);
    }
    for (const x of train) if (fixed.get(x.date)?.sport && x.sport !== p.primary && !x.own) {
      const capped = x.want > 0 && x.load < x.want * 0.9;
      x.why.push(capped ? `${SPORT_WORD[x.sport]} místo ${SPORT_GEN[p.primary]}: ${x.minutes} min je strop ${SPORT_GEN[x.sport]} podle toho, kolik teď běháš – zátěž ${x.load} místo ${x.want}, zbytek dostanou ostatní dny` : `${SPORT_WORD[x.sport]} místo ${SPORT_GEN[p.primary]}: stejná zátěž (${x.load}), délka podle sportu`);
    }

    // kontrola formy: výhled po dnech; pod dnem se zkracují Z2 a dlouhý, pak poslední kvalita → Z2
    const floor = tg.phase === "build" ? -30 : tg.phase === "taper" ? null : -20;
    const proj = () => project(state, stateDate, dates.map((d) => days.find((x) => x.date === d)!.load));
    if (floor != null) {
      for (let it = 0; it < 3; it++) {
        const low = proj().find((x) => x.form < floor);
        if (!low) break;
        if (it < 2) {
          for (const x of train) if ((x.role === "endurance" || x.role === "long") && !x.mine) { const c = capsOf(x.sport, x.role); setMinutes(x, Math.max(c.min, Math.round((x.minutes * 0.8) / 15) * 15)); if (detail) x.why.push(`zkráceno – forma by spadla pod ${floor}`); }
        } else {
          const kd = [...train].reverse().find((x) => x.role === "key" && !x.mine);
          if (kd) { kd.role = "endurance"; kd.why.push(`místo kvality Z2 – forma ${dayDm(low.date)} by byla ${num(low.form, 0)}`); setMinutes(kd, Math.min(kd.minutes, capsOf(kd.sport, "endurance").max)); }
        }
      }
      if (detail) for (const x of train) if (x.why.some((w) => w.startsWith("zkráceno") || w.startsWith("místo kvality"))) {
        const calib = rateOf(x.sport).calib;
        const b = buildWorkout({ sport: x.sport, family: x.role === "long" ? "long" : "end", level: 0, wid: null, minutes: x.minutes, indoor: x.indoor, zones: inp.zones, calib });
        x.workout = relabel(b.workout, x.sport); x.steps = stepsText(x.workout, x.sport); x.name = nameFor(b.name, x.sport); x.targetText = b.targetText; x.load = b.load; x.tiz = 0; x.qualityType = null; x.cat = null;
      }
    }
    const pr = proj();
    const end = pr.length ? pr[pr.length - 1]! : { ctl: state.ctl, atl: state.atl };
    const planned = days.reduce((t, x) => t + x.load, 0);
    weeks.push({ weekStart: tg.weekStart, detail, target: tg, sessions: sk.sessions, keys: sk.keys, long: sk.long, planned, ctlEnd: Math.round(end.ctl * 10) / 10, days, notes });
    state = { ctl: end.ctl, atl: end.atl };
    if (!tg.recoveryWeek) prevTotal = tg.done + planned;
    stateDate = dates[dates.length - 1]!;
    prevDays = days;
  }

  return toPlan(inp, weeks, { from, todayDone, startState, history, usual: historyBase(history).usual, fat, longest, typical, runLongest: run.longest, runExperienced: run.experienced });
}

// ---------- výstup ve tvaru plánu (dashboard, zápis do intervals.icu, Telegram) ----------

/** Jedna věta: kam dojde kondice za 4 týdny a proč (hlavně když cíl nejde splnit hned). */
export function horizonSummary(weeks: Pick<Week3, "planned" | "ctlEnd" | "target">[], ctlNow: number, usual: number): string {
  const n1 = (x: number) => x.toFixed(1).replace(".", ",");
  const last = weeks[weeks.length - 1]!;
  const end = last.ctlEnd;
  const ramp = weeks[0]!.target.ramp;
  const keep = Math.round((7 * ctlNow) / 10) * 10;
  const lastLoad = last.target.done + last.planned;
  const head = `Za ${weeks.length} týdny: kondice ${n1(ctlNow)} → ${n1(end)}`;
  if (ramp < 0) return `${head} (řízený pokles, asi ${n1((ctlNow - end) / weeks.length)} za týden).`;
  const goalEnd = ctlNow + ramp * weeks.length;
  if (end >= goalEnd - 0.5) return `${head} – ${ramp === 0 ? "drží se" : "roste podle cíle"}.`;
  return `${head}. Na ${ramp === 0 ? "udržení" : "růst"} by bylo potřeba asi ${keep}${ramp > 0 ? " a víc" : ""} zátěže týdně (7 × kondice), teď jezdíš kolem ${usual}. Přidávám nejvýš o 15 % týdně, ve 4. týdnu už ${lastLoad} – kondice se pak usadí a dál ${ramp === 0 ? "drží" : "roste"}.`;
}

function toPlan(inp: Coach3Input, weeks: Week3[], o: { from: string; todayDone: boolean; startState: { ctl: number; atl: number }; history: { weekLoads: number[] }; usual: number; fat: { notes: string[] }; longest: number; typical: number; runLongest: number; runExperienced: boolean }): Plan3 {
  const T = inp.today;
  const all = weeks.flatMap((w) => w.days);
  const dayOf = (d: string) => all.find((x) => x.date === d) ?? null;
  const calBy = new Map<string, CalItem>();
  for (const c of inp.calendar) if ((c.status === "planned" || c.status === "moved") && c.kind !== "rest" && !calBy.has(c.date)) calBy.set(c.date, c);
  const today0 = dayOf(T);
  const includeToday = !o.todayDone && !!today0 && (today0.role !== "rest" || calBy.has(T) || !!today0.blocked);
  const dates: string[] = [];
  if (includeToday) dates.push(T);
  for (let i = 1; i <= 7; i++) dates.push(addDays(T, i));

  // výhled kondice a formy po dnech celého horizontu
  const projDates: string[] = [];
  const last = weeks[weeks.length - 1]!.days.slice(-1)[0]!.date;
  for (let d = o.from; d <= last; d = addDays(d, 1)) projDates.push(d);
  const proj = project(o.startState, addDays(o.from, -1), projDates.map((d) => dayOf(d)?.load ?? 0));
  const projBy = new Map(proj.map((x) => [x.date, x]));

  const days: PlanDay[] = dates.map((date) => {
    const x = dayOf(date) ?? { date, role: "rest" as Role, sport: inp.profile.primary, minutes: 0, load: 0, want: 0, name: null, workout: null, steps: [], targetText: null, indoor: false, qualityType: null, cat: null, tiz: 0, why: [], blocked: null, own: null, mine: false, userRest: false };
    const pj = projBy.get(date);
    const w = inp.weather.get(date) ?? null;
    const ride = x.role !== "rest" && !x.blocked;
    const tag0 = x.role === "key" ? "Kvalita" : x.role === "endurance" ? "Z2" : x.role === "long" ? "Z2 dlouhá" : x.role === "easy" ? "Z1" : "Volno";
    const tag = x.own ? "Vlastní" : ride && x.sport !== inp.profile.primary ? `${SPORT_WORD[x.sport][0]!.toUpperCase()}${SPORT_WORD[x.sport].slice(1)} · ${tag0}` : tag0;
    const note = [...(date === T && inp.recovery === "green" && ride ? ["🟢 ráno zotavený, beze změny."] : []), ...(date === T && inp.recovery === "yellow" ? ["🟡 ráno částečně zotavený: dnes bez kvality."] : []), ...x.why.map((s) => (/[.!]$/.test(s) ? s : `${s}.`))].map((s) => s[0]!.toUpperCase() + s.slice(1)).join(" ");
    return {
      date,
      isToday: date === T,
      orientational: date >= addDays(T, 5),
      kind: x.blocked ? "blocked" : KIND[x.role],
      tag: x.blocked ? "Nelze" : tag,
      tagClass: x.role === "key" ? "q" : x.role === "endurance" || x.role === "long" ? "e" : "",
      name: ride ? x.name : null,
      indoor: x.indoor,
      durationMin: ride ? x.minutes : null,
      workout: ride ? x.workout : null,
      steps: ride ? x.steps : [],
      targetText: ride ? x.targetText : null,
      carbs: ride && x.minutes > 60 ? carbsFor(x.minutes, x.role === "key" ? "quality" : x.role === "easy" ? "easy" : "z2", !!w && w.tmax < 5 && !x.indoor) : null,
      load: ride ? x.load : 0,
      loadNote: ride ? "zátěž dne podle cíle týdne" : "",
      form: pj?.form ?? null,
      formZone: pj ? formZone(pj.form) : null,
      weather: w,
      weatherText: w ? w.text : inp.weatherOk ? "bez předpovědi" : "počasí neznám",
      note: x.blocked ? x.blocked : note,
      qualityType: x.qualityType,
      calId: calBy.get(date)?.id ?? null,
      changed: null,
      sport: x.sport,
      userRest: x.userRest,
      own: x.own,
      mine: x.mine,
    } as PlanDay;
  });

  // změny proti kalendáři intervals.icu (zapíší se až po „Zapsat“)
  const changes: Change[] = [];
  let n = 0;
  for (const day of days) {
    const cal = calBy.get(day.date) ?? null;
    const x = dayOf(day.date);
    if (!day.name || !day.workout) {
      if (cal) { day.changed = "smazat"; changes.push({ code: `#${++n}`, date: day.date, action: "smazat", name: cal.name, why: x?.blocked ?? "volno podle plánu", targetId: cal.id }); }
      continue;
    }
    const stepsTxt = renderIcu(day.workout as Workout);
    const same = cal && cal.name === day.name && (cal.duration_min ?? 0) === day.durationMin && ((cal.sport as string) || "ride") === day.sport && !!cal.indoor === day.indoor && (cal.steps_text ?? "") === stepsTxt;
    if (same) continue;
    const payload: Payload = { date: day.date, kind: day.kind as Kind, quality_type: day.qualityType, name: day.name, indoor: day.indoor ? 1 : 0, duration_min: day.durationMin ?? 0, steps_json: JSON.stringify(day.workout), steps_text: stepsTxt, target_load: day.load, reason: day.note, moved_from: null, sport: day.sport, goal: inp.goal };
    const why = x?.why.join(", ") || (day.kind === "quality" ? "kvalita týdne" : day.kind === "long" ? "dlouhý trénink" : day.kind === "recovery" ? "lehký den" : "Z2 objem");
    day.changed = cal ? "upravit" : "nová";
    changes.push({ code: `#${++n}`, date: day.date, action: cal ? "upravit" : "nová", name: day.name, why, targetId: cal?.id, payload });
  }

  // hotové / vynechané položky kalendáře
  const trained = (d: string) => inp.acts.some((a) => a.date === d && (a.moving_s ?? 0) >= 20 * 60);
  const done: PlanResult["done"] = [];
  const missed: PlanResult["missed"] = [];
  for (const c of inp.calendar) {
    if (c.kind === "rest" || !["planned", "moved", "missed", "done"].includes(c.status)) continue;
    if (c.date > T || (c.date === T && !o.todayDone)) continue;
    if (c.status === "done" || trained(c.date)) done.push({ id: c.id, date: c.date });
    else if (c.date < T) missed.push({ id: c.id, date: c.date, name: c.name, kind: c.kind });
  }

  // graf 7 dní zpět + 7 dopředu
  const chart: PlanResult["chart"] = [];
  for (let i = -7; i <= 7; i++) {
    const d = addDays(T, i);
    if (i < 0 || (i === 0 && o.todayDone)) {
      const acts = inp.acts.filter((a) => a.date === d);
      chart.push({ date: d, load: Math.round(acts.reduce((t, a) => t + (a.load ?? 0), 0)), planned: false, quality: acts.some((a) => a.quality), today: i === 0 });
    } else {
      const x = dayOf(d);
      chart.push({ date: d, load: Math.round(x?.load ?? 0), planned: true, quality: x?.role === "key", today: i === 0 });
    }
  }
  const loadPast7 = Math.round(chart.slice(0, 7).reduce((t, c) => t + c.load, 0) + (o.todayDone ? chart[7]!.load : 0));
  const loadNext7 = Math.round(chart.slice(8).reduce((t, c) => t + c.load, 0));

  const w0 = weeks[0]!, w1 = weeks[1]!;
  const W0 = mondayOf(T);
  const doneKeys = (ws: string) => inp.acts.filter((a) => a.date >= ws && a.date < o.from && a.quality).length;
  const qualityWeeks = [
    { from: W0, to: addDays(W0, 6), count: doneKeys(W0) + w0.days.filter((x) => x.role === "key").length, limit: doneKeys(W0) + w0.keys },
    { from: w1.weekStart, to: addDays(w1.weekStart, 6), count: w1.days.filter((x) => x.role === "key").length, limit: w1.keys },
  ];

  // závěrečná kontrola tohoto a příštího týdne (stejná pravidla jako v2)
  const v2Past = (d: string): V2Past => {
    const acts = inp.acts.filter((a) => a.date === d);
    const mins = acts.reduce((t, a) => t + (a.moving_s ?? 0) / 60, 0);
    const q = acts.some((a) => a.quality);
    const lg = mins >= Math.max(110, o.typical * 1.5);
    return { trained: mins >= 20, key: q, hard: q || lg, minutes: Math.round(mins), sport: acts[0] ? planSport(acts[0].sport) : null, long: lg };
  };
  const fixed = fixedFromConstraints(inp.constraints);
  const validate = (w: Week3): WeekValidation => {
    const past = new Map<string, V2Past>();
    for (let i = -3; i < 7; i++) { const d = addDays(w.weekStart, i); if (d < w.target.from) past.set(d, v2Past(d)); }
    const fp = project(o.startState, addDays(o.from, -1), projDates.map((d) => dayOf(d)?.load ?? 0)).filter((x) => x.date >= w.target.from && x.date < addDays(w.weekStart, 7));
    const caps = { easy: capsFor({ sport: "ride", role: "endurance", winter: w.target.winter, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max, long: capsFor({ sport: "ride", role: "long", winter: w.target.winter, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max, key: capsFor({ sport: "ride", role: "key", winter: w.target.winter, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max - 20 };
    return validateWeek({
      weekStart: w.weekStart,
      from: w.target.from,
      days: w.days.map((x) => ({ date: x.date, role: x.role, sport: x.sport, minutes: x.minutes, tiz: x.tiz, blocked: !!x.blocked, own: !!x.own, userQuality: fixed.get(x.date)?.type === "quality", userMinutes: !!fixed.get(x.date)?.minutes || (x.role === "key" && !!fixed.get(x.date)?.edit), downgraded: null })),
      past,
      keys: w.keys,
      long: w.long,
      caps,
      runCap: capsFor({ sport: "run", role: "long", winter: false, longest: 0, typical: 0, runLongest: o.runLongest }).max,
      tsbFloor: w.target.phase === "build" ? -30 : w.target.phase === "taper" ? null : -20,
      forms: fp.map((x) => ({ date: x.date, form: x.form })),
    });
  };
  const v0 = validate(w0), v1 = validate(w1);
  const validation: WeekValidation = { ok: v0.ok && v1.ok, items: [...v0.items, ...v1.items] };

  const summary = horizonSummary(weeks, o.startState.ctl, o.usual);
  const warnings: string[] = [summary, ...w0.notes, ...o.fat.notes.map((s) => `Únava: ${s}.`)];
  for (const x of proj.filter((y) => y.date <= addDays(T, 7))) if (formZone(x.form) === "Vysoké riziko") warnings.push(`Plán vede do Vysokého rizika ${dayDm(x.date)} – uber zátěž.`);
  for (const it of validation.items) if (it.level !== "exception") warnings.push(it.text);

  const tg = w0.target;
  const total0 = Math.round(tg.done + w0.planned);
  const minutes0 = inp.acts.filter((a) => a.date >= W0 && a.date < o.from).reduce((t, a) => t + (a.moving_s ?? 0) / 60, 0) + w0.days.reduce((t, x) => t + x.minutes, 0);
  const cyc = tg.phase === "base" || tg.phase === "build";
  const coach: CoachInfo3 = {
    version: 3,
    phase: tg.phase,
    phaseLabel: tg.phaseLabel,
    cycleIdx: tg.cycleIdx,
    cycle: cyc,
    recoveryWeek: tg.recoveryWeek,
    nextRecovery: cyc && !tg.recoveryWeek ? addDays(W0, 7 * (4 - tg.cycleIdx)) : null,
    load: total0,
    keepLoad: Math.round(7 * o.startState.ctl),
    recentLoad: Math.round(o.history.weekLoads.reduce((t, x) => t + x, 0) / Math.max(1, o.history.weekLoads.length)),
    ramp: tg.ramp,
    hours: Math.round((minutes0 / 60) * 4) / 4,
    tsbFloor: tg.phase === "build" ? -30 : tg.phase === "taper" ? null : -20,
    sessions: w0.sessions,
    keys: w0.keys,
    ctlNow: Math.round(o.startState.ctl * 10) / 10,
    ctlTarget: w0.ctlEnd,
    notes: [summary, ...w0.notes],
    distribution: distribution(inp.acts, T),
    plannedHard: minutes0 > 0 ? Math.round((w0.days.reduce((t, x) => t + x.tiz, 0) / minutes0) * 100) : 0,
    plannedLoad: total0,
    validation,
    horizon: weeks.map((w) => ({ weekStart: w.weekStart, detail: w.detail, load: w.planned, done: w.target.done, need: w.target.need, ctlStart: w.target.ctlStart, ctlEnd: w.ctlEnd, ctlGoal: w.target.ctlGoal, phaseLabel: w.target.phaseLabel, recoveryWeek: w.target.recoveryWeek, days: w.days.map((x) => ({ date: x.date, role: x.role, sport: x.sport, minutes: x.minutes, load: x.load, name: x.name, blocked: !!x.blocked })) })),
  };
  return { from: dates[0]!, to: dates[dates.length - 1]!, days, changes, chart, loadPast7, loadNext7, qualityWeeks, warnings, weeklyTarget: { lo: Math.round(total0 * 0.9), hi: Math.round(total0 * 1.1), mid: total0 }, missed, done, coach };
}
