// Trenér v3 – cíl zátěže a výhled kondice. Všechno se počítá od DNEŠNÍ kondice (ne od pondělí), takže cíl
// a výhled nikdy nejdou proti sobě: pokles kondici snižuje, udržet drží, zlepšit zvedá – pokud to nepustí omezení,
// a pak to výsledek řekne čísly.
import { K_CTL, type Goal } from "../fitness";
import { type Phase, isWinter, phaseFor } from "./target";

// ---------- pravidla podle zdrojů (docs/trener/zdroje.md) ----------
/** Zima: kondice klesá k zimnímu základu = vrchol sezóny × (1 − pokles). Trenéři uvádějí pokles 30–40 % od vrcholu
 *  (TrainRight), uživatel chce 35–50 % (jeho dřívější zimy byly −64 až −88 %) → střed 42,5 %. */
export const WINTER_DROP = 0.425;
/** Jak rychle se ke základu klesá: 15 % zbývajícího rozdílu za týden, nejvýš 5 bodů. Zdroje dávají jen „2–4 týdny
 *  volněji hned po sezóně“ (Roadman), konkrétní rychlost je moje volba: rychle na začátku, u základu se zastaví. */
export const WINTER_APPROACH = 0.15, WINTER_MAX_DROP = 5;
/** Růst kondice v Základu a Rozvoji: TrainingPeaks – při kondici do 45 nízké riziko do 3 bodů za týden, nad 45
 *  4–6 střední; Friel 5–8 pro většinu. Beru spodní, bezpečnou hranu: 3, nad 45 → 4. */
export const rampUp = (ctl: number) => (ctl <= 45 ? 3 : 4);
/** Lehčí týden (Friel 3:1): o 40–50 % méně objemu (Roadman, přehled výzkumu taperu) → 55 % průměru předchozích
 *  zátěžových týdnů bloku. */
export const RECOVERY_SHARE = 0.55;
/** Lehčí týden přijde po tolika zátěžových týdnech za sebou (Friel 3:1). Od 40 let po 2 (2:1) – TrainingPeaks / Friel:
 *  3+1 pro zkušené a mladší 40 let, 2+1 pro méně zkušené a starší 40 let. */
export const BLOCK_WEEKS = 3;
export const BLOCK_WEEKS_40 = 2;
/** Délka bloku podle věku (rok narození z profilu; bez něj 3+1). */
export const blockWeeksFor = (birthYear: number | null | undefined, today: string): number => (birthYear && Number(today.slice(0, 4)) - birthYear >= 40 ? BLOCK_WEEKS_40 : BLOCK_WEEKS);
/** Lehký týden v historii: zátěž pod 75 % běžné úrovně předchozích týdnů. Musí zachytit lehčí týden (55 %) i první
 *  týden ladění (70 %), běžné kolísání (±15 %) ne – konkrétní hranice je vlastní volba. Týden s ≥ 3 dny mimo
 *  (nemoc, zranění, dovolená) je lehký vždy. */
export const LIGHT_SHARE = 0.75;
/** Pod touto průměrnou zátěží zátěžových týdnů se lehčí týden nedělá: při ~4,5 h Z2 týdně (kondice do ~29) se únava
 *  nenahromadí a ubrání by jen srazilo kondici. Vlastní volba – zdroje 3:1 doporučují pro všechny, hranici nedávají. */
export const MIN_RECOVERY_LOAD = 200;
/** Dvě kvality týdně jen při objemu aspoň 5 h: 80/20 podle času (Seiler) – dvě kvality mají ~2 × 30 min nad Z2,
 *  to je 20 % z 5 h. Odhad 30 min nad Z2 na kvalitu je vlastní volba (knihovna má 20–40 min). */
export const TWO_KEYS_MIN_H = 5;
/** Ladění před závodem (Bosquet a kol. 2007, metaanalýza 27 studií): 2 týdny, objem o 41–60 % méně (postupně),
 *  intenzita a počet tréninků beze změny → týden před závodním 70 %, závodní týden 45 % běžného týdne. */
export const TAPER_SHARE = { before: 0.7, race: 0.45 };
/** Týden po závodě (přechod): lehce a bez kvality. Délka 1 týden podle Frielových plánů zotavení po kratším závodě
 *  (TrainingPeaks: 1 týden sprint / olympijský triatlon, 4 týdny dlouhý); zátěž jako lehčí týden (55 % posledního
 *  běžného týdne) – podíl je vlastní volba, zdroj ho nedává. */
