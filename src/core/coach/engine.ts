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
import { type EngineAct, MAX_DAY_MIN, MAX_STREAK, type ProgressRow, easyRate, fixedFromConstraints, runCapOf } from "./common";
import { type Built, type Cat, type WorkPlan, type Zones, CAT_NAME as CAT_WORD, START_TIER, applyStepEdit, buildWorkout, catCandidates, catNeeds, chooseCat, isCat } from "./library";
import type { CoachProfile } from "./profile";
import { type Distribution, distribution } from "./progress";

/** Nejdelší dlouhá jízda na trenažéru (min). Hodina na trenažéru odpovídá 1,25–1,5 h venku (CTS, Roadman: koeficient
 *  1,3–1,5), takže 2 h uvnitř ≈ 2,5–3 h venku; konkrétní strop je vlastní volba. */
export const INDOOR_LONG_MAX = 120;
import { runReadiness } from "./run";
import type { Reentry } from "./reentry";
import { type Fatigue, fatigueFactor, formFloor } from "./target";
import { type WeekValidation, validateWeek } from "./validate";
import type { Fixed, PastDay as V2Past } from "./common";
import { type WeekTarget, TWO_KEYS_MIN_H, blockWeeksFor, historyBase, nextBlock, usualSessions, weekHistory, weekTarget } from "./budget";
import { type PastDay, type SkDay, solveWeek } from "./skeleton";
import { ROLE_INTENSITY, type Role, capsFor, loadFor, minutesFor, nameFor, relabel, stepsText } from "./sport";

export interface CoachInput {
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
  /** odjeté kvality (kategorie) – střídání kategorií přes týdny */
  keyHistory?: { date: string; cat: Cat }[];
  /** posledně naplánované tréninky z knihovny (kvality) – na stejném stupni se střídají */
  recentWids?: { date: string; sport: PlanSport; cat: Cat; wid: string }[];
  /** interní: plán týdne tak, jak by vypadal v pondělí (bez rekurze) */
  mondayMode?: boolean;
  /** uložený pondělní plán tohoto týdne (src/report/build.ts ho uloží při prvním spuštění v týdnu); null = spočítat */
  mondayPlan?: MondayPlan | null;
  /** návrat po pauze: strop intenzity po dnech (src/core/coach/reentry.ts); null = bez omezení */
  reentry?: Reentry | null;
}

/** 🟡 ráno: kvalita o stupeň lehčí (VO2 a kratší ostré → práh, práh a over-under → sweet spot, sweet spot → tempo,
 *  tempo → Z2) a o čtvrtinu kratší. Stupně a ×0,75 jsou vlastní volba (docs/trener/zdroje.md). */
export const STEP_DOWN: Record<Cat, Cat | null> = { nm: "thr", ana: "thr", vo2s: "thr", vo2: "thr", ou: "ss", thr: "ss", ss: "tempo", tempo: null };
export const YELLOW_CUT = 0.75;

/** Pondělní plán týdne: z něj se rozběhnutý týden dopočítává. Uloží se jednou, ať únava a nová omezení mění jen
 *  dnešek a budoucí dny – ne odjeté dny a ne dvakrát. */
