// Skládání reportů z kontextu. Vše deterministické – LLM sem nevstupuje.
import { BIKE_SPORTS } from "../datasource/types";
import { type ActivityAnalysis, type PlannedForAct, analyzeActivity } from "../core/activity";
import { hrQuality, qualityFromName } from "../core/quality";
import { hardEasyDays } from "../core/rpe";
import { ftpCheck } from "../core/ftpCheck";
import { workoutFromIcu } from "../core/workout";
import { acwr, fuelPlan, lthrSanity, sleepRegularity, weeklyReview, type WeeklyReview } from "../core/extras";
import { FORM_ZONE_RANGE, formZone, rampLabel, weeklyLoadTarget } from "../core/fitness";
import type { Change, PlanDay, PlanResult } from "../core/plan";
import { bestIn, eftp } from "../core/power";
import { type RecoveryResult, evaluateRecovery } from "../core/recovery";
import { recoveryScore } from "../core/readinessScore";
import { type DayWeather, dayWeather } from "../core/weather";
import type { Workout } from "../core/workout";
import { all, first, getState, logged, run, setState } from "../lib/db";
import { type KeyRecord, evaluateKeys, recordKeys } from "../core/coach/keys";
import { dayDm, dm, hmm, num, signed } from "../lib/format";
import { addDays, dateRange, mondayOf } from "../lib/time";
import type { Ctx, FullAct, MetricRow } from "./context";
import { type Fatigue, fatigueFactor } from "../core/coach/target";
import { type Adherence, type AdherenceDay, weekAdherence } from "../core/coach/adherence";
import { reentryOf } from "../core/coach/reentry";
import { type Drivers, KEEP_VERSIONS, diffDays, reasonOf, versionDays } from "../core/coach/versions";
import { fosterOf } from "../core/foster";
import type { EngineAct, ProgressRow } from "../core/coach/common";
import { type CoachPlan, type MondayPlan, runCoach } from "../core/coach/engine";
import { profileFromHistory, validateProfile } from "../core/coach/profile";
import { norm } from "../core/recovery";
import { setSetting } from "../lib/settings";
import { zonesFor } from "../lib/zoneHistory";

const isBike = (s: string) => BIKE_SPORTS.includes(s as any);

export function metricOn(ctx: Ctx, date: string): MetricRow | null {
  return ctx.metrics.find((m) => m.date === date) ?? null;
}

export function todayActs(ctx: Ctx): FullAct[] {
  return ctx.acts.filter((a) => a.date === ctx.T);
}

// ---------- 😴 zotavení ----------

export function dayAfterReason(ctx: Ctx): string | null {
  const y = ctx.acts.filter((a) => a.date === addDays(ctx.T, -1));
  if (y.some((a) => a.sport === "xc_ski" && ((a.moving_s ?? 0) > 7200 || (a.load ?? 0) > 120))) return "dlouhých běžkách";
  const big = y.find((a) => (a.load ?? 0) > 120);
  return big ? `jízdě se zátěží ${Math.round(big.load!)}` : null;
}