export const POST_SHARE = RECOVERY_SHARE;
export const PHASE_LABEL3: Record<Phase, string> = { offseason: "Zima", maintain: "Udržování", base: "Základ", build: "Rozvoj", taper: "Ladění", post: "Po závodě" };

/** Růst kondice za týden podle fáze. Zima: k základu (vrchol × 0,575), u základu 0 (drží). */
export function rampOf(phase: Phase, ctl: number, seasonPeak: number | null): number {
  if (phase === "offseason") {
    const floor = (seasonPeak ?? ctl) * (1 - WINTER_DROP);
    return ctl > floor ? -Math.min(WINTER_MAX_DROP, WINTER_APPROACH * (ctl - floor)) : 0;
  }
  if (phase === "maintain") return 0;
  if (phase === "taper") return -2;
  if (phase === "post") return 0;
  return rampUp(ctl);
}
import { addDays, daysBetween, mondayOf } from "../../lib/time";

const A = 1 - K_CTL;

/** Celková zátěž za `n` dní (rovnoměrně rozložená), po které kondice přejde z `c0` na `c1`. */
export function loadToReach(c0: number, c1: number, n: number): number {
  if (n <= 0) return 0;
  const an = Math.pow(A, n);
  return Math.max(0, (n * (c1 - c0 * an)) / (1 - an));
}

/** Kondice po `n` dnech s celkovou zátěží `load` rozloženou rovnoměrně. */
export function ctlAfter(c0: number, load: number, n: number): number {
  if (n <= 0) return c0;
  const an = Math.pow(A, n);
  return c0 * an + (load / n) * (1 - an);
}

/** Historie posledních 4 ukončených týdnů (nejstarší první). */
export interface History {
  weekLoads: number[];
  weekSessions: number[];
  /** dny mimo (Nemocný / Zraněný / Dovolená) v týchž týdnech */
  weekOff: number[];
  /** týdny (ze stejných 4), které se do obvyklé zátěže nepočítají: lehčí týden, ladění, přechod po závodě */
  skip?: boolean[];
  /** pozice v bloku z historie (před tímto týdnem) */
  block?: BlockState;
  /** nejvyšší kondice za posledních 6 měsíců (vrchol sezóny) – pro zimní základ */
  seasonPeak?: number | null;
}

/**
 * Obvyklá týdenní zátěž: vážený průměr 4 týdnů (novější víc). Týdny s ≥ 3 dny mimo se nepočítají, jeden
 * ojedinělý propad (pod čtvrtinu ostatních) taky ne. Když nezbude nic, bere se skutečnost.
 */
export function usualLoad(h: Pick<History, "weekLoads" | "weekOff" | "skip">): number {
  return usualOf(h, h.weekLoads);
}

/** Obvyklý počet tréninků týdně: vážený průměr stejných týdnů jako u obvyklé zátěže (ne maximum). */
export function usualSessions(h: Pick<History, "weekLoads" | "weekOff" | "skip" | "weekSessions">): number {
  return usualOf(h, h.weekSessions);
}

function usualOf(h: Pick<History, "weekLoads" | "weekOff" | "skip">, vals: number[]): number {
  const off = (i: number) => (h.weekOff[i] ?? 0) >= 3 || !!h.skip?.[i];
  const max = (i: number) => Math.max(0, ...h.weekLoads.filter((_x, j) => j !== i && !off(j)));
  const low = h.weekLoads.map((x, i) => !off(i) && x < 0.25 * max(i));
  const outage = low.filter(Boolean).length === 1 ? low.indexOf(true) : -1;
  let idx = h.weekLoads.map((_x, i) => i).filter((i) => i !== outage && !off(i));
  if (!idx.length) idx = h.weekLoads.map((_x, i) => i);
  const w = idx.reduce((t, i) => t + (i + 1), 0);
  return w ? Math.round(idx.reduce((t, i) => t + (vals[i] ?? 0) * (i + 1), 0) / w) : 0;
}

