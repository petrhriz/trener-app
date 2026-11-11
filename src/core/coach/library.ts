// Knihovna jednotek Trenéra v2: rodiny, žebříčky (stupeň = minuty v cílové zóně), kroky ve W (kolo) nebo v tepu.
// Stavba podle 80/20 Endurance přeložená na zóny uživatele: jejich Z1 → Z1, Z2 → Z2, X → Z3 (tempo),
// Z3 → Z4 (práh), Z4 → Z5 (VO2). Zóny a prahy jsou uživatelovy (Garmin), stupnice 80/20 se nepřebírá.
import type { PlanSport } from "../../datasource/types";
import { num } from "../../lib/format";
import { QUALITY_NAME, type QualityType } from "../quality";
import { type Format, LADDER, bandFor, tizMin } from "../qualityDesign";
import { type Block, type IntervalSet, type Step, type Workout, SPORT_LABEL, intervalWorkout, totalSeconds, workoutName, z1Workout, z2Workout } from "../workout";
import { type HrZones, TARGET_PCT, hrZoneRange, pctRange, round5 } from "../zones";

export type Family = "rec" | "end" | "long" | "ff" | "tempo" | "ss" | "thr" | "vo2" | "vo2s" | "sp";
export type KeyFamily = "tempo" | "ss" | "thr" | "vo2" | "vo2s" | "sp";
export const KEY_FAMILIES: KeyFamily[] = ["tempo", "ss", "thr", "vo2", "vo2s", "sp"];
export const isKeyFamily = (f: Family | null): f is KeyFamily => !!f && (KEY_FAMILIES as string[]).includes(f);

export const FAMILY_NAME: Record<Family, string> = {
  rec: "regenerace", end: "vytrvalost", long: "dlouhá", ff: "rychlý závěr", tempo: "tempo", ss: "sweet spot", thr: "práh", vo2: "VO2", vo2s: "VO2 30/15", sp: "krátké ostré",
};

const F = (reps: number, workMin: number, restMin: number): Format => ({ reps, work_s: Math.round(workMin * 60), rest_s: Math.round(restMin * 60) });

/** Žebříčky kola (čas v cílové zóně roste). */
export const RIDE_LADDER: Record<KeyFamily, Format[]> = {
  tempo: [F(2, 15, 5), F(2, 20, 5), F(3, 15, 5), F(3, 20, 5), F(2, 30, 5)],
  ss: LADDER.sweetspot,
  thr: LADDER.prah,
  vo2: LADDER.vo2,
  vo2s: LADDER.vo2short,
  sp: [F(5, 1, 2), F(6, 1, 2), F(8, 1, 2)],
};
/** Žebříčky běhu (podle tepu): tempo souvisle, práh v úsecích, rovinky. */
export const RUN_LADDER: Record<"tempo" | "thr" | "sp", Format[]> = {
  tempo: [F(1, 15, 0), F(1, 20, 0), F(1, 25, 0), F(1, 30, 0), F(1, 35, 0)],
  thr: [F(4, 5, 3), F(5, 5, 3), F(4, 6, 3), F(4, 8, 3), F(5, 8, 3)],
  sp: [F(6, 1 / 3, 5 / 3), F(8, 1 / 3, 5 / 3)],
};
/** Rychlý závěr: minuty tempa na konci Z2. */
export const FF_LADDER = [10, 12, 15, 20];

export const START_LEVEL: Record<KeyFamily, number> = { tempo: 0, ss: 1, thr: 1, vo2: 1, vo2s: 1, sp: 1 };
const FAMILY_QT: Record<KeyFamily, QualityType | null> = { tempo: "tempo", ss: "sweetspot", thr: "prah", vo2: "vo2", vo2s: "vo2short", sp: null };
/** zóna tepu pro rodinu (kroky podle tepu) */
const FAMILY_HRZ: Record<Family, number> = { rec: 1, end: 2, long: 2, ff: 3, tempo: 3, ss: 3, thr: 4, vo2: 5, vo2s: 5, sp: 4 };

export interface Zones {
  ftp: number | null;
  hr: HrZones | null;
  /** nejlepší 5min výkon za 42 dní (VO2 se míří podle něj) */
  p5: number | null;
}

