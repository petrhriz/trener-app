// Plán na 7 dní (kap. 6) + návrh změn v kalendáři (7.1). Čistá funkce – vstup z D1, výstup plán + změny.
import { BIKE_SPORTS, type Sport } from "../datasource/types";
import { dayDm, minHm, num } from "../lib/format";
import { addDays, dow, mondayOf } from "../lib/time";
import { FORM_ZONE_RANGE, formZone, project, weeklyLoadTarget } from "./fitness";
import { type Carbs, carbsFor } from "./nutrition";
import type { ActPower } from "./power";
import { QUALITY_NAME, type QualityType, isOffSeason, qualityFromName, qualityLimit } from "./quality";
import { type PastQuality, designQuality } from "./qualityDesign";
import type { State } from "./recovery";
import type { DayWeather } from "./weather";
import { type Workout, humanSteps, renderIcu, totalSeconds, validate, workoutName, z1Workout, z2Workout } from "./workout";
import { type HrZones, TARGET_PCT, hrZoneRange, pctRange } from "./zones";

export type Kind = "z2" | "quality" | "long" | "recovery" | "rest";

export interface CalItem {
  id: number;
  date: string;
  kind: Kind;
  quality_type: string | null;
  name: string;
  indoor: number;
  duration_min: number | null;
  steps_json: string | null;
  steps_text: string | null;
  target_load: number | null;
  reason: string | null;
  status: string;
}

export interface Constraint {
  date: string;
  kind: "nemuzu" | "hokej" | "bezky" | "nemoc" | "dovolena" | "nepojedu";
  note: string | null;
}

export interface ActDay {
  date: string;
  sport: Sport;
  load: number | null;
  moving_s: number | null;
  is_quality: number | boolean;
  counts: boolean;
  quality_type: string | null;
  name: string | null;
}

export interface PlanInput {
  today: string;
  ftp: number;
  hr: HrZones | null;
  goal: "udrzeni" | "zvyseni" | "pokles" | "zavod";
  ridesPerWeek: number;
  /** stav na konci včerejška (D−1) */
  startYesterday: { ctl: number; atl: number };
  /** stav na konci dneška, když dnes už proběhla aktivita */
  startToday: { ctl: number; atl: number } | null;
  acts: ActDay[]; // D−42 … dnes
  actsPower: ActPower[]; // D−84 … dnes
  past: (t: QualityType) => PastQuality | null;
  calendar: CalItem[]; // D−7 … D+7, status planned/done/missed
  constraints: Constraint[];
  weather: Map<string, DayWeather | null>;
  weatherOk: boolean;
  recovery: State | null;
  p5: number | null;
  /** zátěž posledních 4 ukončených týdnů po–ne (nejstarší první) – limit +10 % a lehký týden */
  weekLoads?: number[];
}

/**
 * Týdenní cíl zátěže: 7 × CTL podle cíle (6.6 krok 1), navíc z referencí (plan-my-week):
 * nejvýš +10 % proti minulému týdnu a po 3 týdnech růstu lehčí týden (−30 %).
 */
export function weekTargetAdjusted(
  base: { lo: number; hi: number; mid: number },
  weekLoads: number[] | undefined,
): { lo: number; hi: number; mid: number; note: string | null } {
  const wl = (weekLoads ?? []).filter((x) => x > 0);
  if (wl.length >= 3) {
    const [a, b, c] = wl.slice(-3) as [number, number, number];
    if (b > a * 1.05 && c > b * 1.05) {
      const mid = Math.round(c * 0.7);
      return { lo: Math.round(mid * 0.9), hi: Math.round(mid * 1.1), mid, note: `Lehčí týden: 3 týdny růstu zátěže (${Math.round(a)} → ${Math.round(b)} → ${Math.round(c)}), cíl ${mid}.` };
    }
  }
  // +10 % proti běžnému týdnu: větší z minulého týdne a průměru 4 týdnů (po lehkém / vynechaném týdnu
  // se tak plán nesrazí na minimum – vynechaný trénink se nedohání, ale ani netrestá)
  const last = wl[wl.length - 1] ?? 0;
  const avg4 = wl.length ? wl.reduce((a, b) => a + b, 0) / wl.length : 0;
  const ref = Math.max(last, avg4);
  if (ref > 0 && base.mid > ref * 1.1) {
    const mid = Math.round(ref * 1.1);
    return { lo: Math.round(mid * 0.9), hi: mid, mid, note: `Zátěž omezena na +10 % proti běžnému týdnu (${Math.round(ref)} → max. ${mid}).` };
  }
  return { ...base, note: null };
}

export type ChangeAction = "nová" | "upravit" | "přesunout" | "smazat";

