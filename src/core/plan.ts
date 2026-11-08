// Plán na 7 dní (kap. 6) + návrh změn v kalendáři (7.1). Čistá funkce – vstup z D1, výstup plán + změny.
import { BIKE_SPORTS, ENDURANCE_SPORTS, type PlanSport, type Sport } from "../datasource/types";
import { dayDm, minHm, num } from "../lib/format";
import { addDays, dow, mondayOf } from "../lib/time";
import { FORM_ZONE_RANGE, formZone, project, weeklyLoadTarget } from "./fitness";
import { type Carbs, carbsFor } from "./nutrition";
import type { ActPower } from "./power";
import { QUALITY_NAME, type QualityType, isOffSeason, qualityFromName, qualityLimit } from "./quality";
import { type PastQuality, designQuality } from "./qualityDesign";
import { type OwnRide, ownRideName, readOwnRide } from "./ownRide";
import type { State } from "./recovery";
import type { DayWeather } from "./weather";
import { type Workout, SPORT_LABEL, humanSteps, otherMinutes, otherWorkout, renderIcu, totalSeconds, validate, workoutName, z1Workout, z2Workout } from "./workout";
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
  sport?: string | null;
  goal?: string | null;
  icu_event_id?: string | null;
}

export interface Constraint {
  date: string;
  /** sport = náhrada kola jiným sportem, note = ride | run | xc_ski | walk; typ = vynucený druh jednotky, note = z2 | quality */
  kind: "nemuzu" | "hokej" | "bezky" | "nemoc" | "dovolena" | "nepojedu" | "sport" | "typ" | "jizda" | "delka";
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
  /** běhá pravidelně (≥ 6 běhů za 60 dní) → běh smí mít intervaly */
  runExperienced?: boolean;
}

/**
 * Týdenní cíl zátěže: 7 × CTL podle cíle (6.6 krok 1), navíc z referencí (plan-my-week):
 * nejvýš +10 % proti minulému týdnu a po 3 týdnech růstu lehčí týden (−30 %).
 */
export function weekTargetAdjusted(
  base: { lo: number; hi: number; mid: number },
  weekLoads: number[] | undefined,
  goal: PlanInput["goal"] = "zvyseni",
): { lo: number; hi: number; mid: number; note: string | null } {
  const wl = (weekLoads ?? []).filter((x) => x > 0);
  if (wl.length >= 3 && goal !== "pokles") {
    const [a, b, c] = wl.slice(-3) as [number, number, number];
    if (b > a * 1.05 && c > b * 1.05) {
      const mid = Math.round(c * 0.7);
      return { lo: Math.round(mid * 0.9), hi: Math.round(mid * 1.1), mid, note: `Lehčí týden: 3 týdny růstu zátěže (${Math.round(a)} → ${Math.round(b)} → ${Math.round(c)}), cíl ${mid}.` };
    }
  }
  // Cíl je podle kondice (CTL) a cíle – ne podle minulého týdne. Minulé týdny slouží jen jako pojistka
  // proti příliš prudkému skoku (akutní : chronická zátěž ≤ ~1,3). Týdny výrazně slabší než ostatní
  // (nemoc, dovolená – pod 60 % nejsilnějšího) se do „běžného týdne“ nepočítají, jinak by jeden
  // nemocný týden stáhl plán na minimum.
  const top = wl.length ? Math.max(...wl) : 0;
  const normal = wl.filter((x) => x >= top * 0.6);
  const ref = normal.length ? normal.reduce((a, b) => a + b, 0) / normal.length : 0;
  if (ref > 0 && base.mid > ref * 1.3) {
    const mid = Math.round(ref * 1.3);
    return { lo: Math.round(mid * 0.9), hi: mid, mid, note: `Zátěž omezena na +30 % proti běžnému týdnu (${Math.round(ref)} → max. ${mid}) – prudší skok zvyšuje riziko přetížení.` };
  }
  return { ...base, note: null };
}