export interface WeekTarget {
  weekStart: string;
  /** první plánovaný den (u tohoto týdne dnešek / zítřek) */
  from: string;
  /** plánovaných dní */
  days: number;
  phase: Phase;
  phaseLabel: string;
  /** růst kondice za celý týden podle fáze */
  ramp: number;
  /** pozice v bloku 1–4 (4 = lehčí týden) */
  cycleIdx: number;
  recoveryWeek: boolean;
  /** z čeho je lehčí týden / ladění: průměr zátěžových týdnů bloku, resp. poslední běžný týden před laděním */
  base: number | null;
  winter: boolean;
  /** zimní krátké délky (Z2 75 min, dlouhá 2 h) – jen Zima a Udržování; Zlepšit v zimě trénuje normálně */
  shortDays: boolean;
  /** zimní základ (jen Zima) */
  floor: number | null;
  /** kondice na začátku plánovaného úseku (u tohoto týdne dnešní) */
  ctlStart: number;
  /** kam má kondice podle cíle dojít na konci týdne */
  ctlGoal: number;
  /** zátěž plánovaných dní potřebná na cíl */
  need: number;
  /** zátěž plánovaných dní po omezeních */
  load: number;
  /** už odjeto tento týden (před `from`) */
  done: number;
  /** odhad kondice na konci týdne s `load` */
  ctlEnd: number;
  /** co cíl omezilo (null = nic) */
  limit: "historie" | "únava" | "lehčí týden" | "ladění" | "po závodě" | null;
  notes: string[];
}

export interface BudgetInput {
  goal: Goal;
  raceDate: string | null;
  /** první plánovaný den */
  from: string;
  /** kondice na konci dne před `from` (výchozí bod výpočtu) */
  ctlNow: number;
  /** kondice, kterou vidíš na stránce (dnes bez dnešního tréninku) – cíl tohoto týdne se měří od ní */
  ctlRef?: number;
  /** zátěž odjetá tento týden před `from` */
  doneLoad: number;
  history: History;
  /** únava: násobek zátěže pro tento týden (1 = bez únavy) */
  fatigue: number;
  /** kolik týdnů (včetně tohoto) */
  weeks: number;
  /** zátěžových týdnů v bloku před lehčím (3, od 40 let 2) */
  blockWeeks?: number;
}

/** Pozice v bloku: kolik zátěžových týdnů za sebou od posledního lehkého, zátěže zátěžových týdnů a poslední týdny. */
export interface BlockState {
  /** zátěžových týdnů za sebou od posledního lehkého */
  streak: number;
  /** zátěže zátěžových týdnů (nejstarší první, nejvýš 6) */
  loads: number[];
  /** zátěže posledních 3 týdnů bez týdnů mimo (reference pro „lehký“) */
  recent: number[];
}
export const EMPTY_BLOCK: BlockState = { streak: 0, loads: [], recent: [] };

/** Běžná úroveň z předchozích týdnů: druhý nejvyšší ze tří (jeden výjimečný týden ji nezvedne), z méně týdnů nejvyšší. */
const levelOf = (recent: number[]): number | null => {
  if (!recent.length) return null;
  const s = [...recent].sort((a, b) => b - a);
  return s.length >= 3 ? s[1]! : s[0]!;
};
/** Je týden se zátěží `load` lehký proti předchozím týdnům? */
export const isLightWeek = (load: number, b: BlockState): boolean => { const l = levelOf(b.recent); return l != null && l > 0 && load < LIGHT_SHARE * l; };

/** Další týden v bloku. `forced` = lehký bez ohledu na zátěž (lehčí týden, ladění, týden mimo); `off` = do reference nepatří. */
export function pushWeek(b: BlockState, load: number, forced = false, off = false): BlockState {
  const light = forced || off || isLightWeek(load, b);
  return {
    streak: light ? 0 : b.streak + 1,
    loads: light ? b.loads : [...b.loads, Math.round(load)].slice(-6),
    recent: off ? b.recent : [...b.recent, Math.round(load)].slice(-3),
  };
}

/** Průměr posledních (nejvýš 3) zátěžových týdnů – z něj je lehčí týden. */
export const blockAvg = (b: BlockState, n = BLOCK_WEEKS): number | null => { const l = b.loads.slice(-n); return l.length ? l.reduce((t, x) => t + x, 0) / l.length : null; };

/**
 * Historie týdnů (nejstarší první, ideálně 8): které byly lehké, které se nepočítají do obvyklé zátěže a pozice
 * v bloku. Do obvyklé zátěže se nepočítá ojedinělý lehký týden (lehčí týden bloku mezi zátěžovými) a týdny ladění
 * a přechodu kolem závodu. Dva lehké týdny za sebou mimo závod už jsou změna návyku – ty se počítají.
 */