export interface Payload {
  date: string;
  kind: Kind;
  quality_type: string | null;
  name: string;
  indoor: number;
  duration_min: number;
  steps_json: string;
  steps_text: string;
  target_load: number;
  reason: string;
  moved_from?: string | null;
}

export interface Change {
  code: string;
  date: string;
  action: ChangeAction;
  name: string;
  why: string;
  targetId?: number;
  payload?: Payload;
}

export interface PlanDay {
  date: string;
  isToday: boolean;
  orientational: boolean;
  kind: Kind | "hockey" | "xc_ski" | "blocked";
  tag: string;
  tagClass: "q" | "e" | "";
  name: string | null;
  indoor: boolean;
  durationMin: number | null;
  workout: Workout | null;
  steps: string[];
  targetText: string | null;
  carbs: Carbs | null;
  load: number;
  loadNote: string;
  form: number | null;
  formZone: string | null;
  weather: DayWeather | null;
  weatherText: string;
  note: string;
  qualityType: QualityType | null;
  calId: number | null;
  /** kalendářní položka, která se mění (pro diff) */
  changed: ChangeAction | null;
}

export interface PlanResult {
  from: string;
  to: string;
  days: PlanDay[];
  changes: Change[];
  chart: { date: string; load: number; planned: boolean; quality: boolean; today: boolean }[];
  loadPast7: number;
  loadNext7: number;
  qualityWeeks: { from: string; to: string; count: number; limit: number }[];
  warnings: string[];
  weeklyTarget: { lo: number; hi: number; mid: number };
  missed: { id: number; date: string; name: string; kind: Kind }[];
  done: { id: number; date: string }[];
}

const isBike = (s: Sport) => BIKE_SPORTS.includes(s);
const DOW_QUALITY_PREF = [2, 3, 4, 6, 5, 1, 7];

interface Slot {
  date: string;
  kind: PlanDay["kind"];
  qualityType: QualityType | null;
  cal: CalItem | null;
  minutes: number;
  indoor: boolean;
  note: string[];
  fixedName?: string;
  movedFrom?: string;
  changed: ChangeAction | null;
  why: string[];
  workout?: Workout | null;
  reason?: string;
  load?: number;
  loadNote?: string;
}

export function estimateLoad(
  kind: Kind,
  qt: QualityType | null,
  minutes: number,
  acts: ActDay[],
  today: string,
): { load: number; note: string } {
  if (kind === "rest" || minutes <= 0) return { load: 0, note: "" };
  const from = addDays(today, -21);
  const cands = acts.filter(
    (a) =>
      a.date >= from &&
      isBike(a.sport) &&
      a.load &&
      a.moving_s &&
      (kind === "quality" ? !!a.is_quality && (!qt || a.quality_type === qt || !a.quality_type) : !a.is_quality),
  );
  if (cands.length) {
    const best = cands.reduce((b, a) => (Math.abs(a.moving_s! / 60 - minutes) < Math.abs(b.moving_s! / 60 - minutes) ? a : b));
    const est = Math.round((best.load! * minutes) / (best.moving_s! / 60));
    return { load: est, note: `odhad podle ${best.date.slice(8, 10).replace(/^0/, "")}.${best.date.slice(5, 7).replace(/^0/, "")}.: ${Math.round(best.load!)}` };
  }
  const IF: Record<string, number> = { vo2: 0.85, vo2short: 0.82, prah: 0.88, sweetspot: 0.85, tempo: 0.8 };
  const f = kind === "quality" ? (IF[qt ?? "prah"] ?? 0.85) : kind === "recovery" ? 0.5 : 0.65;
  return { load: Math.round((minutes / 60) * f * f * 100), note: "odhad vzorcem" };
}

function parseWorkout(json: string | null): Workout | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Workout;
  } catch {
    return null;
  }
}

