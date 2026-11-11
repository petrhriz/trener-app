// Trenér v2 – engine: z profilu, cíle, dat a uloženého plánu složí plán týdne. Čistá funkce bez I/O.
// Plán je uložený po týdnech (po–ne). Přepočítává se jen, když se změní vstupy (otisk), a jen dny od dneška;
// řešič se drží dřívější kostry. Výstup má stejný tvar jako v1 (PlanResult) → stránka, Telegram i zápis beze změny.
import { BIKE_SPORTS, ENDURANCE_SPORTS, type NLap, type PlanSport, type Sport } from "../../datasource/types";
import { dayDm, num } from "../../lib/format";
import { addDays, daysBetween, dow, mondayOf } from "../../lib/time";
import { type Goal, formZone, project } from "../fitness";
import { carbsFor } from "../nutrition";
import { type OwnRide, ownRideName, readOwnRide } from "../ownRide";
import type { CalItem, Change, Constraint, Kind, Payload, PlanDay, PlanResult } from "../plan";
import type { QualityType } from "../quality";
import type { State } from "../recovery";
import type { DayWeather } from "../weather";
import { type Workout, SPORT_LABEL, humanSteps, renderIcu } from "../workout";
import { type Anchor, type Budget, type Fatigue, type Rate, KEY_MIN, NO_FATIGUE, weekBudget } from "./budget";
import { type Built, type Family, type KeyFamily, type Zones, EASY_LOAD_H, FAMILY_NAME, PHASE_LABEL, START_LEVEL, buildWorkout, capLevel, familyFor, isKeyFamily, keyCandidates, pickFamilies } from "./library";
import { type CoachProfile, isWinter } from "./profile";
import { type Distribution, distribution, nextLevel, outcomeOf } from "./progress";
import { type Fixed, type PastDay, type Role, type SolvedDay, solveWeek } from "./week";

export interface CoachDay {
  date: string;
  role: Role;
  sport: PlanSport;
  minutes: number;
  family: Family | null;
  level: number;
  indoor: boolean;
  name: string | null;
  load: number;
  /** minuty nad Z2 */
  tiz: number;
  qualityType: QualityType | null;
  /** proč den vypadá takhle (úpravy podle zotavení, počasí…) */
  why: string[];
  fixed: boolean;
  blocked: string | null;
  userRest: boolean;
  own: OwnRide | null;
  plan: Built["plan"];
  /** klíčový den už byl vyhodnocen do postupu */
  evaluated?: boolean;
}

export interface StoredWeek {
  weekStart: string;
  cycleIdx: number;
  budget: Budget;
  days: CoachDay[];
  /** otisk vstupů – stejný = plán se nemění */
  hash: string;
  /** otisk profilu a cíle – jiný = týden se staví od nuly */
  baseKey: string;
}

export interface EngineAct {
  id: string;
  date: string;
  sport: Sport;
  load: number | null;
  moving_s: number | null;
  /** kvalita podle času v zónách (počítá se do klíčových dnů) */
  quality: boolean;
  hr_z: number[] | null;
  pwr_z: number[] | null;
  laps: NLap[] | null;
  compliance: number | null;
}

export interface ProgressRow {
  level: number;
  last: string | null;
}

export interface EngineInput {
  today: string;
  goal: Goal;
  raceDate: string | null;
  anchor: Anchor | null;
  profile: CoachProfile;
  zones: Zones;
  /** aktivity za posledních ≥ 60 dní */
  acts: EngineAct[];
  /** kondice a únava na konci dne (z daily_metrics) */
  metric: (date: string) => { ctl: number; atl: number } | null;
  calendar: CalItem[];
  constraints: Constraint[];
  weather: Map<string, DayWeather | null>;
  weatherOk: boolean;
  recovery: State | null;
  fatigue: Fatigue;
  /** zátěž posledních 4 ukončených týdnů (nejstarší první) */
  weekLoads: number[];
  stored: Map<string, StoredWeek>;
  progress: Record<string, ProgressRow>;
}

export interface CoachInfo {
  version: 2;
  phase: string;
  phaseLabel: string;
  cycleIdx: number;
  /** blok má lehčí 4. týden (Zlepšit, Závod) */
  cycle: boolean;
  recoveryWeek: boolean;
  /** pondělí příštího lehčího týdne */
  nextRecovery: string | null;
  hours: number;
  hoursBand: { min: number; max: number };
  keys: number;
  ctlTarget: number;
  notes: string[];
  distribution: Distribution | null;
  /** plánovaný podíl času nad Z2 v tomto týdnu (%) */
  plannedHard: number;
}