/** Nejdelší Z2 podle cíle a dne (min): Zlepšit jezdí déle, Pokles kratší. */
export function z2MaxMinutes(goal: PlanInput["goal"], weekend: boolean, offSeason: boolean): number {
  const up = goal === "zvyseni" || goal === "zavod";
  if (weekend) return offSeason ? (up ? 150 : goal === "pokles" ? 105 : 120) : up ? 210 : goal === "pokles" ? 150 : 180;
  return up ? 120 : goal === "pokles" ? 80 : 90;
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
  sport?: PlanSport;
  goal?: string;
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
  /** sport jednotky (ride | run | xc_ski | walk) */
  sport: PlanSport;
  /** volno zvolené uživatelem */
  userRest?: boolean;
  /** vlastní jízda zadaná uživatelem (délka, s kým) */
  own?: OwnRide | null;
  /** den upravený uživatelem (sport, druh, délka, volno, vlastní jízda) */
  mine?: boolean;
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
export const GOAL_SHORT: Record<string, string> = { zvyseni: "Zlepšit", udrzeni: "Udržet", pokles: "Řízený pokles", zavod: "Závod" };
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
  sport: PlanSport;
  /** volno zvolené uživatelem – plán ho nezaplní */
  userRest?: boolean;
  /** sport zvolený uživatelem – počasí den nepřesouvá */
  userPick?: boolean;
  /** jednotka z kalendáře vznikla pro jiný cíl → délka a zátěž se počítají znovu */
  replan?: boolean;
  /** druh zvolený uživatelem (přesun kvality / „místo toho Z2“) */
  userType?: "z2" | "quality";
  /** délka zadaná uživatelem (min) – plán ji nemění */
  userMin?: number;
  /** vlastní jízda (zadal jsi délku) – plán ji nemění, jen započítá zátěž */
  own?: OwnRide;
}

