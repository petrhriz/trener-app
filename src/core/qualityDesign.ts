// Kvalitní jednotka individuálně z dat (6.6). Žádná pevná knihovna: zaměření z dat, dávka podle poslední jednotky.
import type { NLap } from "../datasource/types";
import { dm, num } from "../lib/format";
import { type ActPower, curveCompare, daysSince, lastStimulus } from "./power";
import { QUALITY_NAME, type QualityType, isOffSeason } from "./quality";
import { round5 } from "./zones";
import { type IntervalSet, type IntervalSpec, type Workout, intervalWorkout, totalSeconds, workoutName } from "./workout";

export interface Format {
  reps: number;
  work_s: number;
  rest_s: number;
  sets?: number; // pro 30/15: počet sérií
}

const F = (reps: number, workMin: number, restMin: number): Format => ({ reps, work_s: workMin * 60, rest_s: restMin * 60 });

/** Žebříček dávek (čas v cílové zóně roste). */
export const LADDER: Record<Exclude<QualityType, "tempo">, Format[]> = {
  vo2: [F(4, 3, 3), F(5, 3, 3), F(4, 4, 3), F(5, 4, 3), F(6, 4, 3), F(5, 5, 4), F(6, 5, 4)],
  prah: [F(2, 10, 5), F(3, 8, 4), F(3, 10, 5), F(2, 15, 5), F(3, 12, 5), F(2, 20, 5)],
  sweetspot: [F(2, 12, 5), F(2, 15, 5), F(3, 12, 5), F(2, 20, 5), F(3, 15, 5)],
  vo2short: [
    { reps: 10, work_s: 30, rest_s: 15, sets: 2 },
    { reps: 12, work_s: 30, rest_s: 15, sets: 2 },
    { reps: 13, work_s: 30, rest_s: 15, sets: 2 },
    { reps: 10, work_s: 30, rest_s: 15, sets: 3 },
    { reps: 12, work_s: 30, rest_s: 15, sets: 3 },
  ],
};
const START_IDX: Record<keyof typeof LADDER, number> = { vo2: 2, prah: 2, sweetspot: 1, vo2short: 2 };

export const tizMin = (f: Format) => ((f.sets ?? 1) * f.reps * f.work_s) / 60;

export type Outcome = "posun" | "zopakovat" | "ubrat" | "nove";

export interface PastQuality {
  date: string;
  type: QualityType;
  /** cíle z plánu (pokud byl workout v kalendáři) */
  plan: { reps: number; work_s: number; lo: number; hi: number; sets?: number } | null;
  laps: NLap[] | null;
}

/** Krok 3: jak jsem zvládl poslední jednotku stejného zaměření. */
export function evaluatePast(p: PastQuality | null): { outcome: Outcome; text: string; workW: number[]; format: Format | null } {
  if (!p) return { outcome: "nove", text: "bez předchozí jednotky stejného zaměření", workW: [], format: null };
  if (!p.plan) return { outcome: "nove", text: `${dm(p.date)} bez plánovaného workoutu, dávku nehodnotím`, workW: [], format: null };
  if (!p.laps?.length) return { outcome: "zopakovat", text: `${dm(p.date)} lapy nejsou, opakuji dávku`, workW: [], format: planFormat(p.plan) };
  const pl = p.plan;
  // jen pracovní intervaly s délkou z plánu (±25 %) – úseky Z2 a vyjetí vynechat
  const work = p.laps.filter((l) => l.moving_s >= pl.work_s * 0.75 && l.moving_s <= pl.work_s * 1.25 && (l.avg_power ?? 0) >= pl.lo - 40);
  const expected = pl.reps * (pl.sets ?? 1);
  const w = work.map((l) => Math.round(l.avg_power ?? 0));
  const below = work.filter((l) => (l.avg_power ?? 0) < pl.lo).length;
  const hr = work.map((l) => l.avg_hr ?? 0).filter((x) => x > 0);
  const hrRise = hr.length >= 2 ? hr[hr.length - 1]! - hr[0]! : 0;
  const fmt = planFormat(pl);
  if (work.length < expected || below >= 2)
    return { outcome: "ubrat", text: `${dm(p.date)} ${work.length < expected ? `dokončeno ${work.length} z ${expected}` : `${below} intervaly pod pásmem`}`, workW: w, format: fmt };
  const lastBelow = (work[work.length - 1]?.avg_power ?? 0) < pl.lo;
  if (lastBelow || hrRise > 8)
    return { outcome: "zopakovat", text: `${dm(p.date)} hraniční (${lastBelow ? "poslední interval pod pásmem" : `tep +${hrRise} bpm`})`, workW: w, format: fmt };
  const holds = w.length < 2 || w[w.length - 1]! >= w[0]! * 0.98;
  if (holds && hrRise <= 5)
    return { outcome: "posun", text: `${dm(p.date)} zvládnuto čistě (${w.join(", ")} W)`, workW: w, format: fmt };
  return { outcome: "zopakovat", text: `${dm(p.date)} výkon nedržel (${w.join(", ")} W)`, workW: w, format: fmt };
}