/** Rodina, kterou sport opravdu umí (běh nemá sweet spot ani VO2 podle tepu). */
export function familyFor(sport: PlanSport, f: KeyFamily, hasPower: boolean): KeyFamily {
  if (sport === "ride" && hasPower) return f;
  if (sport === "ride") return f;
  if (f === "ss") return "tempo";
  if (f === "vo2" || f === "vo2s") return "thr";
  return f;
}

export function ladderOf(sport: PlanSport, f: KeyFamily): Format[] {
  if (sport === "ride") return RIDE_LADDER[f];
  return RUN_LADDER[f as "tempo" | "thr" | "sp"] ?? RUN_LADDER.tempo;
}

export const clampLevel = (sport: PlanSport, f: KeyFamily, level: number) => Math.max(0, Math.min(ladderOf(sport, f).length - 1, Math.round(level)));

/** Nejvyšší stupeň, který nepřekročí čas v zóně `maxTiz` (pojistka 80/20). */
export function capLevel(sport: PlanSport, f: KeyFamily, level: number, maxTiz: number | null): number {
  let l = clampLevel(sport, f, level);
  if (maxTiz == null) return l;
  const lad = ladderOf(sport, f);
  while (l > 0 && tizMin(lad[l]!) > maxTiz + 0.01) l--;
  return l;
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

function hrIntervals(hr: HrZones | null, z: number, f: Format, minutes: number, warmMin: number, ride: boolean): Workout {
  const sets = f.sets ?? 1;
  const core = (sets * f.reps * (f.work_s + f.rest_s)) / 60;
  const cool = Math.max(ride ? 10 : 5, r5(minutes - warmMin - core));
  const blocks: Block[] = [{ label: "Rozjeti", kind: "warmup", steps: [hrStep(hr, 2, warmMin * 60, ride)] }];
  for (let i = 0; i < sets; i++) {
    const steps = [hrStep(hr, z, f.work_s)];
    if (f.rest_s > 0 && f.reps > 1) steps.push(hrStep(hr, 1, f.rest_s));
    blocks.push({ label: sets > 1 ? `Serie ${i + 1}` : "Intervaly", kind: "work", reps: f.reps > 1 ? f.reps : undefined, steps });
    if (i < sets - 1) blocks.push({ label: "Pauza", kind: "pause", steps: [hrStep(hr, 1, 180, ride)] });
  }
  blocks.push({ label: "Vyjeti", kind: "cooldown", steps: [hrStep(hr, ride ? 2 : 1, cool * 60, ride)] });
  return { blocks };
}

function hrEasy(hr: HrZones | null, minutes: number, z: number, ride: boolean): Workout {
  if (z === 1) return { blocks: [{ label: "Z1", kind: "cooldown", steps: [hrStep(hr, 1, minutes * 60, ride)] }] };
  const warm = ride ? 5 : 10;
  const main = Math.max(10, minutes - warm - 5);
  return {
    blocks: [
      { label: "Rozjeti", kind: "warmup", steps: [hrStep(hr, 1, warm * 60)] },
      { label: "Z2", kind: "main", steps: [hrStep(hr, 2, main * 60)] },
      { label: "Vyjeti", kind: "cooldown", steps: [hrStep(hr, 1, 300, ride)] },
    ],
  };
}

// ---------- zátěž ----------

const HR_IF = [0.55, 0.68, 0.82, 0.92, 1.02];

/**
 * Zátěž jednotky z jejích kroků: Σ čas × IF² (IF = střed pásma / FTP; u kroků podle tepu podle zóny).
 * `calib` = poměr skutečné zátěže uživatele k teorii (z jeho historie), drží odhad u jeho čísel.
 */
export function workoutLoad(w: Workout, ftp: number | null, calib = 1): number {
  let t = 0;
  for (const b of w.blocks)
    for (const s of b.steps) {
      const f = s.lo != null && s.hi != null && ftp ? (s.lo + s.hi) / 2 / ftp : HR_IF[(s.z ?? 2) - 1] ?? 0.68;
      t += (b.reps ?? 1) * s.dur_s * f * f;
    }
  return Math.round((t / 3600) * 100 * calib);
}
/** teoretická zátěž lehké hodiny (Z2) – základ kalibrace */
export const EASY_LOAD_H = { power: 41.6, hr: 46.2 };

// ---------- stavba ----------

export interface BuildInput {
  sport: PlanSport;
  family: Family;
  level: number;
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
  /** cíl pracovního úseku (pro vyhodnocení okruhů) */
  plan: { reps: number; work_s: number; lo: number; hi: number; sets?: number } | null;
}

const bpm = (hr: HrZones | null, z: number) => (hr && hr.floors.length >= z ? hrZoneRange(hr, z).join("–") : null);
const hrText = (hr: HrZones | null, z: number, extra = "") => (bpm(hr, z) ? `❤️ Z${z} (${bpm(hr, z)} bpm)${extra}` : `❤️ Z${z} tepu${extra}`);

function spBand(ftp: number): [number, number] {
  const m = round5(1.15 * ftp);
  return [m - 10, m + 10];
}

export function buildWorkout(inp: BuildInput): Built {
  const { sport, zones, indoor } = inp;
  const hr = zones.hr;
  const calib = inp.calib ?? 1;
  const minutes = Math.max(20, Math.round(inp.minutes));
  const L = SPORT_LABEL[sport]!;
  const power = sport === "ride" && !!zones.ftp;
  const done = (workout: Workout, name: string, x: Partial<Built> = {}): Built => ({
    workout,
    name,
    minutes: Math.round(totalSeconds(workout) / 60),
    tizMin: 0,
    load: workoutLoad(workout, zones.ftp, calib),
    qualityType: null,
    targetText: null,
    family: inp.family,
    level: 0,
    plan: null,
    ...x,
  });

  // --- běžky: bez struktury (v zimě se hodinky hlídat nedají) ---
  if (sport === "xc_ski") {
    const q = isKeyFamily(inp.family);
    const w: Workout = { blocks: [{ label: q ? "Kvalita" : "Lehce", kind: q ? "work" : "main", steps: [hrStep(hr, q ? 4 : 2, minutes * 60)] }] };
    return done(w, q ? "Běžky – kvalita naplno" : "Běžky – pocitově lehce", { tizMin: q ? Math.round(minutes * 0.4) : 0, targetText: q ? "pocitově naplno (úseky do kopce, bez hlídání hodinek)" : "pocitově lehce, ať se dá mluvit" });
  }
  if (sport === "walk") return done(hrEasy(hr, minutes, 1, false), "Chůze – svižně", { family: "rec", targetText: hrText(hr, 1) });

  // --- lehké jednotky ---
  if (inp.family === "rec") {
    const m = Math.min(45, minutes);
    if (power) return done(z1Workout({ ftp: zones.ftp! }, m), workoutName("Z1 regenerace", indoor), { targetText: `⚡ ${pctRange(zones.ftp!, TARGET_PCT.recovery).join("–")} W (40–54 % FTP)` });
    return done(hrEasy(hr, m, 1, sport === "ride"), sport === "ride" ? workoutName("Z1 regenerace", indoor) : `${L} – Z1 regenerace`, { targetText: hrText(hr, 1) });
  }
  if (inp.family === "end" || inp.family === "long" || inp.family === "ff") {
    const long = inp.family === "long";
    if (inp.family === "ff" && minutes >= 60) {
      const lvl = Math.max(0, Math.min(FF_LADDER.length - 1, Math.round(inp.level)));
      const fin = FF_LADDER[lvl]!;
      if (power) {
        const base = z2Workout({ ftp: zones.ftp! }, minutes - fin);
        const [lo, hi] = [round5(zones.ftp! * 0.8), round5(zones.ftp! * 0.88)];
        const w: Workout = { blocks: [base.blocks[0]!, base.blocks[1]!, { label: "Rychly zaver", kind: "main", steps: [{ dur_s: fin * 60, lo, hi }] }, base.blocks[2]!] };
        const [zl, zh] = pctRange(zones.ftp!, TARGET_PCT.z2);
        return done(w, workoutName(`Z2 s rychlým závěrem ${fin} min`, indoor), { tizMin: fin, level: lvl, targetText: `⚡ ${zl}–${zh} W, závěr ${lo}–${hi} W${bpm(hr, 2) ? ` · ❤️ Z2 (${bpm(hr, 2)} bpm)` : ""}` });
      }
      const e = hrEasy(hr, minutes - fin, 2, sport === "ride");
      const w: Workout = { blocks: [e.blocks[0]!, e.blocks[1]!, { label: "Rychly zaver", kind: "main", steps: [hrStep(hr, 3, fin * 60)] }, e.blocks[2]!] };
      return done(w, sport === "ride" ? workoutName(`Z2 s rychlým závěrem ${fin} min`, indoor) : `${L} – Z2 s rychlým závěrem ${fin} min`, { tizMin: fin, level: lvl, targetText: hrText(hr, 2, `, závěr Z3`) });
    }
    if (power) {
      const [zl, zh] = pctRange(zones.ftp!, TARGET_PCT.z2);
      return done(z2Workout({ ftp: zones.ftp! }, minutes), indoor ? "Trenažér – Z2" : long ? "Z2 dlouhá jízda" : "Z2 vytrvalost", { family: inp.family === "ff" ? "end" : inp.family, targetText: `⚡ ${zl}–${zh} W (57–72 % FTP)${bpm(hr, 2) ? ` · ❤️ Z2 (${bpm(hr, 2)} bpm)` : ""}` });
    }
    const nm = sport === "ride" ? (indoor ? "Trenažér – Z2" : long ? "Z2 dlouhá jízda" : "Z2 vytrvalost") : long ? `${L} – Z2 dlouhá` : `${L} – Z2`;
    return done(hrEasy(hr, minutes, 2, sport === "ride"), nm, { family: inp.family === "ff" ? "end" : inp.family, targetText: hrText(hr, 2) });
  }

  // --- klíčové jednotky ---
  const fam = familyFor(sport, inp.family as KeyFamily, power);
  const lad = ladderOf(sport, fam);
  let level = clampLevel(sport, fam, inp.level);
  // podle tepu (běh): stupeň se musí vejít do délky jednotky (rozklusání 10 + vyklusání 5 min)
  const coreMin = (f: Format) => ((f.sets ?? 1) * f.reps * (f.work_s + f.rest_s)) / 60;
  if (!power && sport !== "ride") while (level > 0 && 15 + coreMin(lad[level]!) > minutes + 5) level--;
  const fmt = lad[level]!;
  const tiz = Math.round(tizMin(fmt));
  if (power) {
    const ftp = zones.ftp!;
    const qt = FAMILY_QT[fam];
    const band = fam === "sp" ? spBand(ftp) : bandFor(qt ?? "tempo", ftp, zones.p5);
    const nSets = fmt.sets ?? 1;
    const label = fam === "thr" ? "Prah" : fam === "ss" ? "Sweet spot" : fam === "tempo" ? "Tempo" : fam === "vo2s" ? "Serie" : fam === "sp" ? "Ostre" : "VO2";
    const sets: IntervalSet[] = [];
    if (fam === "vo2s") for (let i = 0; i < nSets; i++) sets.push({ label: `Serie ${i + 1}`, reps: fmt.reps, work_s: fmt.work_s, rest_s: fmt.rest_s, lo: band[0], hi: band[1] });
    else if (fmt.reps === 2 && fmt.work_s >= 15 * 60) {
      sets.push({ label: `${label} 1`, reps: 1, work_s: fmt.work_s, rest_s: 0, lo: band[0], hi: band[1] });
      sets.push({ label: `${label} 2`, reps: 1, work_s: fmt.work_s, rest_s: 0, lo: band[0], hi: band[1] });
    } else sets.push({ label, reps: fmt.reps, work_s: fmt.work_s, rest_s: fmt.rest_s, lo: band[0], hi: band[1] });
    const warmupMin = indoor ? 15 : 20;
    const pause = fam === "vo2s" ? 180 : 300;
    const coreSec = sets.reduce((t, s) => t + s.reps * (s.work_s + (s.reps > 1 ? s.rest_s : 0)), 0) + (sets.length - 1) * pause;
    let cooldownMin = Math.max(10, Math.round((minutes * 60 - warmupMin * 60 - coreSec) / 60 / 5) * 5);
    const total = warmupMin + coreSec / 60 + cooldownMin;
    cooldownMin += (5 - (Math.round(total) % 5)) % 5;
    const workout = intervalWorkout({ ftp }, { warmupMin, sets, pauseBetweenS: pause, cooldownMin });
    const wmin = fmt.work_s / 60;
    const base =
      fam === "vo2s" ? `${nSets}×${fmt.reps}×30/15 s VO2 ${band[0]}–${band[1]} W`
      : fam === "vo2" ? `${fmt.reps}×${num(wmin)} min VO2 ${band[0]}–${band[1]} W`
      : fam === "sp" ? `${fmt.reps}×${num(wmin)} min ostře`
      : `${fmt.reps}×${num(wmin)} min ${QUALITY_NAME[qt!]}`;
    const hot = fam === "vo2" || fam === "vo2s" || fam === "sp";
    const hz = hr && hr.floors.length >= 5 ? `${hrZoneRange(hr, hot ? 4 : 3)[0]}–${hrZoneRange(hr, hot ? 5 : 4)[1]} bpm` : null;
    return done(workout, workoutName(base, indoor), {
      tizMin: tiz,
      qualityType: qt,
      family: fam,
      level,
      plan: { reps: fmt.reps, work_s: fmt.work_s, lo: band[0], hi: band[1], sets: fmt.sets },
      targetText: `⚡ ${band[0]}–${band[1]} W (${Math.round((band[0] / ftp) * 100)}–${Math.round((band[1] / ftp) * 100)} % FTP)${hz ? ` · ❤️ ${hot ? "Z4–Z5" : "Z3–Z4"} (${hz})` : ""}`,
    });
  }
  // podle tepu (běh, kolo bez wattmetru)
  const z = FAMILY_HRZ[fam];
  const ride = sport === "ride";
  const w = hrIntervals(hr, z, fmt, minutes, ride ? 20 : 10, ride);
  const wmin = fmt.work_s / 60;
  const what = fam === "sp" ? (ride ? `${fmt.reps}×${num(wmin)} min ostře` : `${fmt.reps}× rovinka ${fmt.work_s} s`) : fmt.reps > 1 ? `${fmt.reps}×${num(wmin)} min ${FAMILY_NAME[fam]} (Z${z})` : `${num(wmin)} min ${FAMILY_NAME[fam]} (Z${z})`;
  return done(w, ride ? workoutName(what, indoor) : `${L} – ${what}`, {
    tizMin: tiz,
    qualityType: FAMILY_QT[fam],
    family: fam,
    level,
    targetText: fam === "sp" && !ride ? "rovinky svižně a uvolněně, mezi nimi klus" : hrText(hr, z, fmt.reps > 1 ? ", pauzy Z1" : ""),
  });
}

// ---------- výběr rodiny klíčového dne ----------

export type Phase = "zaklad" | "rozvoj" | "udrzovani" | "ladeni";
export const PHASE_LABEL: Record<Phase, string> = { zaklad: "Základ", rozvoj: "Rozvoj", udrzovani: "Udržování", ladeni: "Ladění" };

/** Které rodiny připadají v úvahu pro 1. a 2. klíčový den týdne. */
export function keyCandidates(phase: Phase, o: { recoveryWeek: boolean; decline: boolean; winter: boolean }): KeyFamily[][] {
  if (o.recoveryWeek || phase === "ladeni") return [["sp"], ["sp"]];
  if (o.decline) return [["ss", "sp"], ["sp"]];
  if (phase === "udrzovani") return o.winter ? [["ss", "thr"], ["tempo"]] : [["thr", "vo2"], ["ss", "vo2s"]];
  if (phase === "zaklad") return [["tempo", "ss"], ["thr", "ss"]];
  return [["thr", "vo2"], ["vo2s", "vo2", "ss"]];
}

/**
 * Výběr rodin pro klíčové dny: z kandidátů ta, která se nejela nejdéle (střídání), žádná dvakrát v týdnu.
 * `lastDone` = datum poslední jednotky rodiny (chybí = nikdy).
 */
export function pickFamilies(cands: KeyFamily[][], count: number, lastDone: Partial<Record<KeyFamily, string>>): KeyFamily[] {
  const out: KeyFamily[] = [];
  for (let i = 0; i < count; i++) {
    const pool = (cands[Math.min(i, cands.length - 1)] ?? ["ss"]).filter((f) => !out.includes(f) || f === "sp");
    const src = pool.length ? pool : (cands[0] ?? ["ss"]);
    const best = [...src].sort((a, b) => (lastDone[a] ?? "").localeCompare(lastDone[b] ?? "") || src.indexOf(a) - src.indexOf(b))[0]!;
    out.push(best);
  }
  return out;
}