export interface EngineOutput {
  plan: PlanResult & { coach: CoachInfo };
  /** týdny, které se změnily (uložit) */
  save: StoredWeek[];
  /** změny stupňů v žebříčcích (uložit) */
  progress: { key: string; level: number; last: string; outcome: string }[];
  /** nová kotva trajektorie (uložit), když se změnil cíl */
  anchor: Anchor | null;
}

const hashOf = (x: unknown): string => {
  const s = JSON.stringify(x);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
};
const r15 = (x: number) => Math.round(x / 15) * 15;
const isBike = (s: Sport) => BIKE_SPORTS.includes(s);
const planSport = (s: Sport): PlanSport | null => (isBike(s) ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);
const KIND: Record<Role, Kind> = { rest: "rest", easy: "recovery", endurance: "z2", key: "quality", long: "long" };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };

/** Zátěž za hodinu lehké jednotky z historie uživatele (60 dní), v rozumných mezích kolem teorie. */
export function easyRate(acts: EngineAct[], today: string, sport: PlanSport, power: boolean): { rate: number; calib: number } {
  const theory = sport === "ride" && power ? EASY_LOAD_H.power : EASY_LOAD_H.hr;
  const v = acts
    .filter((a) => a.date > addDays(today, -60) && planSport(a.sport) === sport && !a.quality && (a.moving_s ?? 0) >= 40 * 60 && (a.load ?? 0) > 0)
    .map((a) => a.load! / (a.moving_s! / 3600));
  const m = v.length >= 3 ? median(v)! : theory;
  const rate = Math.max(theory * 0.8, Math.min(theory * 1.35, m));
  return { rate, calib: rate / theory };
}

export function fixedFromConstraints(cons: Constraint[]): Map<string, Fixed> {
  const out = new Map<string, Fixed>();
  const get = (d: string) => { let f = out.get(d); if (!f) out.set(d, (f = {})); return f; };
  for (const c of cons) {
    // doporučení z dřívějšího „AI návrhu týdne“ (předpona ai:) v2 nepoužívá
    if (typeof c.note === "string" && c.note.startsWith("ai:")) continue;
    const f = get(c.date);
    if (c.kind === "nemoc") f.blocked = "Nemoc: volno, nic nedohánět.";
    else if (c.kind === "nepojedu") f.blocked = f.blocked ?? "Dnes nepojedu.";
    else if (c.kind === "dovolena") f.blocked = f.blocked ?? "Dovolená.";
    else if (c.kind === "nemuzu" || c.kind === "hokej") f.blocked = f.blocked ?? "Nemůžu (tvoje poznámka).";
    else if (c.kind === "bezky") f.sport = "xc_ski";
    else if (c.kind === "sport" && c.note) { if (c.note === "rest") f.rest = true; else f.sport = c.note as PlanSport; }
    else if (c.kind === "typ" && (c.note === "z2" || c.note === "quality")) f.type = c.note;
    else if (c.kind === "delka" && Number(c.note) >= 20) f.minutes = Math.round(Number(c.note));
    else if (c.kind === "jizda") { const o = readOwnRide(c.note); if (o) f.own = o; }
  }
  for (const [d, f] of out) {
    if (f.rest && !f.blocked) out.set(d, { rest: true });
    else if (f.own) { f.sport = f.sport ?? "ride"; delete f.type; delete f.minutes; }
    if (!Object.keys(out.get(d)!).length) out.delete(d);
  }
  return out;
}

function weatherWhy(w: DayWeather): string {
  const r: string[] = [];
  if (w.rain) r.push(`déšť ${num(w.rainProb)} %`);
  if (w.gusty) r.push(`nárazy ${num(w.gustMax)} km/h`);
  if (w.frost) r.push("mráz ráno");
  return r.join(", ") || "počasí";
}