function planFormat(pl: NonNullable<PastQuality["plan"]>): Format {
  return { reps: pl.reps, work_s: pl.work_s, rest_s: 0, sets: pl.sets };
}

/** Jaká zaměření kvality připadají v úvahu: v zimě (mimo sezónu) podle cíle bez ostrých intervalů. */
export function qualityCandidates(date: string, goal: DesignInput["goal"] = "zvyseni"): Exclude<QualityType, "tempo">[] {
  if (!isOffSeason(date)) return ["vo2", "prah", "sweetspot", "vo2short"];
  return goal === "pokles" ? ["sweetspot", "prah"] : goal === "udrzeni" ? ["sweetspot", "prah"] : ["prah", "sweetspot", "vo2"];
}

/** Krok 2: na co kvalitu zaměřit. */
export function chooseFocus(acts: ActPower[], today: string, lastWeekType: QualityType | null, avoid: QualityType[] = [], goal: DesignInput["goal"] = "zvyseni") {
  const curve = curveCompare(acts, today);
  const stim = lastStimulus(acts, today);
  const pct = (s: number) => curve.rows.find((r) => r.secs === s)?.pct ?? null;
  const decl = (s: number) => Math.max(0, -(pct(s) ?? 0));
  // v zimě (mimo sezónu) žádné ostré intervaly, když se nezlepšuje: zpocený a pak zima, VO2 jen pro Zlepšit / Závod
  const cands = qualityCandidates(today, goal);
  const score: Record<string, number> = {
    // mimo sezónu priorita VO2 a práh (klesají nejrychleji)
    vo2: decl(300) * 2 + Math.min(daysSince(stim.vo2, today), 21) / 3 + 1,
    prah: decl(1200) * 2 + Math.min(daysSince(stim.prah, today), 21) / 3 + 1,
    sweetspot: decl(1200) * 1.5 + Math.min(daysSince(stim.prah, today), 21) / 4,
    vo2short: Math.max(decl(30), decl(60)) * 2 + Math.min(daysSince(stim.anaer, today), 21) / 4,
  };
  // pestrost: ne stejné zaměření jako minulý týden ani jako jiná kvalita v posledních ~10 dnech
  let pool = cands.filter((c) => c !== lastWeekType && !avoid.includes(c));
  if (!pool.length) pool = cands.filter((c) => !avoid.includes(c));
  if (!pool.length) pool = cands;
  pool.sort((a, b) => score[b]! - score[a]!);
  return { focus: pool[0]!, curve, stim, score };
}

export interface DesignInput {
  today: string;
  date: string; // den jednotky
  ftp: number;
  p5: number | null; // nejlepší 5min výkon za 42 dní
  indoor: boolean;
  acts: ActPower[];
  lastWeekType: QualityType | null;
  past: (type: QualityType) => PastQuality | null;
  /** cílová délka celé jízdy (min) podle zátěže týdne */
  targetMin: number;
  /** 🟡 = dávka −30 % */
  reduce?: boolean;
  forceFocus?: QualityType | null;
  /** zaměření, kterým se vyhnout (jiná kvalita v posledních dnech) */
  avoid?: QualityType[];
  /** cíl: zvyseni = posun dávky, udrzeni = drží dávku, pokles = menší dávka */
  goal?: "udrzeni" | "zvyseni" | "pokles" | "zavod";
}

