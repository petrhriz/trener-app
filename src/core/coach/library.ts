// Knihovna jednotek Trenéra v2. Klíčové tréninky na kole s wattmetrem se vybírají z knihovny (workouts.data.ts,
// hlavní části převzaté z projektu Domestique, Apache-2.0) – trenér je střídá a přidává podle náročnosti.
// Rozjetí, dojezd, lapy a watty staví sám ze zón uživatele (Garmin). Běh, běžky a kolo bez wattmetru jedou
// podle tepu z vlastních žebříčků.
import type { PlanSport } from "../../datasource/types";
import { dm, num } from "../../lib/format";
import { type ActPower, curveCompare, daysSince, lastStimulus } from "../power";
import type { QualityType } from "../quality";
import type { Format } from "../qualityDesign";
import { type Block, type Step, type Workout, SPORT_LABEL, totalSeconds, workoutName, z1Workout, z2Workout } from "../workout";
import { type HrZones, TARGET_PCT, hrZoneRange, pctRange, round5, runHrZones } from "../zones";
import type { Phase } from "./target";
import { type LibWorkout, LIBRARY } from "./workouts.data";

export type Cat = "tempo" | "ss" | "thr" | "ou" | "vo2" | "vo2s" | "ana" | "nm";
export type Family = "rec" | "end" | "long" | "ff" | Cat;
export const CATS: Cat[] = ["tempo", "ss", "thr", "ou", "vo2", "vo2s", "ana", "nm"];
export const isCat = (f: string | null | undefined): f is Cat => !!f && (CATS as string[]).includes(f);

export const CAT_NAME: Record<Cat, string> = { tempo: "tempo", ss: "sweet spot", thr: "práh", ou: "over-under", vo2: "VO2max", vo2s: "VO2 krátké", ana: "anaerobní", nm: "sprinty" };
const CAT_QT: Record<Cat, QualityType | null> = { tempo: "tempo", ss: "sweetspot", thr: "prah", ou: "prah", vo2: "vo2", vo2s: "vo2short", ana: "vo2short", nm: null };
const CAT_LABEL: Record<Cat, string> = { tempo: "Tempo", ss: "Sweet spot", thr: "Prah", ou: "Over-under", vo2: "VO2", vo2s: "Serie", ana: "Anaerobni", nm: "Sprint" };

/** stupně náročnosti v každé kategorii (0 = nejlehčí) */
export const TIERS = 6;
export const START_TIER = 1;
const HARD = 76;