export function recoveryFor(ctx: Ctx): RecoveryResult {
  const illness = ctx.constraints.some((c) => c.kind === "nemoc" && (c.date === ctx.T || c.date === addDays(ctx.T, -1)));
  // Zotavení v % (VST + tep ve spánku proti 60 nocím + délka spánku proti potřebě)
  const nights = ctx.well.map((w) => ({ date: w.date, hrv: w.hrv, rhr: w.rhr, sleep_hr: w.sleep_hr, sleep_s: w.sleep_s, sleep_need_min: w.sleep_need_min, sleep_score: w.sleep_score, sleep_resp: w.sleep_resp }));
  const rs = recoveryScore(nights.find((n) => n.date === ctx.T) ?? null, nights);
  const txt = (c: { label: string; value: string }) => `${c.label} ${c.value}`;
  const r = evaluateRecovery({
    score: { score: rs.score, drags: rs.drags.map(txt), boosts: rs.boosts.map(txt) },
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

export function weatherMap(ctx: Ctx, from: string, days: number): Map<string, DayWeather | null> {
  const m = new Map<string, DayWeather | null>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    m.set(d, ctx.weatherOk ? dayWeather(ctx.hours, d, ctx.s.ride_temps ?? undefined, ctx.sun?.get(d)) : null);
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

/** Stav zotavení v daný den (bez „den po zátěži“) – pro počet horších rán za posledních 5 dní. */
function recoveryStateOn(ctx: Ctx, date: string): "green" | "yellow" | "red" | null {
  const w = ctx.well.find((x) => x.date === date);
  if (!w || (w.hrv == null && w.sleep_s == null && w.rhr == null)) return null;
  const nights = ctx.well.filter((x) => x.date <= date).map((x) => ({ date: x.date, hrv: x.hrv, rhr: x.rhr, sleep_hr: x.sleep_hr, sleep_s: x.sleep_s, sleep_need_min: x.sleep_need_min, sleep_score: x.sleep_score, sleep_resp: x.sleep_resp }));
  const rs = recoveryScore(nights.find((n) => n.date === date) ?? null, nights);
  return evaluateRecovery({ score: { score: rs.score, drags: [], boosts: [] }, date, rows: ctx.well.filter((x) => x.date <= date).map((x) => ({ date: x.date, hrv: x.hrv, rhr: x.rhr, sleep_s: x.sleep_s, sleep_score: x.sleep_score, sleep_q: x.sleep_q })), dayAfter: null, illness: false }).state;
}

/** Únava pro rozpočet týdne: forma, horší rána za 5 dní, týdenní VST pod normou, dny nemoci. */
export function fatigueOf(ctx: Ctx, rec: RecoveryResult, cons: { date: string; kind: string }[]): Fatigue {
  const T = ctx.T;
  const y = metricOn(ctx, addDays(T, -1));
  let bad = rec.state !== "green" ? 1 : 0;
  for (let i = 1; i <= 4; i++) { const st = recoveryStateOn(ctx, addDays(T, -i)); if (st && st !== "green") bad++; }
  const hist = norm(ctx.well.filter((w) => w.date >= addDays(T, -60) && w.date < addDays(T, -7)).map((w) => w.hrv));
  const last7 = norm(ctx.well.filter((w) => w.date >= addDays(T, -6) && w.date <= T).map((w) => w.hrv));
  // stejná hranice jako normální rozsah na stránce (průměr − 1 SD) – „trochu pod průměrem“ ještě není únava
  const hrvLow = hist.n >= 21 && last7.n >= 4 && last7.mean < hist.mean - hist.sd;
  const illnessDays = new Set(cons.filter((c) => c.kind === "nemoc" && c.date > addDays(T, -10) && c.date <= T).map((c) => c.date)).size;
  const hardEasy = hardEasyDays(ctx.acts.map((a) => ({ date: a.date, rpe: (a as any).rpe ?? null, quality: !!a.is_quality, moving_s: a.moving_s })), T);
  return { form: y ? y.ctl - y.atl : null, badMornings: bad, hrvLow, illnessDays, hardEasy };
}

/**
 * Plnění minulého týdne proti jeho pondělnímu plánu (bez dnů nemoci, volna od trenéra 🔴 a tvých „nemůžu“).
 * Bez uloženého plánu (první týden) se bere kalendář zapsaných tréninků. null = nebylo co hodnotit.
 */
export function adherenceOf(ctx: Ctx, prev: MondayPlan | null, cons: { date: string; kind: string }[]): Adherence | null {
  const ws = addDays(mondayOf(ctx.T), -7), we = addDays(ws, 6);
  const plan: AdherenceDay[] = prev?.week && prev.weekStart === ws
    ? prev.week.days.map((x) => ({ date: x.date, training: x.role !== "rest" && !x.blocked, load: x.load }))
    : ctx.calendar.filter((c) => c.date >= ws && c.date <= we && c.kind !== "rest" && !!c.name).map((c) => ({ date: c.date, training: true, load: c.target_load ?? 0 }));
  if (!plan.some((d) => d.training)) return null;
  const skip = new Set([...offDaysOf(ctx), ...cons.filter((c) => ["nemoc", "nepojedu", "nemuzu", "dovolena"].includes(c.kind)).map((c) => c.date)]);
  for (const d of dateRange(ws, we)) if (recoveryStateOn(ctx, d) === "red") skip.add(d);
  return weekAdherence(ws, plan, ctx.acts.map((a) => ({ date: a.date, load: a.load, moving_s: a.moving_s })), skip);
}

/** Uloží novou verzi plánu, když se změnily budoucí dny (nebo začal nový týden). Bez tabulky (stará migrace) nic. */
async function saveVersion(ctx: Ctx, plan: CoachPlan, drivers: Drivers): Promise<void> {
  const days = versionDays(plan.coach.horizon.slice(0, 2).flatMap((w) => w.days));
  const last = await first<{ id: number; week_start: string; days: string; drivers: string }>(ctx.env.DB, "SELECT id, week_start, days, drivers FROM plan_versions ORDER BY id DESC LIMIT 1");
  const from = plan.days[0]?.date ?? ctx.T;
  const changes = last ? diffDays(JSON.parse(last.days), days, from) : [];
  if (last && last.week_start === drivers.week && !changes.length) return;
  const reason = reasonOf(last ? (JSON.parse(last.drivers) as Drivers) : null, drivers);
  await run(ctx.env.DB, "INSERT INTO plan_versions (created_at, week_start, reason, drivers, days, changes) VALUES (?, ?, ?, ?, ?, ?)", new Date().toISOString(), drivers.week, reason.join(" · "), JSON.stringify(drivers), JSON.stringify(days), JSON.stringify(changes));
  if (last && last.id % 20 === 0) await run(ctx.env.DB, "DELETE FROM plan_versions WHERE id <= ?", last.id - KEEP_VERSIONS);
}

/** Dny za posledních 5 týdnů se stavem Nemocný / Zraněný / Dovolená (ukončená období + právě běžící stav). */
export function offDaysOf(ctx: Ctx): string[] {
  const T = ctx.T, from = addDays(T, -35);
  const spans = [...(ctx.s.status_log ?? [])];
  const st = ctx.s.status;
  if (st && st.kind !== "active" && st.from) spans.push({ kind: st.kind, from: st.from, until: st.until && st.until < T ? st.until : T });
  const out = new Set<string>();
  for (const sp of spans) for (const d of dateRange(sp.from < from ? from : sp.from, sp.until > T ? T : sp.until)) out.add(d);
  return [...out];
}

/** Trenér v3: plán od dnešní kondice, 4 týdny dopředu, bez uložených týdnů (src/core/coach/, docs/trener/). */
export async function planForCoach(ctx: Ctx, rec: RecoveryResult, opt: { dryRun?: boolean } = {}): Promise<PlanResult> {
  const T = ctx.T;
  let profile = ctx.s.coach_profile ? validateProfile(ctx.s.coach_profile).profile : null;
  if (!profile) {
    profile = profileFromHistory(ctx.acts, T);
    await setSetting(ctx.env.DB, "coach_profile", profile);
    ctx.s.coach_profile = profile;
  }
  const constraints = [...ctx.constraints, ...statusConstraints(ctx)];
  const acts: EngineAct[] = ctx.acts.map((a) => ({ id: a.id, date: a.date, sport: a.sport, load: a.load, moving_s: a.moving_s, // kvalita podle tepu i u aktivit uložených dřív (běh a kolo bez wattmetru se dřív za kvalitu nepočítaly)
    quality: (!!a.is_quality || ((a.sport === "run" || (isBike(a.sport) && !a.np)) && !!hrQuality(a.hr_z))) && a.sport !== "skate" && a.sport !== "padel", hr_z: a.hr_z, pwr_z: a.pwr_z, laps: a.laps ?? null, compliance: (a as any).icu_compliance ?? null, rpe: (a as any).rpe ?? null }));
  const power = ctx.acts.filter((a) => isBike(a.sport)).map((a) => ({ id: a.id, date: a.date, mmp: a.mmp, max20: a.max20, pwr_z: a.pwr_z }));
  const state: { progress: Record<string, ProgressRow> } = { progress: {} };
  for (const r of await all<{ key: string; level: number; last_date: string | null }>(ctx.env.DB, "SELECT key, level, last_date FROM coach_progress")) state.progress[r.key] = { level: r.level, last: r.last_date };
  // kvality: vyhodnotit odjeté (stupeň náročnosti nahoru / dolů), pak plánovat s aktuálními stupni a historií kategorií
  const keys0 = (await getState<KeyRecord[]>(ctx.env.DB, "coach3_keys")) ?? [];
  const ev = evaluateKeys(keys0, acts, T, ctx.s.goal, state.progress);
  for (const u of ev.updates) {
    await run(ctx.env.DB, "INSERT INTO coach_progress (key, level, last_date, last_outcome) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET level = excluded.level, last_date = excluded.last_date, last_outcome = excluded.last_outcome", u.key, u.level, u.last, u.outcome.slice(0, 200));
    state.progress[u.key] = { level: u.level, last: u.last };
  }
  // pondělní plán týdne: uloží se jednou (v pondělí před prvním tréninkem se smí přepsat) – únava a nová omezení
  // pak mění jen dnešek a budoucí dny, ne odjeté dny a ne dvakrát
  const W0 = mondayOf(T);
  const mon0 = await getState<MondayPlan>(ctx.env.DB, "coach3_monday");
  // nedělní vyhodnocení: pondělní plán minulého týdne (uložený při přechodu na nový týden, nebo ještě ten aktuální)
  const prevMon = mon0 && mon0.weekStart === addDays(W0, -7) ? mon0 : await getState<MondayPlan>(ctx.env.DB, "coach3_monday_prev");
  const adherence = adherenceOf(ctx, prevMon, constraints);
  const foster = fosterOf(ctx.acts, T);
  const fatigue: Fatigue = { ...fatigueOf(ctx, rec, constraints), adherence, strain: foster.strainHigh ? foster.note : null };
  const reentry = reentryOf(ctx.acts, T, profile.level ?? "intermediate");
  const weather = weatherMap(ctx, T, 35);
  const plan = runCoach({
    mondayPlan: mon0 && mon0.weekStart === W0 ? mon0 : null,
    today: T,
    goal: ctx.s.goal,
    raceDate: ctx.s.goal === "zavod" ? ctx.s.goal_date : null,
    profile,
    zones: { ftp: ctx.s.ftp ?? null, hr: ctx.s.hr_zones },
    acts,
    power,
    metric: (d) => metricOn(ctx, d),
    calendar: ctx.calendar,
    constraints,
    weather,
    weatherOk: ctx.weatherOk,
    recovery: rec.state,
    fatigue,
    reentry,
    weekLoads: await weekLoads(ctx),
    offDays: offDaysOf(ctx),
    progress: state.progress,
    keyHistory: ev.records.filter((r) => r.state === "done").map((r) => ({ date: r.date, cat: r.cat })),
    recentWids: ev.records.filter((r) => !!r.wid).map((r) => ({ date: r.date, sport: r.sport, cat: r.cat, wid: r.wid! })),
  });
  // dnešní (a dřívější) kvality z plánu uložit – po odjetí se vyhodnotí; zápis jen při změně
  const keys1 = recordKeys(ev.records, plan.coach.keyDays, T);
  if (JSON.stringify(keys1) !== JSON.stringify(keys0)) await setState(ctx.env.DB, "coach3_keys", keys1);
  const mp = plan.coach.mondayPlan;
  if (!opt.dryRun && mp && (!mon0 || mon0.weekStart !== mp.weekStart || mon0.goal !== mp.goal || (mp.monday && JSON.stringify(mp) !== JSON.stringify(mon0)))) {
    // nový týden: pondělní plán minulého týdne si nechat pro nedělní vyhodnocení plnění
    if (mon0 && mon0.weekStart < mp.weekStart) await setState(ctx.env.DB, "coach3_monday_prev", mon0);
    await setState(ctx.env.DB, "coach3_monday", mp);
  }
  (plan.coach as any).adherence = adherence;
  (plan.coach as any).foster = { monotony: foster.monotony, strain: foster.strain, usual: foster.usual, note: foster.note };
  if (!opt.dryRun) {
    const fi = fatigueFactor(fatigue);
    const drivers: Drivers = {
      week: W0,
      goal: ctx.s.goal,
      recovery: rec.state,
      fatigue: Math.round(fi.factor * 100) / 100,
      notes: fi.notes,
      reentry: reentry.note,
      mine: JSON.stringify(constraints.filter((c) => c.date >= T).map((c) => `${c.date}|${c.kind}|${c.note ?? ""}`).sort()),
      weatherBad: [...weather.entries()].filter(([d, w]) => d <= addDays(T, 8) && !!w?.bad).map(([d]) => d).sort(),
      trained: [...new Set(ctx.acts.filter((a) => a.date >= W0 && (a.moving_s ?? 0) >= 20 * 60).map((a) => a.date))].sort(),
      profile: JSON.stringify(profile),
    };
    await saveVersion(ctx, plan, drivers).catch(logged(ctx.env.DB, "historie plánu se neuložila", undefined));
  }
  // odhad jídla a pití do rozpisu tréninku (rozbalí se pod kroky)
  const weight = [...ctx.well].reverse().find((w) => w.weight_kg != null)?.weight_kg ?? null;
  plan.days = plan.days.map((d) => {
    if (!d.name || !d.durationMin) return d;
    const temp = d.indoor ? 20 : d.weather ? Math.round((d.weather.tmax + d.weather.tmin) / 2) : null;
    return { ...d, fuel: fuelPlan(d.durationMin, temp, weight, d.kind === "quality" ? "quality" : "z2").lines };
  });
  (plan.coach as any).lastKeys = keys1.filter((r) => r.state !== "pending").slice(-4).reverse();
  return plan;
}

/** Plán trenéra (src/core/coach/, docs/trener/). */
export async function planFor(ctx: Ctx, rec?: RecoveryResult): Promise<PlanResult> {
  if (ctx.s.coach_on === false) return freePlan(ctx);
  return planForCoach(ctx, rec ?? recoveryFor(ctx));
}

/**
 * Trenér vypnutý: žádné tréninky ani návrhy změn. Cíl týdne = zátěž na udržení kondice (7 × kondice z konce
 * minulého týdne, pásmo ± 10 %) – tak se kondice nemění (TrainingPeaks / Friel, src/core/fitness.ts).
 */
export function freePlan(ctx: Ctx): PlanResult {
  const T = ctx.T;
  const mon = mondayOf(T);
  const ctl = metricOn(ctx, addDays(mon, -1))?.ctl ?? ctx.metrics[ctx.metrics.length - 1]?.ctl ?? 0;
  const sum = (from: string, to: string) => Math.round(ctx.acts.filter((a) => a.date >= from && a.date <= to).reduce((s, a) => s + (a.load ?? 0), 0));
  return {
    from: T, to: T, days: [], changes: [], chart: [], qualityWeeks: [], warnings: [], missed: [], done: [],
    loadPast7: sum(addDays(T, -6), T), loadNext7: 0,
    weeklyTarget: weeklyLoadTarget(ctl, "udrzeni"),
  };
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
    done: { name: string; load: number | null; id: string; sport?: string; unit?: string; compliance?: number | null }[];
    calendarName: string | null;
  };
  tomorrow: string;
  /** zítřek strukturovaně (karta Dnes): trénink, délka, počasí */
  tomorrowInfo: { date: string; name: string | null; tag: string | null; minutes: number | null; tmax: number | null; tmin: number | null; rainProb: number | null; gust: number | null } | null;
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
  const done = todayActs(ctx).map((a) => ({ name: a.name ?? "aktivita", load: a.load, id: a.id, sport: a.sport, unit: ["ride", "mtb", "indoor"].includes(a.sport) && a.np && a.load_source !== "hr_indoor" ? "TSS" : "HRSS", compliance: (a as any).icu_compliance != null ? Math.round((a as any).icu_compliance) : null }));
  const cal = ctx.calendar.find((c) => c.date === T && c.status !== "skipped") ?? null;
  let decision: string;
  let why: string;
  // Trenér v3: dnešek jen z plánu trenéra (ranní stav už v plánu je) – kalendář intervals.icu je jen zápis
  // dnešek jen z plánu trenéra (ranní stav už v plánu je) – kalendář intervals.icu je jen zápis
  if (done.length) {
    decision = "Odtrénováno";
    why = `${done.map((d) => `${d.name} (zátěž ${num(d.load)})`).join(", ")}.`;
  } else if (!day || !day.name) {
    decision = "Volno";
    why = day?.kind === "blocked" ? day.note || "Dnes nelze." : "Volno podle plánu.";
  } else if (day.indoor) {
    decision = "Trenažér";
    why = day.note || "Kvalita na trenažéru.";
  } else {
    decision = rec.state === "yellow" ? "Jet lehčeji" : "Jet podle plánu";
    why = day.note || "Zotavení v normě.";
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
    today: { title: done.length ? done[0]!.name : day?.name ?? "Volno", decision, decisionWhy: why, day, done, calendarName: cal?.name ?? null },
    tomorrow,
    tomorrowInfo: tomorrowDay ? { date: tomorrowDay.date, name: tomorrowDay.name ?? null, tag: tomorrowDay.tag ?? null, minutes: tomorrowDay.durationMin ?? null, tmax: tomorrowDay.weather?.tmax ?? null, tmin: tomorrowDay.weather?.tmin ?? null, rainProb: tomorrowDay.weather?.rainProb ?? null, gust: tomorrowDay.weather?.gustMax ?? null } : null,
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
  if (rec.state === "red") w.push(`${rec.stateLabel}: ${[...rec.flags.counted, ...rec.reasons].join(", ")}.`);
  if (rec.rhr.streak3) w.push("Klidový tep zvýšený 3 dny po sobě. Když se k tomu přidají příznaky nemoci, žádná zátěž a případně lékař.");
  if (rec.illness) w.push("Nemoc: nic nedohánět, po návratu postupně. Při bolesti na hrudi nebo závrati k lékaři.");
  if (fit.form != null && fit.form < -25) w.push(`Forma ${num(fit.form, 1)} je pod −25.`);
  if (fit.ramp != null && fit.ramp > 5) w.push(`Ramp rate ${signed(fit.ramp, 1)} za 7 dní je nad +5.`);
  if (fit.acwr.level === "high") w.push(`Poměr zátěže 7/28 dní ${num(fit.acwr.ratio, 2)} je nad 1,5 – riziko přetížení.`);
  else if (fit.acwr.level === "warn") w.push(`Poměr zátěže 7/28 dní ${num(fit.acwr.ratio, 2)} je nad 1,3.`);
  // Foster: jednotvárná zátěž / strain nad obvyklým (src/core/foster.ts)
  const fo = fosterOf(ctx.acts, ctx.T);
  if (fo.note) w.push(`${fo.note[0]!.toUpperCase()}${fo.note.slice(1)}.`);
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
  const z = zonesFor(ctx.zh, a.date, ctx.s);
  return analyzeActivity(a, plannedFor(ctx, a), z.ftp, z.hr);
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