export interface Design {
  type: QualityType;
  name: string;
  workout: Workout;
  durationMin: number;
  band: [number, number];
  format: Format;
  reason: string;
  outcome: Outcome;
}

/** Krok 4: cílový výkon z křivky (ne jen % FTP), pásmo vždy ±10 W. */
export function bandFor(type: QualityType, ftp: number, p5: number | null): [number, number] {
  let c: number;
  switch (type) {
    case "vo2":
      c = p5 ? 0.95 * p5 : 1.12 * ftp; // 90–100 % 5min výkonu
      break;
    case "vo2short":
      c = p5 ? 1.05 * p5 : 1.2 * ftp; // 100–110 % 5min výkonu
      break;
    case "prah":
      c = 0.97 * ftp; // 95–100 % FTP
      break;
    case "sweetspot":
      c = 0.91 * ftp;
      break;
    default:
      c = 0.82 * ftp;
  }
  const m = round5(c);
  return [m - 10, m + 10];
}

function pickFormat(type: keyof typeof LADDER, outcome: Outcome, last: Format | null, reduce: boolean): Format {
  const ladder = LADDER[type];
  let idx: number;
  if (!last || outcome === "nove") idx = START_IDX[type];
  else {
    const t = tizMin(last);
    const cur = ladder.reduce((bi, f, i) => (Math.abs(tizMin(f) - t) < Math.abs(tizMin(ladder[bi]!) - t) ? i : bi), 0);
    if (outcome === "posun") idx = Math.min(ladder.length - 1, cur + 1);
    else if (outcome === "ubrat") {
      const target = t * 0.8;
      idx = Math.max(0, ladder.findLastIndex((f) => tizMin(f) <= target + 0.01));
    } else idx = cur;
    // jiný formát se stejnou dávkou, pokud nejde o přímé zopakování
    if (outcome === "posun" && last && ladder[idx]!.reps === last.reps && ladder[idx]!.work_s === last.work_s && idx < ladder.length - 1) idx++;
  }
  let f = ladder[idx]!;
  if (reduce) {
    const target = tizMin(f) * 0.7;
    f = ladder[Math.max(0, ladder.findLastIndex((x) => tizMin(x) <= target + 0.01))]!;
  }
  return f;
}

