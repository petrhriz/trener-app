// Doplňkové údaje a upozornění –
// do semaforu zotavení ani do rozhodnutí nevstupují.
import { BIKE_SPORTS, type Sport } from "../datasource/types";
import { dayDm, num } from "../lib/format";
import { addDays } from "../lib/time";

// ACWR (poměr zátěže 7/28 dní) se nepočítá: 7 dní je součástí 28 (provázaný výpočet, Lolli a kol. 2019) a nárůst
// zátěže hlídá ramp rate a Fosterova monotónnost (docs/trener/zdroje.md).

// ---------- Sleep: pravidelnost ----------

const REG_MIN_NIGHTS = 7;
const DAY_MIN = 1440;
const HALF_DAY_MIN = 720;

const clockMin = (x: string | null | undefined): number | null =>
  x && x.length >= 16 ? +x.slice(11, 13) * 60 + +x.slice(14, 16) : null;

function sdOf(mins: number[]): number | null {
  if (mins.length < REG_MIN_NIGHTS) return null;
  const m = mins.reduce((a, b) => a + b, 0) / mins.length;
  return Math.round(Math.sqrt(mins.reduce((a, b) => a + (b - m) ** 2, 0) / (mins.length - 1)));
}

export interface SleepRegularity {
  n: number;
  /** horší z obou SD (usínání, vstávání) v minutách */
  sdMin: number | null;
  sdStart: number | null;
  sdWake: number | null;
  text: string;
}

/**
 * Rozptyl času usínání a vstávání (SD v minutách) za posledních N nocí; hodnocení podle horší z obou.
 * Usínání se posune o 12 h (poledne = 0), aby 23:30 a 0:30 byly 60 min od sebe, ne 23 h.
 */
export function sleepRegularity(nights: { sleep_start?: string | null; wake_time?: string | null }[]): SleepRegularity {
  const starts = nights.map((r) => clockMin(r.sleep_start)).filter((m): m is number => m != null).map((m) => (m + HALF_DAY_MIN) % DAY_MIN);
  const wakes = nights.map((r) => clockMin(r.wake_time)).filter((m): m is number => m != null);
  const sdStart = sdOf(starts);
  const sdWake = sdOf(wakes);
  const n = Math.max(starts.length, wakes.length);
  const sds = [sdStart, sdWake].filter((x): x is number => x != null);
  if (!sds.length) return { n, sdMin: null, sdStart, sdWake, text: "málo dat" };
  const worst = Math.max(...sds);
  const parts = [sdStart != null ? `usínání ±${sdStart} min` : null, sdWake != null ? `vstávání ±${sdWake} min` : null].filter(Boolean).join(", ");
  const label = worst <= 30 ? "pravidelné" : worst <= 60 ? "kolísá" : "nepravidelné";
  return { n, sdMin: worst, sdStart, sdWake, text: `${label} (${parts})` };
}

// ---------- Zone calculator: kontrola LTHR proti skutečnému max. tepu ----------

export function lthrSanity(lthr: number | null, maxSet: number | null, maxSeen: number | null): string | null {
  if (!lthr || !maxSeen) return null;
  const pct = Math.round((lthr / maxSeen) * 100);
  if (pct < 85 || pct > 92) return `LTHR ${lthr} bpm je ${pct} % nejvyššího tepu z dat (${maxSeen} bpm), čekal bych 85–92 %. Jedno z čísel asi nesedí – zvaž test.`;
  if (maxSet && maxSet > maxSeen + 5) return `Max. tep v nastavení (${maxSet}) je vyšší než cokoli v datech (${maxSeen}), nejspíš odhad.`;
  return null;
}

// ---------- Weekly review ----------

export interface WeekAct {
  date: string;
  sport: Sport;
  name: string | null;
  load: number | null;
  moving_s: number | null;
  is_quality: number | boolean;
  np: number | null;
  drift: number | null;
  hr_z: number[] | null;
  pwr_z: number[] | null;
  max20?: number | null;
  mmp?: Record<string, number> | null;
}

export interface WeekPlanItem {
  date: string;
  name: string;
  kind: string;
  status: string;
  target_load: number | null;
  duration_min: number | null;
}

export interface WeeklyReview {
  from: string;
  to: string;
  plannedCount: number;
  doneCount: number;
  plannedMin: number;
  doneMin: number;
  plannedLoad: number;
  doneLoad: number;
  qualityPlanned: number;
  qualityDone: number;
  qualityList: string[];
  missed: string[];
  easyNotEasy: string[];
  wins: string[];
  flags: string[];
  adjustments: string[];
  trend: string | null;
  z2DriftAvg: number | null;
}

/** Z2 jízda „nebyla lehká“: víc než 20 % času v Z3+ výkonu (nebo tepu bez wattmetru). */
export function easyNotEasy(a: WeekAct): boolean {
  if (!BIKE_SPORTS.includes(a.sport) || a.is_quality || !a.moving_s || a.moving_s < 1800) return false;
  const z = a.pwr_z && a.np ? a.pwr_z : a.hr_z;
  if (!z) return false;
  const hi = z.slice(2).reduce((s, x) => s + x, 0);
  return hi / a.moving_s > 0.2;
}

