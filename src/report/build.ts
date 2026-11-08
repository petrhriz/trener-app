// Skládání reportů z kontextu. Vše deterministické – LLM sem nevstupuje.
import { BIKE_SPORTS } from "../datasource/types";
import { type ActivityAnalysis, type PlannedForAct, analyzeActivity } from "../core/activity";
import { qualityFromName } from "../core/quality";
import { ftpCheck } from "../core/ftpCheck";
import { workoutFromIcu } from "../core/workout";
import { acwr, lthrSanity, sleepRegularity, weeklyReview, type WeeklyReview } from "../core/extras";
import { FORM_ZONE_RANGE, formZone, rampLabel, weeklyLoadTarget } from "../core/fitness";
import { type ActDay, type Change, type PlanDay, type PlanResult, generatePlan } from "../core/plan";
import { bestIn, eftp } from "../core/power";
import type { PastQuality } from "../core/qualityDesign";
import type { QualityType } from "../core/quality";
import { type RecoveryResult, decisionFor, evaluateRecovery } from "../core/recovery";
import { type DayWeather, dayWeather } from "../core/weather";
import type { Workout } from "../core/workout";
import { all } from "../lib/db";
import { dayDm, dm, hmm, num, signed } from "../lib/format";
import { addDays, dateRange, mondayOf } from "../lib/time";
import type { Ctx, FullAct, MetricRow } from "./context";

const isBike = (s: string) => BIKE_SPORTS.includes(s as any);

export function metricOn(ctx: Ctx, date: string): MetricRow | null {
  return ctx.metrics.find((m) => m.date === date) ?? null;
}

export function todayActs(ctx: Ctx): FullAct[] {
  return ctx.acts.filter((a) => a.date === ctx.T);
}

export function lastActivityDay(ctx: Ctx): string | null {
  return ctx.acts.length ? ctx.acts[ctx.acts.length - 1]!.date : null;
}

// ---------- 😴 zotavení ----------

export function dayAfterReason(ctx: Ctx): string | null {
  const y = ctx.acts.filter((a) => a.date === addDays(ctx.T, -1));
  if (y.some((a) => a.sport === "hockey")) return "hokeji";
  if (y.some((a) => a.sport === "xc_ski" && ((a.moving_s ?? 0) > 7200 || (a.load ?? 0) > 120))) return "dlouhých běžkách";
  const big = y.find((a) => (a.load ?? 0) > 120);
  return big ? `jízdě se zátěží ${Math.round(big.load!)}` : null;
}

export function recoveryFor(ctx: Ctx): RecoveryResult {
  const illness = ctx.constraints.some((c) => c.kind === "nemoc" && (c.date === ctx.T || c.date === addDays(ctx.T, -1)));
  const r = evaluateRecovery({
    date: ctx.T,
    rows: ctx.well.map((w) => ({ date: w.date, hrv: w.hrv, rhr: w.rhr, sleep_s: w.sleep_s, sleep_score: w.sleep_score, sleep_q: w.sleep_q })),
    dayAfter: dayAfterReason(ctx),
    illness,
  });
  return r;
}

// ---------- 📊 kondice ----------

export interface FitnessTable {
  col1: string;
  col2: string;
  rows: { label: string; v1: string; v2: string; diff: string; sub: string; iv: boolean }[];
  note: string;
  ctl: number | null;
  atl: number | null;
  form: number | null;
  ramp: number | null;
  load7: number;
  loadPrev7: number;
  maintenance: string | null;
  acwr: ReturnType<typeof acwr>;
}

function vo2Last(ctx: Ctx, upTo: string): number | null {
  const r = [...ctx.well].reverse().find((w) => w.date <= upTo && w.vo2max != null);
  return r?.vo2max ?? null;
}

/** eFTP: odhad intervals.icu (icu_rolling_ftp z poslední jízdy), záložně 95 % nejlepších 20 min za 42 dní. */
export function eftpOf(ctx: Ctx): { w: number; date: string; source: "icu" | "calc" } | null {
  const a = [...ctx.acts].reverse().find((x) => isBike(x.sport) && x.icu_eftp);
  if (a) return { w: Math.round(a.icu_eftp!), date: a.date, source: "icu" };
  const e = eftp(ctx.acts.filter((x) => isBike(x.sport)).map((x) => ({ id: x.id, date: x.date, mmp: x.mmp, max20: x.max20, pwr_z: x.pwr_z })), ctx.T);
  return e ? { ...e, source: "calc" } : null;
}