export function designQuality(inp: DesignInput): Design {
  const ch = chooseFocus(inp.acts, inp.today, inp.lastWeekType, inp.avoid ?? [], inp.goal ?? "zvyseni");
  const type = (inp.forceFocus && inp.forceFocus !== "tempo" ? inp.forceFocus : ch.focus) as keyof typeof LADDER;
  const ev = evaluatePast(inp.past(type));
  // cíl mění progresi: udržení posun nedělá, pokles bere menší dávku
  let outcome = ev.outcome;
  if (inp.goal === "udrzeni" && outcome === "posun") outcome = "zopakovat";
  const reduce = !!inp.reduce || inp.goal === "pokles";
  const fmt = pickFormat(type, outcome, ev.format, reduce);
  const band = bandFor(type, inp.ftp, inp.p5);
  const sets: IntervalSet[] = [];
  const nSets = fmt.sets ?? 1;
  const label = type === "prah" ? "Prah" : type === "sweetspot" ? "Sweet spot" : type === "vo2short" ? "Serie" : "VO2";
  if (type === "vo2short") {
    for (let i = 0; i < nSets; i++) sets.push({ label: `Serie ${i + 1}`, reps: fmt.reps, work_s: fmt.work_s, rest_s: fmt.rest_s, lo: band[0], hi: band[1] });
  } else if (fmt.reps === 2 && fmt.work_s >= 15 * 60) {
    // dva dlouhé bloky s delší pauzou (končí lapem)
    sets.push({ label: `${label} 1`, reps: 1, work_s: fmt.work_s, rest_s: 0, lo: band[0], hi: band[1] });
    sets.push({ label: `${label} 2`, reps: 1, work_s: fmt.work_s, rest_s: 0, lo: band[0], hi: band[1] });
  } else sets.push({ label, reps: fmt.reps, work_s: fmt.work_s, rest_s: fmt.rest_s, lo: band[0], hi: band[1] });

  const warmupMin = inp.indoor ? 15 : 25;
  const pause = type === "vo2short" ? 180 : 300;
  const coreSec = sets.reduce((t, s) => t + s.reps * (s.work_s + (s.reps > 1 ? s.rest_s : 0)), 0) + (sets.length - 1) * pause;
  let cooldownMin = Math.max(inp.indoor ? 10 : 15, Math.round((inp.targetMin * 60 - warmupMin * 60 - coreSec) / 60 / 5) * 5);
  // celá jednotka na celých 5 min (1:15, ne 1:14): zbytek přidat k dojezdu
  const totalMin = warmupMin + coreSec / 60 + cooldownMin;
  cooldownMin += (5 - (Math.round(totalMin) % 5)) % 5;
  const spec: IntervalSpec = { warmupMin, sets, pauseBetweenS: pause, cooldownMin };
  const workout = intervalWorkout({ ftp: inp.ftp }, spec);

  const wmin = fmt.work_s / 60;
  let base: string;
  if (type === "vo2short") base = `${nSets}×${fmt.reps}×30/15 s VO2 ${band[0]}–${band[1]} W`;
  else if (type === "vo2") base = `${fmt.reps}×${num(wmin)} min VO2 ${band[0]}–${band[1]} W`;
  else base = `${fmt.reps}×${num(wmin)} min ${QUALITY_NAME[type]}`;

  // Krok 5: zdůvodnění s čísly z dat
  const parts: string[] = [];
  const row = (s: number) => ch.curve.rows.find((r) => r.secs === s);
  const sysSecs = type === "prah" || type === "sweetspot" ? 1200 : type === "vo2short" ? 60 : 300;
  const r = row(sysSecs);
  const sysName = sysSecs === 1200 ? "20min" : sysSecs === 300 ? "5min" : "1min";
  if (r?.now && r.prev) parts.push(`${sysName} výkon ${r.pct! < -0.5 ? `klesl o ${num(-r.pct!, 1)} %` : r.pct! > 0.5 ? `vzrostl o ${num(r.pct!, 1)} %` : "drží"} (${Math.round(r.prev)} → ${Math.round(r.now)} W)${ch.curve.short ? ", srovnání krátké" : ""}`);
  else if (r?.now) parts.push(`${sysName} výkon ${Math.round(r.now)} W`);
  const stimDate = type === "prah" || type === "sweetspot" ? ch.stim.prah : type === "vo2short" ? ch.stim.anaer : ch.stim.vo2;
  parts.push(stimDate ? `poslední podnět ${dm(stimDate)}` : "podnět za 21 dní chybí");
  const action = { posun: "posun", zopakovat: "stejná dávka", ubrat: "ubráno ~20 %", nove: "výchozí dávka" }[outcome] + (inp.goal === "udrzeni" && ev.outcome === "posun" ? " (cíl udržet)" : "");
  // z referencí (VO2 optimizer): 4×4 min je výzkumem ověřený protokol (Tier 1), ostatní formáty jsou jeho úprava
  const tier =
    type === "vo2" ? (fmt.reps === 4 && fmt.work_s === 240 ? " Formát 4×4 min = ověřený protokol (Tier 1)." : " Formát je úprava ověřeného 4×4 min (Tier 1, upraveno).") : "";
  const reason = `${QUALITY_NAME[type][0]!.toUpperCase() + QUALITY_NAME[type].slice(1)}: ${parts.join(", ")}; ${ev.text} → ${action}${inp.reduce ? ", 🟡 dávka −30 %" : inp.goal === "pokles" ? ", řízený pokles: dávka −30 %" : ""}${inp.avoid?.length && !inp.forceFocus ? `, jiné zaměření než ${inp.avoid.map((t) => QUALITY_NAME[t]).join("/")} v posledních dnech` : ""}: ${base}.${tier}`;

  return {
    type,
    name: workoutName(base, inp.indoor),
    workout,
    durationMin: Math.round(totalSeconds(workout) / 60),
    band,
    format: fmt,
    reason,
    outcome: ev.outcome,
  };
}
