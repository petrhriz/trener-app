// Doplňkové údaje a upozornění –
// do semaforu zotavení ani do rozhodnutí nevstupují.
import { BIKE_SPORTS, type Sport } from "../datasource/types";
import { dayDm, num } from "../lib/format";
import { addDays } from "../lib/time";
import { carbsFor } from "./nutrition";

// ---------- Recovery check: akutní vs. chronická zátěž ----------

/** ACWR = průměrná denní zátěž 7 dní / průměrná denní zátěž 28 dní. ~1,0 stabilní, nad 1,3 pozor, nad 1,5 riziko. */
export function acwr(loads: Map<string, number>, lastDay: string): { acute: number; chronic: number; ratio: number | null; level: "ok" | "warn" | "high" | "low" } {
  let a = 0;
  let c = 0;
  for (let i = 0; i < 28; i++) {
    const v = loads.get(addDays(lastDay, -i)) ?? 0;
    c += v;
    if (i < 7) a += v;
  }
  const acute = a / 7;
  const chronic = c / 28;
  const ratio = chronic > 5 ? Math.round((acute / chronic) * 100) / 100 : null;
  const level = ratio == null ? "ok" : ratio > 1.5 ? "high" : ratio > 1.3 ? "warn" : ratio < 0.6 ? "low" : "ok";
  return { acute: Math.round(acute * 10) / 10, chronic: Math.round(chronic * 10) / 10, ratio, level };
}

// ---------- Fuel & pace: tekutiny a sodík (odhad) ----------

export interface FuelPlan {
  durationMin: number;
  carbsPerHour: number;
  carbsTotal: number;
  carbsPack: string;
  fluidPerHour: number; // l/h (odhad)
  fluidTotal: number;
  sodiumPerHour: number; // mg/h (odhad)
  estimates: string[];
  lines: string[];
}

/**
 * Pot 0,4–1,4 l/h podle teploty, intenzity a hmotnosti; sodík 400–1100 mg na litr potu (střed 700).
 * Pije se ~70 % ztrát (nepřepíjet – hyponatrémie). Vše označeno jako odhad, dokud neuděláš test pocení.
 */
export function fuelPlan(durationMin: number, tempC: number | null, weightKg: number | null, sharp: "quality" | "z2" | "easy" = "z2"): FuelPlan {
  const c = carbsFor(durationMin, sharp, tempC != null && tempC < 5);
  const t = tempC ?? 15;
  const w = weightKg ?? 75;
  let sweat = 0.6 + Math.max(0, t - 15) * 0.03 + (w - 70) * 0.008 + (sharp === "quality" ? 0.15 : 0);
  sweat = Math.max(0.4, Math.min(1.4, sweat));
  const fluid = Math.round(sweat * 0.7 * 20) / 20;
  const sodium = Math.round((sweat * 700) / 50) * 50;
  const h = durationMin / 60;
  const lines = [
    `Sacharidy: ${c.text}`,
    `Tekutiny: ${num(fluid, 2)} l/h (${num(fluid * h, 1)} l celkem, odhad)`,
    durationMin >= 120 || t >= 25 ? `Sodík: ${sodium} mg/h (odhad)` : "Sodík: u jízdy do 2 h a v chladu není potřeba",
  ];
  return {
    durationMin,
    carbsPerHour: c.perHour,
    carbsTotal: c.total,
    carbsPack: c.pack,
    fluidPerHour: fluid,
    fluidTotal: Math.round(fluid * h * 10) / 10,
    sodiumPerHour: sodium,
    estimates: [
      `pocení ${num(sweat, 2)} l/h (odhad z teploty ${num(t)} °C a hmotnosti ${num(w)} kg)`,
      "sodík v potu 700 mg/l (odhad, rozpětí 400–1100)",
    ],
    lines,
  };
}

export const SWEAT_TEST_HINT =
  "Test pocení: zvaž se před a po hodinové jízdě v podobných podmínkách; 1 kg úbytku ≈ 1 l potu, plus co jsi vypil.";

// ---------- Sleep: pravidelnost ----------

/** Rozptyl času vstávání (SD v minutách) za posledních N nocí. Pravidelnost je důležitější než délka. */
export function sleepRegularity(wakeTimes: (string | null)[]): { n: number; sdMin: number | null; text: string } {
  const mins = wakeTimes
    .filter((x): x is string => !!x && x.length >= 16)
    .map((x) => +x.slice(11, 13) * 60 + +x.slice(14, 16));
  if (mins.length < 7) return { n: mins.length, sdMin: null, text: "málo dat" };
  const m = mins.reduce((a, b) => a + b, 0) / mins.length;
  const sd = Math.sqrt(mins.reduce((a, b) => a + (b - m) ** 2, 0) / (mins.length - 1));
  const r = Math.round(sd);
  return { n: mins.length, sdMin: r, text: r <= 30 ? `pravidelné (±${r} min)` : r <= 60 ? `kolísá (±${r} min)` : `nepravidelné (±${r} min)` };
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