/** Kontrola FTP: doporučit test, když eFTP / 20 min neodpovídá nebo je FTP dlouho neověřené. */
export function ftpCheckOf(ctx: Ctx, ftpSetAt: string | null) {
  const power = ctx.acts.filter((a) => isBike(a.sport)).map((a) => ({ id: a.id, date: a.date, mmp: a.mmp, max20: a.max20, pwr_z: a.pwr_z }));
  const m = +ctx.T.slice(5, 7);
  return ftpCheck({ today: ctx.T, ftp: ctx.s.ftp, eftp: eftpOf(ctx), best20: bestIn(power, addDays(ctx.T, -42), ctx.T, 1200), ftpSetAt, inSeason: m >= 3 && m <= 9 });
}

export function fitnessTable(ctx: Ctx): FitnessTable {
  const T = ctx.T;
  const done = todayActs(ctx).length > 0;
  // stejně jako intervals.icu: hodnoty dne (CTL, ATL, forma = CTL − ATL)
  const r2 = metricOn(ctx, T) ?? metricOn(ctx, addDays(T, -1));
  const r1 = metricOn(ctx, addDays(T, -7));
  const col1 = dm(addDays(T, -7));
  const col2 = `${dm(T)} dnes`;
  const f = (m: MetricRow | null) => (m ? m.form : null);
  const loadIn = (from: string, to: string) => ctx.acts.filter((a) => a.date >= from && a.date <= to);
  const endDay = done ? T : addDays(T, -1);
  const l7 = loadIn(addDays(endDay, -6), endDay);
  const lp7 = loadIn(addDays(endDay, -13), addDays(endDay, -7));
  const load7 = Math.round(l7.reduce((s, a) => s + (a.load ?? 0), 0));
  const loadPrev7 = Math.round(lp7.reduce((s, a) => s + (a.load ?? 0), 0));
  const form2 = f(r2);
  const zone = form2 != null ? formZone(form2) : null;
  const ramp = r2?.ramp ?? null;

  // VO2max: poslední známá hodnota, trend 14 vs 14 dní
  const v1 = vo2Last(ctx, addDays(T, -8));
  const v2 = vo2Last(ctx, addDays(T, -1));
  const vals = (from: string, to: string) => ctx.well.filter((w) => w.date >= from && w.date <= to && w.vo2max != null).map((w) => w.vo2max!);
  const a14 = vals(addDays(T, -14), addDays(T, -1));
  const p14 = vals(addDays(T, -28), addDays(T, -15));
  const v30 = vals(addDays(T, -30), addDays(T, -1));
  const avgf = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);
  const A = avgf(a14);
  const P = avgf(p14);
  const trend = A != null && P != null ? (A - P <= -1 ? "klesá" : A - P >= 1 ? "roste" : "stabilní") : "–";
  const ef = eftpOf(ctx);
  const ftp = ctx.s.ftp;

  const loads = new Map<string, number>();
  for (const a of ctx.acts) loads.set(a.date, (loads.get(a.date) ?? 0) + (a.load ?? 0));
  const ac = acwr(loads, endDay);

  const target = r2 ? weeklyLoadTarget(r2.ctl, ctx.s.goal) : null;
  const maintenance = target && (load7 < target.lo || load7 > target.hi) ? `Zátěž za 7 dní ${load7} je ${load7 < target.lo ? "pod" : "nad"} pásmem pro cíl (${target.lo}–${target.hi}).` : null;

  const rows = [
    { label: "Kondice (CTL)", v1: num(r1?.ctl, 1), v2: num(r2?.ctl, 1), diff: r1 && r2 ? signed(r2.ctl - r1.ctl, 1) : "–", sub: `ramp rate ${signed(ramp, 1)} za 7 dní · ${rampLabel(ramp)}`, iv: (ramp ?? 0) > 5 },
    { label: "Únava (ATL)", v1: num(r1?.atl, 1), v2: num(r2?.atl, 1), diff: r1 && r2 ? signed(r2.atl - r1.atl, 1) : "–", sub: `zátěž za 7 dní ${load7} (${l7.length} aktivit) · předchozích 7 dní ${loadPrev7}${ac.ratio != null ? ` · poměr 7/28 dní ${num(ac.ratio, 2)}` : ""}`, iv: false },
    { label: "Forma (TSB)", v1: num(f(r1), 1), v2: num(form2, 1), diff: r1 && r2 ? signed(form2! - f(r1)!, 1) : "–", sub: zone ? `${zone} (${FORM_ZONE_RANGE[zone]})` : "–", iv: (form2 ?? 0) < -25 },
    { label: "VO2max (Garmin)", v1: num(v1), v2: num(v2), diff: v1 != null && v2 != null ? signed(v2 - v1) : "–", sub: `${trend} · rozpětí 30 d ${v30.length ? `${Math.min(...v30)}–${Math.max(...v30)}` : "–"} · průměr 14 d ${num(A, 1)} (předtím ${num(P, 1)})${ef ? ` · eFTP ${ef.w} W` : ""}${ftp ? `, FTP ${ftp} W` : ""}`, iv: false },
  ];
  const notes: string[] = [];
  notes.push(`Kondice, únava a forma z intervals.icu (forma = kondice − únava dne)${done ? ", včetně dnešní aktivity" : ""}.`);
  if (A != null && P != null && A - P <= -2) notes.push("VO2max průměr klesl o 2 a víc.");
  if (ef && ftp) notes.push(`FTP ${ftp} W je z testu (nastavené v intervals.icu). eFTP ${ef.w} W je odhad intervals.icu z jízd bez testu${Math.abs(ef.w - ftp) / ftp > 0.03 ? ` – liší se o ${Math.round(Math.abs(ef.w - ftp))} W, ${zone === "Čerstvý" ? "zvaž nový test" : "test až při formě Čerstvý"}` : ", sedí s FTP"}.`);
  return { col1, col2, rows, note: notes.join(" "), ctl: r2?.ctl ?? null, atl: r2?.atl ?? null, form: form2, ramp, load7, loadPrev7, maintenance, acwr: ac };
}