const byCat = new Map<Cat, LibWorkout[]>();
for (const c of CATS) byCat.set(c, LIBRARY.filter((w) => w.c === c).sort((a, b) => a.s - b.s || a.id.localeCompare(b.id)));
const tierOfIdx = (i: number, n: number) => Math.min(TIERS - 1, Math.floor((i / Math.max(1, n)) * TIERS));
export const libById = (id: string | null | undefined): LibWorkout | null => (id ? LIBRARY.find((w) => w.id === id) ?? null : null);
export function tierOf(w: LibWorkout): number {
  const list = byCat.get(w.c as Cat) ?? [];
  return tierOfIdx(list.indexOf(w), list.length);
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export interface PickInput {
  cat: Cat;
  tier: number;
  /** nejdelší hlavní část (min), aby se trénink vešel do délky dne */
  maxMain: number;
  /** strop minut nad Z2 (pojistka 80/20) */
  maxTiz: number | null;
  /** nedávno použité tréninky a tvary – nebrat znovu (pestrost) */
  avoidIds: string[];
  avoidShapes: string[];
  /** stejný den = stejná volba */
  seed: string;
}

/**
 * Výběr tréninku z knihovny: správná kategorie a stupeň, vejde se, a co nejdéle nebyl.
 * Délka hlavní části a strop minut nad Z2 jsou tvrdé limity: když se nevejde nic, vrací null
 * (engine pak zkusí jinou kategorii, nebo dá místo kvality Z2) – nikdy trénink nad limit.
 */
export function pickLib(o: PickInput): LibWorkout | null {
  const list = byCat.get(o.cat) ?? [];
  const fits = (w: LibWorkout) => w.m <= o.maxMain && (o.maxTiz == null || w.t <= o.maxTiz + 0.01);
  const want = Math.max(0, Math.min(TIERS - 1, Math.round(o.tier)));
  let best: { w: LibWorkout; score: number } | null = null;
  list.forEach((w, i) => {
    if (!fits(w)) return;
    const dist = Math.abs(tierOfIdx(i, list.length) - want);
    const score = dist * 10 + (o.avoidIds.includes(w.id) ? 25 : 0) + (o.avoidShapes.includes(w.n) ? 11 : 0) + (hash(o.seed + w.id) % 1000) / 1000;
    if (!best || score < best.score) best = { w, score };
  });
  return (best as { w: LibWorkout } | null)?.w ?? null;
}

// ---------- kroky podle tepu ----------

function hrStep(hr: HrZones | null, z: number, dur_s: number, lap = false): Step {
  const s: Step = { dur_s, hr: `Z${z} HR`, z };
  if (hr && hr.floors.length >= z) {
    const [lo, hi] = hrZoneRange(hr, z);
    s.hrLo = lo;
    s.hrHi = hi;
    // intervals.icu neumí cíl v bpm – jde tam % LTHR spočítané z bpm Garminu (stejný cíl v hodinkách i v aplikaci)
    if (hr.lthr && hr.lthr > 100) s.hr = `${Math.round((lo / hr.lthr) * 100)}-${Math.round((hi / hr.lthr) * 100)}% LTHR`;
  }
  if (lap) s.lap = true;
  return s;
}

const r5 = (x: number) => Math.round(x / 5) * 5;
const F = (reps: number, workMin: number, restMin: number): Format => ({ reps, work_s: Math.round(workMin * 60), rest_s: Math.round(restMin * 60) });
type HrFam = "tempo" | "thr" | "vo2" | "sp";
/** Žebříčky podle tepu (6 stupňů): tempo souvisle, práh a VO2 v úsecích, krátké ostré / rovinky. */
const HR_LADDER: Record<HrFam, Format[]> = {
  tempo: [F(1, 15, 0), F(1, 20, 0), F(1, 25, 0), F(1, 30, 0), F(1, 35, 0), F(1, 40, 0)],
  thr: [F(4, 5, 3), F(5, 5, 3), F(4, 6, 3), F(4, 8, 3), F(5, 8, 3), F(4, 10, 3)],
  vo2: [F(4, 3, 3), F(5, 3, 3), F(4, 4, 3), F(5, 4, 3), F(6, 4, 3), F(5, 5, 4)],
  sp: [F(5, 1, 2), F(6, 1, 2), F(8, 1, 2), F(8, 1, 2), F(10, 1, 2), F(10, 1, 2)],
};
const RUN_STRIDES: Format[] = [F(6, 1 / 3, 5 / 3), F(6, 1 / 3, 5 / 3), F(8, 1 / 3, 5 / 3), F(8, 1 / 3, 5 / 3), F(10, 1 / 3, 5 / 3), F(10, 1 / 3, 5 / 3)];
const HR_ZONE: Record<HrFam, number> = { tempo: 3, thr: 4, vo2: 5, sp: 4 };
const HR_NAME: Record<HrFam, string> = { tempo: "tempo", thr: "práh", vo2: "VO2", sp: "krátké ostré" };
/** Kategorie → rodina podle tepu (běh nemá VO2 podle tepu – tep nestihne naběhnout). */
function hrFamOf(cat: Cat, sport: PlanSport): HrFam {
  if (cat === "tempo" || cat === "ss") return "tempo";
  if (cat === "thr" || cat === "ou") return "thr";
  if (cat === "vo2" || cat === "vo2s") return sport === "ride" ? "vo2" : "thr";
  return "sp";
}
const coreMin = (f: Format) => ((f.sets ?? 1) * f.reps * (f.work_s + f.rest_s)) / 60;

function hrIntervals(hr: HrZones | null, z: number, f: Format, minutes: number, warmMin: number, ride: boolean): Workout {
  const cool = Math.max(ride ? 10 : 5, r5(minutes - warmMin - coreMin(f)));
  const steps = [hrStep(hr, z, f.work_s)];
  if (f.rest_s > 0 && f.reps > 1) steps.push(hrStep(hr, 1, f.rest_s));
  return {
    blocks: [
      { label: "Rozjeti", kind: "warmup", steps: [hrStep(hr, 2, warmMin * 60, ride)] },
      { label: "Intervaly", kind: "work", reps: f.reps > 1 ? f.reps : undefined, steps },
      { label: "Vyjeti", kind: "cooldown", steps: [hrStep(hr, ride ? 2 : 1, cool * 60, ride)] },
    ],
  };
}

function hrEasy(hr: HrZones | null, minutes: number, z: number, ride: boolean): Workout {
  if (z === 1) return { blocks: [{ label: "Z1", kind: "cooldown", steps: [hrStep(hr, 1, minutes * 60, ride)] }] };
  const warm = ride ? 5 : 10;
  const main = Math.max(10, minutes - warm - 5);
  return {
    blocks: [
      { label: "Rozjeti", kind: "warmup", steps: [hrStep(hr, 1, warm * 60)] },
      { label: "Z2", kind: "main", steps: [hrStep(hr, 2, main * 60, ride)] }, // na kole Z2 do lapu (viz z2Workout)
      { label: "Vyjeti", kind: "cooldown", steps: [hrStep(hr, 1, 300, ride)] },
    ],
  };
}

// ---------- zátěž ----------

const HR_IF = [0.55, 0.68, 0.82, 0.92, 1.02];
/** běh: zóny jsou výš (Z2 = 85–89 % prahu), takže i lehký běh dává za hodinu víc zátěže než lehká jízda */
const RUN_IF = [0.66, 0.8, 0.88, 0.95, 1.03];

/**
 * Zátěž jednotky z jejích kroků: Σ čas × IF² (IF = střed pásma / FTP; u kroků podle tepu podle zóny).
 * `calib` = poměr skutečné zátěže uživatele k teorii (z jeho historie), drží odhad u jeho čísel.
 */
export function workoutLoad(w: Workout, ftp: number | null, calib = 1, run = false): number {
  let t = 0;
  const tab = run ? RUN_IF : HR_IF;
  for (const b of w.blocks)
    for (const s of b.steps) {
      const f = s.lo != null && s.hi != null && ftp ? (s.lo + s.hi) / 2 / ftp : tab[(s.z ?? 2) - 1] ?? tab[1]!;
      t += (b.reps ?? 1) * s.dur_s * f * f;
    }
  return Math.round((t / 3600) * 100 * calib);
}
/** teoretická zátěž lehké hodiny (Z2) – základ kalibrace */
export const EASY_LOAD_H = { power: 41.6, hr: 46.2, run: 64 };

// ---------- stavba ----------

export interface Zones {
  ftp: number | null;
  hr: HrZones | null;
}

export interface BuildInput {
  sport: PlanSport;
  family: Family;
  /** stupeň náročnosti 0–5 (klíčové), u rychlého závěru délka závěru */
  level: number;
  /** trénink z knihovny (kolo s wattmetrem); null = vybere se podle stupně */
  wid?: string | null;
  /** výběr z knihovny: stejný den = stejná volba (datum) a nedávno použité tréninky kategorie (střídání na stupni) */
  seed?: string;
  avoidIds?: string[];
  minutes: number;
  indoor: boolean;
  zones: Zones;
  calib?: number;
}

export interface Built {
  workout: Workout;
  name: string;
  minutes: number;
  /** minuty nad Z2 (pro pojistku 80/20) */
  tizMin: number;
  load: number;
  qualityType: QualityType | null;
  targetText: string | null;
  family: Family;
  level: number;
  wid: string | null;
  /** cíl pracovních úseků (pro vyhodnocení okruhů): první blok + všechny bloky, když jich je víc druhů */
  plan: WorkPlan | null;
}

/** Cíl jednoho druhu pracovních úseků: reps × work_s v pásmu lo–hi W, `sets` = kolikrát se blok opakuje. */
export interface WorkTarget { reps: number; work_s: number; lo: number; hi: number; sets?: number }
/** Uložený cíl kvality. Pole první úrovně = první blok (starší uložené plány mají jen to). */
export interface WorkPlan extends WorkTarget { blocks?: WorkTarget[] }

const bpm = (hr: HrZones | null, z: number) => (hr && hr.floors.length >= z ? hrZoneRange(hr, z).join("–") : null);
const hrText = (hr: HrZones | null, z: number, extra = "") => (bpm(hr, z) ? `tep Z${z} (${bpm(hr, z)} bpm)${extra}` : `Z${z} tepu${extra}`);
/** Rychlý závěr: minuty tempa na konci Z2. */
export const FF_LADDER = [10, 12, 15, 20];

/** Hlavní část z knihovny → bloky s watty ze zón uživatele, s rozjetím, lapy a dojezdem. */
function fromLibrary(w: LibWorkout, cat: Cat, ftp: number, minutes: number, indoor: boolean): { workout: Workout; plan: Built["plan"]; band: [number, number] } {
  const [wl, wh] = pctRange(ftp, TARGET_PCT.warmupPre);
  const [rl, rh] = pctRange(ftp, TARGET_PCT.recovery);
  const [zl, zh] = pctRange(ftp, TARGET_PCT.z2);
  let lo = Infinity, hi = 0;
  const step = ([dur, pct]: [number, number]): Step => {
    if (pct < HARD) return pct <= 60 ? { dur_s: dur, lo: rl, hi: rh } : { dur_s: dur, lo: zl, hi: zh };
    const m = round5((ftp * pct) / 100);
    lo = Math.min(lo, m - 10);
    hi = Math.max(hi, m + 10);
    return { dur_s: dur, lo: m - 10, hi: m + 10 };
  };
  const warmupMin = indoor ? 15 : 20;
  const blocks: Block[] = [{ label: "Rozjeti", kind: "warmup", steps: [{ dur_s: warmupMin * 60, lo: wl, hi: wh, lap: true }] }];
  let n = 0;
  const works = w.g.filter((x) => typeof x[1] !== "number" || x[1] >= HARD).length;
  // všechny druhy pracovních úseků v pořadí. Stejný úsek (délka + pásmo) v dalším bloku se přičte – podle
  // okruhů se stejné úseky stejně rozlišit nedají; jako zvláštní blok se počítá jen jiná délka nebo pásmo.
  const targets: WorkTarget[] = [];
  const addTarget = (reps: number, s: Step) => {
    const same = targets.find((t) => t.work_s === s.dur_s && t.lo === s.lo && t.hi === s.hi);
    if (same) same.reps += reps;
    else targets.push({ reps, work_s: s.dur_s, lo: s.lo!, hi: s.hi! });
  };
  for (const x of w.g) {
    if (typeof x[1] === "number") {
      if (x[1] < HARD) blocks.push({ label: "Pauza", kind: "pause", steps: [{ ...step(x as [number, number]), lap: true }] });
      else { const s = step(x as [number, number]); blocks.push({ label: works > 1 ? `${CAT_LABEL[cat]} ${++n}` : CAT_LABEL[cat], kind: "work", steps: [s] }); addTarget(1, s); }
      continue;
    }
    const steps = x[1].map(step);
    blocks.push({ label: works > 1 ? `${CAT_LABEL[cat]} ${++n}` : CAT_LABEL[cat], kind: "work", reps: x[0], steps });
    for (const s of steps) if ((s.lo ?? 0) > zh) addTarget(x[0], s);
  }
  const first = targets[0];
  const plan: Built["plan"] = first ? { ...first, ...(targets.length > 1 ? { blocks: targets.map((t) => ({ ...t })) } : {}) } : null;
  const mainMin = blocks.slice(1).reduce((t, b) => t + ((b.reps ?? 1) * b.steps.reduce((s, y) => s + y.dur_s, 0)) / 60, 0);
  let cooldownMin = Math.max(10, r5(minutes - warmupMin - mainMin));
  cooldownMin += (5 - (Math.round(warmupMin + mainMin + cooldownMin) % 5)) % 5;
  blocks.push({ label: "Z2 a dojezd", kind: "cooldown", steps: [{ dur_s: cooldownMin * 60, lo: zl, hi: zh, lap: true }] });
  return { workout: { blocks }, plan, band: [lo, hi] };
}

export function buildWorkout(inp: BuildInput): Built {
  const { sport, zones, indoor } = inp;
  const hr = sport === "run" ? runHrZones(zones.hr) : zones.hr;
  const calib = inp.calib ?? 1;
  const minutes = Math.max(20, Math.round(inp.minutes));
  const L = SPORT_LABEL[sport]!;
  const power = sport === "ride" && !!zones.ftp;
  const done = (workout: Workout, name: string, x: Partial<Built> = {}): Built => ({
    workout,
    name,
    minutes: Math.round(totalSeconds(workout) / 60),
    tizMin: 0,
    load: workoutLoad(workout, zones.ftp, calib, sport === "run"),
    qualityType: null,
    targetText: null,
    family: inp.family,
    level: 0,
    wid: null,
    plan: null,
    ...x,
  });

  // --- běžky: bez struktury (v zimě se hodinky hlídat nedají) ---
  if (sport === "xc_ski") {
    const q = isCat(inp.family);
    const w: Workout = { blocks: [{ label: q ? "Kvalita" : "Lehce", kind: q ? "work" : "main", steps: [hrStep(hr, q ? 4 : 2, minutes * 60)] }] };
    return done(w, q ? "Běžky – kvalita naplno" : "Běžky – pocitově lehce", { tizMin: q ? Math.round(minutes * 0.4) : 0, targetText: q ? "pocitově naplno (úseky do kopce, bez hlídání hodinek)" : "pocitově lehce, ať se dá mluvit" });
  }
  if (sport === "walk") return done(hrEasy(hr, minutes, 1, false), "Chůze – svižně", { family: "rec", targetText: hrText(hr, 1) });

  // --- lehké jednotky ---
  if (inp.family === "rec") {
    const m = Math.min(45, minutes);
    if (power) return done(z1Workout({ ftp: zones.ftp! }, m), workoutName("Z1 regenerace", indoor), { targetText: `${pctRange(zones.ftp!, TARGET_PCT.recovery).join("–")} W (40–54 % FTP)` });
    return done(hrEasy(hr, m, 1, sport === "ride"), sport === "ride" ? workoutName("Z1 regenerace", indoor) : `${L} – Z1 regenerace`, { targetText: hrText(hr, 1) });
  }
  if (inp.family === "end" || inp.family === "long" || inp.family === "ff") {
    if (inp.family === "ff" && minutes >= 60) {
      const lvl = Math.max(0, Math.min(FF_LADDER.length - 1, Math.round(inp.level)));
      const fin = FF_LADDER[lvl]!;
      if (power) {
        const base = z2Workout({ ftp: zones.ftp! }, minutes - fin);
        const [lo, hi] = [round5(zones.ftp! * 0.8), round5(zones.ftp! * 0.88)];
        const w: Workout = { blocks: [base.blocks[0]!, base.blocks[1]!, { label: "Rychly zaver", kind: "main", steps: [{ dur_s: fin * 60, lo, hi }] }, base.blocks[2]!] };
        const [zl, zh] = pctRange(zones.ftp!, TARGET_PCT.z2);
        return done(w, workoutName(`Z2 s rychlým závěrem ${fin} min`, indoor), { tizMin: fin, level: lvl, targetText: `${zl}–${zh} W, závěr ${lo}–${hi} W${bpm(hr, 2) ? ` · tep Z2 (${bpm(hr, 2)} bpm)` : ""}` });
      }
      const e = hrEasy(hr, minutes - fin, 2, sport === "ride");
      const w: Workout = { blocks: [e.blocks[0]!, e.blocks[1]!, { label: "Rychly zaver", kind: "main", steps: [hrStep(hr, 3, fin * 60)] }, e.blocks[2]!] };
      return done(w, sport === "ride" ? workoutName(`Z2 s rychlým závěrem ${fin} min`, indoor) : `${L} – Z2 s rychlým závěrem ${fin} min`, { tizMin: fin, level: lvl, targetText: hrText(hr, 2, `, závěr Z3`) });
    }
    if (power) {
      const [zl, zh] = pctRange(zones.ftp!, TARGET_PCT.z2);
      return done(z2Workout({ ftp: zones.ftp! }, minutes), indoor ? "Trenažér – Z2" : "Z2", { family: inp.family === "ff" ? "end" : inp.family, targetText: `${zl}–${zh} W (57–72 % FTP)${bpm(hr, 2) ? ` · tep Z2 (${bpm(hr, 2)} bpm)` : ""}` });
    }
    const nm = sport === "ride" ? (indoor ? "Trenažér – Z2" : "Z2") : `${L} – Z2`;
    return done(hrEasy(hr, minutes, 2, sport === "ride"), nm, { family: inp.family === "ff" ? "end" : inp.family, targetText: hrText(hr, 2) });
  }

  // --- klíčové jednotky ---
  const cat = inp.family as Cat;
  const tier = Math.max(0, Math.min(TIERS - 1, Math.round(inp.level)));
  // nedávno použité tréninky se vynechají, ale jen na stejném stupni – kvůli střídání se stupeň nemění
  const pick = (avoidIds: string[]) => pickLib({ cat, tier, maxMain: minutes - (indoor ? 15 : 20) - 10, maxTiz: null, avoidIds, avoidShapes: [], seed: inp.seed ?? "" });
  const fresh = power && !inp.wid ? pick(inp.avoidIds ?? []) : null, plain = power && !inp.wid ? pick([]) : null;
  const libW = power ? libById(inp.wid) ?? (fresh && plain && tierOf(fresh) !== tierOf(plain) ? plain : fresh ?? plain) : null;
  // s wattmetrem z knihovny; když se do délky nevejde žádný trénink kategorie, stejně jako bez wattmetru podle tepu
  if (power && libW) {
    const ftp = zones.ftp!;
    const w = libW;
    const b = fromLibrary(w, cat, ftp, minutes, indoor);
    const hot = cat === "vo2" || cat === "vo2s" || cat === "ana" || cat === "nm";
    const hz = hr && hr.floors.length >= 5 ? `${hrZoneRange(hr, hot ? 4 : 3)[0]}–${hrZoneRange(hr, hot ? 5 : 4)[1]} bpm` : null;
    return done(b.workout, workoutName(`${w.n} ${CAT_NAME[cat]} ${b.band[0]}–${b.band[1]} W`, indoor), {
      tizMin: Math.round(w.t),
      qualityType: CAT_QT[cat],
      level: tierOf(w),
      wid: w.id,
      plan: b.plan,
      targetText: `${b.band[0]}–${b.band[1]} W (${Math.round((b.band[0] / ftp) * 100)}–${Math.round((b.band[1] / ftp) * 100)} % FTP)${hz && cat !== "nm" ? ` · tep ${hot ? "Z4–Z5" : "Z3–Z4"} (${hz})` : ""}`,
    });
  }
  // podle tepu (běh, kolo bez wattmetru)
  const ride = sport === "ride";
  const fam = hrFamOf(cat, sport);
  const lad = fam === "sp" && !ride ? RUN_STRIDES : HR_LADDER[fam];
  let lvl = tier;
  // stupeň se musí vejít do délky jednotky
  while (lvl > 0 && (ride ? 30 : 15) + coreMin(lad[lvl]!) > minutes + 5) lvl--;
  // ani nejnižší stupeň se nevejde (krátký den): méně opakování, ať trénink délku dne nepřeroste
  const base = (ride ? 30 : 15), per = (lad[lvl]!.work_s + lad[lvl]!.rest_s) / 60;
  const fmt = base + coreMin(lad[lvl]!) > minutes + 5 ? { ...lad[lvl]!, reps: Math.max(1, Math.floor((minutes + 5 - base) / per)) } : lad[lvl]!;
  const z = HR_ZONE[fam];
  const w = hrIntervals(hr, z, fmt, minutes, ride ? 20 : 10, ride);
  const wmin = fmt.work_s / 60;
  const what = fam === "sp" ? (ride ? `${fmt.reps}×${num(wmin)} min ostře` : `${fmt.reps}× rovinka ${fmt.work_s} s`) : fmt.reps > 1 ? `${fmt.reps}×${num(wmin)} min ${HR_NAME[fam]} (Z${z})` : `${num(wmin)} min ${HR_NAME[fam]} (Z${z})`;
  return done(w, ride ? workoutName(what, indoor) : `${L} – ${what}`, {
    tizMin: Math.round((fmt.reps * fmt.work_s) / 60),
    qualityType: fam === "tempo" ? "tempo" : fam === "thr" ? "prah" : fam === "vo2" ? "vo2" : null,
    level: lvl,
    targetText: fam === "sp" && !ride ? "rovinky svižně a uvolněně, mezi nimi klus" : hrText(hr, z, fmt.reps > 1 ? ", pauzy Z1" : ""),
  });
}

// ---------- výběr kategorie klíčového dne ----------

/** Které kategorie připadají v úvahu (v pořadí přednosti). */
export function catCandidates(phase: Phase, o: { recoveryWeek: boolean; winter: boolean }): Cat[] {
  if (o.recoveryWeek || phase === "taper" || phase === "post") return ["nm", "vo2s"];
  if (phase === "offseason") return ["ss", "tempo", "nm", "ou"];
  if (phase === "maintain") return o.winter ? ["ss", "thr", "tempo", "ou"] : ["thr", "vo2", "ou", "vo2s", "ss"];
  if (phase === "base") return ["tempo", "ss", "thr", "ou"];
  return ["thr", "vo2", "vo2s", "ou", "ana"];
}

export interface CatNeed {
  score: number;
  text: string;
}

/** Co data říkají o jednotlivých schopnostech: pokles křivky výkonu a jak dlouho chybí podnět. */
export function catNeeds(acts: ActPower[], today: string): Partial<Record<Cat, CatNeed>> {
  const out: Partial<Record<Cat, CatNeed>> = {};
  if (!acts.some((a) => a.mmp || a.max20)) return out;
  const curve = curveCompare(acts, today);
  const stim = lastStimulus(acts, today);
  const row = (s: number) => curve.rows.find((r) => r.secs === s);
  const sys: [Cat[], number, string, string | null][] = [
    [["tempo", "ss", "thr", "ou"], 1200, "20min", stim.prah],
    [["vo2", "vo2s"], 300, "5min", stim.vo2],
    [["ana"], 60, "1min", stim.anaer],
    [["nm"], 30, "30s", stim.anaer],
  ];
  for (const [cats, secs, label, last] of sys) {
    const r = row(secs);
    const decl = Math.max(0, -(r?.pct ?? 0));
    const since = daysSince(last, today);
    const parts: string[] = [];
    if (r?.now && r.prev) parts.push(`${label} výkon za 6 týdnů ${r.pct! < -0.5 ? `klesl o ${num(-r.pct!, 1)} %` : r.pct! > 0.5 ? `vzrostl o ${num(r.pct!, 1)} %` : "drží"} (${Math.round(r.prev)} → ${Math.round(r.now)} W)`);
    parts.push(last ? `poslední podnět ${dm(last)}` : "podnět za 3 týdny chybí");
    for (const c of cats) out[c] = { score: Math.min(6, decl * 1.5) + Math.min(21, since) / 7, text: parts.join(", ") };
  }
  return out;
}

/**
 * Kategorie klíčového dne: z kandidátů ta, kterou data nejvíc potřebují a která nejdéle nebyla (střídání).
 * `exclude` = kategorie už použité v týdnu a u předchozí kvality – dvakrát totéž po sobě nejde.
 */
export function chooseCat(o: { cands: Cat[]; exclude: Cat[]; lastUse: Partial<Record<Cat, string>>; date: string; needs: Partial<Record<Cat, CatNeed>> }): { cat: Cat; why: string } {
  let pool = o.cands.filter((c) => !o.exclude.includes(c));
  if (!pool.length) pool = o.cands;
  const sc = (c: Cat) => (pool.length - pool.indexOf(c)) * 0.75 + Math.min(28, daysSince(o.lastUse[c] ?? null, o.date)) / 2 + (o.needs[c]?.score ?? 0);
  const cat = [...pool].sort((a, b) => sc(b) - sc(a) || pool.indexOf(a) - pool.indexOf(b))[0]!;
  const last = o.lastUse[cat];
  const rot = last ? `naposledy ${dm(last)}` : "ještě nebyl";
  return { cat, why: `${o.needs[cat]?.text ? `${o.needs[cat]!.text}; ` : ""}${CAT_NAME[cat]} ${rot}` };
}

// ---------- tvoje úprava kvality (editor tréninku) ----------

/** Úprava hlavní série kvality: počet opakování, délka pracovního úseku (s), intenzita v % (±10). */
export interface StepEdit {
  reps?: number;
  work_s?: number;
  pct?: number;
}

export const EDIT_LIMITS = { reps: [1, 12], work_s: [30, 1800], pct: [-10, 10], growth: 1.5 } as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Kontrola uložené úpravy (JSON z omezení „kroky“). */
export function readStepEdit(note: string | null | undefined): StepEdit | null {
  if (!note) return null;
  try {
    const o = JSON.parse(note) as Record<string, unknown>;
    const e: StepEdit = {};
    const n = (k: keyof StepEdit, [lo, hi]: readonly [number, number]) => {
      if (o[k] == null) return true;
      const v = Number(o[k]);
      if (!Number.isFinite(v) || v < lo || v > hi) return false;
      e[k] = Math.round(v);
      return true;
    };
    if (!n("reps", EDIT_LIMITS.reps) || !n("work_s", EDIT_LIMITS.work_s) || !n("pct", EDIT_LIMITS.pct)) return null;
    return Object.keys(e).length ? e : null;
  } catch {
    return null;
  }
}

/** Hlavní část kvality: první blok s opakováním, jinak první pracovní blok (souvislé tempo). -1 = nic. */
export function editableBlock(w: Workout): number {
  const i = w.blocks.findIndex((x) => (x.reps ?? 1) > 1 && x.steps.length >= 1);
  return i >= 0 ? i : w.blocks.findIndex((x) => x.kind === "work" && x.steps.length >= 1);
}

/**
 * Použije úpravu na hlavní sérii (první blok s opakováním; u souvislého úseku jen délka a intenzita). Pracovní čas série smí vzrůst nejvýš o polovinu
 * (víc = jiný trénink, ne úprava) – při překročení se ubere opakování. Intenzita mění jen pracovní krok s watty.
 * Délka dne, zátěž, čas nad Z2 i cíl pro vyhodnocení okruhů se přepočítají. Bez série vrací trénink beze změny.
 */
export function applyStepEdit(b: Built, e: StepEdit, ftp: number | null, calib = 1, run = false): Built {
  const i = editableBlock(b.workout);
  if (i < 0) return b;
  const blk = b.workout.blocks[i]!;
  const s0 = blk.steps[0]!;
  const reps0 = blk.reps ?? 1;
  // souvislý úsek bez pauzy: opakování nedává smysl (byl by to jen delší úsek)
  const series = reps0 > 1 || blk.steps.length > 1;
  let reps = series ? clamp(Math.round(e.reps ?? reps0), EDIT_LIMITS.reps[0], EDIT_LIMITS.reps[1]) : 1;
  let work = Math.round(clamp(e.work_s ?? s0.dur_s, EDIT_LIMITS.work_s[0], EDIT_LIMITS.work_s[1]) / 15) * 15;
  const lim = reps0 * s0.dur_s * EDIT_LIMITS.growth;
  while (reps > 1 && reps * work > lim) reps--;
  if (reps * work > lim) work = Math.max(EDIT_LIMITS.work_s[0], Math.floor(lim / reps / 15) * 15);
  const pct = clamp(e.pct ?? 0, EDIT_LIMITS.pct[0], EDIT_LIMITS.pct[1]);
  const f = 1 + pct / 100;
  const step: Step = { ...s0, dur_s: work, ...(s0.lo != null ? { lo: round5(s0.lo * f) } : {}), ...(s0.hi != null ? { hi: round5(s0.hi * f) } : {}) };
  const blocks: Block[] = b.workout.blocks.map((x, j) => (j === i ? { ...x, ...(series ? { reps } : {}), steps: [step, ...x.steps.slice(1)] } : x));
  const workout: Workout = { blocks };
  const dWork = (reps * work - reps0 * s0.dur_s) / 60;
  const plan = b.plan ? { ...b.plan, reps, work_s: work, lo: step.lo ?? b.plan.lo, hi: step.hi ?? b.plan.hi, ...(b.plan.blocks ? { blocks: b.plan.blocks.map((t, j) => (j === 0 ? { ...t, reps, work_s: work, lo: step.lo ?? t.lo, hi: step.hi ?? t.hi } : t)) } : {}) } : null;
  return {
    ...b,
    workout,
    minutes: Math.round(totalSeconds(workout) / 60),
    tizMin: Math.max(0, Math.round(b.tizMin + dWork)),
    load: workoutLoad(workout, ftp, calib, run),
    name: b.name.endsWith("(upraveno)") ? b.name : `${b.name} (upraveno)`,
    plan,
  };
}