/** Zátěž vlastní jízdy: jako Z2 stejné délky, se skupinou o 15 % víc (jede se nerovnoměrně, dotahuje se). */
function ownLoad(o: OwnRide, acts: ActDay[], today: string): number {
  const base = estimateLoad(o.min >= 120 ? "long" : "z2", null, o.min, acts, today).load;
  return Math.round(base * (o.with ? 1.15 : 1));
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
  // „odjeto“ = jakýkoli vytrvalostní trénink (kolo, běh, běžky, chůze), ne jen kolo
  const rodeOn = (d: string) => (actsBy.get(d) ?? []).some((a) => ENDURANCE_SPORTS.includes(a.sport) && (a.moving_s ?? 0) >= 20 * 60);
  // volba uživatele pro den: sport (ride | run | xc_ski | walk) nebo „rest“ = volno
  const sportBy = new Map<string, PlanSport | "rest">();
  for (const c of inp.constraints) if (c.kind === "sport" && c.note) sportBy.set(c.date, c.note as PlanSport | "rest");
  const typeBy = new Map<string, "z2" | "quality">();
  for (const c of inp.constraints) if (c.kind === "typ" && (c.note === "z2" || c.note === "quality")) typeBy.set(c.date, c.note);
  // nejvýš dní tréninku za sebou: zlepšení / závod 3, jinak 2 (mimo sezónu a při poklesu víc volna)
  const maxRun = inp.goal === "zvyseni" || inp.goal === "zavod" ? 3 : 2;
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
  const calPast = inp.calendar.filter((c) => c.kind !== "rest" && (c.status === "planned" || c.status === "moved" || c.status === "missed" || c.status === "done"));
  for (const c of calPast) {
    if (c.date > T || (c.date === T && !todayDone)) continue;
    if (c.status === "done" || rodeOn(c.date)) done.push({ id: c.id, date: c.date });
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
    const pick = sportBy.get(d);
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
      sport: pick && pick !== "rest" ? pick : ((cal?.sport as PlanSport) || "ride"),
      userPick: !!pick && pick !== "rest",
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
    } else if (cons.some((c) => c.kind === "jizda") && readOwnRide(cons.find((c) => c.kind === "jizda")!.note)) {
      // vlastní jízda: pevná délka, plán den nemění (ani kvůli počasí), ostatní dny týdne se dopočítají
      const o = readOwnRide(cons.find((c) => c.kind === "jizda")!.note)!;
      s.own = o;
      s.kind = o.min >= 120 ? "long" : "z2";
      s.minutes = o.min;
      s.userPick = true;
      s.fixedName = ownRideName(o);
      s.changed = cal && cal.name === s.fixedName ? null : cal ? "upravit" : "nová";
      s.why.push(`tvoje jízda${o.with ? (o.with === "skupina" ? " ve skupině" : ` s ${o.with}`) : ""}`);
    } else if (cal) {
      s.kind = cal.kind;
      s.qualityType = (cal.quality_type as QualityType) ?? (cal.kind === "quality" ? qualityFromName(cal.name) : null);
      s.minutes = cal.duration_min ?? 60;
      s.indoor = !!cal.indoor;
      s.fixedName = cal.name;
      s.workout = parseWorkout(cal.steps_json);
      const calSport = (cal.sport as PlanSport) || "ride";
      const redo = (why: string) => {
        s.changed = "upravit";
        s.why.push(why);
        s.fixedName = undefined;
        s.workout = undefined;
      };
      // jiný sport, než je v kalendáři (napsal jsi „zítra běh místo kola“)
      if (s.sport !== calSport) redo(`${SPORT_LABEL[s.sport]} místo ${({ ride: "kola", run: "běhu", xc_ski: "běžek", walk: "chůze" } as Record<string, string>)[calSport] ?? calSport}`);
      // jednotka vznikla pro jiný cíl → přepočítat (změna Zlepšit / Udržet / Pokles)
      else if (cal.goal !== inp.goal && !(d === T && todayDone)) {
        redo(`přepočet pro cíl ${GOAL_SHORT[inp.goal]}`);
        s.replan = true;
      }
    }
    // volba ve dni bez omezení: „volno“ zruší trénink, sport ve dni volna přidá jednotku
    const free = s.kind !== "hockey" && s.kind !== "xc_ski" && s.kind !== "blocked";
    if (free && pick === "rest") {
      if (cal) {
        s.changed = "smazat";
        s.why.push("volno (tvoje volba)");
      }
      s.kind = "rest";
      s.userRest = true;
      s.minutes = 0;
      s.fixedName = undefined;
      s.workout = undefined;
      s.note.push("Volno (tvoje volba).");
    } else if (free && pick && s.kind === "rest" && !s.own) {
      s.kind = "z2";
      s.minutes = 60;
      s.changed = "nová";
      s.why.push(`${SPORT_LABEL[pick]} (tvoje volba)`);
    }
    // druh jednotky zvolený uživatelem: kvalita přesunutá na jiný den / „místo toho Z2“
    const ut = typeBy.get(d);
    if (free && ut && pick !== "rest" && !s.own) {
      s.userType = ut;
      if (ut === "z2" && s.kind === "quality") {
        s.kind = "z2";
        s.qualityType = null;
        s.fixedName = undefined;
        s.workout = undefined;
        s.minutes = s.minutes || 60;
        s.changed = cal ? "upravit" : "nová";
        s.why.push("místo kvality Z2 (tvoje volba)");
      } else if (ut === "quality" && s.kind !== "quality") {
        s.changed = s.kind === "rest" ? "nová" : cal ? "upravit" : "nová";
        s.kind = "quality";
        s.qualityType = null;
        s.fixedName = undefined;
        s.workout = undefined;
        s.minutes = 75;
        s.why.push("kvalita přesunutá sem (tvoje volba)");
      }
    }
    // délka zadaná uživatelem (kratší / delší trénink)
    const dl = cons.find((c) => c.kind === "delka");
    if (dl && Number(dl.note) >= 20 && !s.own && ["z2", "long", "quality", "recovery"].includes(s.kind as string)) {
      s.userMin = Math.round(Number(dl.note));
      s.minutes = s.userMin;
      s.fixedName = undefined;
      s.workout = undefined;
      s.changed = s.changed ?? (cal ? "upravit" : "nová");
      s.why.push(`délka ${minHm(s.userMin)} (tvoje volba)`);
    }
    // běh bez pravidelného běhání: žádné intervaly (riziko zranění), jen Z2
    if (s.sport === "run" && s.kind === "quality" && !inp.runExperienced && s.userType !== "quality") {
      s.kind = "z2";
      s.qualityType = null;
      s.fixedName = undefined;
      s.workout = undefined;
      s.changed = s.changed ?? (cal ? "upravit" : null);
      s.why.push("běh zatím bez intervalů – běháš málo (méně než 6× za 60 dní)");
    }
    // chůze je regenerace: kvalitu ani Z2 tepem (Z4 = rychlý běh) chůzí nesplníš
    if (s.sport === "walk" && (s.kind === "quality" || s.kind === "z2" || s.kind === "long")) {
      if (cal && s.changed !== "upravit") {
        s.changed = "upravit";
        s.why.push("chůze je regenerace, ne trénink do zón");
      }
      s.kind = "recovery";
      s.qualityType = null;
      s.fixedName = undefined;
      s.workout = undefined;
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

  const isTrain = (d: string): boolean => {
    const sl = slots.find((x) => x.date === d);
    if (sl) return sl.kind !== "rest" && sl.kind !== "blocked";
    return rodeOn(d) || qualityOn(d);
  };
  /** kolik dní tréninku by bylo za sebou, kdyby se v den d trénovalo */
  const streakIf = (d: string): number => {
    let n = 1;
    for (let x = addDays(d, -1); isTrain(x) && n < 10; x = addDays(x, -1)) n++;
    for (let x = addDays(d, 1); isTrain(x) && n < 10; x = addDays(x, 1)) n++;
    return n;
  };

  // Přesuny kalendářních jednotek z blokovaných dnů (výměnou, 6.1b)
  const moveQueue: Slot[] = slots.filter((s) => s.cal && s.changed === "smazat" && !s.userRest);

  // ---- po týdnech ----
  const weeks = [...new Set(dates.map(mondayOf))];
  const ctlRef = inp.startYesterday.ctl;
  const adj = weekTargetAdjusted(weeklyLoadTarget(ctlRef, inp.goal), inp.weekLoads, inp.goal);
  // únava: forma (CTL − ATL) hluboko v minusu → týden lehčí, ať nehrozí přetížení (pod −30 Vysoké riziko)
  const formY = inp.startYesterday.ctl - inp.startYesterday.atl;
  const tired = formY < -30 ? 0.75 : formY < -20 ? 0.88 : 1;
  const weeklyTarget = { lo: Math.round(adj.lo * tired), hi: Math.round(adj.hi * tired), mid: Math.round(adj.mid * tired) };
  if (tired < 1) warnings.push(`Únava: forma ${num(formY, 1)} – týden o ${Math.round((1 - tired) * 100)} % lehčí (cíl ${weeklyTarget.mid}).`);
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
      if (s.userType === "quality") {
        qCount++;
        if (prevDayHard(s.date)) s.note.push("Pozor: den po kvalitě nebo hokeji – tvoje volba, jeď podle pocitu.");
        continue;
      }
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
      const swap = wSlots.find((s) => s.kind === "z2" && s.cal && !s.userType && !s.userPick && !prevDayHard(s.date) && !nextDayHard(s.date));
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
    const ridesTarget = Math.max(2, Math.min(4, inp.ridesPerWeek));
    let rides = doneRides + wSlots.filter((s) => s.kind === "z2" || s.kind === "quality" || s.kind === "long" || s.kind === "recovery").length;
    const empty = () => wSlots.filter((s) => s.kind === "rest" && !s.cal && s.date !== T && !s.userRest);

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
        if (target.kind === "quality") {
          if (qCount >= limit) {
            target.kind = "z2";
            target.qualityType = null;
            target.workout = undefined;
            target.why.push(`limit kvality ${limit} týdně`);
          } else qCount++;
        }
        if (target.kind === "z2" || target.kind === "quality" || target.kind === "long" || target.kind === "recovery") rides++;
      }
    }

    if (qCount < limit && rides < ridesTarget + 1) {
      const cand = empty()
        .filter((s) => s.userType !== "z2" && !prevDayHard(s.date) && !nextDayHard(s.date) && !recentIllness(s.date) && streakIf(s.date) <= maxRun)
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
    // kvalita pořád chybí (týden zaplnily tvoje volby sportu / jízdy) → dát ji na kolový den se Z2,
    // ne den po / před kvalitou nebo hokejem; tvůj den „místo toho Z2“ a vlastní jízdu nech být
    if (qCount < limit) {
      const conv = wSlots
        .filter((s) => s.kind === "z2" && s.sport === "ride" && !s.own && s.userType !== "z2" && s.date !== T && !prevDayHard(s.date) && !nextDayHard(s.date) && !recentIllness(s.date))
        .sort((a, b) => DOW_QUALITY_PREF.indexOf(dow(a.date)) - DOW_QUALITY_PREF.indexOf(dow(b.date)));
      const c = conv[0];
      if (c && (inp.recovery !== "red" || c.date !== addDays(T, 1))) {
        c.kind = "quality";
        c.qualityType = null;
        c.fixedName = undefined;
        c.workout = undefined;
        c.minutes = c.userMin ?? 75;
        c.changed = c.changed ?? (c.cal ? "upravit" : "nová");
        c.why.push("kvalita týdne na kolový den");
        qCount++;
      }
    }
    while (rides < ridesTarget) {
      const cand = empty().filter((s) => !recentIllness(s.date) && streakIf(s.date) <= maxRun);
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

    // 4) délky podle týdenní zátěže (6.6 krok 1) – nové Z2 i Z2 přepočítávané pro nový cíl
    const newZ2 = wSlots.filter((s) => (s.kind === "z2" || s.kind === "long") && !s.userMin && ((!s.cal && !s.fixedName) || s.replan));
    // nová kvalita (bez hotového workoutu) se počítá zvlášť jako qLoad – ne podruhé ve fixní zátěži
    const qSlot0 = wSlots.find((s) => s.kind === "quality" && !s.fixedName);
    const fixedLoad = wSlots
      .filter((s) => (s.cal || s.fixedName || s.userMin) && !newZ2.includes(s) && s !== qSlot0)
      .reduce((t, s) => {
        // stejný odhad jako ve výsledném plánu: zátěž z kalendáře jen u nezměněné jednotky
        // (u „běh místo kola“ by jinak zůstala zátěž původní jízdy a Z2 vyšly krátké)
        if (s.own) return t + ownLoad(s.own, inp.acts, T);
        if (s.sport !== "ride") {
          const k = s.kind as "z2" | "quality" | "long" | "recovery";
          const min = s.cal?.sport === s.sport && s.minutes ? s.minutes : otherMinutes(s.sport, s.minutes || 60, k);
          const f = s.kind === "quality" ? 0.82 : s.sport === "walk" || s.kind === "recovery" ? 0.5 : 0.68;
          return t + Math.round((min / 60) * f * f * 100);
        }
        if (s.cal?.target_load && !s.changed) return t + s.cal.target_load;
        return t + estimateLoad(s.kind as Kind, s.qualityType, s.minutes, inp.acts, T).load;
      }, 0);
    const hockeyLoad = wSlots.filter((s) => s.kind === "hockey" || s.kind === "xc_ski").length * 70;
    const qSlot = wSlots.find((s) => s.kind === "quality" && !s.fixedName);
    const qLoad = qSlot ? estimateLoad("quality", null, 75, inp.acts, T).load : 0;
    if (qSlot && !qSlot.userMin) qSlot.minutes = 75;
    const daysInWeekPlanned = wSlots.length;
    const weekShare = Math.min(1, daysInWeekPlanned / 7 + (doneLoad > 0 ? 0 : 0));
    const share = pastActs.length || wSlots.length === 7 ? 1 : weekShare;
    const remaining = Math.max(0, weeklyTarget.mid - doneLoad - fixedLoad - hockeyLoad - qLoad) * share;
    // délka Z2 = délka, jejíž odhad zátěže (stejný jako u výsledného tréninku) je nejblíž potřebě – dřív
    // se počítalo z hodinové sazby a týden pak vycházel pod cílem
    const minMin = inp.goal === "pokles" ? 45 : 60;
    const z2Min = (date: string, per: number) => {
      const weekend = dow(date) >= 6;
      const maxM = z2MaxMinutes(inp.goal, weekend, isOffSeason(date));
      let best = minMin, bd = Infinity;
      for (let m = minMin; m <= maxM; m += 15) {
        const d = Math.abs(estimateLoad(m >= 120 && weekend ? "long" : "z2", null, m, inp.acts, T).load - per);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    };
    const setZ2 = (s: Slot, min: number) => {
      const weekend = dow(s.date) >= 6;
      s.minutes = min;
      if (min >= 120 && weekend) s.kind = "long";
      else if (s.kind === "long") s.kind = "z2";
    };
    // víkend dostane větší podíl (dlouhá jízda), všední dny kratší
    const wgt = (s: Slot) => (dow(s.date) >= 6 ? 1.5 : 1);
    const split = () => { const W = newZ2.reduce((t, s) => t + wgt(s), 0) || 1; for (const s of newZ2) setZ2(s, z2Min(s.date, (remaining * wgt(s)) / W)); };
    split();
    // Když se cíl týdne nevejde ani do nejdelších Z2, přidat jízdu do volného dne (raději víkend a hezké počasí,
    // bez porušení max. dní za sebou). Přidaná jízda dostane jen to, co chybí – ostatní jízdy se NEzkracují
    // (dřív se zátěž rozpočítala znovu a u Zlepšit pak vyšly všední jízdy kratší než u Udržet).
    // Zlepšit / Závod doplňují do středu pásma, Udržet do spodní hranice, Pokles nikdy.
    const up = inp.goal === "zvyseni" || inp.goal === "zavod";
    const need = up ? remaining : Math.max(0, weeklyTarget.lo - doneLoad - fixedLoad - hockeyLoad - qLoad) * share;
    const est = (s: Slot) => estimateLoad(s.kind as Kind, null, s.minutes, inp.acts, T).load;
    let short = need - newZ2.reduce((t, s) => t + est(s), 0);
    while (newZ2.length && short > need * 0.08 && rides < inp.ridesPerWeek + (up ? 2 : 1)) {
      const cand = empty().filter((s) => !recentIllness(s.date) && streakIf(s.date) <= maxRun && s.userType !== "quality");
      if (!cand.length) break;
      cand.sort((a, b) => (dow(b.date) >= 6 ? 2 : 0) + (inp.weather.get(b.date)?.bad ? -2 : 0) - ((dow(a.date) >= 6 ? 2 : 0) + (inp.weather.get(a.date)?.bad ? -2 : 0)) || a.date.localeCompare(b.date));
      const pick = cand[0]!;
      pick.kind = "z2";
      pick.changed = "nová";
      pick.why.push(`Z2 navíc – cíl ${GOAL_SHORT[inp.goal]} se jinak nevejde`);
      setZ2(pick, z2Min(pick.date, short));
      newZ2.push(pick);
      rides++;
      short = need - newZ2.reduce((t, s) => t + est(s), 0);
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
    const sessions = doneRides + wSlots.filter((s) => ["z2", "quality", "long", "recovery", "hockey", "xc_ski"].includes(s.kind as string)).length;
    if (sessions > inp.ridesPerWeek + 1) warnings.push(`Týden od ${dayDm(mon)} má ${sessions} tréninků, nastaveno ${inp.ridesPerWeek} – zvaž volno (ikona 🛋️ u dne).`);
    const longRun = wSlots.find((s) => isTrain(s.date) && streakIf(s.date) > maxRun);
    if (longRun) warnings.push(`Kolem ${dayDm(longRun.date)} je ${streakIf(longRun.date)} dní tréninku za sebou – doporučuji max. ${maxRun}, pak volno.`);
    qualityWeeks.push({ from: mon, to: sun, count: qCount, limit });
  }

  // ---- počasí (kap. 8): kvalita na trenažér, Z2 přesunout nebo trenažér ----
  for (const s of slots) {
    if (!["z2", "quality", "long"].includes(s.kind as string)) continue;
    if (s.sport !== "ride") continue; // běh, běžky, chůze: počasí plán nemění
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
    if (w && w.bad && !s.indoor && s.userPick) {
      // den zvolený uživatelem se kvůli počasí nepřesouvá
      s.note.push(`Počasí: ${weatherWhy(w)} – den nechávám, je to tvoje volba (případně trenažér).`);
      continue;
    }
    if (w && w.bad && !s.indoor) {
      // přesun Z2 na volný den téhož týdne s dobrým počasím
      const mon = mondayOf(s.date);
      const target = slots.find(
        (x) => x.kind === "rest" && !x.cal && !x.userRest && x.date !== T && mondayOf(x.date) === mon && (() => { const ww = inp.weather.get(x.date); return ww && !ww.bad; })() && !prevDayHard(x.date) === true,
      );
      if (target && s.date !== T) {
        const origId = s.cal?.id ?? (s as any).moveId;
        Object.assign(target, { kind: s.kind, minutes: s.minutes, indoor: false, qualityType: null, fixedName: s.fixedName, workout: s.workout, movedFrom: s.movedFrom ?? s.date, changed: origId ? "přesunout" : "nová" });
        target.why = [...s.why, `z ${dayDm(s.date)}: ${weatherWhy(w)}`];
        (target as any).moveId = origId;
        (s as any).moveId = undefined;
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
  if (todaySlot && inp.recovery && inp.recovery !== "green" && (todaySlot.kind === "z2" || todaySlot.kind === "quality" || todaySlot.kind === "long" || todaySlot.kind === "recovery")) {
    if (inp.recovery === "red") {
      todaySlot.why.push("🔴 neodpočatý: volno nebo Z1 do 45 min");
      todaySlot.kind = "recovery";
      todaySlot.minutes = Math.min(45, todaySlot.minutes || 45);
      todaySlot.qualityType = null;
      todaySlot.changed = "upravit";
    } else if (todaySlot.kind === "quality") {
      todaySlot.kind = "z2";
      todaySlot.qualityType = null;
      todaySlot.changed = "upravit";
      todaySlot.why.push("🟡 částečně odpočatý: kvalita → Z2");
    } else if (todaySlot.kind === "z2" || todaySlot.kind === "long") {
      todaySlot.minutes = Math.max(45, Math.round((todaySlot.minutes * 2) / 3 / 5) * 5);
      todaySlot.changed = "upravit";
      todaySlot.why.push("🟡 částečně odpočatý: zkráceno o třetinu");
    }
    if (todaySlot.changed === "upravit") todaySlot.fixedName = undefined;
  }

  // ---- stavba workoutů, názvy, zátěž ----
  const lastWeekQ = lastQualityType(inp, T);
  // pestrost kvality: zaměření posledních kvalit (odjeté + už naplánované v tomto běhu)
  const recentQ: { date: string; type: QualityType }[] = inp.acts
    .filter((a) => a.is_quality && a.quality_type && isBike(a.sport) && a.date >= addDays(T, -10))
    .map((a) => ({ date: a.date, type: a.quality_type as QualityType }));
  const avoidFor = (d: string) => [...new Set(recentQ.filter((q) => q.date < d && q.date >= addDays(d, -10)).map((q) => q.type))];
  for (const s of slots) {
    if (!["z2", "quality", "long", "recovery"].includes(s.kind as string)) continue;
    if (s.own) {
      s.workout = z2Workout({ ftp: inp.ftp }, s.own.min);
      s.fixedName = ownRideName(s.own);
      s.minutes = s.own.min;
      s.load = ownLoad(s.own, inp.acts, T);
      s.loadNote = s.own.with ? "odhad Z2 + 15 % (skupina)" : "odhad jako Z2";
      s.reason = "Vlastní jízda – trasu i tempo volíš ty, trenér jen počítá zátěž. Drž se spíš Z2, ať další dny platí.";
      continue;
    }
    // jiný sport než kolo: náhradní jednotka podle tepu
    if (s.sport !== "ride") {
      // jiné sporty nemají pravidla lapů (7.3 platí jen pro kolo)
      const keep = s.fixedName && !s.changed && s.workout;
      if (!keep) {
        const k = s.kind as "z2" | "quality" | "long" | "recovery";
        const min = s.cal?.sport === s.sport && s.minutes ? s.minutes : otherMinutes(s.sport, s.minutes || 60, k);
        const ow = otherWorkout(s.sport, k, min);
        s.workout = ow.workout;
        s.fixedName = ow.name;
        s.minutes = Math.round(totalSeconds(ow.workout) / 60);
        s.indoor = false;
        s.qualityType = null;
        if (!s.changed && !s.cal) s.changed = "nová";
        s.reason = k === "quality" ? `${SPORT_LABEL[s.sport]} místo kola: intervaly podle tepu (Z4), stejný záměr jako kvalita na kole.` : "";
      }
      const f = s.kind === "quality" ? 0.82 : s.sport === "walk" || s.kind === "recovery" ? 0.5 : 0.68;
      s.load = s.cal?.target_load && !s.changed ? s.cal.target_load : Math.round((s.minutes / 60) * f * f * 100);
      s.loadNote = "odhad z tepu";
      continue;
    }
    let keepCal = s.fixedName && !s.changed && s.workout;
    if (keepCal && s.kind === "quality" && s.qualityType && avoidFor(s.date).includes(s.qualityType)) {
      // stejné zaměření jako předchozí kvalita → navrhnout jiné
      s.changed = "upravit";
      s.why.push(`jiné zaměření než předchozí ${QUALITY_NAME[s.qualityType]}`);
      s.qualityType = null;
      s.fixedName = undefined;
      keepCal = false;
    }
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
        if (s.kind === "quality" && s.qualityType) recentQ.push({ date: s.date, type: s.qualityType });
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
        forceFocus: s.qualityType && !avoidFor(s.date).includes(s.qualityType) ? s.qualityType : null,
        avoid: avoidFor(s.date),
        goal: inp.goal,
      });
      recentQ.push({ date: s.date, type: d.type });
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
    if (ride && s.sport === "xc_ski") {
      targetText = s.kind === "quality" ? "pocitově naplno (úseky do kopce, bez hlídání hodinek)" : "pocitově lehce, ať se dá mluvit";
    } else if (ride && s.sport !== "ride") {
      const z = s.kind === "quality" ? 4 : s.kind === "recovery" || s.sport === "walk" ? 1 : 2;
      targetText = inp.hr ? `❤️ Z${z} (${hrZoneRange(inp.hr, z).join("–")} bpm)${z === 4 ? `, pauzy Z1` : ""}` : `❤️ Z${z} tepu`;
    } else if (ride && s.kind !== "quality") {
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
    const tag0 =
      s.kind === "quality" ? "Kvalita" : s.kind === "z2" ? "Z2" : s.kind === "long" ? "Z2 dlouhá" : s.kind === "recovery" ? "Z1" : s.kind === "hockey" ? "Hokej" : s.kind === "xc_ski" ? "Běžky" : "Volno";
    const tag = s.own ? "Vlastní" : ride && s.sport !== "ride" ? `${SPORT_LABEL[s.sport]} · ${tag0}` : tag0;
    const noteParts = [...s.note];
    const whyTxt = cap(s.why.join("; ")) + ".";
    if (s.why.length && s.changed && !noteParts.some((n) => n.toLowerCase() === whyTxt.toLowerCase())) noteParts.push(whyTxt);
    if (s.reason && (s.kind === "quality" || s.own)) noteParts.push(s.reason);
    if (s.date === T && inp.recovery === "green" && ride) noteParts.unshift("🟢 ráno odpočatý, beze změny.");
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
      steps: ride && s.workout && s.sport !== "xc_ski" && (s.kind === "quality" || s.kind === "z2" || s.kind === "long") ? humanSteps(s.workout) : [],
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
      sport: s.sport,
      userRest: !!s.userRest,
      own: s.own ?? null,
      mine: !!(s.userPick || s.userType || s.userMin || s.own || s.userRest),
    };
  });

  // ---- změny v kalendáři (7.1) ----
  const changes: Change[] = [];
  let n = 0;
  const code = () => `#${++n}`; // #1, #2… (dřív Z1 – pletlo se se zónami)
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
        sport: s.sport,
        goal: inp.goal,
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