// ---------- 🗓️ plán ----------

function workoutOf(json: string | null): Workout | null {
  try {
    return json ? (JSON.parse(json) as Workout) : null;
  } catch {
    return null;
  }
}

export function pastQuality(ctx: Ctx, t: QualityType): PastQuality | null {
  const a = [...ctx.acts].reverse().find((x) => x.is_quality && x.quality_type === t && isBike(x.sport) && x.date < ctx.T);
  if (!a) return null;
  const pw = ctx.calendar.find((c) => c.date === a.date && c.kind === "quality");
  const w = workoutOf(pw?.steps_json ?? null);
  const workBlocks = w?.blocks.filter((b) => b.kind === "work") ?? [];
  const s0 = workBlocks[0]?.steps[0];
  const plan = s0?.lo != null && s0.hi != null
    ? { reps: workBlocks[0]!.reps ?? 1, work_s: s0.dur_s, lo: s0.lo, hi: s0.hi, sets: workBlocks.length > 1 ? workBlocks.length : undefined }
    : null;
  if (plan && workBlocks.length > 1 && (workBlocks[0]!.reps ?? 1) === 1) {
    plan.reps = workBlocks.length;
    plan.sets = undefined;
  }
  return { date: a.date, type: t, plan, laps: a.laps };
}

export function weatherMap(ctx: Ctx, from: string, days: number): Map<string, DayWeather | null> {
  const m = new Map<string, DayWeather | null>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    m.set(d, ctx.weatherOk ? dayWeather(ctx.hours, d, ctx.s.ride_temps ?? undefined) : null);
  }
  return m;
}

export async function weekLoads(ctx: Ctx): Promise<number[]> {
  const mon = mondayOf(ctx.T);
  const out: number[] = [];
  for (let w = 4; w >= 1; w--) {
    const from = addDays(mon, -7 * w);
    const to = addDays(from, 6);
    out.push(Math.round(ctx.acts.filter((a) => a.date >= from && a.date <= to).reduce((s, a) => s + (a.load ?? 0), 0)));
  }
  return out;
}