export function runEngine(inp: EngineInput): EngineOutput {
  const T = inp.today;
  const p = inp.profile;
  const power = !!inp.zones.ftp;
  const actsBy = new Map<string, EngineAct[]>();
  for (const a of inp.acts) actsBy.set(a.date, [...(actsBy.get(a.date) ?? []), a]);
  const trainedOn = (d: string) => (actsBy.get(d) ?? []).some((a) => ENDURANCE_SPORTS.includes(a.sport) && (a.moving_s ?? 0) >= 20 * 60);
  const todayDone = trainedOn(T);
  const fixedAll = fixedFromConstraints(inp.constraints);
  const save = new Map<string, StoredWeek>();
  const progOut: EngineOutput["progress"] = [];
  const progress: Record<string, ProgressRow> = { ...inp.progress };

  // ---- kotva trajektorie: začátek = den, kdy byl cíl nastaven ----
  const mY = inp.metric(addDays(T, -1)) ?? inp.metric(T) ?? { ctl: 0, atl: 0 };
  let anchor = inp.anchor;
  let anchorOut: Anchor | null = null;
  if (!anchor || anchor.goal !== inp.goal) anchorOut = anchor = { date: T, ctl: Math.round(mY.ctl * 10) / 10, goal: inp.goal };

  // ---- zátěž za hodinu z historie ----
  const er = easyRate(inp.acts, T, p.primary, p.primary === "ride" && power);
  const calibOf = (s: PlanSport) => (s === p.primary ? er.calib : easyRate(inp.acts, T, s, s === "ride" && power).calib);
  const rate: Rate = { easy: er.rate, key: er.rate * (KEY_MIN / 60) * 1.45 };

  const pastDay = (d: string): PastDay => {
    const acts = (actsBy.get(d) ?? []).filter((a) => ENDURANCE_SPORTS.includes(a.sport));
    const minutes = Math.round(acts.reduce((t, a) => t + (a.moving_s ?? 0), 0) / 60);
    const load = (actsBy.get(d) ?? []).reduce((t, a) => t + (a.load ?? 0), 0);
    const key = (actsBy.get(d) ?? []).some((a) => a.quality);
    const longest = [...acts].sort((a, b) => (b.moving_s ?? 0) - (a.moving_s ?? 0))[0];
    return { trained: minutes >= 20, key, hard: key || minutes >= 180 || load >= 150, minutes, sport: longest ? planSport(longest.sport) : null };
  };

  // ---- vyhodnocení odjetých klíčových dnů → postup v žebříčcích ----
  for (const w of inp.stored.values()) {
    let dirty = false;
    for (const d of w.days) {
      if (d.role !== "key" || d.evaluated || !isKeyFamily(d.family) || d.date > T || (d.date === T && !todayDone)) continue;
      const act = (actsBy.get(d.date) ?? []).filter((a) => planSport(a.sport) === d.sport).sort((a, b) => (b.load ?? 0) - (a.load ?? 0))[0];
      if (!act && d.date === T) continue;
      d.evaluated = true;
      dirty = true;
      if (!act) continue; // zmeškaná: stupeň zůstává, nic se nedohání
      const o = outcomeOf({ date: d.date, plan: d.plan, laps: act.laps, compliance: act.compliance });
      const key = `${d.sport}:${d.family}`;
      const level = nextLevel(d.level, o.outcome, inp.goal);
      progress[key] = { level, last: d.date };
      progOut.push({ key, level, last: d.date, outcome: `${o.outcome}: ${o.text}` });
    }
    if (dirty) save.set(w.weekStart, w);
  }
  const lastDone = (sport: PlanSport): Partial<Record<KeyFamily, string>> => {
    const o: Partial<Record<KeyFamily, string>> = {};
    for (const [k, v] of Object.entries(progress)) { const [s, f] = k.split(":"); if (s === sport && v.last) o[f as KeyFamily] = v.last; }
    return o;
  };

  // ---- dlouhá pauza / nemoc: blok od začátku ----
  const lastAct = inp.acts.filter((a) => ENDURANCE_SPORTS.includes(a.sport) && a.date <= T).map((a) => a.date).sort().pop() ?? null;
  const longBreak = !!lastAct && daysBetween(lastAct, T) > 14;

  const runActs = inp.acts.filter((a) => a.sport === "run" && (a.moving_s ?? 0) >= 15 * 60);
  const runInfo = {
    experienced: p.primary === "run" || runActs.filter((a) => a.date >= addDays(T, -60)).length >= 6,
    longest: Math.round(Math.max(0, ...runActs.filter((a) => a.date >= addDays(T, -28)).map((a) => (a.moving_s ?? 0) / 60))) || (p.primary === "run" ? 40 : 0),
  };
  const longestRide = Math.round(Math.max(0, ...inp.acts.filter((a) => isBike(a.sport) && a.date >= addDays(T, -42)).map((a) => (a.moving_s ?? 0) / 60)));
  const illness = [...fixedAll.entries()].filter(([, f]) => f.blocked?.startsWith("Nemoc")).map(([d]) => d);
  const afterIllness = (d: string) => illness.some((x) => x < d && x >= addDays(d, -2)) && !illness.includes(d);
  const baseKey = hashOf([p, inp.goal, inp.raceDate]);

  /** Postaví (nebo vrátí uložený) týden. `tail` = dny před týdnem, `from` = první plánovaný den. */
  const buildWeek = (weekStart: string, from: string, ctlStart: number, cycleIdx: number, prevWeeks: number[], fatigue: Fatigue, tail: Map<string, PastDay>, current: boolean): StoredWeek => {
    const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i));
    const stored = inp.stored.get(weekStart) ?? null;
    const budget = weekBudget({ weekStart, goal: inp.goal, profile: p, ctl: ctlStart, anchor, raceDate: inp.raceDate, prevWeeks, cycleIdx, fatigue, rate });
    const past = new Map(tail);
    for (const d of dates) if (d < from) past.set(d, pastDay(d));
    const fixed = new Map<string, Fixed>();
    for (const d of dates) { const f = fixedAll.get(d); if (f && d >= from) fixed.set(d, f); }
    const weatherBad = new Set<string>();
    if (p.primary === "ride") for (const d of dates) if (d >= from && inp.weather.get(d)?.bad) weatherBad.add(d);
    const noKey = new Set<string>(), easyOnly = new Set<string>();
    if (current && from === T && inp.recovery === "yellow") noKey.add(T);
    if (current && from === T && inp.recovery === "red") easyOnly.add(T);
    for (const d of dates) if (d >= from && afterIllness(d)) noKey.add(d);
    const levels = Object.entries(progress).map(([k, v]) => `${k}=${v.level}`).sort();
    const hash = hashOf([from, current ? inp.recovery : null, [...fixed.entries()], [...past.entries()], baseKey, budget.load, budget.keys, budget.hours, budget.recoveryWeek, [...weatherBad], inp.weatherOk, inp.zones.ftp, inp.zones.hr?.floors, inp.zones.p5 ? Math.round(inp.zones.p5 / 5) : null, levels, Math.round(er.calib * 20)]);
    if (stored && stored.hash === hash) return stored;
    const sameBase = !!stored && stored.baseKey === baseKey;
    const prev = sameBase ? new Map(stored!.days.map((d) => [d.date, d.role] as [string, Role])) : null;
    const solved = solveWeek({ weekStart, from, profile: p, hours: budget.hours, keys: budget.keys, past, fixed, weatherBad, prev, noKey, easyOnly, run: runInfo, longestRide });

    // rodiny klíčových dnů: střídání podle toho, co se nejelo nejdéle; uložená volba se drží
    const T60 = budget.hours * 60;
    const doneKeys = dates.filter((d) => d < from && past.get(d)?.key).length;
    const keyDays = solved.filter((x) => x.role === "key");
    const cands = keyCandidates(budget.phase, { recoveryWeek: budget.recoveryWeek, decline: inp.goal === "pokles", winter: isWinter(p, weekStart) });
    const maxTiz = keyDays.length ? ((T60 < 300 ? 0.25 : 0.2) * T60) / (keyDays.length + doneKeys) : null;
    const picked = new Map<string, KeyFamily>();
    {
      const bySport = new Map<PlanSport, SolvedDay[]>();
      for (const k of keyDays) bySport.set(k.sport, [...(bySport.get(k.sport) ?? []), k]);
      for (const [sport, ds] of bySport) {
        const fams = pickFamilies(cands.slice(Math.min(doneKeys, cands.length - 1)), ds.length, lastDone(sport));
        ds.forEach((d, i) => picked.set(d.date, fams[i]!));
      }
    }
    const storedDay = (d: string) => (sameBase ? stored!.days.find((x) => x.date === d) ?? null : null);

    const make = (x: SolvedDay): CoachDay => {
      const why: string[] = [];
      const was = storedDay(x.date);
      const base: CoachDay = { date: x.date, role: x.role, sport: x.sport, minutes: 0, family: null, level: 0, indoor: false, name: null, load: 0, tiz: 0, qualityType: null, why, fixed: x.fixed, blocked: x.blocked, userRest: x.userRest, own: x.own, plan: null };
      if (x.blocked) { why.push(x.blocked); return base; }
      if (x.userRest) { why.push("Volno (tvoje volba)."); return base; }
      if (x.role === "rest") return base;
      let role = x.role, minutes = x.minutes, indoor = false;
      const w = inp.weather.get(x.date) ?? null;
      const isToday = current && x.date === T;
      // ráno podle zotavení
      if (isToday && inp.recovery === "red") why.push("🔴 nezotavený: volno, nebo jen Z1 do 45 min");
      if (isToday && inp.recovery === "yellow") {
        if (was?.role === "key" && role !== "key") why.push("🟡 částečně zotavený: kvalita dnes ne");
        if (role === "long" && !x.own && !fixed.get(x.date)?.minutes) { minutes = r15(minutes * 0.75); why.push("🟡 částečně zotavený: dlouhý trénink o čtvrtinu kratší"); }
      }
      if (afterIllness(x.date) && !x.own) { minutes = Math.min(minutes, 60); if (role === "long") role = "endurance"; why.push("po nemoci postupný návrat"); }
      // počasí (jen kolo): kvalita na trenažér, Z2 na trenažér na 2/3 délky
      if (x.sport === "ride" && !x.own) {
        if (role === "key") {
          const goodOutside = inp.weatherOk && !!w && !w.bad && !!w.window;
          if (!inp.weatherOk || (w ? w.bad : false) || (isWinter(p, x.date) && !goodOutside)) { indoor = true; if (w?.bad) why.push(`${weatherWhy(w)} → trenažér`); }
        } else if (w?.bad && (role === "endurance" || role === "long")) {
          if (x.fixed) why.push(`Počasí: ${weatherWhy(w)} – den nechávám, je to tvoje volba (případně trenažér)`);
          else { indoor = true; if (!fixed.get(x.date)?.minutes) minutes = Math.max(45, r15((minutes * 2) / 3)); if (role === "long") role = "endurance"; why.push(`${weatherWhy(w)} → trenažér na 2/3 délky`); }
        }
      }
      if (was?.role === "key" && role !== "key" && !why.length) why.push("kvalita přesunuta na jiný den");
      // rodina a stupeň
      let family: Family, level = 0;
      if (x.own) family = x.own.min >= 120 ? "long" : "end";
      else if (role === "easy") family = "rec";
      else if (role === "key") {
        const keep = was && was.role === "key" && isKeyFamily(was.family) && cands.some((c) => c.includes(was.family as KeyFamily)) ? (was.family as KeyFamily) : null;
        const f = familyFor(x.sport, keep ?? picked.get(x.date) ?? "ss", x.sport === "ride" && power);
        const pl = progress[`${x.sport}:${f}`]?.level ?? START_LEVEL[f];
        level = capLevel(x.sport, f, inp.goal === "pokles" ? pl - 1 : pl, maxTiz);
        family = f;
      } else if (role === "long") {
        const ffOk = budget.phase !== "udrzovani" && budget.phase !== "ladeni" && !budget.recoveryWeek && budget.cycleIdx >= 2 && minutes >= 90 && !indoor && x.sport !== "xc_ski";
        family = ffOk ? "ff" : "long";
        if (ffOk) level = Math.min(3, budget.cycleIdx - 2 + (budget.phase === "rozvoj" ? 1 : 0));
      } else family = "end";
      const b = buildWorkout({ sport: x.sport, family, level, minutes, indoor, zones: inp.zones, calib: calibOf(x.sport) });
      let load = b.load, name = b.name;
      if (x.own) {
        load = Math.round(b.load * (x.own.with ? 1.15 : 1));
        name = ownRideName(x.own);
        why.push(`tvoje jízda${x.own.with ? (x.own.with === "skupina" ? " ve skupině" : ` s ${x.own.with}`) : ""}`);
      }
      return { ...base, role, minutes: x.own ? x.own.min : b.minutes, family: b.family, level: b.level, indoor, name, load, tiz: b.tizMin, qualityType: b.qualityType, plan: b.plan };
    };

    let days = solved.map(make);
    // doladění délek na cíl zátěže (jen vytrvalostní a dlouhé dny bez tvé úpravy; hodiny v pásmu z profilu)
    const doneLoad = dates.filter((d) => d < from).reduce((t, d) => t + (actsBy.get(d) ?? []).reduce((s, a) => s + (a.load ?? 0), 0), 0);
    const adjustable = (d: CoachDay) => (d.role === "endurance" || d.role === "long") && !d.fixed && !d.indoor && !afterIllness(d.date) && !(current && d.date === T && inp.recovery !== "green" && inp.recovery != null);
    const planned = days.reduce((t, d) => t + d.load, 0);
    const adj = days.filter(adjustable);
    const adjLoad = adj.reduce((t, d) => t + d.load, 0);
    const diff = budget.load - doneLoad - planned;
    if (adj.length && adjLoad > 0 && Math.abs(diff) > budget.load * 0.06) {
      // nic se nedohání: přidává se nejvýš o čtvrtinu a jen u cíle Zlepšit / Závod; ubírá se, když je týden přes rozpočet
      const up = inp.goal === "zvyseni" || inp.goal === "zavod";
      const f = Math.max(0.6, Math.min(up ? 1.25 : 1.1, (adjLoad + diff) / adjLoad));
      const doneMin = dates.filter((d) => d < from).reduce((t, d) => t + (past.get(d)?.minutes ?? 0), 0);
      const room = budget.hoursBand.max * 60 - doneMin - days.reduce((t, d) => t + d.minutes, 0);
      const adjMin = adj.reduce((t, d) => t + d.minutes, 0);
      const ff = f > 1 ? Math.min(f, 1 + Math.max(0, room) / adjMin) : f;
      if (Math.abs(ff - 1) > 0.04) {
        const scaled = new Map<string, number>();
        for (const d of adj) scaled.set(d.date, d.sport === "run" ? Math.max(30, Math.round((d.minutes * ff) / 5) * 5) : Math.max(45, r15(d.minutes * ff)));
        days = solved.map((x) => (scaled.has(x.date) ? make({ ...x, minutes: scaled.get(x.date)! }) : days.find((d) => d.date === x.date)!));
        if (diff < 0 && doneLoad > budget.load * 0.15) for (const d of days) if (scaled.has(d.date) && d.minutes < (solved.find((x) => x.date === d.date)?.minutes ?? 0)) d.why.push("zkráceno – týden je přes rozpočet zátěže");
      }
    }
    // minulé dny týdne zůstávají, jak byly uložené (historie plánu)
    const keepPast = (stored?.days ?? []).filter((d) => d.date < from);
    const week: StoredWeek = { weekStart, cycleIdx: budget.cycleIdx, budget, days: [...keepPast, ...days].sort((a, b) => a.date.localeCompare(b.date)), hash, baseKey };
    save.set(weekStart, week);
    return week;
  };

  // ---- tento týden ----
  const W0 = mondayOf(T), W1 = addDays(W0, 7);
  const from0 = todayDone ? addDays(T, 1) : T;
  const cyc = inp.goal === "zvyseni" || inp.goal === "zavod";
  const prevStored = inp.stored.get(addDays(W0, -7)) ?? null;
  const cur = inp.stored.get(W0) ?? null;
  const cycle0 = !cyc ? 1 : longBreak || inp.fatigue.illnessDays >= 4 ? 1 : cur ? cur.cycleIdx : prevStored ? (prevStored.cycleIdx % 4) + 1 : 1;
  const ctl0 = (inp.metric(addDays(W0, -1)) ?? mY).ctl;
  const tail0 = new Map<string, PastDay>();
  for (let i = 1; i <= 3; i++) tail0.set(addDays(W0, -i), pastDay(addDays(W0, -i)));
  const week0 = buildWeek(W0, from0 > addDays(W0, 6) ? addDays(W0, 7) : from0, ctl0, cycle0, inp.weekLoads, inp.fatigue, tail0, true);

  // ---- výhled kondice do konce týdne → příští týden ----
  const start = todayDone && inp.metric(T) ? inp.metric(T)! : mY;
  const startDate = todayDone ? T : addDays(T, -1);
  const dayOf = (d: string): CoachDay | null => (d < W1 ? week0 : week1)?.days.find((x) => x.date === d) ?? null;
  let week1: StoredWeek | null = null;
  const loads0: number[] = [];
  for (let d = addDays(startDate, 1); d < W1; d = addDays(d, 1)) loads0.push(week0.days.find((x) => x.date === d)?.load ?? 0);
  const proj0 = project(start, startDate, loads0);
  const ctlEnd0 = proj0.length ? proj0[proj0.length - 1]!.ctl : start.ctl;
  const doneLoad0 = inp.acts.filter((a) => a.date >= W0 && a.date < from0).reduce((t, a) => t + (a.load ?? 0), 0);
  const total0 = Math.round(doneLoad0 + week0.days.filter((d) => d.date >= from0).reduce((t, d) => t + d.load, 0));
  const tail1 = new Map<string, PastDay>();
  for (let i = 1; i <= 3; i++) {
    const d = addDays(W1, -i);
    const pd = week0.days.find((x) => x.date === d);
    tail1.set(d, d < from0 ? pastDay(d) : { trained: !!pd && pd.role !== "rest", key: pd?.role === "key", hard: pd?.role === "key" || pd?.role === "long", minutes: pd?.minutes ?? 0, sport: pd?.sport ?? null });
  }
  week1 = buildWeek(W1, W1, ctlEnd0, cyc ? (week0.cycleIdx % 4) + 1 : 1, [...inp.weekLoads.slice(-3), total0], NO_FATIGUE, tail1, false);

  // ---- dny plánu: dnešek (když je co jet) + 7 dní ----
  const calPlanned = inp.calendar.filter((c) => c.status === "planned" || c.status === "moved");
  const calBy = new Map<string, CalItem>();
  for (const c of calPlanned) if (!calBy.has(c.date) && c.kind !== "rest") calBy.set(c.date, c);
  const today0 = dayOf(T);
  const includeToday = !todayDone && ((!!today0 && today0.role !== "rest") || calBy.has(T) || !!today0?.blocked);
  const dates: string[] = [];
  if (includeToday) dates.push(T);
  for (let i = 1; i <= 7; i++) dates.push(addDays(T, i));

  const projDates: string[] = [];
  for (let d = addDays(startDate, 1); d <= addDays(T, 7); d = addDays(d, 1)) projDates.push(d);
  const proj = project(start, startDate, projDates.map((d) => dayOf(d)?.load ?? 0));
  const projBy = new Map(proj.map((x) => [x.date, x]));
  const warnings: string[] = [...week0.budget.notes];
  for (const x of proj) {
    if (formZone(x.form) === "Vysoké riziko") warnings.push(`Plán vede do Vysokého rizika ${dayDm(x.date)} – uber zátěž.`);
    else if (x.form < -25) warnings.push(`Forma ${dayDm(x.date)} ${num(x.form, 1)} (pod −25).`);
  }

  const built = new Map<string, Built | null>();
  const workoutOf = (d: CoachDay): Built | null => {
    if (d.role === "rest" || !d.family) return null;
    if (!built.has(d.date)) built.set(d.date, buildWorkout({ sport: d.sport, family: d.family, level: d.level, minutes: d.minutes, indoor: d.indoor, zones: inp.zones, calib: calibOf(d.sport) }));
    return built.get(d.date)!;
  };
  const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

  const days: PlanDay[] = dates.map((date) => {
    const d = dayOf(date) ?? ({ date, role: "rest", sport: p.primary, minutes: 0, family: null, level: 0, indoor: false, name: null, load: 0, tiz: 0, qualityType: null, why: [], fixed: false, blocked: null, userRest: false, own: null, plan: null } as CoachDay);
    const w = inp.weather.get(date) ?? null;
    const pj = projBy.get(date);
    const ride = d.role !== "rest";
    const b = workoutOf(d);
    const kind: PlanDay["kind"] = d.blocked ? "blocked" : KIND[d.role];
    const tag0 = d.role === "key" ? "Kvalita" : d.role === "endurance" ? "Z2" : d.role === "long" ? "Z2 dlouhá" : d.role === "easy" ? "Z1" : "Volno";
    const tag = d.own ? "Vlastní" : ride && d.sport !== "ride" ? `${SPORT_LABEL[d.sport]} · ${tag0}` : tag0;
    const notes = d.why.map((x) => (/[.!]$/.test(x) ? cap(x) : `${cap(x)}.`));
    if (d.role === "key" && isKeyFamily(d.family)) notes.push(`${cap(FAMILY_NAME[d.family])}: stupeň ${d.level + 1} žebříčku${week0.budget.recoveryWeek && date < W1 ? " (lehčí týden)" : ""}.`);
    if (d.own) notes.push("Vlastní jízda – trasu i tempo volíš ty, trenér jen počítá zátěž. Drž se spíš Z2, ať další dny platí.");
    if (date === T && inp.recovery === "green" && ride) notes.unshift("🟢 ráno zotavený, beze změny.");
    const sharp = d.role === "key" ? "quality" : d.role === "easy" ? "easy" : "z2";
    return {
      date,
      isToday: date === T,
      orientational: date >= addDays(T, 5),
      kind,
      tag: d.blocked ? "Nelze" : tag,
      tagClass: d.role === "key" ? "q" : d.role === "endurance" || d.role === "long" ? "e" : "",
      name: ride ? d.name : null,
      indoor: d.indoor,
      durationMin: ride ? d.minutes : null,
      workout: ride && b ? b.workout : null,
      steps: ride && b && d.sport !== "xc_ski" && d.role !== "easy" ? humanSteps(b.workout) : [],
      targetText: ride && b ? b.targetText : null,
      carbs: ride && d.minutes > 60 ? carbsFor(d.minutes, sharp, !!w && w.tmax < 5 && !d.indoor) : null,
      load: d.load,
      loadNote: ride ? "odhad z kroků tréninku" : "",
      form: pj?.form ?? null,
      formZone: pj ? formZone(pj.form) : null,
      weather: w,
      weatherText: w ? w.text : inp.weatherOk ? "bez předpovědi" : "počasí neznám",
      note: notes.join(" "),
      qualityType: d.qualityType,
      calId: calBy.get(date)?.id ?? null,
      changed: null,
      sport: d.sport,
      userRest: d.userRest,
      own: d.own,
      mine: d.fixed || !!d.own,
    };
  });

  // ---- změny proti kalendáři ----
  const changes: Change[] = [];
  let n = 0;
  const code = () => `#${++n}`;
  for (const day of days) {
    const cal = calBy.get(day.date) ?? null;
    const d = dayOf(day.date);
    const ride = !!day.name && !!day.workout;
    if (!ride) {
      if (cal) { day.changed = "smazat"; changes.push({ code: code(), date: day.date, action: "smazat", name: cal.name, why: (d?.why ?? []).join(", ") || "volno podle plánu", targetId: cal.id }); }
      continue;
    }
    const stepsText = renderIcu(day.workout as Workout);
    const same = cal && cal.name === day.name && (cal.duration_min ?? 0) === day.durationMin && ((cal.sport as string) || "ride") === day.sport && !!cal.indoor === day.indoor && (cal.steps_text ?? "") === stepsText;
    if (same) continue;
    const payload: Payload = {
      date: day.date,
      kind: day.kind as Kind,
      quality_type: day.qualityType,
      name: day.name!,
      indoor: day.indoor ? 1 : 0,
      duration_min: day.durationMin ?? 0,
      steps_json: JSON.stringify(day.workout),
      steps_text: stepsText,
      target_load: day.load,
      reason: day.note,
      moved_from: null,
      sport: day.sport,
      goal: inp.goal,
    };
    const why = (d?.why ?? []).join(", ") || (day.kind === "quality" ? "kvalita týdne" : day.kind === "long" ? "dlouhý trénink" : day.kind === "recovery" ? "lehký den" : "Z2 objem");
    day.changed = cal ? "upravit" : "nová";
    changes.push({ code: code(), date: day.date, action: cal ? "upravit" : "nová", name: day.name!, why, targetId: cal?.id, payload });
  }

  // ---- hotové / vynechané položky kalendáře ----
  const done: PlanResult["done"] = [];
  const missed: PlanResult["missed"] = [];
  for (const c of inp.calendar) {
    if (c.kind === "rest" || !["planned", "moved", "missed", "done"].includes(c.status)) continue;
    if (c.date > T || (c.date === T && !todayDone)) continue;
    if (c.status === "done" || trainedOn(c.date)) done.push({ id: c.id, date: c.date });
    else if (c.date < T) missed.push({ id: c.id, date: c.date, name: c.name, kind: c.kind });
  }

  // ---- graf 7 + 7 ----
  const chart: PlanResult["chart"] = [];
  for (let i = -7; i <= 7; i++) {
    const d = addDays(T, i);
    if (i < 0 || (i === 0 && todayDone)) {
      const acts = actsBy.get(d) ?? [];
      chart.push({ date: d, load: Math.round(acts.reduce((t, a) => t + (a.load ?? 0), 0)), planned: false, quality: acts.some((a) => a.quality), today: i === 0 });
    } else {
      const x = dayOf(d);
      chart.push({ date: d, load: Math.round(x?.load ?? 0), planned: true, quality: x?.role === "key", today: i === 0 });
    }
  }
  const loadPast7 = Math.round(chart.slice(0, 7).reduce((t, c) => t + c.load, 0) + (todayDone ? chart[7]!.load : 0));
  const loadNext7 = Math.round(chart.slice(8).reduce((t, c) => t + c.load, 0));
  const qCount = (w: StoredWeek, from: string) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(w.weekStart, i)).filter((d) => (d < from ? pastDay(d).key : w.days.find((x) => x.date === d)?.role === "key")).length;
  const qualityWeeks = [
    { from: W0, to: addDays(W0, 6), count: qCount(week0, from0), limit: week0.budget.keys },
    { from: W1, to: addDays(W1, 6), count: qCount(week1, from0), limit: week1.budget.keys },
  ];

  const fut0 = week0.days.filter((d) => d.date >= from0);
  const doneMin0 = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(W0, i)).filter((d) => d < from0).reduce((t, d) => t + pastDay(d).minutes, 0);
  const totalMin0 = doneMin0 + fut0.reduce((t, d) => t + d.minutes, 0);
  const b0 = week0.budget;
  const coach: CoachInfo = {
    version: 2,
    phase: b0.phase,
    phaseLabel: PHASE_LABEL[b0.phase],
    cycleIdx: b0.cycleIdx,
    cycle: cyc && b0.phase !== "ladeni",
    recoveryWeek: b0.recoveryWeek,
    nextRecovery: cyc && b0.phase !== "ladeni" && !b0.recoveryWeek ? addDays(W0, 7 * (4 - b0.cycleIdx)) : null,
    hours: b0.hours,
    hoursBand: b0.hoursBand,
    keys: b0.keys,
    ctlTarget: b0.ctlTarget,
    notes: b0.notes,
    distribution: distribution(inp.acts, T),
    plannedHard: totalMin0 > 0 ? Math.round((fut0.reduce((t, d) => t + d.tiz, 0) / totalMin0) * 100) : 0,
  };

  return {
    plan: { from: dates[0]!, to: dates[dates.length - 1]!, days, changes, chart, loadPast7, loadNext7, qualityWeeks, warnings, weeklyTarget: { lo: b0.lo, hi: b0.hi, mid: b0.load }, missed, done, coach },
    save: [...save.values()],
    progress: progOut,
    anchor: anchorOut,
  };
}