export function generatePlan(inp: PlanInput): PlanResult {
  const T = inp.today;
  const actsBy = new Map<string, ActDay[]>();
  for (const a of inp.acts) actsBy.set(a.date, [...(actsBy.get(a.date) ?? []), a]);
  const rodeOn = (d: string) => (actsBy.get(d) ?? []).some((a) => isBike(a.sport));
  const qualityOn = (d: string) => (actsBy.get(d) ?? []).some((a) => a.counts || a.sport === "hockey");
  const todayDone = rodeOn(T);
  const warnings: string[] = [];

  const calPlanned = inp.calendar.filter((c) => c.status === "planned" || c.status === "moved");
  const calBy = new Map<string, CalItem>();
  for (const c of calPlanned) if (!calBy.has(c.date) && c.kind !== "rest") calBy.set(c.date, c);
  const consBy = new Map<string, Constraint[]>();
  for (const c of inp.constraints) consBy.set(c.date, [...(consBy.get(c.date) ?? []), c]);

  // Hotové / vynechané položky z minulosti (6.1a)
  const done: { id: number; date: string }[] = [];
  const missed: PlanResult["missed"] = [];
  for (const c of calPlanned) {
    if (c.date > T || (c.date === T && !todayDone)) continue;
    if (rodeOn(c.date)) done.push({ id: c.id, date: c.date });
    else if (c.date < T) missed.push({ id: c.id, date: c.date, name: c.name, kind: c.kind });
  }

  // Dny plánu: dnešek (jen když je v kalendáři neodjetá jednotka) + D+1 … D+7
  const includeToday = !todayDone && calBy.has(T);
  const dates: string[] = [];
  if (includeToday) dates.push(T);
  for (let i = 1; i <= 7; i++) dates.push(addDays(T, i));

  // nemoc: den + 2 dny jen lehce, nic nedohánět
  const illnessDates = inp.constraints.filter((c) => c.kind === "nemoc").map((c) => c.date);
  const recentIllness = (d: string) => illnessDates.some((x) => x <= d && x >= addDays(d, -2));

  const slots: Slot[] = dates.map((d) => {
    const cons = consBy.get(d) ?? [];
    const cal = calBy.get(d) ?? null;
    const s: Slot = {
      date: d,
      kind: "rest",
      qualityType: null,
      cal,
      minutes: 0,
      indoor: false,
      note: [],
      changed: null,
      why: [],
    };
    if (cons.some((c) => c.kind === "hokej")) {
      s.kind = "hockey";
      s.note.push("Hokej (tvoje poznámka).");
    } else if (cons.some((c) => c.kind === "bezky")) {
      s.kind = "xc_ski";
      s.note.push("Běžky (tvoje poznámka).");
    } else if (cons.some((c) => c.kind === "nemuzu" || c.kind === "dovolena" || c.kind === "nepojedu" || c.kind === "nemoc")) {
      s.kind = "blocked";
      const k = cons.find((c) => ["nemoc", "nepojedu", "nemuzu", "dovolena"].includes(c.kind))!.kind;
      s.note.push(k === "nemoc" ? "Nemoc: volno, nic nedohánět." : k === "nepojedu" ? "Dnes nepojedu." : k === "dovolena" ? "Dovolená." : "Nemůžu (tvoje poznámka).");
    } else if (cal) {
      s.kind = cal.kind;
      s.qualityType = (cal.quality_type as QualityType) ?? (cal.kind === "quality" ? qualityFromName(cal.name) : null);
      s.minutes = cal.duration_min ?? 60;
      s.indoor = !!cal.indoor;
      s.fixedName = cal.name;
      s.workout = parseWorkout(cal.steps_json);
    }
    if (recentIllness(d) && s.kind !== "blocked" && s.kind !== "rest") {
      if (s.kind === "quality" || s.kind === "long") {
        s.kind = "z2";
        s.qualityType = null;
        s.minutes = Math.min(s.minutes || 60, 60);
        s.changed = "upravit";
        s.why.push("po nemoci postupný návrat");
      }
    }
    // kalendářní jednotka v blokovaném dni → přesunout / smazat
    if (cal && (s.kind === "blocked" || s.kind === "hockey" || s.kind === "xc_ski")) {
      s.changed = "smazat";
      s.why.push(s.kind === "blocked" ? "nemůžeš" : s.kind === "hockey" ? "hokej" : "běžky");
    }
    return s;
  });

  const prevDayHard = (d: string): boolean => {
    const p = addDays(d, -1);
    const sl = slots.find((x) => x.date === p);
    if (sl) return sl.kind === "quality" || sl.kind === "hockey" || (sl.kind === "xc_ski" && false);
    return qualityOn(p);
  };
  const nextDayHard = (d: string): boolean => {
    const sl = slots.find((x) => x.date === addDays(d, 1));
    return !!sl && (sl.kind === "quality" || sl.kind === "hockey");
  };

  // Přesuny kalendářních jednotek z blokovaných dnů (výměnou, 6.1b)
  const moveQueue: Slot[] = slots.filter((s) => s.cal && s.changed === "smazat");

  // ---- po týdnech ----
  const weeks = [...new Set(dates.map(mondayOf))];
  const ctlRef = inp.startYesterday.ctl;
  const adj = weekTargetAdjusted(weeklyLoadTarget(ctlRef, inp.goal), inp.weekLoads);
  const weeklyTarget = { lo: adj.lo, hi: adj.hi, mid: adj.mid };
  if (adj.note) warnings.push(adj.note);
  const qualityWeeks: PlanResult["qualityWeeks"] = [];

  for (const mon of weeks) {
    const sun = addDays(mon, 6);
    const wSlots = slots.filter((s) => s.date >= mon && s.date <= sun);
    const firstPlanDay = wSlots[0]?.date ?? mon;
    const pastActs = inp.acts.filter((a) => a.date >= mon && a.date < firstPlanDay);
    const doneRides = new Set(pastActs.filter((a) => isBike(a.sport)).map((a) => a.date)).size;
    const doneQuality = pastActs.filter((a) => a.counts).length;
    const doneLoad = pastActs.reduce((t, a) => t + (a.load ?? 0), 0);
    const limit = qualityLimit(mon);

    // 1) kontrola kalendářních kvalit: limit, ne dvě po sobě, ne den po hokeji
    let qCount = doneQuality + wSlots.filter((s) => s.kind === "hockey").length;
    for (const s of wSlots) {
      if (s.kind !== "quality") continue;
      if (qCount >= limit) {
        s.kind = "z2";
        s.qualityType = null;
        s.changed = s.changed ?? "upravit";
        s.why.push(`limit kvality ${limit} týdně`);
        continue;
      }
      if (prevDayHard(s.date)) {
        s.kind = "z2";
        s.qualityType = null;
        s.changed = s.changed ?? "upravit";
        s.why.push("den po kvalitě nebo hokeji bez intervalů");
        continue;
      }
      qCount++;
    }

    // 2) vynechaná kvalita z tohoto týdne: výměnou za nejbližší vhodnou Z2 (6.1a)
    for (const m of missed.filter((x) => x.kind === "quality" && x.date >= mon && x.date <= sun)) {
      if (qCount >= limit) break;
      const swap = wSlots.find((s) => s.kind === "z2" && s.cal && !prevDayHard(s.date) && !nextDayHard(s.date));
      if (swap) {
        swap.kind = "quality";
        swap.qualityType = null;
        swap.changed = "upravit";
        swap.movedFrom = m.date;
        swap.why.push(`přesunuto z ${dayDm(m.date)} výměnou za Z2`);
        qCount++;
      }
    }

    // 3) doplnit prázdné dny
    // řízený pokles: o jízdu méně, intenzitu (1 kvalita) držet – objem klesá, kvalita zůstává
    const ridesTarget = Math.max(2, Math.min(4, inp.ridesPerWeek - (inp.goal === "pokles" ? 1 : 0)));
    let rides = doneRides + wSlots.filter((s) => s.kind === "z2" || s.kind === "quality" || s.kind === "long" || s.kind === "recovery").length;
    const empty = () => wSlots.filter((s) => s.kind === "rest" && !s.cal && s.date !== T);

    // kalendářní jednotky z blokovaných dnů přesunout do volného dne téhož týdne
    for (const mv of moveQueue.filter((x) => x.date >= mon && x.date <= sun)) {
      const cal = mv.cal!;
      const target = empty().find((s) => (cal.kind !== "quality" || (!prevDayHard(s.date) && !nextDayHard(s.date))));
      if (target) {
        target.kind = cal.kind;
        target.qualityType = (cal.quality_type as QualityType) ?? null;
        target.minutes = cal.duration_min ?? 60;
        target.indoor = !!cal.indoor;
        target.fixedName = cal.name;
        target.workout = parseWorkout(cal.steps_json);
        target.movedFrom = mv.date;
        target.changed = "přesunout";
        target.why.push(`z ${dayDm(mv.date)} (${mv.why.join(", ")})`);
        mv.changed = null; // nahrazeno přesunem
        (target as Slot & { moveOf?: number }).cal = null;
        (target as Slot & { moveId?: number }).moveId = cal.id;
      }
    }

    if (qCount < limit && rides < ridesTarget + 1) {
      const cand = empty()
        .filter((s) => !prevDayHard(s.date) && !nextDayHard(s.date) && !recentIllness(s.date))
        .sort((a, b) => DOW_QUALITY_PREF.indexOf(dow(a.date)) - DOW_QUALITY_PREF.indexOf(dow(b.date)));
      const pick = cand[0];
      if (pick && (inp.recovery !== "red" || pick.date !== addDays(T, 1))) {
        pick.kind = "quality";
        pick.changed = "nová";
        pick.why.push("kvalita týdne");
        qCount++;
        rides++;
      }
    }
    while (rides < ridesTarget) {
      const cand = empty().filter((s) => !recentIllness(s.date));
      if (!cand.length) break;
      const score = (s: Slot) => {
        let sc = 0;
        const w = inp.weather.get(s.date);
        if (dow(s.date) >= 6) sc += 2;
        if (w && !w.bad) sc += 2;
        if (w?.window) sc += 1;
        const prev = slots.find((x) => x.date === addDays(s.date, -1));
        const next = slots.find((x) => x.date === addDays(s.date, 1));
        const ridePrev = prev ? prev.kind !== "rest" && prev.kind !== "blocked" : rodeOn(addDays(s.date, -1));
        const rideNext = next ? next.kind !== "rest" && next.kind !== "blocked" : false;
        if (ridePrev && rideNext) sc -= 3;
        else if (ridePrev || rideNext) sc -= 1;
        return sc;
      };
      cand.sort((a, b) => score(b) - score(a) || a.date.localeCompare(b.date));
      const pick = cand[0]!;
      pick.kind = "z2";
      pick.changed = "nová";
      pick.why.push("Z2 objem");
      rides++;
    }

    // 4) délky podle týdenní zátěže (6.6 krok 1)
    const newZ2 = wSlots.filter((s) => s.kind === "z2" && !s.cal && !s.fixedName);
    const fixedLoad = wSlots
      .filter((s) => s.cal || s.fixedName)
      .reduce((t, s) => t + (s.cal?.target_load ?? estimateLoad(s.kind as Kind, s.qualityType, s.minutes, inp.acts, T).load), 0);
    const hockeyLoad = wSlots.filter((s) => s.kind === "hockey" || s.kind === "xc_ski").length * 70;
    const qSlot = wSlots.find((s) => s.kind === "quality" && !s.fixedName);
    const qLoad = qSlot ? estimateLoad("quality", null, 75, inp.acts, T).load : 0;
    if (qSlot) qSlot.minutes = 75;
    const daysInWeekPlanned = wSlots.length;
    const weekShare = Math.min(1, daysInWeekPlanned / 7 + (doneLoad > 0 ? 0 : 0));
    const remaining = Math.max(0, weeklyTarget.mid - doneLoad - fixedLoad - hockeyLoad - qLoad) * (pastActs.length || wSlots.length === 7 ? 1 : weekShare);
    const z2Rate = estimateLoad("z2", null, 60, inp.acts, T).load || 50;
    for (const s of newZ2) {
      const per = newZ2.length ? remaining / newZ2.length : 0;
      let min = Math.round(((per / z2Rate) * 60) / 15) * 15;
      const weekend = dow(s.date) >= 6;
      const maxMin = isOffSeason(s.date) ? 120 : weekend ? 180 : 120;
      min = Math.max(60, Math.min(weekend ? maxMin : 90, min));
      s.minutes = min;
      if (min >= 120 && weekend) s.kind = "long";
    }
    // vynechaná Z2: jen když by týden skončil s méně než 2 jízdami → prodloužit nejbližší Z2 o 20 min (max 2 h)
    if (missed.some((m) => m.kind !== "quality" && m.date >= mon && m.date <= sun) && rides < 2) {
      const z = wSlots.find((s) => s.kind === "z2");
      if (z) {
        z.minutes = Math.min(120, z.minutes + 20);
        z.changed = z.changed ?? "upravit";
        z.why.push("+20 min, týden by měl jen 1 jízdu");
      }
    }
    qualityWeeks.push({ from: mon, to: sun, count: qCount, limit });
  }

  // ---- počasí (kap. 8): kvalita na trenažér, Z2 přesunout nebo trenažér ----
  for (const s of slots) {
    if (!["z2", "quality", "long"].includes(s.kind as string)) continue;
    const w = inp.weather.get(s.date) ?? null;
    if (s.kind === "quality") {
      const goodOutside = inp.weatherOk && w && !w.bad && !!w.window;
      const wantIndoor = !inp.weatherOk || (w ? w.bad : false) || (isOffSeason(s.date) && !goodOutside);
      if (wantIndoor && !s.indoor) {
        s.indoor = true;
        if (s.fixedName || s.cal) {
          s.changed = s.changed ?? "upravit";
          s.why.push(!inp.weatherOk ? "počasí neznám" : w?.bad ? weatherWhy(w) : "v zimě kvalita na trenažéru");
        }
      }
      continue;
    }
    if (w && w.bad && !s.indoor) {
      // přesun Z2 na volný den téhož týdne s dobrým počasím
      const mon = mondayOf(s.date);
      const target = slots.find(
        (x) => x.kind === "rest" && !x.cal && x.date !== T && mondayOf(x.date) === mon && (() => { const ww = inp.weather.get(x.date); return ww && !ww.bad; })() && !prevDayHard(x.date) === true,
      );
      if (target && s.date !== T) {
        Object.assign(target, { kind: s.kind, minutes: s.minutes, indoor: false, qualityType: null, fixedName: s.fixedName, workout: s.workout, movedFrom: s.date, changed: s.cal ? "přesunout" : "nová" });
        target.why = [...s.why, `z ${dayDm(s.date)}: ${weatherWhy(w)}`];
        (target as any).moveId = s.cal?.id;
        s.kind = "rest";
        s.changed = s.cal ? null : null;
        s.note.push(`Jízda přesunuta na ${dayDm(target.date)} (${weatherWhy(w)}).`);
        s.fixedName = undefined;
        s.workout = undefined;
        if (!s.cal) s.why = [];
        continue;
      }
      s.indoor = true;
      s.minutes = Math.max(45, Math.round((s.minutes * 2) / 3 / 5) * 5);
      if (s.kind === "long") s.kind = "z2";
      s.changed = s.changed ?? (s.cal ? "upravit" : "nová");
      s.why.push(`${weatherWhy(w)} → trenažér 2/3 délky`);
    }
  }

  // ---- dnešek podle zotavení (kap. 4) ----
  const todaySlot = slots.find((s) => s.date === T);
  if (todaySlot && inp.recovery && inp.recovery !== "green" && todaySlot.kind !== "rest" && todaySlot.kind !== "blocked") {
    if (inp.recovery === "red") {
      todaySlot.why.push("🔴 nedoregenerovaný: volno nebo Z1 do 45 min");
      todaySlot.kind = "recovery";
      todaySlot.minutes = Math.min(45, todaySlot.minutes || 45);
      todaySlot.qualityType = null;
      todaySlot.changed = "upravit";
    } else if (todaySlot.kind === "quality") {
      todaySlot.kind = "z2";
      todaySlot.qualityType = null;
      todaySlot.changed = "upravit";
      todaySlot.why.push("🟡 částečně zregenerovaný: kvalita → Z2");
    } else if (todaySlot.kind === "z2" || todaySlot.kind === "long") {
      todaySlot.minutes = Math.max(45, Math.round((todaySlot.minutes * 2) / 3 / 5) * 5);
      todaySlot.changed = "upravit";
      todaySlot.why.push("🟡 částečně zregenerovaný: zkráceno o třetinu");
    }
    if (todaySlot.changed === "upravit") todaySlot.fixedName = undefined;
  }

  // ---- stavba workoutů, názvy, zátěž ----
  const lastWeekQ = lastQualityType(inp, T);
  for (const s of slots) {
    if (!["z2", "quality", "long", "recovery"].includes(s.kind as string)) continue;
    const keepCal = s.fixedName && !s.changed && s.workout;
    if (keepCal) {
      const errs = validate(s.workout!);
      if (errs.length) {
        s.changed = "upravit";
        s.why.push(`kroky neodpovídají 7.3 (${errs[0]})`);
      } else {
        s.reason = s.cal?.reason ?? "";
        const est = s.cal?.target_load
          ? { load: s.cal.target_load, note: "z kalendáře" }
          : estimateLoad(s.kind as Kind, s.qualityType, s.minutes, inp.acts, T);
        s.load = est.load;
        s.loadNote = est.note;
        continue;
      }
    }
    // přesun beze změny obsahu: ponechat kroky
    if (s.changed === "přesunout" && s.workout && !validate(s.workout).length) {
      const est = estimateLoad(s.kind as Kind, s.qualityType, Math.round(totalSeconds(s.workout) / 60), inp.acts, T);
      s.load = est.load;
      s.loadNote = est.note;
      s.minutes = Math.round(totalSeconds(s.workout) / 60);
      continue;
    }
    if (s.kind === "quality") {
      const d = designQuality({
        today: T,
        date: s.date,
        ftp: inp.ftp,
        p5: inp.p5,
        indoor: s.indoor,
        acts: inp.actsPower,
        lastWeekType: lastWeekQ,
        past: inp.past,
        targetMin: s.minutes || 75,
        reduce: false,
        forceFocus: s.qualityType,
      });
      s.workout = d.workout;
      s.qualityType = d.type;
      s.fixedName = d.name;
      s.minutes = d.durationMin;
      s.reason = d.reason;
    } else if (s.kind === "recovery") {
      s.workout = z1Workout({ ftp: inp.ftp }, s.minutes || 45);
      s.fixedName = workoutName("Z1 regenerace", s.indoor);
      s.minutes = Math.round(totalSeconds(s.workout) / 60);
    } else {
      s.workout = z2Workout({ ftp: inp.ftp }, s.minutes || 60);
      s.fixedName = s.indoor ? "Trenažér – Z2" : s.kind === "long" ? "Z2 dlouhá jízda" : "Z2 vytrvalost";
      s.minutes = Math.round(totalSeconds(s.workout) / 60);
    }
    const est = estimateLoad(s.kind as Kind, s.qualityType, s.minutes, inp.acts, T);
    s.load = est.load;
    s.loadNote = est.note;
  }

  // ---- výhled formy (6.4): od posledního ukončeného dne ----
  const start = todayDone && inp.startToday ? inp.startToday : inp.startYesterday;
  const startDate = todayDone ? T : addDays(T, -1);
  const projDates: string[] = [];
  for (let d = addDays(startDate, 1); d <= addDays(T, 7); d = addDays(d, 1)) projDates.push(d);
  const loadFor = (d: string) => {
    const s = slots.find((x) => x.date === d);
    if (!s) return 0;
    if (s.kind === "hockey" || s.kind === "xc_ski") return 70;
    return s.load ?? 0;
  };
  const proj = project(start, startDate, projDates.map(loadFor));
  const projBy = new Map(proj.map((p) => [p.date, p]));
  for (const p of proj) {
    if (p.form < -25) warnings.push(`Forma ${dayDm(p.date)} ${num(p.form, 1)} (pod −25).`);
    if (formZone(p.form) === "Vysoké riziko") warnings.push(`Plán vede do Vysokého rizika ${dayDm(p.date)} – uber zátěž.`);
  }

  // ---- výstup dnů ----
  const hzZ2 = inp.hr ? hrZoneRange(inp.hr, 2) : null;
  const days: PlanDay[] = slots.map((s) => {
    const w = inp.weather.get(s.date) ?? null;
    const p = projBy.get(s.date);
    const ride = ["z2", "quality", "long", "recovery"].includes(s.kind as string);
    let targetText: string | null = null;
    if (ride && s.kind !== "quality") {
      const [lo, hi] = s.kind === "recovery" ? pctRange(inp.ftp, TARGET_PCT.recovery) : pctRange(inp.ftp, TARGET_PCT.z2);
      targetText = `⚡ ${lo}–${hi} W (${s.kind === "recovery" ? "40–54" : "57–72"} % FTP)${hzZ2 && s.kind !== "recovery" ? ` · ❤️ Z2 (${hzZ2[0]}–${hzZ2[1]} bpm)` : ""}`;
    } else if (s.kind === "quality" && s.workout) {
      const work = s.workout.blocks.find((b) => b.kind === "work")?.steps[0];
      if (work?.lo) {
        const pl = Math.round((work.lo / inp.ftp) * 100);
        const ph = Math.round((work.hi! / inp.ftp) * 100);
        const hz = inp.hr ? `${hrZoneRange(inp.hr, 3)[0]}–${hrZoneRange(inp.hr, s.qualityType === "vo2" || s.qualityType === "vo2short" ? 5 : 4)[1]} bpm` : null;
        targetText = `⚡ ${work.lo}–${work.hi} W (${pl}–${ph} % FTP)${hz ? ` · ❤️ ${s.qualityType === "vo2" || s.qualityType === "vo2short" ? "Z4–Z5" : "Z3–Z4"} (${hz})` : ""}`;
      }
    }
    const sharp = s.kind === "quality" ? "quality" : s.kind === "recovery" ? "easy" : "z2";
    const carbs = ride && s.minutes > 60 ? carbsFor(s.minutes, sharp, !!w && w.tmax < 5 && !s.indoor) : null;
    const tag =
      s.kind === "quality" ? "Kvalita" : s.kind === "z2" ? "Z2" : s.kind === "long" ? "Z2 dlouhá" : s.kind === "recovery" ? "Z1" : s.kind === "hockey" ? "Hokej" : s.kind === "xc_ski" ? "Běžky" : "Volno";
    const noteParts = [...s.note];
    if (s.why.length && s.changed) noteParts.push(cap(s.why.join("; ")) + ".");
    if (s.reason && s.kind === "quality") noteParts.push(s.reason);
    if (s.date === T && inp.recovery === "green" && ride) noteParts.unshift("🟢 ráno zregenerovaný, beze změny.");
    return {
      date: s.date,
      isToday: s.date === T,
      orientational: s.date >= addDays(T, 5),
      kind: s.kind,
      tag,
      tagClass: s.kind === "quality" ? "q" : s.kind === "z2" || s.kind === "long" ? "e" : "",
      name: ride ? (s.fixedName ?? null) : null,
      indoor: s.indoor,
      durationMin: ride ? s.minutes : null,
      workout: ride ? (s.workout ?? null) : null,
      steps: ride && s.workout && (s.kind === "quality" || s.kind === "z2" || s.kind === "long") ? humanSteps(s.workout) : [],
      targetText,
      carbs,
      load: s.kind === "hockey" || s.kind === "xc_ski" ? 70 : (s.load ?? 0),
      loadNote: s.kind === "hockey" || s.kind === "xc_ski" ? "odhad" : (s.loadNote ?? ""),
      form: p?.form ?? null,
      formZone: p ? formZone(p.form) : null,
      weather: w,
      weatherText: w ? w.text : inp.weatherOk ? "bez předpovědi" : "počasí neznám",
      note: noteParts.join(" "),
      qualityType: s.qualityType,
      calId: s.cal?.id ?? null,
      changed: s.changed,
    };
  });

  // ---- změny v kalendáři (7.1) ----
  const changes: Change[] = [];
  let n = 0;
  const code = () => `Z${++n}`;
  for (const s of slots) {
    const day = days.find((d) => d.date === s.date)!;
    const ride = ["z2", "quality", "long", "recovery"].includes(s.kind as string);
    const why = s.why.join(", ") || (s.kind === "quality" ? "kvalita týdne" : "Z2 objem");
    const moveId = (s as any).moveId as number | undefined;
    if (s.changed === "smazat" && s.cal) {
      changes.push({ code: code(), date: s.date, action: "smazat", name: s.cal.name, why: s.why.join(", "), targetId: s.cal.id });
    } else if (ride && s.changed && s.workout) {
      const payload: Payload = {
        date: s.date,
        kind: s.kind as Kind,
        quality_type: s.qualityType,
        name: day.name!,
        indoor: s.indoor ? 1 : 0,
        duration_min: s.minutes,
        steps_json: JSON.stringify(s.workout),
        steps_text: renderIcu(s.workout),
        target_load: day.load,
        reason: s.reason ?? "",
        moved_from: s.movedFrom ?? null,
      };
      if (s.changed === "přesunout" && moveId) {
        changes.push({ code: code(), date: s.date, action: "přesunout", name: `${day.name} z ${dayDm(s.movedFrom!)} na ${dayDm(s.date)}`, why, targetId: moveId, payload });
      } else if (s.cal) {
        changes.push({ code: code(), date: s.date, action: "upravit", name: day.name!, why, targetId: s.cal.id, payload });
      } else {
        changes.push({ code: code(), date: s.date, action: "nová", name: day.name!, why, payload });
      }
    } else if (s.cal && (s.kind === "rest" || s.kind === "blocked") && s.changed == null && !slots.some((x) => (x as any).moveId === s.cal!.id)) {
      // kalendářní jednotka, kterou plán už nemá (přesunutá kvůli počasí apod.) se řeší v přesunu
    }
  }

  // ---- graf 7 + 7 a součty ----
  const chart: PlanResult["chart"] = [];
  for (let i = -7; i <= 7; i++) {
    const d = addDays(T, i);
    if (i < 0 || (i === 0 && todayDone)) {
      const acts = actsBy.get(d) ?? [];
      chart.push({ date: d, load: Math.round(acts.reduce((t, a) => t + (a.load ?? 0), 0)), planned: false, quality: acts.some((a) => !!a.is_quality), today: i === 0 });
    } else {
      const day = days.find((x) => x.date === d);
      chart.push({ date: d, load: Math.round(day?.load ?? 0), planned: true, quality: day?.kind === "quality" || day?.kind === "hockey", today: i === 0 });
    }
  }
  const loadPast7 = Math.round(chart.slice(0, 7).reduce((t, c) => t + c.load, 0) + (todayDone ? chart[7]!.load : 0));
  const loadNext7 = Math.round(chart.slice(8).reduce((t, c) => t + c.load, 0));

  return {
    from: dates[0]!,
    to: dates[dates.length - 1]!,
    days,
    changes,
    chart,
    loadPast7,
    loadNext7,
    qualityWeeks,
    warnings,
    weeklyTarget,
    missed,
    done,
  };
}

function lastQualityType(inp: PlanInput, today: string): QualityType | null {
  const mon = mondayOf(today);
  const prevWeek = inp.acts
    .filter((a) => a.date >= addDays(mon, -7) && a.date < mon && a.is_quality && a.quality_type)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return (prevWeek?.quality_type as QualityType) ?? null;
}

function weatherWhy(w: DayWeather): string {
  const r: string[] = [];
  if (w.rain) r.push(`déšť ${num(w.rainProb)} %`);
  if (w.gusty) r.push(`nárazy ${num(w.gustMax)} km/h`);
  if (w.frost) r.push("mráz ráno");
  return r.join(", ") || "počasí";
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function changeLine(c: Change): string {
  return `${c.code} · ${dayDm(c.date)}: ${c.action} – ${c.name}${c.why ? ` – ${c.why}` : ""}`;
}

export function formText(f: number | null): string {
  if (f == null) return "–";
  const z = formZone(f);
  return `${f > 0 ? "+" : f < 0 ? "−" : ""}${num(Math.abs(f), 1)} (${z})`;
}

export { FORM_ZONE_RANGE, QUALITY_NAME, minHm };