export async function planFor(ctx: Ctx, rec?: RecoveryResult): Promise<PlanResult> {
  const T = ctx.T;
  const recovery = rec ?? recoveryFor(ctx);
  const ftp = ctx.s.ftp ?? 250;
  const acts: ActDay[] = ctx.acts
    .filter((a) => a.date >= addDays(T, -42))
    .map((a) => ({
      date: a.date,
      sport: a.sport,
      load: a.load,
      moving_s: a.moving_s,
      is_quality: a.is_quality,
      counts: !!a.is_quality && a.sport !== "skate" && a.sport !== "padel",
      quality_type: a.quality_type,
      name: a.name,
    }));
  const power = ctx.acts.filter((a) => isBike(a.sport)).map((a) => ({ id: a.id, date: a.date, mmp: a.mmp, max20: a.max20, pwr_z: a.pwr_z }));
  const y = metricOn(ctx, addDays(T, -1));
  const t = metricOn(ctx, T);
  return generatePlan({
    today: T,
    ftp,
    hr: ctx.s.hr_zones,
    goal: ctx.s.goal,
    ridesPerWeek: ctx.s.rides_per_week,
    startYesterday: y ? { ctl: y.ctl, atl: y.atl } : { ctl: 0, atl: 0 },
    startToday: t ? { ctl: t.ctl, atl: t.atl } : null,
    acts,
    actsPower: power,
    past: (q) => pastQuality(ctx, q),
    calendar: ctx.calendar,
    constraints: [...ctx.constraints, ...statusConstraints(ctx)],
    runExperienced: ctx.acts.filter((a) => a.sport === "run" && a.date >= addDays(T, -60) && (a.moving_s ?? 0) >= 15 * 60).length >= 6,
    weather: weatherMap(ctx, T, 9),
    weatherOk: ctx.weatherOk,
    recovery: recovery.state,
    p5: bestIn(power, addDays(T, -42), T, 300)?.w ?? null,
    weekLoads: await weekLoads(ctx),
  });
}

/**
 * Stav Nemocný / Zraněný / Dovolená → virtuální omezení na dny stavu (plán se zastaví, nic se nedohání).
 * Nemoc = „nemoc“ (po návratu 2 dny lehce), zranění = „nemuzu“, dovolená = „dovolena“. Bez konce = 14 dní dopředu.
 */
export function statusConstraints(ctx: Ctx): { date: string; kind: "nemoc" | "nemuzu" | "dovolena"; note: string | null }[] {
  const st = ctx.s.status;
  if (!st || st.kind === "active") return [];
  const kind = st.kind === "sick" ? "nemoc" : st.kind === "injured" ? "nemuzu" : "dovolena";
  const from = st.from && st.from > addDays(ctx.T, -3) ? st.from : addDays(ctx.T, -3);
  const to = st.until ?? addDays(ctx.T, 14);
  if (to < from) return [];
  return dateRange(from, to).map((date) => ({ date, kind, note: "stav" }));
}

// ---------- 🚦 připravenost ----------

export interface Readiness {
  date: string;
  time: string;
  recovery: RecoveryResult;
  fitness: FitnessTable;
  today: {
    title: string;
    decision: string;
    decisionWhy: string;
    day: PlanDay | null;
    done: { name: string; load: number | null; id: string }[];
    calendarName: string | null;
  };
  tomorrow: string;
  changes: Change[];
  warnings: string[];
  extras: { bb: number | null; stress: number | null; sleepReg: string; steps: number | null; lthrNote: string | null };
  lastActivity: { date: string; name: string | null } | null;
  missingData: string[];
  plan: PlanResult;
}