export interface MondayPlan {
  weekStart: string;
  /** cíl, pro který byl spočítaný – po změně cíle se počítá znovu */
  goal: Goal;
  /** násobek únavy, se kterým byl spočítaný (únava se pak počítá jen nad jeho rámec) */
  fatigue: number;
  week: CoachInfo["horizon"][number];
  /** spočítaný v pondělí před prvním tréninkem – do konce pondělí se smí přepsat */
  monday: boolean;
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
  /** kvalita: stupeň náročnosti a cílové úseky (pro vyhodnocení po odjetí) */
  level?: number;
  /** základní stupeň kategorie (level bývá o stupeň níž) a trénink z knihovny */
  base?: number;
  wid?: string | null;
  wplan?: WorkPlan | null;
  /** zátěž, kterou by den měl podle cíle týdne (před stropy délek) */
  want: number;
  /** délka z pondělního plánu – platí i když strop délky během týdne klesne (okno 28 dní se posune) */
  keepMin?: number;
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

export interface CoachInfo {
  version: 3;
  phase: string;
  phaseLabel: string;
  cycleIdx: number;
  /** délka bloku včetně lehčího týdne (4, od 40 let 3) */
  cycleLen: number;
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
  /** dnešní kondice (jako na stránce), kondice na začátku týdne (pondělí) a kam dojde na konci týdne */
  ctlNow: number;
  ctlWeekStart: number;
  /** Zima: zimní základ (vrchol sezóny − 42,5 %) */
  floor: number | null;
  ctlTarget: number;
  notes: string[];
  distribution: Distribution | null;
  plannedHard: number;
  plannedLoad: number;
  validation: WeekValidation;
  /** kvality v plánu (tento a příští týden) – uloží se v den tréninku a po odjetí vyhodnotí */
  keyDays: { date: string; sport: PlanSport; cat: Cat; level: number; base: number; wid: string | null; plan: WorkPlan | null; minutes: number; name: string | null }[];
  /** výhled kondice: týdny plánu (+ případně další jen z cíle týdne, stejná pravidla, bez kostry) */
  outlook: { days: { date: string; load: number }[]; weeks: { weekStart: string; load: number; ctlEnd: number; recoveryWeek: boolean; phaseLabel: string; exact: boolean }[] };
  /** pondělní plán tohoto týdne k uložení (nebo ten uložený) */
  mondayPlan: MondayPlan | null;
  /** návrat po pauze (strop intenzity) – text pro stránku; null = bez omezení */
  reentry: string | null;
  horizon: { weekStart: string; detail: boolean; load: number; done: number; need: number; target: number; notes: string[]; limit: WeekTarget["limit"]; ctlStart: number; ctlEnd: number; ctlGoal: number; phaseLabel: string; recoveryWeek: boolean; days: { date: string; role: Role; sport: PlanSport; minutes: number; load: number; name: string | null; blocked: boolean; workout: Workout | null; steps: string[]; targetText: string | null; why: string[] }[] }[];
}

export type CoachPlan = PlanResult & { coach: CoachInfo };
/** Výhled kondice na tolik týdnů (graf na Trenérovi) – stejně daleko jako plán tréninků. Při větším čísle se další
 *  týdny dopočítají jen z cíle týdne (bez kostry). */
export const OUTLOOK_WEEKS = 4;

const KIND: Record<Role, Kind> = { rest: "rest", easy: "recovery", endurance: "z2", key: "quality", long: "long" };
const isBike = (s: Sport) => BIKE_SPORTS.includes(s);
const planSport = (s: Sport): PlanSport | null => (isBike(s) ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };
const SPORT_WORD: Record<PlanSport, string> = { ride: "kolo", run: "běh", xc_ski: "běžky", walk: "chůze" };
const SPORT_GEN: Record<PlanSport, string> = { ride: "kola", run: "běhu", xc_ski: "běžek", walk: "chůze" };

export function runCoach(inp: CoachInput): CoachPlan {
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
  const offIn = (ws: string) => [0, 1, 2, 3, 4, 5, 6].filter((i) => off.has(addDays(ws, i))).length;
  // 8 ukončených týdnů pro pozici v bloku (lehký týden, ladění) – starší 4 z aktivit, novější 4 = weekLoads
  const weekStarts8 = [8, 7, 6, 5, 4, 3, 2, 1].map((w) => addDays(W0, -7 * w));
  const loads8 = [...weekStarts8.slice(0, 4).map((ws) => Math.round(inp.acts.filter((a) => a.date >= ws && a.date < addDays(ws, 7)).reduce((t, a) => t + (a.load ?? 0), 0))), ...inp.weekLoads];
  const wh = weekHistory({ starts: weekStarts8, loads: loads8, off: weekStarts8.map(offIn), raceDate: inp.raceDate });
  const history = {
    weekLoads: inp.weekLoads,
    weekSessions: weekStarts4.map(sessionsIn),
    weekOff: weekStarts4.map(offIn),
    skip: wh.skip.slice(-4),
    block: wh.block,
    // vrchol sezóny: nejvyšší kondice za posledních 6 měsíců (zimní základ = jeho 57,5 %)
    seasonPeak: (() => { let mx = 0; for (let i = 1; i <= 183; i++) { const m = inp.metric(addDays(T, -i)); if (m && m.ctl > mx) mx = m.ctl; } return mx || null; })(),
  };
  const rides28 = inp.acts.filter((a) => a.date > addDays(T, -28) && planSport(a.sport) === p.primary && (a.moving_s ?? 0) >= 20 * 60).map((a) => (a.moving_s ?? 0) / 60);
  const longest = Math.round(Math.max(60, ...rides28));
  const typical = Math.round(median(rides28) ?? 60);
  const run = runReadiness(inp.acts, T, p.primary === "run");
  // typický běh za 4 týdny (medián, běhy od 15 min) – strop Z2 běhu
  const runTypical = Math.round(median(inp.acts.filter((a) => a.sport === "run" && a.date > addDays(T, -28) && (a.moving_s ?? 0) >= 15 * 60).map((a) => (a.moving_s ?? 0) / 60)) ?? 0);
  const rateOf = (s: PlanSport) => easyRate(inp.acts, T, s, s === "ride" && power);
  const fat = fatigueFactor(inp.fatigue);
  // návrat po pauze: první týden jen Z1–Z2, pak nejvýš tempo / sweet spot (tvoje výslovná kvalita platí)
  const ceilingOf = (d: string) => inp.reentry?.ceilingOn(d) ?? "full";

  // kondice, kterou vidíš na stránce: dnešek bez dnešního tréninku (po tréninku = start plánu)
  const ctlRef = todayDone ? startState.ctl : (inp.metric(T)?.ctl ?? startState.ctl);
  // cíl týdne vždy od kondice na konci neděle (začátek týdne); ctlRef je jen pro zobrazení „dnes“
  const binp = { goal: inp.goal, raceDate: inp.raceDate, from, ctlNow: startState.ctl, doneLoad, history, fatigue: fat.factor, weeks: 4, blockWeeks: blockWeeksFor(p.birthYear, T) };
  let blk = history.block;
  const fixed = fixedFromConstraints(inp.constraints);
  const needs = catNeeds(inp.power, T);
  // kategorie kvalit v horizontu → střídání (odjeté kvality zatím kategorii nemají – etapa 5)
  const usedWids: NonNullable<CoachInput["recentWids"]> = [];
  const usedCats: { date: string; cat: Cat }[] = (inp.keyHistory ?? []).filter((k) => k.date < from).map((k) => ({ date: k.date, cat: k.cat }));

  // Týden je vždy od pondělí. Když už běží, spočítá se nejdřív plán celého týdne tak, jak by vypadal v pondělí
  // (stejná logika, kondice z neděle). Zbylé dny dostanou zátěž, která na ně v pondělním plánu připadá:
  // co se vynechalo, se nedohání; co se odjelo navíc, se odečte. Dny volna v plánu tak vyváží tréninky téhož
  // týdne – bez toho by si trenér každý den „odpustil“ pokles kondice za den volna a plánoval čím dál míň.
  // Pondělní plán se uloží jednou (build.ts) a předává jako vstup; bez uloženého se spočítá znovu (jako dřív).
  const stored = !inp.mondayMode && inp.mondayPlan && inp.mondayPlan.weekStart === W0 && inp.mondayPlan.goal === inp.goal ? inp.mondayPlan : null;
  const mondayPlan: MondayPlan | null = inp.mondayMode ? null : from > W0 && from <= addDays(W0, 6)
    ? stored ?? { weekStart: W0, goal: inp.goal, fatigue: fat.factor, monday: false, week: runCoach({ ...inp, today: W0, acts: inp.acts.filter((a) => a.date < W0), recovery: "green", mondayMode: true, mondayPlan: null }).coach.horizon[0]! }
    : null;
  const monday = mondayPlan?.week ?? null;
  // dny, které z pondělního plánu odpadnou: nově zablokované, tvoje volno, 🔴 dnes (nedohání se)
  const lostBase = (d: string) => !!fixed.get(d)?.blocked || !!fixed.get(d)?.rest || (d === T && inp.recovery === "red");
  const mine = (d: string) => { const f = fixed.get(d); return !!(f && (f.sport || f.type || f.minutes || f.own || f.edit)); };
  // trénoval jsi navíc (dny, které pondělní plán neměl) → den z plánu, který by byl už 4. za sebou, je volno a nedohání
  // se (pravidlo nejvýš MAX_STREAK dny za sebou platí i proti skutečnosti, ne jen proti plánu); tvoje volby dne platí
  const streakRest = new Set<string>();
  if (monday) {
    let run = 0;
    for (let d = addDays(from, -3); d <= addDays(W0, 6); d = addDays(d, 1)) {
      const m = monday.days.find((x) => x.date === d);
      const t = d < from ? trainedOn(d) || d === inp.raceDate : !!m && m.role !== "rest" && !m.blocked && !lostBase(d);
      run = t ? run + 1 : 0;
      if (run > MAX_STREAK && d >= from && !mine(d)) { streakRest.add(d); run = 0; }
    }
  }
  const lostDay = (d: string) => lostBase(d) || streakRest.has(d);
  // únava nad rámec té, se kterou se pondělní plán počítal – jen zbylé dny, ne dvakrát
  const fRel = mondayPlan ? Math.min(1, fat.factor / Math.max(0.01, mondayPlan.fatigue)) : 1;
  const weekZero = (tg: WeekTarget, m: CoachInfo["horizon"][number]): WeekTarget => {
    const planDone = m.days.filter((x) => x.date < from).reduce((t, x) => t + x.load, 0);
    const rest = m.days.filter((x) => x.date >= from);
    const planRest = rest.reduce((t, x) => t + x.load, 0);
    const lost = rest.filter((x) => x.load > 0 && lostDay(x.date));
    const lostLoad = lost.reduce((t, x) => t + x.load, 0);
    const over = Math.max(0, Math.round(doneLoad - planDone));
    const missed = Math.max(0, Math.round(planDone - doneLoad));
    const before = Math.max(0, Math.round(planRest - lostLoad - over));
    const load = Math.round(before * fRel);
    const n1 = (x: number) => x.toFixed(1).replace(".", ",");
    const notes = [...m.notes];
    if (lostLoad > 0) notes.push(`${lost.map((x) => dayDm(x.date)).join(", ")}: trénink z plánu odpadá (−${Math.round(lostLoad)} zátěže), nedohání se.`);
    const extra = lost.filter((x) => streakRest.has(x.date));
    if (extra.length) notes.push(`${extra.map((x) => dayDm(x.date)).join(", ")}: volno – s tréninky navíc by to byly víc než ${MAX_STREAK} dny za sebou.`);
    if (fRel < 1) notes.push(`Únava: zbytek týdne o ${Math.round((1 - fRel) * 100)} % lehčí (${before} → ${load}).`);
    if (missed > 20) notes.push(`Od pondělí odjeto ${Math.round(doneLoad)} z plánovaných ${Math.round(planDone)} – co se nestihlo, se nedohání; zbytek týdne zůstává podle plánu.`);
    if (over > 5) notes.push(`Od pondělí odjeto o ${over} víc, než bylo v plánu – zbylé dny jsou o to lehčí.`);
    return { ...tg, ctlStart: m.ctlStart, ctlGoal: m.ctlGoal, need: Math.round(planRest), load, limit: fRel < 1 ? "únava" : missed > 20 ? tg.limit : m.limit ?? tg.limit, notes: notes.length ? notes : [`Cíl týdne od pondělní kondice ${n1(m.ctlStart)}.`] };
  };

  const weeks: Week3[] = [];
  let prevDays: Day3[] = [];
  let state = { ctl: startState.ctl, atl: startState.atl };
  let stateDate = addDays(from, -1);
  const doneKeys0 = inp.acts.filter((a) => a.date >= W0 && a.date < from && a.quality).length;
  const doneLong0 = inp.acts.some((a) => a.date >= W0 && a.date < from && (a.moving_s ?? 0) >= Math.max(110, typical * 1.5) * 60);

  for (let k = 0; k < binp.weeks; k++) {
    // cíl týdne od kondice, na kterou opravdu dojde plán předchozího týdne
    const tg = k === 0 && monday ? weekZero(weekTarget(binp, 0, state.ctl, blk), monday) : weekTarget(binp, k, state.ctl, blk);
    const detail = k <= 1;
    const dates: string[] = [];
    for (let d = tg.from; d < addDays(tg.weekStart, 7); d = addDays(d, 1)) dates.push(d);
    const winter = tg.winter;
    const rate = rateOf(p.primary).rate;
    // zimní krátké délky jen pro Zimu a Udržování – Zlepšit v zimě je záměrné budování základu, délky jako v sezóně
    const capsOf = (sport: PlanSport, role: Role) => capsFor({ sport, role, winter: tg.shortDays, longest, typical, runLongest: run.longest, runTypical });

    // kolik tréninků, kvalit a jestli dlouhý
    const capE = capsOf(p.primary, "endurance");
    const sessionLoad = rate * Math.min(capE.max, Math.max(capE.min, typical)) / 60;
    const nDays = dates.length;
    // aspoň tolik tréninků, kolik je potřeba, aby se zátěž vešla do stropů délek (v zimě krátké jízdy)
    const capLoad = rate * capsOf(p.primary, "long").max / 60 * 0.5 + rate * capE.max / 60 * 0.5;
    // kvalita má kratší strop než Z2 a dlouhý – počítá se zvlášť (jinak by sportovec s jedním dlouhým tréninkem týdně
    // dostal 2 tréninky a do jejich stropů by se zátěž nevešla)
    const keyCapLoad = loadFor(capsOf(p.primary, "key").max, rate, "key");
    const fitN = tg.phase === "post" ? Math.ceil(tg.load / capLoad) : 1 + Math.ceil(Math.max(0, tg.load - keyCapLoad) / capLoad);
    let sessions = tg.load <= 15 ? 0 : Math.max(1, Math.round(tg.load / sessionLoad), fitN);
    // nejvýš o jeden víc, než kolik tréninků obvykle máš (vážený průměr jako u zátěže, ne nejvíc za 4 týdny)
    const maxSess = Math.max(3, usualSessions(history) + 1);
    sessions = Math.min(sessions, nDays, maxSess, 6);
    // ladění (Bosquet 2007): méně objemu, ale stejně tréninků a intenzita zůstává → kratší tréninky
    if (tg.phase === "taper" && tg.load > 15) sessions = Math.min(nDays, Math.max(sessions, Math.round(history.weekSessions.reduce((t, x) => t + x, 0) / Math.max(1, history.weekSessions.length))));
    // nikdy víc tréninků, než kolik se jich do zátěže týdne vejde v nejkratší délce (jinak plán přeroste cíl – hlavně
    // ladění u malého objemu, kde se drží počet tréninků z historie)
    if (tg.load > 15) sessions = Math.min(sessions, Math.max(1, Math.floor((tg.load * 1.1) / Math.max(1, loadFor(capE.min, rate, "endurance")))));
    // dvě kvality jen v Rozvoji a jen když je na ně objem i zátěž: týden aspoň TWO_KEYS_MIN_H hodin (80/20 podle
    // času, Seiler) a po dvou kvalitách zbyde na ostatní tréninky aspoň jejich nejkratší délka
    const keyCap = capsOf(p.primary, "key").max;
    const kLoad2 = loadFor(keyCap, rate, "key");
    const weekLoad = tg.done + tg.load;
    const weekH = (2 * keyCap + (Math.max(0, weekLoad - 2 * kLoad2) / rate) * 60) / 60;
    const twoKeys = sessions >= 4 && weekH >= TWO_KEYS_MIN_H && weekLoad - 2 * kLoad2 >= (sessions - 2) * loadFor(capE.min, rate, "endurance");
    const phaseKeys = tg.phase === "build" && twoKeys ? 2 : 1;
    let keys = tg.phase === "post" ? 0 : sessions >= 3 ? phaseKeys : sessions === 2 ? 1 : 0;
    if (k === 0) keys = Math.max(0, Math.min(keys, fat.keysMax) - doneKeys0);
    else if (k === 1) keys = Math.min(keys, Math.max(1, fat.keysMax));
    const hasWeekend = dates.some((d) => dow(d) >= 6);
    // dlouhý jen když na něj po kvalitách zbyde zátěž aspoň na jeho minimální délku (jinak je to jen Z2)
    const keyLoad = loadFor(capsOf(p.primary, "key").max, rate, "key");
    const longMin = loadFor(capsOf(p.primary, "long").min, rate, "long");
    const long = tg.phase !== "post" && sessions >= 2 && hasWeekend && !(k === 0 && doneLong0) && tg.load - keys * keyLoad >= longMin + (sessions - keys - 1) * loadFor(capE.min, rate, "endurance");

    // může mít sport dne intervaly? (hlavní sport ano; další podle profilu, běh jen při pravidelném běhání)
    const qualityOk = (s: PlanSport) => s === p.primary || (!!p.sports[s]?.quality && (s !== "run" || run.experienced));
    // kostra
    const skDays: SkDay[] = dates.map((d) => {
      const f: Fixed | undefined = fixed.get(d);
      const w = inp.weather.get(d) ?? null;
      return {
        date: d,
        // den závodu je rezervovaný pro závod
        blocked: !!f?.blocked || (d === T && inp.recovery === "red") || d === inp.raceDate,
        rest: !!f?.rest,
        type: f?.type,
        must: !!(f?.sport || f?.minutes || f?.own || f?.edit),
        ownLong: !!f?.own && f.own.min >= 120,
        // 🟡 ráno, nebo tvůj sport dne bez intervalů (běžky, chůze…) – kvalita patří jinam
        // po závodě v témže týdnu už kvalita ne (den po závodě nikdy, i když závod v aktivitách není)
        noKey: ceilingOf(d) === "base" || (!!f?.sport && !qualityOk(f.sport)) || (!!inp.raceDate && d > inp.raceDate && d <= addDays(inp.raceDate, 7)),
        badWeather: !!w?.bad,
      };
    });
    const tail: PastDay[] = [1, 2, 3].map((i) => {
      const d = addDays(tg.from, -i);
      // den závodu je trénink a těžký den, i když je v plánu jako blokovaný a závod v aktivitách není
      if (d === inp.raceDate) return { date: d, trained: true, hard: true };
      const pd = prevDays.find((x) => x.date === d);
      if (pd) return { date: d, trained: pd.role !== "rest", hard: pd.role === "key" || pd.role === "long" };
      const acts = actsOn(d);
      const mins = acts.reduce((t, a) => t + (a.moving_s ?? 0) / 60, 0);
      // den závodu je těžký, i když závod v aktivitách není
      if (d === inp.raceDate) return { date: d, trained: true, hard: true };
      return { date: d, trained: mins >= 20, hard: acts.some((a) => a.quality) || mins >= Math.max(110, typical * 1.5) };
    });
    const habit: Record<number, number> = {};
    for (let i = 1; i <= 56; i++) { const d = addDays(T, -i); if (trainedOn(d)) habit[dow(d)] = (habit[dow(d)] ?? 0) + 1 / 8; }
    // špatné počasí o víkendu: dlouhý nejdřív na druhý víkendový den; když nejde, zůstane o víkendu a pojede se na
    // trenažéru (se stropem délky); teprve když se o víkendu nevejde vůbec, řešič vybere sám
    let sk = solveWeek({ days: skDays, tail, sessions, keys, long, habit });
    if (long && skDays.some((d) => d.badWeather && dow(d.date) >= 6)) {
      const wk = (d: SkDay) => dow(d.date) < 6;
      const a = solveWeek({ days: skDays.map((d) => ({ ...d, noLong: d.badWeather || wk(d) })), tail, sessions, keys, long, habit });
      const b = a.long ? a : solveWeek({ days: skDays.map((d) => ({ ...d, noLong: wk(d) })), tail, sessions, keys, long, habit });
      if (b.long) sk = b;
    }
    // rozběhnutý týden: zbylé dny přesně podle pondělního plánu (dny, druh, zátěž); mění je jen ranní stav
    // (🔴 volno, 🟡 dnes bez kvality) – jinak by každodenní nové rozdělení zbytku týdne tiše ubíralo zátěž
    const pinned = k === 0 && !!monday;
    const mDay = (d: string) => monday?.days.find((x) => x.date === d) ?? null;
    const roleWhy = new Map<string, string>();
    if (pinned) {
      for (const d of dates) {
        const m = mDay(d);
        let r: Role = m && !m.blocked && !lostDay(d) ? m.role : "rest";
        // tvoje volba zadaná až během týdne platí i proti pondělnímu plánu (trénink v den volna, kvalita, Z2)
        const f = fixed.get(d);
        if (f && !lostDay(d) && !skDays.find((x) => x.date === d)?.blocked) {
          if (f.type === "quality") r = "key";
          else if (f.type === "z2" && r === "key") r = "endurance";
          else if (r === "rest" && mine(d)) r = f.own && f.own.min >= 120 ? "long" : "endurance";
        }
        if (r === "key" && ceilingOf(d) === "base" && fixed.get(d)?.type !== "quality") { r = "endurance"; roleWhy.set(d, "místo kvality Z2 – návrat po pauze, první týden jen Z1–Z2"); }
        // do týdne po závodě kvalita ne (závod se mohl během týdne přidat nebo posunout)
        if (r === "key" && !!inp.raceDate && d > inp.raceDate && d <= addDays(inp.raceDate, 7) && fixed.get(d)?.type !== "quality") { r = "endurance"; roleWhy.set(d, "místo kvality Z2 – týden po závodě"); }
        // včera opravdu těžký den (kvalita podle zón, dlouhý, závod), který v plánu nebyl → dnes kvalita ne
        if (d === tg.from && r === "key" && fixed.get(d)?.type !== "quality" && tail[0]?.hard) { r = "endurance"; roleWhy.set(d, "místo kvality Z2 – včera byl těžký trénink"); }
        sk.roles.set(d, r);
      }
      // kvalita ne den po těžkém dni – i když se těžký den (tvoje dlouhá jízda, kvalita) objevil až během týdne
      for (const d of dates) {
        if (sk.roles.get(d) !== "key" || fixed.get(d)?.type === "quality") continue;
        const y = addDays(d, -1);
        const yr = sk.roles.get(y);
        if (yr === "key" || yr === "long" || (yr === undefined && tail.find((t) => t.date === y)?.hard)) { sk.roles.set(d, "endurance"); roleWhy.set(d, "místo kvality Z2 – den předtím je těžký trénink"); }
      }
      // nová únava / nemoc může ubrat kvality (pozdější → Z2), přidat ne
      const keyDays = dates.filter((d) => sk.roles.get(d) === "key" && fixed.get(d)?.type !== "quality");
      for (const d of keyDays.slice(Math.max(0, fat.keysMax - doneKeys0))) { sk.roles.set(d, "endurance"); roleWhy.set(d, `místo kvality Z2 – únava (kvalita nejvýš ${fat.keysMax}× týdně)`); }
      sk.notes.length = 0;
    }
    const notes = [...tg.notes, ...sk.notes];

    // další sporty z profilu: druhý hlavní sport (běh / kolo) nejvýš jeden vytrvalostní den týdně, běžky při sněhu
    // jeden vytrvalostní den týdně. Den drží zátěž, délka podle sportu (běh ve stropech běhu). Tvoje volba sportu
    // u dne (nebo už odjetý ten sport tento týden) se počítá.
    const autoSport = new Map<string, PlanSport>();
    const free = (d: string) => sk.roles.get(d) === "endurance" && !fixed.get(d)?.sport && !fixed.get(d)?.own && !autoSport.has(d);
    if (pinned) {
      for (const d of dates) { const m = mDay(d); if (m && m.sport !== p.primary && m.role === sk.roles.get(d) && !fixed.get(d)?.sport) autoSport.set(d, m.sport); }
    } else {
      const inWeek = (s: PlanSport) => dates.some((d) => fixed.get(d)?.sport === s) || (k === 0 && inp.acts.some((a) => a.date >= W0 && a.date < from && planSport(a.sport) === s && (a.moving_s ?? 0) >= 20 * 60));
      const other: PlanSport = p.primary === "ride" ? "run" : "ride";
      if (p.sports[other]?.enabled && !inWeek(other)) {
        const d = dates.find((x) => free(x) && dow(x) <= 5) ?? dates.find(free);
        if (d) autoSport.set(d, other);
      }
      if (p.snow && p.sports.xc_ski?.enabled && !inWeek("xc_ski")) {
        const d = [...dates].reverse().find(free);
        if (d) autoSport.set(d, "xc_ski");
      }
    }

    // dny: sport, cíl zátěže, délka
    const days: Day3[] = dates.map((d) => {
      const f = fixed.get(d);
      const role = sk.roles.get(d) ?? "rest";
      const sport: PlanSport = role === "rest" ? p.primary : (f?.sport ?? autoSport.get(d) ?? p.primary);
      return { date: d, role, sport, minutes: 0, load: 0, want: 0, name: null, workout: null, steps: [], targetText: null, indoor: false, qualityType: null, cat: null, tiz: 0, why: [], blocked: f?.blocked ?? (d === inp.raceDate ? "🏁 Závod – den D." : d === T && inp.recovery === "red" ? "🔴 ráno: volno, nebo Z1 do 45 min / procházka." : null), own: f?.own ?? null, mine: !!(f && (f.sport || f.type || f.minutes || f.own || f.edit)), userRest: !!f?.rest };
    });
    for (const x of days) { const w = roleWhy.get(x.date); if (w && x.role !== "rest") x.why.push(w); }
    const train = days.filter((x) => x.role !== "rest");
    const rOf = (x: Day3) => rateOf(x.sport).rate;
    const setMinutes = (x: Day3, m: number) => { x.minutes = m; x.load = loadFor(m, rOf(x), x.role); };
    // pevné dny: vlastní jízda a tvoje délka
    for (const x of train) {
      const f = fixed.get(x.date);
      if (x.own) { x.minutes = x.own.min; x.load = Math.round(loadFor(x.own.min, rOf(x), x.role === "key" ? "endurance" : x.role) * (x.own.with ? 1.15 : 1)); }
      // tvoje délka, nejvýš strop sportu (běh 4 h, kolo 7 h…)
      else if (f?.minutes) setMinutes(x, Math.min(f.minutes, MAX_DAY_MIN[x.sport]));
    }
    // kvalita: asi stejný čas jako Z2 den týdne (zátěž ×1,35 podle intenzity), nejvýš strop kvality hlavního sportu
    // (45–90 min, v zimě do 60). S pevným stropem by u malého objemu (2–3 h týdně) jedna kvalita snědla půl týdne
    // a plán by přestřelil cíl. Délka kvality = délka Z2 dne je vlastní volba (zdroje délku v minutách nedávají).
    const pinnedLen = (x: Day3) => !!x.own || !!fixed.get(x.date)?.minutes;
    const wOf = (x: Day3) => (x.role === "key" ? ROLE_INTENSITY.key : x.role === "long" ? 1.6 : x.role === "easy" ? 0.5 : 1);
    const flexW = train.filter((x) => !pinnedLen(x)).reduce((t, x) => t + wOf(x), 0);
    const flexLoad = Math.max(0, tg.load - train.filter(pinnedLen).reduce((t, x) => t + x.load, 0));
    for (const x of train) if (x.role === "key" && !pinnedLen(x)) {
      x.want = Math.min(loadFor(capsOf(p.primary, "key").max, rate, "key"), flexW > 0 ? (flexLoad * wOf(x)) / flexW : 0);
      const kc = capsOf(x.sport, "key");
      setMinutes(x, x.want > 0 ? minutesFor(x.want, rOf(x), "key", x.sport, kc) : kc.min);
    }
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
    // tvoje dny (vlastní jízda, délka) už spotřebovaly zátěž týdne: Z2 / dlouhý den, na který zbyla méně než polovina
    // nejkratší délky, je volno – trénink navíc by týden jen přetáhl (zbytek se rozdělí mezi ostatní dny)
    if (!pinned) {
      const tiny = train.filter((x) => (x.role === "endurance" || x.role === "easy" || x.role === "long") && !x.mine && !x.own && x.want < loadFor(capsOf(x.sport, x.role).min, rOf(x), x.role) / 2);
      for (const x of tiny) { x.role = "rest"; x.minutes = 0; x.load = 0; train.splice(train.indexOf(x), 1); }
      if (tiny.length) { notes.push(`${tiny.map((x) => dayDm(x.date)).join(", ")}: volno – zátěž týdne už pokryjí tvoje tréninky.`); spread(); }
    }
    const overRest: Day3[] = [];
    if (pinned) {
      const planRest = dates.filter((d) => !lostDay(d)).reduce((t, d) => t + (mDay(d)?.load ?? 0), 0);
      const scale = planRest > 0 ? Math.min(1, tg.load / planRest) : 1;
      for (const x of train) {
        if (x.own || fixed.get(x.date)?.minutes) continue;
        const m = mDay(x.date);
        if (!m || m.load <= 0) continue;
        x.want = Math.round(m.load * scale);
        const ld = x.want;
        // týden už je odjetý nad plán: den, na který zbyla méně než polovina nejkratší délky, je volno (ne trénink
        // nejkratší délky navíc – to by týden dál přetahovalo)
        if (scale < 1 && x.role !== "key" && !mine(x.date) && ld < loadFor(capsOf(x.sport, x.role).min, rOf(x), x.role) / 2) { overRest.push(x); continue; }
        // stejný sport a druh: délka z pondělního plánu (krát poměr) – přepočet ze zátěže by kvůli rozjetí v Z1
        // dal každý den o kus míň; jinak délka ze zátěže podle sportu dne
        const c = capsOf(x.sport, x.role);
        const same = m.sport === x.sport && m.role === x.role && m.minutes > 0;
        // Při dorovnání zátěže po skutečném průběhu týdne stačí jemnější krok než
        // obvyklé 15min zaokrouhlení – jinak se menší přebytek kvality na Z2 vůbec neprojeví.
        const step = 5;
        // běh má strop kvůli šlachám a kostem (podle nejdelšího běhu) – ten platí vždy
        const keep = same && x.sport !== "run";
        if (keep) x.keepMin = m.minutes;
        setMinutes(x, same ? Math.max(Math.min(c.min, m.minutes), Math.min(Math.max(c.max, keep ? m.minutes : 0), Math.round((m.minutes * scale) / step) * step)) : minutesFor(ld, rOf(x), x.role, x.sport, c));
      }
      // součet nejkratších délek přerostl zbytek týdne (odjeto víc, než bylo v plánu) → nejmenší Z2 dny jsou volno,
      // dokud se zbytek nevejde (nedohání se ani nepřetahuje)
      while (scale < 1) {
        const free = train.filter((x) => !mine(x.date) && !x.own && !overRest.includes(x));
        if (free.reduce((t, x) => t + x.load, 0) <= tg.load * 1.15 + 10) break;
        const drop = free.filter((x) => x.role === "endurance" || x.role === "easy" || x.role === "long").sort((p1, p2) => Number(p1.role === "long") - Number(p2.role === "long") || p1.want - p2.want || p2.date.localeCompare(p1.date))[0];
        if (!drop) break;
        overRest.push(drop);
      }
      for (const x of overRest) { x.role = "rest"; x.minutes = 0; x.load = 0; train.splice(train.indexOf(x), 1); }
      if (overRest.length) notes.push(`${overRest.map((x) => dayDm(x.date)).join(", ")}: volno – tento týden už máš odjeto víc, než bylo v plánu.`);
    }

    // obsah: konkrétní tréninky tento a příští týden; další týdny náhled (`preview` – bez počasí a bez
    // dorovnání zátěže týdne, kroky jsou orientační)
      const build = (x: Day3, preview = false, forceCat: Cat | null = null) => {
        const f = fixed.get(x.date);
        const w = inp.weather.get(x.date) ?? null;
        const calib = rateOf(x.sport).calib;
        x.indoor = false;
        if (x.sport === "ride" && !x.own && !preview) {
          if (x.role === "key") {
            const goodOutside = inp.weatherOk && !!w && !w.bad && !!w.window;
            if (!inp.weatherOk || !!w?.bad || (winter && !goodOutside)) { x.indoor = true; if (w?.bad) x.why.push(`${w.text} → trenažér`); }
          } else if (w?.bad && !x.mine) { x.indoor = true; x.why.push(`${w.text} → trenažér`); }
          // dlouhá na trenažéru nejvýš INDOOR_LONG_MAX (hodina na trenažéru ≈ 1,25–1,5 h venku)
          if (x.indoor && x.role === "long" && x.minutes > INDOOR_LONG_MAX) { x.minutes = INDOOR_LONG_MAX; if (!x.why.some((s) => s.startsWith("dlouhá na trenažéru"))) x.why.push(`dlouhá na trenažéru nejvýš ${INDOOR_LONG_MAX / 60} h (hodina uvnitř ≈ 1,25–1,5 h venku), zbytek dostanou ostatní dny`); }
        }
        let b: Built;
        if (x.role === "key") {
          // tvoje výslovná volba „kvalita“ platí i pro sport bez intervalů v profilu
          if (!qualityOk(x.sport) && f?.type !== "quality") {
            x.role = "endurance";
            x.why.push(`${SPORT_WORD[x.sport]}: bez intervalů (v profilu nebo zatím málo běhání) → Z2`);
          }
        }
        if (x.role === "key") {
          let cands = catCandidates(tg.phase, { recoveryWeek: tg.recoveryWeek, winter });
          if (x.sport === "run") cands = cands.filter((c) => c !== "vo2" && c !== "vo2s");
          if (!cands.length) cands = ["thr"];
          // návrat po pauze: nejvýš tempo a sweet spot (ne práh, VO2, sprinty)
          if (ceilingOf(x.date) === "tempo" && f?.type !== "quality") {
            cands = cands.filter((c) => c === "tempo" || c === "ss");
            if (!cands.length) cands = ["tempo"];
            if (!x.why.some((s) => s.startsWith("návrat po pauze"))) x.why.push("návrat po pauze: nejvýš tempo a sweet spot");
          }
          if (forceCat) cands = [forceCat];
          const before = usedCats.filter((u) => u.date < x.date);
          const lastUse: Partial<Record<Cat, string>> = {};
          for (const u of before) lastUse[u.cat] = u.date;
          const inWeek = usedCats.filter((u) => u.date >= tg.weekStart && u.date < x.date).map((u) => u.cat);
          const ch = forceCat ? { cat: forceCat, why: null as string | null } : chooseCat({ cands, exclude: [...inWeek, ...(before.length ? [before[before.length - 1]!.cat] : [])], lastUse, date: x.date, needs: x.sport === "ride" && power ? needs : {} });
          const lvl0 = inp.progress[`${x.sport}:${ch.cat}`]?.level ?? START_TIER;
          const level = Math.max(0, tg.phase === "offseason" || tg.recoveryWeek ? lvl0 - 1 : lvl0);
          const avoidIds = [...(inp.recentWids ?? []).filter((u) => u.date < from && u.sport === x.sport && u.cat === ch.cat).slice(-3), ...usedWids.filter((u) => u.sport === x.sport && u.cat === ch.cat)].map((u) => u.wid);
          b = buildWorkout({ sport: x.sport, family: ch.cat, level, wid: null, minutes: x.minutes, indoor: x.indoor, zones: inp.zones, calib, seed: x.date, avoidIds });
          if (b.wid) usedWids.push({ date: x.date, sport: x.sport, cat: ch.cat, wid: b.wid });
          if (f?.edit) { b = applyStepEdit(b, f.edit, x.sport === "ride" ? inp.zones.ftp : null, calib, x.sport === "run"); x.why.push("tvoje úprava kroků"); }
          x.cat = isCat(b.family) ? b.family : ch.cat;
          x.level = level;
          x.base = lvl0;
          x.wid = b.wid;
          x.wplan = b.plan;
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
        // délka a zátěž ze sestaveného tréninku (i u náhledu – dlaždice, graf a rozpis musí sedět)
        if (!x.own) { x.minutes = b.minutes; x.load = b.load; }
        // tvoje délka kvality je kratší, než se do ní vejde rozjetí, úseky a vyjetí → říct proč je delší
        if (x.role === "key" && f?.minutes && x.minutes > f.minutes + 5) {
          const msg = `kvalita potřebuje aspoň ${x.minutes} min (rozjetí, úseky, vyjetí) – ${f.minutes} min nestačí`;
          if (!x.why.includes(msg)) x.why.push(msg);
        }
      };
    if (detail) {
      for (const x of train.filter((y) => y.role === "key")) build(x);
      // zbylá zátěž po skutečných kvalitách → znovu délky Z2 a dlouhého
      if (!pinned) spread();
      for (const x of train.filter((y) => y.role !== "key")) build(x);
      // dorovnání: skutečné tréninky mají rozjetí a vyjetí v Z1, takže dají méně než odhad z délky → když týden
      // zaostane o víc než 3 %, Z2 a dlouhý se prodlouží (ve stropech) a sestaví znovu
      if (!pinned) for (let it = 0; it < 2; it++) {
        const got = train.reduce((t, x) => t + x.load, 0);
        const gap = tg.load - got;
        if (gap <= tg.load * 0.03) break;
        const flex = train.filter((x) => (x.role === "endurance" || x.role === "long") && !x.own && !fixed.get(x.date)?.minutes && x.minutes < capsOf(x.sport, x.role).max);
        const fl = flex.reduce((t, x) => t + x.load, 0);
        if (!flex.length || fl <= 0) break;
        for (const x of flex) {
          const c = capsOf(x.sport, x.role);
          const m = Math.min(c.max, x.sport === "run" ? Math.round((x.minutes * (1 + gap / fl)) / 5) * 5 : Math.round((x.minutes * (1 + gap / fl)) / 15) * 15);
          if (m !== x.minutes) { x.minutes = m; build(x); }
        }
      }
    }
    if (detail && inp.recovery === "yellow") {
      const x = train.find((y) => y.date === T);
      if (x && !x.own && !x.mine) {
        const c = capsOf(x.sport, x.role === "key" ? "endurance" : x.role);
        const cut = Math.max(c.min, Math.round((x.minutes * YELLOW_CUT) / 5) * 5);
        if (x.role === "key") {
          const from0 = x.cat, down = from0 ? STEP_DOWN[from0] : null;
          x.minutes = cut;
          if (down) { build(x, false, down); x.why.push(`🟡 ráno: o stupeň lehčí (${CAT_WORD[from0!]} → ${CAT_WORD[down]}) a o čtvrtinu kratší`); }
          else { x.role = "endurance"; build(x); x.why.push(`🟡 ráno: místo ${from0 ? CAT_WORD[from0] : "kvality"} Z2, o čtvrtinu kratší`); }
        } else if (x.role === "long") {
          // dlouhý → Z2: o čtvrtinu kratší a nejvýš strop Z2 dne (jinak by „Z2“ zůstala delší než běžný Z2 den)
          const e = capsOf(x.sport, "endurance");
          x.role = "endurance";
          x.minutes = Math.max(e.min, Math.min(e.max, cut));
          build(x);
          x.why.push(`🟡 ráno: místo dlouhé Z2 ${x.minutes} min`);
        } else if (x.minutes > c.min) {
          x.minutes = cut;
          build(x);
          x.why.push("🟡 ráno: o čtvrtinu kratší");
        }
      }
    }
    for (const x of train) if (autoSport.get(x.date) === x.sport && !fixed.get(x.date)?.sport) {
      x.why.push(`${SPORT_WORD[x.sport]} podle profilu (${x.sport === "xc_ski" ? "je sníh, " : ""}jeden vytrvalostní den týdně)`);
    }
    for (const x of train) if ((fixed.get(x.date)?.sport || autoSport.get(x.date) === x.sport) && x.sport !== p.primary && !x.own) {
      const capped = x.want > 0 && Math.abs(x.load - x.want) > x.want * 0.15;
      x.why.push(capped ? (x.load < x.want ? `${SPORT_WORD[x.sport]} místo ${SPORT_GEN[p.primary]}: ${x.minutes} min je strop ${SPORT_GEN[x.sport]}${x.sport === "run" ? " podle toho, kolik teď běháš" : ""} – zátěž ${x.load} místo ${x.want}, zbytek dostanou ostatní dny` : `${SPORT_WORD[x.sport]} místo ${SPORT_GEN[p.primary]}: ${x.minutes} min vyjde na zátěž ${x.load} (${SPORT_WORD[p.primary]} by dalo ${x.want}), ostatní dny jsou o to lehčí`) : `${SPORT_WORD[x.sport]} místo ${SPORT_GEN[p.primary]}: stejná zátěž (${x.load}), délka podle sportu`);
    }

    // rozběhnutý týden: den převzatý z pondělního plánu drží jeho zátěž (poměrem délky). Sazba zátěže za hodinu je
    // medián 60 dní a mezi dny může poskočit (aktivita vypadne z okna) – bez toho by týden „rostl“, i když se nic nestalo.
    if (pinned) for (const x of train) {
      const m = mDay(x.date);
      if (!m || x.own || fixed.get(x.date)?.minutes || m.sport !== x.sport || m.role !== x.role || m.minutes <= 0) continue;
      x.load = Math.round((m.load * x.minutes) / m.minutes);
    }

    // kontrola formy: výhled po dnech; pod dnem se zkracují Z2 a dlouhý, pak poslední kvalita → Z2, nakonec volno
    const floor = formFloor(tg.phase);
    const proj = () => project(state, stateDate, dates.map((d) => days.find((x) => x.date === d)!.load));
    if (floor != null) {
      // Propad, ke kterému plán nepřispívá (forma je pod hranicí z minulých dní a úplné volno by ji nezvedlo víc), se
      // zkracováním nespraví – ten se nepočítá. Zkracují se jen dny do posledního propadu (pozdější ho neovlivní).
      const restP = project(state, stateDate, dates.map(() => 0));
      for (let it = 0; it < 5; it++) {
        const lows = proj().filter((x, i) => x.form < floor && x.form < restP[i]!.form - 0.5);
        const low = lows[0];
        if (!low) break;
        const until = lows[lows.length - 1]!.date;
        if (it < 2) {
          const msg = `zkráceno – forma by spadla pod ${floor}`;
          for (const x of train) if ((x.role === "endurance" || x.role === "long") && !x.mine && x.date <= until) { const c = capsOf(x.sport, x.role); setMinutes(x, Math.max(c.min, Math.round((x.minutes * 0.8) / 15) * 15)); if (detail && !x.why.includes(msg)) x.why.push(msg); }
        } else if (it === 2) {
          const kd = [...train].reverse().find((x) => x.role === "key" && !x.mine && x.date <= until);
          if (kd) { kd.role = "endurance"; kd.why.push(`místo kvality Z2 – forma ${dayDm(low.date)} by byla ${num(low.form, 0)}`); setMinutes(kd, Math.min(kd.minutes, capsOf(kd.sport, "endurance").max)); }
        } else {
          // ani zkrácení a Z2 místo kvality nestačí → poslední Z2 / lehký den před propadem je volno
          const ed = [...train].reverse().find((x) => (x.role === "endurance" || x.role === "easy") && !x.mine && x.date <= until);
          if (ed) { ed.role = "rest"; ed.minutes = 0; ed.load = 0; ed.workout = null; ed.steps = []; ed.name = null; ed.tiz = 0; ed.why.push(`volno – forma ${dayDm(low.date)} by byla ${num(low.form, 0)}`); train.splice(train.indexOf(ed), 1); }
        }
      }
      if (detail) for (const x of train) if (x.why.some((w) => w.startsWith("zkráceno") || w.startsWith("místo kvality"))) {
        const calib = rateOf(x.sport).calib;
        const b = buildWorkout({ sport: x.sport, family: x.role === "long" ? "long" : "end", level: 0, wid: null, minutes: x.minutes, indoor: x.indoor, zones: inp.zones, calib });
        x.workout = relabel(b.workout, x.sport); x.steps = stepsText(x.workout, x.sport); x.name = nameFor(b.name, x.sport); x.targetText = b.targetText; x.load = b.load; x.tiz = 0; x.qualityType = null; x.cat = null;
      }
    }
    // orientační týdny: náhled tréninků (kvality napřed kvůli střídání kategorií)
    if (!detail) {
      for (const x of train.filter((y) => y.role === "key")) build(x, true);
      for (const x of train.filter((y) => y.role !== "key")) build(x, true);
    }
    const pr = proj();
    const end = pr.length ? pr[pr.length - 1]! : { ctl: state.ctl, atl: state.atl };
    const planned = days.reduce((t, x) => t + x.load, 0);
    weeks.push({ weekStart: tg.weekStart, detail, target: tg, sessions: sk.sessions, keys: sk.keys, long: sk.long, planned, ctlEnd: Math.round(end.ctl * 10) / 10, days, notes });
    state = { ctl: end.ctl, atl: end.atl };
    blk = nextBlock(blk, tg, tg.done + planned);
    stateDate = dates[dates.length - 1]!;
    prevDays = days;
  }

  // v pondělí před prvním tréninkem je pondělním plánem tento plán (week doplní toPlan)
  const mp: MondayPlan | null = mondayPlan ?? (inp.mondayMode || from !== W0 ? null : { weekStart: W0, goal: inp.goal, fatigue: fat.factor, monday: true, week: null as unknown as MondayPlan["week"] });
  // výhled OUTLOOK_WEEKS týdnů: po 4 týdnech plánu už jen cíl týdne rozložený rovnoměrně po dnech (levné – bez kostry a délek);
  // stejné pořadí pravidel: lehčí týden po bloku, ladění, týden po závodě, strop přidávání
  const outlook: CoachInfo["outlook"] = { days: weeks.flatMap((w) => w.days.map((x) => ({ date: x.date, load: x.load }))), weeks: weeks.map((w) => ({ weekStart: w.weekStart, load: Math.round(w.target.done + w.planned), ctlEnd: w.ctlEnd, recoveryWeek: w.target.recoveryWeek, phaseLabel: w.target.phaseLabel, exact: true })) };
  if (!inp.mondayMode) {
    let st = { ...state }, b = blk;
    for (let k = weeks.length; k < OUTLOOK_WEEKS; k++) {
      const tg = weekTarget(binp, k, st.ctl, b);
      const per = tg.load / 7;
      const dd = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(tg.weekStart, i));
      const pr = project(st, addDays(tg.weekStart, -1), dd.map(() => per));
      for (const d of dd) outlook.days.push({ date: d, load: Math.round(per) });
      const end = pr[pr.length - 1]!;
      outlook.weeks.push({ weekStart: tg.weekStart, load: tg.load, ctlEnd: Math.round(end.ctl * 10) / 10, recoveryWeek: tg.recoveryWeek, phaseLabel: tg.phaseLabel, exact: false });
      st = { ctl: end.ctl, atl: end.atl };
      b = nextBlock(b, tg, tg.load);
    }
  }
  return toPlan(inp, weeks, { reentry: inp.reentry?.note ?? null, outlook, mondayPlan: mp, from, todayDone, startState, history, usual: historyBase(history).usual, ctlRef, fat, longest, typical, runLongest: run.longest, runExperienced: run.experienced });
}

// ---------- výstup ve tvaru plánu (dashboard, zápis do intervals.icu) ----------

/** Jedna věta: kam dojde kondice za 4 týdny a proč (hlavně když cíl nejde splnit hned). */
export function horizonSummary(weeks: Pick<Week3, "planned" | "ctlEnd" | "target">[], ctlNow: number, usual: number): string {
  const n1 = (x: number) => x.toFixed(1).replace(".", ",");
  const end = weeks[weeks.length - 1]!.ctlEnd;
  const ramp = weeks[0]!.target.ramp;
  const head = `Za ${weeks.length} týdny: kondice ${n1(ctlNow)} → ${n1(end)}`;
  const floor = weeks[0]!.target.floor;
  if (weeks[0]!.target.phase === "offseason") return floor != null ? `${head}. Zima: kondice klesá k zimnímu základu ${n1(floor)} (vrchol sezóny − 42,5 %), nejdřív rychleji, u základu se zastaví a drží.` : `${head} (zima).`;
  if (ramp < 0) return `${head} (ladění, asi ${n1((ctlNow - end) / weeks.length)} za týden).`;
  const goalEnd = ctlNow + ramp * weeks.length;
  if (end >= goalEnd - 0.5) return `${head} – ${ramp === 0 ? "drží se" : "roste podle cíle"}.`;
  // proč ne: jen omezení, která opravdu zasáhla (a ve kterých týdnech)
  const wk = (i: number) => (i === 0 ? "tento" : i === 1 ? "příští" : `${i + 1}.`);
  const by = (l: string) => weeks.map((w, i) => (w.target.limit === l ? i : -1)).filter((i) => i >= 0);
  const why: string[] = [];
  const h = by("historie"), f = by("únava"), r = by("lehčí týden"), po = by("po závodě");
  if (h.length) why.push(`zátěž přidávám postupně (obvykle jezdíš kolem ${usual} týdně, nejvýš o 30 %, pak o 15 % za týden)`);
  if (f.length) why.push(`únava ubírá ${f.map(wk).join(" a ")} týden`);
  if (po.length) why.push(`${po.map(wk).join(" a ")} týden je po závodě – lehce, bez kvality`);
  if (r.length) why.push(`${r.map(wk).join(" a ")} týden je lehčí (po 3 zátěžových týdnech)`);
  // plán nedá ani cíl po omezeních: tréninky se nevejdou do stropů délek (v zimě Z2 do 75 min, dlouhá do 2 h)
  const short = weeks.filter((w) => !w.target.recoveryWeek && w.planned < w.target.load * 0.93);
  if (short.length) why.push(weeks[0]!.target.shortDays ? "do zimních délek (Z2 do 75 min, dlouhá do 2 h, kvalita 1 h) se víc zátěže nevejde" : "do délek tréninků a volných dní se víc zátěže nevejde");
  if (!why.length) why.push("tréninky se do délek a volných dní víc nevejdou");
  const cur = weeks[weeks.length - 1]!.target;
  const settled = cur.limit == null && cur.load >= cur.need - 5;
  return `${head}. Na ${ramp === 0 ? "udržení" : "růst"} by to chtělo víc, ale ${why.join(", ")}.${settled ? ` Od ${weeks.length}. týdne už zátěž cíli odpovídá a kondice ${ramp === 0 ? "drží" : "roste"}.` : ""}`;
}

function toPlan(inp: CoachInput, weeks: Week3[], o: { reentry: string | null; outlook: CoachInfo["outlook"]; mondayPlan: MondayPlan | null; from: string; todayDone: boolean; startState: { ctl: number; atl: number }; history: { weekLoads: number[] }; usual: number; ctlRef: number; fat: { notes: string[] }; longest: number; typical: number; runLongest: number; runExperienced: boolean }): CoachPlan {
  const T = inp.today;
  const all = weeks.flatMap((w) => w.days);
  // stejný důvod se při opakovaném sestavení dne (dorovnání zátěže, zkracování) nepíše dvakrát
  for (const x of all) x.why = [...new Set(x.why)];
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
    const note = [...(date === T && inp.recovery === "green" && ride ? ["🟢 ráno zotavený, beze změny."] : []), ...(date === T && inp.recovery === "yellow" ? ["🟡 ráno částečně zotavený: dnes lehčí."] : []), ...x.why.map((s) => (/[.!]$/.test(s) ? s : `${s}.`))].map((s) => s[0]!.toUpperCase() + s.slice(1)).join(" ");
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
    const q = acts.some((a) => a.quality) || d === inp.raceDate;
    const lg = mins >= Math.max(110, o.typical * 1.5);
    return { trained: mins >= 20 || d === inp.raceDate, key: q, hard: q || lg, minutes: Math.round(mins), sport: acts[0] ? planSport(acts[0].sport) : null, long: lg };
  };
  const fixed = fixedFromConstraints(inp.constraints);
  const validate = (w: Week3): WeekValidation => {
    const past = new Map<string, V2Past>();
    for (let i = -3; i < 7; i++) { const d = addDays(w.weekStart, i); if (d < w.target.from) past.set(d, v2Past(d)); }
    const fp = project(o.startState, addDays(o.from, -1), projDates.map((d) => dayOf(d)?.load ?? 0)).filter((x) => x.date >= w.target.from && x.date < addDays(w.weekStart, 7));
    // stejný průběh, ale týden celý volno – propad, který by nastal i tak, není chyba plánu
    const fr = project(o.startState, addDays(o.from, -1), projDates.map((d) => (d < w.target.from ? dayOf(d)?.load ?? 0 : 0))).filter((x) => x.date >= w.target.from && x.date < addDays(w.weekStart, 7));
    const caps = { easy: capsFor({ sport: "ride", role: "endurance", winter: w.target.shortDays, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max, long: capsFor({ sport: "ride", role: "long", winter: w.target.shortDays, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max, key: capsFor({ sport: "ride", role: "key", winter: w.target.shortDays, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max - 20 };
    return validateWeek({
      weekStart: w.weekStart,
      from: w.target.from,
      days: w.days.map((x) => ({ date: x.date, role: x.role, sport: x.sport, minutes: x.minutes, tiz: x.tiz, blocked: !!x.blocked, own: !!x.own, userQuality: fixed.get(x.date)?.type === "quality", userMinutes: !!fixed.get(x.date)?.minutes || (x.role === "key" && !!fixed.get(x.date)?.edit), mine: x.mine, keepMin: x.keepMin, downgraded: null })),
      past,
      keys: w.keys,
      long: w.long,
      caps,
      runCap: runCapOf(o.runLongest),
      tsbFloor: formFloor(w.target.phase),
      forms: fp.map((x) => ({ date: x.date, form: x.form })),
      formsRest: fr.map((x) => ({ date: x.date, form: x.form })),
      otherCap: (sport, role) => capsFor({ sport, role, winter: w.target.shortDays, longest: o.longest, typical: o.typical, runLongest: o.runLongest }).max,
    });
  };
  const v0 = validate(w0), v1 = validate(w1);
  const validation: WeekValidation = { ok: v0.ok && v1.ok, items: [...v0.items, ...v1.items] };

  const summary = horizonSummary(weeks, weeks[0]!.target.ctlStart, o.usual);
  const warnings: string[] = [summary, ...w0.notes, ...o.fat.notes.map((s) => `Zátěž ubírá: ${s}.`), ...(o.reentry ? [`${o.reentry[0]!.toUpperCase()}${o.reentry.slice(1)}.`] : [])];
  // Vysoké riziko: „uber zátěž“ jen tam, kam vede plán; propad z minulých dní (i úplné volno by ho nechalo) se řekne jednou
  const restAll = project(o.startState, addDays(o.from, -1), projDates.map(() => 0));
  const restBy = new Map(restAll.map((x) => [x.date, x.form]));
  let pastRisk = false;
  for (const x of proj.filter((y) => y.date <= addDays(T, 7))) {
    if (formZone(x.form) !== "Vysoké riziko") continue;
    if (x.form < (restBy.get(x.date) ?? x.form) - 0.5) warnings.push(`Plán vede do Vysokého rizika ${dayDm(x.date)} – uber zátěž.`);
    else if (!pastRisk) { pastRisk = true; warnings.push(`Forma ${dayDm(x.date)} ${num(x.form, 0)} je ve Vysokém riziku z minulých dní – volno a lehké dny ji zvednou.`); }
  }
  for (const it of validation.items) if (it.level !== "exception") warnings.push(it.text);

  const tg = w0.target;
  const total0 = Math.round(tg.done + w0.planned);
  const minutes0 = inp.acts.filter((a) => a.date >= W0 && a.date < o.from).reduce((t, a) => t + (a.moving_s ?? 0) / 60, 0) + w0.days.reduce((t, x) => t + x.minutes, 0);
  const cyc = tg.phase === "base" || tg.phase === "build";
  const coach: CoachInfo = {
    version: 3,
    phase: tg.phase,
    phaseLabel: tg.phaseLabel,
    cycleIdx: tg.cycleIdx,
    cycleLen: blockWeeksFor(inp.profile.birthYear, T) + 1,
    cycle: cyc,
    recoveryWeek: tg.recoveryWeek,
    nextRecovery: cyc && !tg.recoveryWeek ? (weeks.find((w) => w.target.recoveryWeek)?.weekStart ?? null) : null,
    load: total0,
    keepLoad: Math.round(7 * o.ctlRef),
    recentLoad: Math.round(o.history.weekLoads.reduce((t, x) => t + x, 0) / Math.max(1, o.history.weekLoads.length)),
    ramp: tg.ramp,
    hours: Math.round((minutes0 / 60) * 4) / 4,
    tsbFloor: formFloor(tg.phase),
    sessions: w0.sessions,
    keys: w0.keys,
    ctlNow: Math.round(o.ctlRef * 10) / 10,
    ctlTarget: w0.ctlEnd,
    ctlWeekStart: w0.target.ctlStart,
    floor: w0.target.floor,
    notes: [summary, ...w0.notes],
    distribution: distribution(inp.acts, T),
    plannedHard: minutes0 > 0 ? Math.round((w0.days.reduce((t, x) => t + x.tiz, 0) / minutes0) * 100) : 0,
    plannedLoad: total0,
    validation,
    keyDays: weeks.filter((w) => w.detail).flatMap((w) => w.days).filter((x) => x.role === "key" && x.cat && x.level != null).map((x) => ({ date: x.date, sport: x.sport, cat: x.cat!, level: x.level!, base: x.base ?? x.level!, wid: x.wid ?? null, plan: x.wplan ?? null, minutes: x.minutes, name: x.name })),
    mondayPlan: null,
    reentry: o.reentry,
    outlook: o.outlook,
    horizon: weeks.map((w) => ({ weekStart: w.weekStart, detail: w.detail, load: w.planned, done: w.target.done, need: w.target.need, target: w.target.load, notes: w.target.notes, limit: w.target.limit, ctlStart: w.target.ctlStart, ctlEnd: w.ctlEnd, ctlGoal: w.target.ctlGoal, phaseLabel: w.target.phaseLabel, recoveryWeek: w.target.recoveryWeek, days: w.days.map((x) => ({ date: x.date, role: x.role, sport: x.sport, minutes: x.minutes, load: x.load, name: x.name, blocked: !!x.blocked, workout: x.role !== "rest" && !x.blocked ? x.workout : null, steps: x.role !== "rest" && !x.blocked ? x.steps : [], targetText: x.role !== "rest" && !x.blocked ? x.targetText : null, why: x.why })) })),
  };
  coach.mondayPlan = o.mondayPlan && !o.mondayPlan.week ? { ...o.mondayPlan, week: coach.horizon[0]! } : o.mondayPlan;
  return { from: dates[0]!, to: dates[dates.length - 1]!, days, changes, chart, loadPast7, loadNext7, qualityWeeks, warnings, weeklyTarget: { lo: Math.round(total0 * 0.9), hi: Math.round(total0 * 1.1), mid: total0 }, missed, done, coach };
}