export function weeklyReview(
  from: string,
  plan: WeekPlanItem[],
  acts: WeekAct[],
  prevReviews: { from: string; doneLoad: number; z2DriftAvg: number | null; missed: number }[],
  ctlStart: number | null,
  ctlEnd: number | null,
  prevBest: { p5: number | null; p20: number | null },
): WeeklyReview {
  const to = addDays(from, 6);
  const wActs = acts.filter((a) => a.date >= from && a.date <= to);
  const wPlan = plan.filter((p) => p.date >= from && p.date <= to && p.kind !== "rest");
  const rides = wActs.filter((a) => BIKE_SPORTS.includes(a.sport));
  const rideDates = new Set(rides.map((a) => a.date));
  const missed = wPlan.filter((p) => !rideDates.has(p.date)).map((p) => `${dayDm(p.date)} ${p.name}`);
  const q = wActs.filter((a) => a.is_quality);
  const enes = wActs.filter(easyNotEasy).map((a) => `${dayDm(a.date)} ${a.name ?? "jízda"}`);
  const z2 = rides.filter((a) => !a.is_quality && a.drift != null && (a.moving_s ?? 0) >= 2400);
  const z2DriftAvg = z2.length ? Math.round((z2.reduce((s, a) => s + a.drift!, 0) / z2.length) * 10) / 10 : null;
  const doneLoad = Math.round(wActs.reduce((s, a) => s + (a.load ?? 0), 0));
  const plannedLoad = Math.round(wPlan.reduce((s, p) => s + (p.target_load ?? 0), 0));

  const wins: string[] = [];
  const best = (s: string) => Math.max(0, ...rides.map((a) => (s === "1200" ? Math.max(a.mmp?.["1200"] ?? 0, a.max20 ?? 0) : (a.mmp?.[s] ?? 0))));
  const b5 = best("300");
  const b20 = best("1200");
  if (b5 && prevBest.p5 && b5 > prevBest.p5) wins.push(`Nejlepší 5min výkon za 42 dní: ${b5} W (předtím ${prevBest.p5} W).`);
  if (b20 && prevBest.p20 && b20 > prevBest.p20) wins.push(`Nejlepší 20min výkon za 42 dní: ${b20} W (předtím ${prevBest.p20} W).`);
  if (wPlan.length && !missed.length) wins.push("Všechny plánované jízdy odjeté.");
  if (ctlStart != null && ctlEnd != null && ctlEnd > ctlStart + 0.5) wins.push(`Kondice ${num(ctlStart, 1)} → ${num(ctlEnd, 1)}.`);

  const flags: string[] = [];
  const prevMissed = prevReviews[prevReviews.length - 1]?.missed ?? 0;
  if (missed.length && prevMissed) flags.push("Vynechané jednotky druhý týden po sobě.");
  if (enes.length) flags.push(`Z2 jízdy nebyly lehké (${enes.length}×): víc než 20 % času v Z3 a výš.`);
  if (z2DriftAvg != null && z2DriftAvg > 8) flags.push(`Průměrný drift Z2 jízd ${num(z2DriftAvg, 1)} % (nad 8 %).`);

  const adjustments: string[] = [];
  if (enes.length) adjustments.push("Z2 jezdi opravdu v pásmu 57–72 % FTP, ať je kvalita opravdu kvalitní (80/20).");
  if (missed.length >= 2) adjustments.push("Dvě a víc vynechaných jednotek: plán na další týden zkrátím na 2–3 jízdy, nic nedoháníme.");
  if (!adjustments.length && doneLoad > 0) adjustments.push("Beze změny, pokračuj podle plánu.");

  // trend přes týdny (paměť review)
  let trend: string | null = null;
  const hist = [...prevReviews.slice(-5), { from, doneLoad, z2DriftAvg, missed: missed.length }];
  if (hist.length >= 3) {
    const loads = hist.map((h) => h.doneLoad);
    const dr = hist.map((h) => h.z2DriftAvg).filter((x): x is number => x != null);
    const parts: string[] = [`zátěž posledních ${hist.length} týdnů ${loads.join(" → ")}`];
    if (dr.length >= 3) parts.push(dr[dr.length - 1]! < dr[0]! - 1 ? `drift Z2 klesá (${dr.join(" → ")} %), aerobní základ se zlepšuje` : dr[dr.length - 1]! > dr[0]! + 1 ? `drift Z2 roste (${dr.join(" → ")} %), únava se kumuluje` : `drift Z2 stabilní (${dr.join(" → ")} %)`);
    const missedWeeks = hist.filter((h) => h.missed > 0).length;
    if (missedWeeks >= 3) parts.push(`vynechané jednotky ve ${missedWeeks} z ${hist.length} týdnů`);
    trend = parts.join("; ") + ".";
  }

  return {
    from,
    to,
    plannedCount: wPlan.length,
    doneCount: rideDates.size,
    plannedMin: wPlan.reduce((s, p) => s + (p.duration_min ?? 0), 0),
    doneMin: Math.round(wActs.reduce((s, a) => s + (a.moving_s ?? 0), 0) / 60),
    plannedLoad,
    doneLoad,
    qualityPlanned: wPlan.filter((p) => p.kind === "quality").length,
    qualityDone: q.length,
    qualityList: q.map((a) => `${dayDm(a.date)} ${a.name ?? ""}`.trim()),
    missed,
    easyNotEasy: enes,
    wins,
    flags,
    adjustments: adjustments.slice(0, 2),
    trend,
    z2DriftAvg,
  };
}