export async function readiness(ctx: Ctx): Promise<Readiness> {
  const T = ctx.T;
  const rec = recoveryFor(ctx);
  const fit = fitnessTable(ctx);
  const plan = await planFor(ctx, rec);
  const day = plan.days.find((d) => d.isToday) ?? null;
  const done = todayActs(ctx).map((a) => ({ name: a.name ?? "aktivita", load: a.load, id: a.id }));
  const cal = ctx.calendar.find((c) => c.date === T && c.status !== "skipped") ?? null;
  const kind = (cal?.kind ?? null) as any;
  const dec = decisionFor(rec.state, kind);
  let decision: string;
  let why: string;
  if (done.length) {
    decision = "Odjeto";
    why = `${done.map((d) => `${d.name} (zátěž ${num(d.load)})`).join(", ")}.`;
  } else if (!cal || cal.kind === "rest") {
    decision = "Volno";
    why = "Volno podle plánu.";
    if (rec.state === "green" && fit.load7 < (weeklyLoadTarget(fit.ctl ?? 0, ctx.s.goal).lo)) why += " Zátěž je pod pásmem, můžeš dát lehkou Z2 do 1:30, nic víc.";
  } else if (rec.state === "red") {
    decision = "Volno";
    why = `${rec.emoji} ${rec.stateLabel.toLowerCase()}: volno, nebo Z1 do 45 min / procházka.`;
  } else if (day?.indoor && !cal.indoor) {
    decision = "Trenažér";
    why = day.note || "Špatné počasí.";
  } else if (rec.state === "yellow") {
    decision = dec.label;
    why = kind === "quality" ? "🟡 částečně odpočatý: kvalitu změň na Z2." : "🟡 částečně odpočatý: zkrať o třetinu.";
  } else {
    decision = "Jet beze změny";
    why = "Zotavení v normě.";
  }
  const tomorrowDay = plan.days.find((d) => d.date === addDays(T, 1));
  const tomorrow = tomorrowDay
    ? tomorrowDay.name
      ? `${dayDm(tomorrowDay.date)}: ${tomorrowDay.name} · ${hmm((tomorrowDay.durationMin ?? 0) * 60)}${tomorrowDay.weather ? `, ${tomorrowDay.weather.text}` : ""}.`
      : `${dayDm(tomorrowDay.date)}: ${tomorrowDay.tag}.`
    : "–";
  const changes = plan.changes.filter((c) => c.date <= addDays(T, 1));
  const warnings = [...alertsFrom(ctx, rec, fit)];
  const tw = ctx.well.find((w) => w.date === T);
  const reg = sleepRegularity(ctx.well.filter((w) => w.date >= addDays(T, -14)).map((w) => w.wake_time));
  const maxSeen = Math.max(0, ...ctx.acts.filter((a) => isBike(a.sport)).map((a) => a.max_hr ?? 0)) || null;
  const lthrNote = lthrSanity(ctx.s.hr_zones?.lthr ?? null, ctx.s.hr_zones?.max ?? null, maxSeen);
  const missing: string[] = [];
  if (rec.hrv.status === "missing") missing.push("dnešní VST");
  if (rec.sleep.status === "missing") missing.push("dnešní spánek");
  if (rec.rhr.status === "missing") missing.push("dnešní klidový tep");
  const last = ctx.acts[ctx.acts.length - 1];
  return {
    date: T,
    time: `${String(ctx.now.hh).padStart(2, "0")}:${String(ctx.now.mm).padStart(2, "0")}`,
    recovery: rec,
    fitness: fit,
    today: { title: done.length ? done[0]!.name : day?.name ?? cal?.name ?? "Volno", decision, decisionWhy: why, day, done, calendarName: cal?.name ?? null },
    tomorrow,
    changes,
    warnings,
    extras: { bb: tw?.bb_max ?? null, stress: tw?.stress_avg ?? null, sleepReg: reg.text, steps: tw?.steps ?? null, lthrNote },
    lastActivity: last ? { date: last.date, name: last.name } : null,
    missingData: missing,
    plan,
  };
}

/** Upozornění (jen když je co hlásit – signál, ne šum). */
export function alertsFrom(ctx: Ctx, rec: RecoveryResult, fit: FitnessTable): string[] {
  const w: string[] = [];
  if (rec.state === "red") w.push(`${rec.emoji} ${rec.stateLabel}: ${[...rec.flags.counted, ...rec.reasons].join(", ")}.`);
  if (rec.rhr.streak3) w.push("Klidový tep zvýšený 3 dny po sobě. Když se k tomu přidají příznaky nemoci, žádná zátěž a případně lékař.");
  if (rec.illness) w.push("Nemoc: nic nedohánět, po návratu postupně. Při bolesti na hrudi nebo závrati k lékaři.");
  if (fit.form != null && fit.form < -25) w.push(`Forma ${num(fit.form, 1)} je pod −25.`);
  if (fit.ramp != null && fit.ramp > 5) w.push(`Ramp rate ${signed(fit.ramp, 1)} za 7 dní je nad +5.`);
  if (fit.acwr.level === "high") w.push(`Poměr zátěže 7/28 dní ${num(fit.acwr.ratio, 2)} je nad 1,5 – riziko přetížení.`);
  else if (fit.acwr.level === "warn") w.push(`Poměr zátěže 7/28 dní ${num(fit.acwr.ratio, 2)} je nad 1,3.`);
  if (ctx.lastSyncOk && Date.now() - Date.parse(ctx.lastSyncOk) > 6 * 3600_000) w.push("Synchronizace s Garminem neproběhla přes 6 h.");
  return w;
}

// ---------- 🚴 aktivita ----------

/** Sedí sport aktivity na sport plánované jednotky? */
export function sportMatches(planSport: string | null | undefined, actSport: string): boolean {
  const p = planSport ?? "ride";
  if (p === "ride") return isBike(actSport);
  if (p === "walk") return actSport === "walk" || actSport === "hike";
  return p === actSport;
}