export function weekHistory(o: { starts: string[]; loads: number[]; off: number[]; raceDate: string | null }): { light: boolean[]; skip: boolean[]; block: BlockState } {
  let b: BlockState = EMPTY_BLOCK;
  const light: boolean[] = [];
  o.loads.forEach((x, i) => {
    const off = (o.off[i] ?? 0) >= 3;
    light.push(off || isLightWeek(x, b));
    b = pushWeek(b, x, false, off);
  });
  const race = (s: string) => { if (!o.raceDate) return false; const d = daysBetween(s, o.raceDate); return d >= -7 && d <= 14; };
  const skip = light.map((l, i) => l && (race(o.starts[i]!) || (!light[i - 1] && !light[i + 1])));
  return { light, skip, block: b };
}

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const n1 = (x: number) => x.toFixed(1).replace(".", ",");

/** Obvyklá zátěž a jestli je historie (sdílené pro všechny týdny). */
export const historyBase = (h: History) => ({ usual: usualLoad(h), hasHistory: h.weekLoads.some((x) => x > 0) });

/**
 * Cíl jednoho týdne. `k` = pořadí (0 = tento, od `from` do neděle), `ctl` = kondice na začátku plánovaných dní
 * (u dalších týdnů ta, na kterou opravdu dojde předchozí plán), `blk` = pozice v bloku před týdnem (z historie
 * a předchozích plánovaných týdnů). Strop: u tohoto týdne z historie +30 % (aspoň +40), u dalších nejvýš +15 %
 * (aspoň +30) proti poslednímu zátěžovému týdnu – lehčí týden ani ladění strop nesnižují.
 */