export function plannedFor(ctx: Ctx, a: FullAct): PlannedForAct | null {
  // 1) spárovaný workout v intervals.icu (i ten, který jsi zadal mimo aplikaci)
  const ev = a.icu_event;
  const own = ctx.calendar.find((c) => c.date === a.date && c.kind !== "rest" && c.status !== "skipped" && sportMatches(c.sport, a.sport));
  if (ev && (!own || !own.icu_event_id || String(own.icu_event_id) !== String(ev.id))) {
    const w = workoutFromIcu(ev.steps, ctx.s.ftp);
    const hasWork = !!w?.blocks.some((b) => b.kind === "work");
    const qt = qualityFromName(ev.name ?? "");
    return {
      name: ev.name ?? "Workout z intervals.icu",
      kind: hasWork || qt ? "quality" : "z2",
      quality_type: qt,
      target_load: ev.load,
      workout: w,
      source: "icu",
      compliance: a.icu_compliance != null && a.icu_compliance > 0 ? Math.round(a.icu_compliance) : null,
    };
  }
  if (own)
    return {
      name: own.name,
      kind: own.kind,
      quality_type: own.quality_type,
      target_load: own.target_load,
      workout: workoutOf(own.steps_json),
      source: "app",
      compliance: a.icu_compliance != null && a.icu_compliance > 0 ? Math.round(a.icu_compliance) : null,
    };
  return null;
}

export function activityReport(ctx: Ctx, a: FullAct): ActivityAnalysis {
  return analyzeActivity(a, plannedFor(ctx, a), ctx.s.ftp, ctx.s.hr_zones);
}

export function findActivity(ctx: Ctx, query?: string): FullAct[] {
  if (!query) {
    const d = lastActivityDay(ctx);
    return d ? ctx.acts.filter((a) => a.date === d).reverse() : [];
  }
  const q = query.trim().toLowerCase();
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.?$/.exec(q);
  if (m) {
    const date = `${ctx.T.slice(0, 4)}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    const d = date > ctx.T ? `${+ctx.T.slice(0, 4) - 1}${date.slice(4)}` : date;
    return ctx.acts.filter((a) => a.date === d).reverse();
  }
  if (q === "včera" || q === "vcera") return ctx.acts.filter((a) => a.date === addDays(ctx.T, -1)).reverse();
  if (q === "dnes") return ctx.acts.filter((a) => a.date === ctx.T).reverse();
  const map: Record<string, string[]> = { běžky: ["xc_ski"], bezky: ["xc_ski"], hokej: ["hockey"], trenažér: ["indoor"], trenazer: ["indoor"], mtb: ["mtb"], kolo: ["ride", "mtb", "indoor"], běh: ["run"], beh: ["run"], procházka: ["walk", "hike"] };
  const sports = map[q];
  const hit = [...ctx.acts].reverse().find((a) => (sports ? sports.includes(a.sport) : (a.name ?? "").toLowerCase().includes(q) || (q === "vo2" && a.quality_type === "vo2")));
  return hit ? [hit] : [];
}

// ---------- 📅 týden ----------

export async function weekly(ctx: Ctx, weekFrom: string): Promise<WeeklyReview> {
  const prev = await all<{ week_from: string; data: string }>(ctx.env.DB, "SELECT week_from, data FROM weekly_reviews WHERE week_from < ? ORDER BY week_from DESC LIMIT 6", weekFrom);
  const prevReviews = prev
    .reverse()
    .map((p) => JSON.parse(p.data) as WeeklyReview)
    .map((r) => ({ from: r.from, doneLoad: r.doneLoad, z2DriftAvg: r.z2DriftAvg, missed: r.missed.length }));
  const plan = ctx.calendar.map((c) => ({ date: c.date, name: c.name, kind: c.kind, status: c.status, target_load: c.target_load, duration_min: c.duration_min }));
  const bikes = ctx.acts.filter((a) => isBike(a.sport)).map((a) => ({ id: a.id, date: a.date, mmp: a.mmp, max20: a.max20, pwr_z: a.pwr_z }));
  const p5 = bestIn(bikes, addDays(weekFrom, -42), addDays(weekFrom, -1), 300)?.w ?? null;
  const p20 = bestIn(bikes, addDays(weekFrom, -42), addDays(weekFrom, -1), 1200)?.w ?? null;
  return weeklyReview(
    weekFrom,
    plan,
    ctx.acts,
    prevReviews,
    metricOn(ctx, addDays(weekFrom, -1))?.ctl ?? null,
    metricOn(ctx, addDays(weekFrom, 6))?.ctl ?? null,
    { p5, p20 },
  );
}

export { dateRange };