export function weekTarget(inp: BudgetInput, k: number, ctl: number, blk: BlockState = inp.history.block ?? EMPTY_BLOCK): WeekTarget {
  const { usual, hasHistory } = historyBase(inp.history);
  const prevTotal = blk.loads[blk.loads.length - 1] ?? usual;
  const weekStart = addDays(mondayOf(inp.from), 7 * k);
  const from = k === 0 ? inp.from : weekStart;
  const days = daysBetween(from, addDays(weekStart, 7));
  const done = k === 0 ? inp.doneLoad : 0;
  const phase = phaseFor(inp.goal, weekStart, inp.raceDate);
  const cyc = phase === "base" || phase === "build";
  const bw = inp.blockWeeks ?? BLOCK_WEEKS;
  const avg = blockAvg(blk, bw);
  // lehčí týden po 3 zátěžových za sebou (z historie, ne z kalendáře); při malé zátěži se nedělá a ani těsně před
  // laděním – ladění samo ubírá objem a podle Bosqueta navazuje na běžný trénink
  const taperNext = phaseFor(inp.goal, addDays(weekStart, 7), inp.raceDate) === "taper";
  const recoveryWeek = cyc && !taperNext && blk.streak >= bw && avg != null && avg >= MIN_RECOVERY_LOAD;
  const cycleIdx = cyc ? (recoveryWeek ? bw + 1 : Math.min(bw, blk.streak + 1)) : 1;
  let base: number | null = null;
  const ramp = Math.round(rampOf(phase, ctl, inp.history.seasonPeak ?? null) * 10) / 10;
  const notes: string[] = [];
  // cíl jen pro plánované dny: růst se krátí poměrem dní (ve čtvrtek zbývají 4 dny → 4/7 týdenního růstu);
  // tento týden se měří od kondice na stránce (dnešek bez dnešního tréninku), ne od včerejška
  const ref = k === 0 ? (inp.ctlRef ?? ctl) : ctl;
  const ctlGoal = ref + (ramp * days) / 7;
  const need = r0(loadToReach(ctl, ctlGoal, days));
  let load = need;
  let limit: WeekTarget["limit"] = null;
  // strop podle historie (celý týden včetně odjetého)
  // další týdny: z předchozího plánovaného (+15 %, aspoň +30), ale nikdy pod strop z historie – tento týden
  // bývá neúplný (část odjetá, část plán), nesmí stáhnout další týdny pod to, co obvykle jezdíš
  const histCap = hasHistory ? Math.max(usual * 1.3, usual + 40) : 150;
  const cap = k === 0 ? histCap : Math.max(histCap, prevTotal * 1.15, prevTotal + 30);
  if (done + load > cap) {
    load = Math.max(0, cap - done);
    limit = "historie";
  }
  if (phase === "taper" && inp.raceDate) {
    // z posledního běžného (zátěžového) týdne před laděním – ne z průměru, do kterého už ladění spadlo
    const raceWeek = daysBetween(weekStart, inp.raceDate) < 7;
    base = prevTotal;
    load = Math.max(0, r0(base * (raceWeek ? TAPER_SHARE.race : TAPER_SHARE.before)) - done);
    limit = "ladění";
  }
  if (phase === "post") {
    base = prevTotal;
    const easy = Math.max(0, r0(base * POST_SHARE) - done);
    if (easy < load) { load = easy; limit = "po závodě"; }
  }
  if (recoveryWeek) {
    base = avg!;
    const easy = Math.max(0, r0(base * RECOVERY_SHARE) - done);
    if (easy < load) { load = easy; limit = "lehčí týden"; }
  }
  const f = k === 0 ? inp.fatigue : k === 1 ? (1 + inp.fatigue) / 2 : 1;
  if (f < 1) { load = load * f; limit = "únava"; }
  load = r0(load);
  const ctlEnd = ctlAfter(ctl, load, days);
  const goalTxt = ramp < 0 ? `zimní pokles kondice na ${n1(ctlGoal)}` : ramp === 0 ? `udržení kondice ${n1(ref)}` : `růst kondice na ${n1(ctlGoal)}`;
  const span = k === 0 && days < 7 ? " do neděle" : "";
  if (limit === "historie" && load < need)
    notes.push(`Na ${goalTxt} by bylo potřeba ${need} zátěže${span}. ${hasHistory && k === 0 ? `Poslední týdny jezdíš kolem ${usual} týdně a víc než o 30 % najednou nepřidávám` : k > 0 ? "Přidávám nejvýš o 15 % za týden" : "Bez historie začínám opatrně"}, takže ${load} → kondice ${n1(ctlEnd)}.`);
  if (limit === "ladění") notes.push(`Ladění před závodem: ${load} zátěže (${daysBetween(weekStart, inp.raceDate!) < 7 ? "45" : "70"} % posledního běžného týdne ${r0(base!)}), intenzita a počet tréninků zůstávají → forma do závodu stoupá.`);
  if (limit === "lehčí týden") notes.push(`Lehčí týden po ${blk.streak} zátěžových: ${load} zátěže (55 % jejich průměru ${r0(base!)}, o 40–50 % méně podle Friela) → kondice ${n1(ctlEnd)}.`);
  if (limit === "po závodě") notes.push(`Týden po závodě: lehce a bez kvality, ${load} zátěže (55 % posledního běžného týdne ${r0(base!)}) → kondice ${n1(ctlEnd)}.`);
  if (limit === "únava") notes.push(`Únava: týden o ${r0((1 - f) * 100)} % lehčí → kondice ${n1(ctlEnd)}.`);
  return { weekStart, from, days, phase, phaseLabel: PHASE_LABEL3[phase], ramp, cycleIdx, recoveryWeek, base: base == null ? null : r0(base), winter: isWinter(weekStart), shortDays: isWinter(weekStart) && (phase === "offseason" || phase === "maintain"), floor: phase === "offseason" && inp.history.seasonPeak ? r1(inp.history.seasonPeak * (1 - WINTER_DROP)) : null, ctlStart: r1(ref), ctlGoal: r1(ctlGoal), need, load, done: r0(done), ctlEnd: r1(ctlEnd), limit, notes };
}

/** Pozice v bloku po týdnu `t` se zátěží `total`: lehčí týden, ladění a přechod po závodě blok končí (a strop
 *  dalších týdnů nesnižují – navazuje se na poslední zátěžový týden). */
export const nextBlock = (blk: BlockState, t: Pick<WeekTarget, "recoveryWeek" | "phase">, total: number): BlockState =>
  pushWeek(blk, total, t.recoveryWeek || t.phase === "taper" || t.phase === "post");

/** Cíle všech týdnů s rovnoměrným odhadem kondice (engine místo toho navazuje skutečným výhledem plánu). */
export function weekTargets(inp: BudgetInput): WeekTarget[] {
  const out: WeekTarget[] = [];
  let ctl = inp.ctlNow;
  let blk = inp.history.block ?? EMPTY_BLOCK;
  for (let k = 0; k < inp.weeks; k++) {
    const t = weekTarget(inp, k, ctl, blk);
    out.push(t);
    ctl = ctlAfter(ctl, t.load, t.days);
    blk = nextBlock(blk, t, t.done + t.load);
  }
  return out;
}
