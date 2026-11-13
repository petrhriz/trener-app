// /api/* – data pro dashboard. Žádná data natvrdo v HTML, vše odsud.
import { Hono } from "hono";
import type { Env } from "../env";
import { BIKE_SPORTS } from "../datasource/types";
import { fuelPlan, SWEAT_TEST_HINT, sleepRegularity } from "../core/extras";
import { GOAL_LABEL, type Goal, formZone, project } from "../core/fitness";
import { carbsFor } from "../core/nutrition";
import { bestIn } from "../core/power";
import { norm } from "../core/recovery";
import { TARGET_PCT, pctRange, powerZones } from "../core/zones";
import { all, first, getState, setState } from "../lib/db";
import { IntervalsClient } from "../datasource/intervals";
import { GarminClient } from "../datasource/garmin";
import { sleepReport } from "../core/sleep";
import { dayDm, dm } from "../lib/format";
import { DEFAULTS, getSettings, setSetting, statusOn, type Settings } from "../lib/settings";
import { STATUS_LABEL, coaching, strainScore, typicalWake, type StatusKind } from "../core/readinessScore";
import { misc } from "./misc";
import { addDays, dow, localNow, mondayOf, tzOffsetMin, daysBetween } from "../lib/time";
import { constraintNoteOk } from "../core/coach/common";
import { RPE_ASK_DAYS, RPE_LABEL, rpeOk, rpeToAsk } from "../core/rpe";
import { addConstraint, applyChanges, claimProposal, finishProposal, getProposal, openProposal, removeConstraint, saveProposal } from "../plan/proposals";
import { activityReport, eftpOf, ftpCheckOf, fitnessTable, recoveryFor, plannedFor, planFor, readiness, weatherMap, weekly } from "../report/build";
import { loadCtx } from "../report/context";
import { compliance, ctlPlan, efficiency, intensityVerdict, intensityWeeks, monotonyWeeks, weeklyCompliance } from "../core/analytics";
import { recomputeLoads } from "../sync/metrics";
import { recomputeSleep } from "../sync/sleep";
import { geocode } from "../sync/weather";
import { syncTick } from "../sync/sync";
import { listModels, modelChain } from "../llm/providers";
import { verifyAccess } from "./access";
import { accountsApi } from "./accounts";
import { alertsApi } from "./alerts";
import { coachApi } from "./coach";
import { OWNER_ID, sessionUser } from "./session";

/** uid = přihlášený uživatel (zatím vždy 1 = vlastník; příprava na víc uživatelů, viz docs/multi-user.md) */
export const api = new Hono<{ Bindings: Env; Variables: { uid: number } }>();
import { gearApi, loadGear, resolveGear } from "./gear";
import { zones28 } from "../core/coach/zones28";
import { loadZoneHistory, recordZones, zonesFor } from "../lib/zoneHistory";
import { applySecrets, encryptSecret, invalidateSecrets, secretInfo, secretsFor } from "../lib/secrets";
const isBike = (s: string) => BIKE_SPORTS.includes(s as any);

// data se mění každých 5 min a po každé úpravě – prohlížeč ani webová aplikace na ploše je nesmí cachovat
api.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
});

api.use("*", async (c, next) => {
  const admin = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (c.env.ADMIN_TOKEN && admin && admin === c.env.ADMIN_TOKEN) { c.set("uid", Number(c.req.header("x-uid") ?? OWNER_ID) || OWNER_ID); return next(); }
  // 1) session (jméno a heslo nebo jednorázový odkaz), 2) Cloudflare Access JWT (pokud je nastavené)
  const uid = await sessionUser(c.env, c.req.header("cookie"));
  if (uid != null) { c.set("uid", uid); return next(); }
  const v = await verifyAccess(c.env, c.req.header("cf-access-jwt-assertion"));
  if (!v.ok) return c.json({ error: "login", message: "Nejsi přihlášený." }, 403);
  c.set("uid", OWNER_ID);
  await next();
});

// účet a uživatelé (src/api/accounts.ts), upozornění (src/api/alerts.ts)
api.route("/", accountsApi);
api.route("/", alertsApi);
api.route("/", coachApi);

api.route("/gear", gearApi);
api.route("/", misc);

/** AI: dostupné modely (Gemma z Google AI Studia, Nemotron z NVIDIE, Workers AI) a pořadí, ve kterém se zkouší. */
api.get("/llm-models", async (c) => {
  const [google, nvidia, chain] = await Promise.all([listModels(c.env, "google").catch(() => []), listModels(c.env, "nvidia").catch(() => []), modelChain(c.env)]);
  return c.json({ google, nvidia, workers: c.env.AI ? [c.env.LLM_MODEL || "@cf/mistralai/mistral-small-3.1-24b-instruct"] : [], chain: chain.map((x) => `${x.p}:${x.model}`), keys: { google: !!c.env.GEMINI_API_KEY, nvidia: !!c.env.NVIDIA_API_KEY }, openrouter: /^sk-or-/.test(c.env.NVIDIA_API_KEY?.trim() ?? "") });
});
/** AI: krátký test (který model odpověděl a za jak dlouho). */
api.post("/llm-test", async (c) => {
  // každý model z řetězu zvlášť (nebo jen vybraný) → je vidět, kdo funguje a proč ne
  const body = (await c.req.json().catch(() => ({}))) as { model?: string };
  const { testModels } = await import("../llm/providers");
  const rows = await testModels(c.env, typeof body.model === "string" && body.model !== "auto" ? body.model : undefined);
  return c.json({ ok: rows.some((x) => x.ok), rows });
});

/** Ruční synchronizace z dashboardu (tlačítko ⟳): stáhne nové aktivity, spánek, HRV a přepočte metriky. Max. 1× za 20 s. */
api.post("/sync-now", async (c) => {
  const last = (await getState<number>(c.env.DB, "manual_sync_at")) ?? 0;
  if (Date.now() - last < 20_000) return c.json({ ok: true, skipped: true, steps: [], errors: [], newActivities: [] });
  await setState(c.env.DB, "manual_sync_at", Date.now());
  const rep = await syncTick(c.env, { manual: true });
  return c.json({ ok: rep.errors.length === 0, ...rep });
});

/** Přehled: zdraví dnes (Body Battery, spánek, HRV, tep, stres, kroky, zátěž), dnešní trénink, poslední aktivita, počasí 7 dní. */
api.get("/overview", async (c) => {
  const ctx0 = await loadCtx(c.env);
  const T = ctx0.T;
  // ?date= : náhled na kterýkoli den v historii; připravenost a plán jsou vždy pro dnešek
  const D = pastDate(c.req.query("date"), T);
  const ctx = await withHistory(c.env, ctx0, D);
  const r = await readiness(ctx);
  const tw = ctx.well.find((w) => w.date === D) ?? null;
  // dlaždice: 30 dní (podrobnější graf s pásmem normy)
  // dlaždice: 90 dní – zobrazí se posledních 30, starší dny slouží pro pásmo normy den po dni
  const last14 = ctx.well.filter((w) => w.date > addDays(D, -90) && w.date <= D);
  const series = (k: keyof (typeof ctx.well)[number]) => last14.map((w) => ({ date: w.date, v: (w as any)[k] ?? null }));
  const hist = ctx.well.filter((w) => w.date >= addDays(D, -60) && w.date < D);
  const nm = (k: "hrv" | "rhr" | "stress_avg" | "steps" | "bb_max" | "sleep_resp") => {
    const x = norm(hist.map((w) => w[k]));
    if (!x.n) return null;
    // dech: Garmin posílá celé dechy (11, 12) → tolerance zaokrouhlení ±0,5 a SD aspoň 0,6
    if (k === "sleep_resp") return { mean: Math.round(x.mean * 10) / 10, sd: Math.round(Math.max(x.sd, 0.6) * 10) / 10, q: 1 };
    return { mean: Math.round(x.mean * 10) / 10, sd: Math.round(x.sd * 10) / 10 };
  };
  const sleep = sleepReport(tw as any, ctx.well.filter((w) => w.date <= D) as any);
  const lastAct = [...ctx.acts].reverse().find((a) => a.date <= D && (a.sport !== "other" || (a.moving_s ?? 0) > 600)) ?? null;
  const todayLoad = Math.round(ctx.acts.filter((a) => a.date === D).reduce((s, a) => s + (a.load ?? 0), 0));
  const yLoad = Math.round(ctx.acts.filter((a) => a.date === addDays(D, -1)).reduce((s, a) => s + (a.load ?? 0), 0));
  const met = ctx.metrics.find((m) => m.date === D);
  const pastFit = D === T ? null : { ctl: met?.ctl ?? null, atl: met?.atl ?? null, form: met?.form ?? null };
  const load7 = Math.round(ctx.acts.filter((a) => a.date > addDays(D, -7) && a.date <= D).reduce((s, a) => s + (a.load ?? 0), 0));
  // VST: průměr každé noci za 14 dní (jen přehled, detail po 5 min není potřeba)
  const hrv14 = ctx.well.filter((w) => w.date > addDays(D, -14) && w.date <= D).map((w) => ({ date: w.date, v: w.hrv ?? null }));
  // spánková bilance: Σ 0,74^k × (spánek − cíl) za 7 nocí (dnešní noc váha 1, nejstarší 0,16)
  const goalMin = ctx.s.sleep_goal_min ?? 480;
  const nights7 = ctx.well.filter((w) => w.date > addDays(D, -7) && w.date <= D).map((w) => ({ date: w.date, d: w.sleep_s ? Math.round(w.sleep_s / 60 - goalMin) : null }));
  const nOk = nights7.filter((x) => x.d != null);
  const sleepBal = nOk.length >= 4 ? { min: Math.round(nights7.reduce((t, x) => t + (x.d == null ? 0 : x.d * Math.pow(0.74, daysBetween(x.date, D))), 0)), nights: nights7, goalMin } : null;
  const fit = r.fitness;
  const day = r.today.day;
  const wm = weatherMap(ctx, T, 7);
  const stressDist = (() => { try { return tw?.stress_dist ? JSON.parse(tw.stress_dist) : null; } catch { return null; } })();
  const vsN = (v: number | null | undefined, n: { mean: number; sd: number } | null, lowGood = false) =>
    v == null || !n ? null : v < n.mean - n.sd ? (lowGood ? "Nízký" : "Pod normou") : v > n.mean + n.sd ? (lowGood ? "Zvýšený" : "Nad normou") : "Normální";
  const past = D !== T;
  // zpětný den: zotavení spočítané k tomu dni (data jen do toho dne)
  const recD = past ? recoveryFor({ ...ctx, T: D, well: ctx.well.filter((w) => w.date <= D), acts: ctx.acts.filter((a) => a.date <= D) } as any) : r.recovery;
  // skóre: Zátěž · Zotavení · Spánek
  const st = statusOn(ctx.s, D);
  const ctlY = ctx.metrics.find((m) => m.date === addDays(D, -1))?.ctl ?? fit.ctl ?? null;
  // plán dne v TSS: z kalendáře, dnes případně z aktuálního plánu
  const calD = ctx.calendar.find((x) => x.date === D && x.status !== "skipped" && x.kind !== "rest");
  const plannedD = calD?.target_load ?? (D === T && day?.name ? day.load : null);
  const strain = strainScore(todayLoad, plannedD, ctlY);
  const sleepNeed = tw?.sleep_need_min ?? null;
  const coach = coaching({
    hour: past ? 21 : ctx.now.hh,
    past,
    status: st.kind as StatusKind,
    statusUntil: st.until,
    // zpětný den bez dat z hodinek: žádné „odpočatý“ z ničeho
    semafor: past && !tw?.hrv && !tw?.sleep_s && !tw?.rhr ? null : { state: recD.state, reasons: [...recD.flags.counted, ...recD.reasons], missing: past ? false : r.missingData.length >= 2 },
    strain,
    sleepS: tw?.sleep_s ?? null,
    sleepNeedMin: sleepNeed,
    nextNeedMin: tw?.next_sleep_need_min ?? null,
    wakeTypical: typicalWake(ctx.well.filter((w) => w.date > addDays(D, -14) && w.date <= D).map((w) => w.wake_time)),
    bbNow: past ? tw?.bb_min ?? null : tw?.bb_latest ?? null,
    stressAvg: tw?.stress_avg ?? null,
    stressNorm: nm("stress_avg")?.mean ?? null,
    steps: tw?.steps ?? null,
    plan: { name: past ? null : day?.name ?? null, kind: past ? null : day?.kind ?? null, minutes: past ? null : day?.durationMin ?? null, done: ctx.acts.some((a) => a.date === D && (a.moving_s ?? 0) >= 20 * 60) },
    remLow: !!sleep && sleep.stages.find((x) => x.key === "rem")?.tone === "bad",
    deepLow: !!sleep && sleep.stages.find((x) => x.key === "deep")?.tone === "bad",
  });
  const hourNow = ctx.hours.find((h) => h.time === `${T}T${String(ctx.now.hh).padStart(2, "0")}:00`) ?? null;
  return c.json({
    status: { ...st, label: STATUS_LABEL[st.kind as StatusKind] },
    scores: {
      strain: { ...strain, paused: st.kind !== "active" },
      sleep: { score: tw?.sleep_score ?? null, durationS: tw?.sleep_s ?? null, needMin: sleepNeed },
    },
    coaching: coach,
    weatherDay: past ? await weatherOfDay(c.env, ctx.s, D) : null,
    weatherNow: hourNow ? { temp: hourNow.temp, feels: hourNow.feels, prob: hourNow.precip_prob, code: (hourNow as any).code ?? null, gust: hourNow.gust, place: ctx.s.place_name } : null,
    name: ctx.s.first_name,
    hour: ctx.now.hh,
    date: D,
    todayDate: T,
    isToday: !past,
    minDate: await firstDay(c.env, T),
    hrv14,
    sleepBal,
    lastSync: ctx.lastSyncOk,
    acts: ctx.acts.filter((a) => a.date === D).map((a) => ({ id: a.id, name: a.name, sport: a.sport, km: a.distance_m ? Math.round(a.distance_m / 100) / 10 : null, moving_s: a.moving_s, load: a.load })),
    ...(past ? {
      hrvPast: { today: tw?.hrv ?? null, rating: vsN(tw?.hrv, nm("hrv")), norm: nm("hrv"), series: series("hrv") },
      rhrPast: { today: tw?.rhr ?? null, rating: vsN(tw?.rhr, nm("rhr"), true), norm: nm("rhr"), series: series("rhr") },
      fitPast: { ...pastFit, load7 },
    } : {}),
    readiness: { state: recD.state, label: recD.stateLabel, emoji: recD.emoji, score: recD.score, scoreDrags: recD.scoreDrags, scoreBoosts: recD.scoreBoosts, reasons: [...recD.flags.counted, ...recD.reasons], decision: r.today.decision, why: r.today.decisionWhy, missing: r.missingData },
    bb: { max: tw?.bb_max ?? null, min: tw?.bb_min ?? null, latest: tw?.bb_latest ?? null, charged: tw?.bb_charged ?? null, drained: tw?.bb_drained ?? null, series: last14.map((w) => ({ date: w.date, max: w.bb_max, min: w.bb_min })), norm: nm("bb_max") },
    hrv: { today: r.recovery.hrv.today, rating: r.recovery.hrv.rating, flag: r.recovery.hrv.flag, range: r.recovery.hrv.rangeText, avg7: r.recovery.hrv.avg7, series: series("hrv"), norm: nm("hrv") },
    rhr: { today: r.recovery.rhr.today, rating: r.recovery.rhr.rating, flag: r.recovery.rhr.flag, range: r.recovery.rhr.rangeText, avg7: r.recovery.rhr.avg7, series: series("rhr"), norm: nm("rhr") },
    stress: { avg: tw?.stress_avg ?? null, max: tw?.stress_max ?? null, dist: stressDist, series: series("stress_avg"), norm: nm("stress_avg") },
    steps: { today: tw?.steps ?? null, goal: 5000, series: series("steps"), norm: nm("steps"), floors: tw?.floors_up ?? null },
    resp: { today: tw?.sleep_resp ?? null, series: series("sleep_resp"), norm: nm("sleep_resp" as any) },
    sleep,
    sleepSeries: last14.map((w) => ({ date: w.date, s: w.sleep_s, score: w.sleep_score, deep: w.deep_s, rem: w.rem_s, light: w.light_s, awake: w.awake_s })),
    strain: { today: todayLoad, yesterday: yLoad, load7: fit.load7, ctl: fit.ctl, atl: fit.atl, form: fit.form, zone: fit.form != null ? formZone(fit.form) : null, ramp: fit.ramp },
    today: { decision: r.today.decision, why: r.today.decisionWhy, name: day?.name ?? null, tag: day?.tag ?? null, durationMin: day?.durationMin ?? null, sport: day?.sport ?? null, targetText: day?.targetText ?? null, done: r.today.done, tomorrow: r.tomorrow, tomorrowInfo: r.tomorrowInfo },
    lastActivity: lastAct ? { id: lastAct.id, date: lastAct.date, name: lastAct.name, sport: lastAct.sport, km: lastAct.distance_m ? Math.round(lastAct.distance_m / 100) / 10 : null, moving_s: lastAct.moving_s, load: lastAct.load, avg_hr: lastAct.avg_hr, np: lastAct.np, elev: lastAct.elev_gain, plan: plannedFor(ctx, lastAct)?.name ?? null, compliance: lastAct.icu_compliance } : null,
    rideTemps: ctx.s.ride_temps ?? null,
    weather: [...wm.entries()].map(([d, w]) => ({ date: d, label: d === T ? "Dnes" : d === addDays(T, 1) ? "Zítra" : dayDm(d), w })),
  });
});

/** Počasí minulého dne (Open-Meteo historical forecast): max/min, pocitově, srážky, kód; v KV na rok. */
async function weatherOfDay(env: Env, st: Settings, D: string): Promise<{ tmax: number | null; tmin: number | null; feels: number | null; precip: number | null; code: number | null; gust: number | null } | null> {
  const lat = st.place_lat ?? Number(env.LAT), lon = st.place_lon ?? Number(env.LON);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const key = `wxday:${lat}:${lon}:${D}`;
  const hit = await env.KV.get(key, "json").catch(() => null);
  if (hit) return hit as any;
  try {
    const r = await fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${D}&end_date=${D}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,wind_gusts_10m_max&timezone=Europe%2FPrague&wind_speed_unit=kmh`);
    if (!r.ok) return null;
    const j = (await r.json()) as { daily?: Record<string, (number | null)[]> };
    const g = (k: string) => j.daily?.[k]?.[0] ?? null;
    const out = { tmax: g("temperature_2m_max"), tmin: g("temperature_2m_min"), feels: g("apparent_temperature_max"), precip: g("precipitation_sum"), code: g("weather_code"), gust: g("wind_gusts_10m_max") };
    if (out.tmax == null) return null;
    // včerejšek se ještě může zpřesnit → krátce, starší dny na rok
    await env.KV.put(key, JSON.stringify(out), { expirationTtl: D >= addDays(localNow().date, -2) ? 6 * 3600 : 365 * 86400 }).catch(() => {});
    return out;
  } catch { return null; }
}

/** Platné datum pro náhled zpět: YYYY-MM-DD v rozsahu T−7 … T, jinak T. */
function pastDate(q: string | undefined, T: string): string {
  if (!q || !/^\d{4}-\d{2}-\d{2}$/.test(q)) return T;
  return q > T ? T : q;
}

/**
 * Náhled na libovolný den v historii: kontext má jen posledních 90 dní, pro starší den se dočte
 * wellness, aktivity a kondice od (den − 92) – normy se počítají z 60 dní před tím dnem.
 */
async function withHistory(env: Env, ctx: CtxT, D: string): Promise<CtxT> {
  if (D >= addDays(ctx.T, -28)) return ctx;
  const from = addDays(D, -92), to = addDays(ctx.T, -91);
  if (from > to) return ctx;
  const [w, a, m] = await Promise.all([
    all<any>(env.DB, "SELECT * FROM wellness WHERE date >= ? AND date <= ? ORDER BY date", from, to),
    all<any>(env.DB, "SELECT * FROM activities WHERE date >= ? AND date <= ? ORDER BY start_local", from, to),
    all<any>(env.DB, "SELECT * FROM daily_metrics WHERE date >= ? AND date < ? ORDER BY date", from, ctx.metrics[0]?.date ?? to),
  ]);
  const { parseAct } = await import("../report/context");
  return { ...ctx, well: [...w, ...ctx.well], acts: [...a.map(parseAct), ...ctx.acts], metrics: [...m, ...ctx.metrics] };
}
/** první den, ke kterému mám data */
const firstDay = async (env: Env, T: string) => (await first<{ d: string | null }>(env.DB, "SELECT MIN(date) AS d FROM wellness"))?.d ?? addDays(T, -7);

api.get("/year", async (c) => {
  const ctx = await loadCtx(c.env);
  const T = ctx.T;
  const year = T.slice(0, 4);
  const yr = await first<{ km: number; n: number; up: number; c100: number; longest: number }>(c.env.DB, "SELECT SUM(distance_m)/1000.0 AS km, COUNT(*) AS n, SUM(elev_gain) AS up, SUM(CASE WHEN distance_m >= 100000 THEN 1 ELSE 0 END) AS c100, MAX(distance_m)/1000.0 AS longest FROM activities WHERE date >= ? AND sport IN ('ride','mtb','indoor')", `${year}-01-01`);
  const last4 = await first<{ km: number }>(c.env.DB, "SELECT SUM(distance_m)/1000.0 AS km FROM activities WHERE date > ? AND sport IN ('ride','mtb','indoor')", addDays(T, -28));
  const doy = Math.round((Date.parse(T) - Date.parse(`${year}-01-01`)) / 86400_000) + 1;
  const daysInYear = (+year % 4 === 0 ? 366 : 365);
  const km = Math.round(yr?.km ?? 0);
  const goal = ctx.s.year_km_goal;
  const weeksLeft = Math.max(0.1, (daysInYear - doy) / 7);
  const r = await readiness(ctx);
  const mon = mondayOf(T);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i);
    const pl = ctx.calendar.find((x) => x.date === d && x.status !== "skipped" && x.kind !== "rest");
    const pd = r.plan.days.find((x) => x.date === d);
    const acts = ctx.acts.filter((a) => a.date === d);
    return {
      date: d, label: dayDm(d), isToday: d === T,
      planned: pl ? { name: pl.name, min: pl.duration_min, status: pl.status } : pd?.name ? { name: pd.name, min: pd.durationMin, status: "návrh" } : null,
      done: acts.map((a) => ({ name: a.name, km: a.distance_m ? Math.round(a.distance_m / 100) / 10 : null, min: Math.round((a.moving_s ?? 0) / 60), id: a.id })),
    };
  });
  const bySport = await all<{ sport: string; n: number; km: number; s: number; up: number }>(c.env.DB, "SELECT sport, COUNT(*) n, SUM(distance_m)/1000.0 km, SUM(moving_s) s, SUM(elev_gain) up FROM activities WHERE date >= ? GROUP BY sport ORDER BY s DESC", `${year}-01-01`);
  const years = await all<{ y: string; sport: string; n: number; km: number; s: number; up: number }>(c.env.DB, "SELECT substr(date, 1, 4) y, sport, COUNT(*) n, SUM(distance_m)/1000.0 km, SUM(moving_s) s, SUM(elev_gain) up FROM activities GROUP BY y, sport ORDER BY y DESC, s DESC");
  return c.json({
    date: T,
    bySport,
    years,
    elevYear: Math.round(bySport.reduce((t, s) => t + (s.up ?? 0), 0)),
    goal: { name: ctx.s.goal_name, date: ctx.s.goal_date, daysLeft: ctx.s.goal_date ? Math.round((Date.parse(ctx.s.goal_date) - Date.parse(T)) / 86400_000) : null },
    yearKm: {
      year, km, goal, rides: yr?.n ?? 0, up: Math.round(yr?.up ?? 0), over100: yr?.c100 ?? 0, longest: Math.round(yr?.longest ?? 0),
      paceToday: goal ? Math.round((goal * doy) / daysInYear) : null,
      perWeekNeeded: goal ? Math.max(0, Math.round((goal - km) / weeksLeft)) : null,
      last4wPerWeek: Math.round((last4?.km ?? 0) / 4),
      projection: Math.round(km + ((last4?.km ?? 0) / 28) * (daysInYear - doy)),
    },
    week,
  });
});

/** výpočty jako v TrainingPeaks: splnění plánu, 80/20, kondice k cíli, Efficiency Factor, monotónnost a strain */
async function analyticsOf(env: Env, ctx: Awaited<ReturnType<typeof loadCtx>>) {
  const T = ctx.T;
  const [plans, reviews] = await Promise.all([
    all<any>(env.DB, "SELECT date, kind, name, duration_min, target_load, status FROM planned_workouts WHERE date >= ? AND date <= ? ORDER BY date", addDays(T, -28), T),
    all<{ week_from: string; data: string }>(env.DB, "SELECT week_from, data FROM weekly_reviews ORDER BY week_from DESC LIMIT 8"),
  ]);
  const comp = compliance(plans, ctx.acts as any, T);
  const weeks = weeklyCompliance(reviews.map((x) => { try { return { week_from: x.week_from, data: JSON.parse(x.data) }; } catch { return { week_from: x.week_from, data: null }; } }));
  const last = ctx.metrics.find((m) => m.date === T) ?? ctx.metrics[ctx.metrics.length - 1];
  return {
    compliance: { ...comp, weeks },
    intensity: { weeks: intensityWeeks(ctx.acts as any, T), verdict: intensityVerdict(ctx.acts as any, T) },
    ctlPlan: ctlPlan(last?.ctl ?? null, ctx.s.goal_ctl ?? null, ctx.s.goal_date, T),
    ef: efficiency(ctx.acts as any, (d) => zonesFor(ctx.zh, d, ctx.s).ftp),
    monotony: monotonyWeeks(ctx.metrics.map((m) => ({ date: m.date, load: m.load })), T),
  };
}
/** krátké postřehy pro trenéra (Trenér → Z čeho trenér vychází) */
function insightsOf(a: Awaited<ReturnType<typeof analyticsOf>>) {
  const out: { tone: string; text: string }[] = [];
  const c = a.compliance;
  if (c.count >= 3 && c.loadPct != null && c.loadPct < 70) out.push({ tone: "warn", text: `Plán za 4 týdny splněný na ${c.loadPct} % – možná je moc těžký, zvaž lehčí cíl nebo méně tréninků.` });
  if (a.intensity.verdict && a.intensity.verdict.tone !== "good") out.push({ tone: a.intensity.verdict.tone, text: a.intensity.verdict.text });
  if (a.monotony.tone !== "good") out.push({ tone: a.monotony.tone, text: a.monotony.text });
  if (a.ctlPlan && a.ctlPlan.tone !== "good") out.push({ tone: a.ctlPlan.tone, text: a.ctlPlan.text });
  if (a.ef.trend != null && a.ef.trend <= -3) out.push({ tone: "warn", text: a.ef.text });
  return out;
}
api.get("/analytics", async (c) => c.json(await analyticsOf(c.env, await loadCtx(c.env))));

api.get("/coach", async (c) => {
  const ctx = await loadCtx(c.env);
  const r = await readiness(ctx);
  const ftp = ctx.s.ftp ?? 250;
  const T = ctx.T;
  const mon = mondayOf(T);
  const weekActs = ctx.acts.filter((a) => a.date >= mon && a.date <= addDays(mon, 6));
  const strength = await first<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM training_log WHERE kind = 'sila' AND date >= ?", mon);
  const moveDays = ctx.well.filter((w) => w.date >= mon && w.date <= T && (w.steps ?? 0) >= 5000).length;
  const longRide = weekActs.some((a) => isBike(a.sport) && (a.moving_s ?? 0) >= 90 * 60 && dow(a.date) >= 6);
  const longPlanned = r.plan.days.some((d) => d.date <= addDays(mon, 6) && dow(d.date) >= 6 && (d.durationMin ?? 0) >= 90);
  const pz = powerZones(ftp, ctx.s.power_zones_pct);
  // návrh změn vždy podle aktuálního plánu (počasí, úpravy, AI) – uložený starší návrh se nahradí
  let open = await openProposal(c.env);
  const key = (x: { date: string; action: string; name: string }) => `${x.date}|${x.action}|${x.name}`;
  const curCh = r.plan.changes ?? [];
  if ((open?.items.map(key).sort().join(";") ?? "") !== curCh.map(key).sort().join(";")) {
    const id = await saveProposal(c.env, "dashboard", curCh);
    open = id ? { id, items: curCh } : null;
  }
  const insights = await analyticsOf(c.env, ctx).then(insightsOf).catch(() => []);
  // posledních 7 tréninkových dnů (14 dní zpět): plán vs. skutečnost
  const recent: any[] = [];
  for (let k = 1; k <= 14 && recent.length < 7; k++) {
    const D = addDays(T, -k);
    const plan = ctx.calendar.find((x) => x.date === D && x.kind !== "rest" && x.status !== "skipped" && x.name) ?? null;
    const acts = ctx.acts.filter((a) => a.date === D && ((a.load ?? 0) >= 5 || (a.moving_s ?? 0) >= 900));
    const skipped = ctx.calendar.find((x) => x.date === D && x.status === "skipped") ?? null;
    if (!plan && !acts.length && !skipped) continue;
    const load = Math.round(acts.reduce((t, a) => t + (a.load ?? 0), 0));
    const comp = acts.map((a) => (a as any).icu_compliance).find((v) => v != null) ?? null;
    const ratio = plan?.target_load ? load / plan.target_load : null;
    const status = !plan ? (acts.length ? "extra" : "skipped")
      : !acts.length ? "missed"
      : (comp != null ? comp >= 80 : ratio == null || (ratio >= 0.8 && ratio <= 1.25)) ? "done" : "partial";
    recent.push({
      date: D, status, compliance: comp != null ? Math.round(comp) : null, load,
      plan: plan ? { name: plan.name, min: plan.duration_min, load: plan.target_load, kind: plan.kind } : skipped ? { name: skipped.name, min: skipped.duration_min, load: skipped.target_load, kind: skipped.kind } : null,
      acts: acts.map((a) => ({ id: a.id, name: a.name, sport: a.sport, moving_s: a.moving_s, load: Math.round(a.load ?? 0), q: !!a.is_quality })),
    });
  }
  // kalendář trenéra: 2 ukončené týdny + tento týden do včerejška – skutečnost po dnech a co bylo v plánu
  const W0 = mondayOf(T);
  const past: { date: string; acts: { id: string; sport: string; min: number; load: number; q: boolean; name: string | null }[]; plan: { name: string; min: number | null; kind: string } | null }[] = [];
  for (let d = addDays(W0, -14); d < T; d = addDays(d, 1)) {
    const acts = ctx.acts.filter((a) => a.date === d && ((a.load ?? 0) >= 5 || (a.moving_s ?? 0) >= 900));
    const pl = ctx.calendar.find((x) => x.date === d && x.kind !== "rest" && x.name) ?? null;
    past.push({ date: d, acts: acts.map((a) => ({ id: a.id, sport: a.sport, min: Math.round((a.moving_s ?? 0) / 60), load: Math.round(a.load ?? 0), q: !!a.is_quality, name: a.name ?? null })), plan: pl ? { name: pl.name, min: pl.duration_min ?? null, kind: pl.kind } : null });
  }
  const pastWeeks = [-14, -7].map((o) => {
    const ws = addDays(W0, o);
    const load = Math.round(ctx.acts.filter((a) => a.date >= ws && a.date < addDays(ws, 7)).reduce((t, a) => t + (a.load ?? 0), 0));
    const m = ctx.metrics.find((x) => x.date === addDays(ws, 6));
    return { weekStart: ws, load, ctlEnd: m ? Math.round(m.ctl * 10) / 10 : null };
  });
  return c.json({
    insights,
    recent,
    past,
    pastWeeks,
    // čas v zónách za 28 dní (součet aktivit) – graf v „Z čeho trenér vychází“
    zones28: zones28(ctx.acts as any, T),
    readiness: r,
    // graf tréninku: % FTP kroků (watty) a zóny tepu (kroky podle tepu)
    ftp: ctx.s.ftp,
    floor: [
      { label: "Dlouhá jízda o víkendu (≥ 1:30)", done: longRide, planned: longPlanned },
      ...(ctx.s.floor_strength ? [{ label: "Síla 1× týdně", done: (strength?.n ?? 0) >= 1, planned: false, count: strength?.n ?? 0 }] : []),
      { label: "Pohyb 5 ze 7 dní (≥ 5 000 kroků)", done: moveDays >= 5, planned: false, count: moveDays },
    ],
    full: { rides: ctx.s.rides_per_week, quality: r.plan.qualityWeeks[0], target: r.plan.weeklyTarget, done: Math.round(weekActs.reduce((s, a) => s + (a.load ?? 0), 0)) },
    intensity: {
      ftp,
      targets: [
        { name: "Rozjetí, vyjetí, pauzy (Z1)", pct: TARGET_PCT.recovery, w: pctRange(ftp, TARGET_PCT.recovery) },
        { name: "Rozjetí před intervaly", pct: TARGET_PCT.warmupPre, w: pctRange(ftp, TARGET_PCT.warmupPre) },
        { name: "Z2 vytrvalost", pct: TARGET_PCT.z2, w: pctRange(ftp, TARGET_PCT.z2) },
        { name: "Sweet spot", pct: [88, 94], w: pctRange(ftp, [88, 94]) },
        { name: "Práh", pct: [95, 100], w: pctRange(ftp, [95, 100]) },
        { name: "VO2 (z křivky výkonu)", pct: [106, 120], w: pctRange(ftp, [106, 120]) },
      ],
      zones: pz,
    },
    proposal: open,
    // omezení od dneška dál (pro tlačítko „Vrátit“)
    constraints: ctx.constraints.filter((x) => x.date >= T && x.kind !== "sport" && x.kind !== "typ"),
    userTypes: ctx.constraints.filter((x) => x.date >= T && x.kind === "typ").map((x) => ({ date: x.date, note: x.note })),
    status: { ...statusOn(ctx.s, T), label: STATUS_LABEL[statusOn(ctx.s, T).kind as StatusKind] },
    weeks: weekLoadsView(ctx, r.plan),
    goalLabel: GOAL_LABEL[ctx.s.goal as Goal],
    goal: ctx.s.goal,
    goals: goalsView(ctx, r.plan),
    coach: (r.plan as { coach?: unknown }).coach ?? null,
    eftp: eftpOf(ctx),
    ftpCheck: ftpCheckOf(ctx, await getState<string>(c.env.DB, "ftp_set_at")),
  });
});

type CtxT = Awaited<ReturnType<typeof loadCtx>>;

/** Cíle s konkrétními čísly pro dnešní kondici – ať je vidět rozdíl mezi Zlepšit / Udržet / Pokles. */
function goalsView(ctx: CtxT, plan: Awaited<ReturnType<typeof planFor>>) {
  const co = (plan as { coach?: { hours: number; keys: number; keepLoad: number; recentLoad: number } }).coach;
  const t = plan.weeklyTarget;
  const now = co ? ` Tento týden: ${String(co.hours).replace(".", ",")} h, zátěž ${t.lo}–${t.hi}, kvalita ${co.keys}×.` : "";
  const g = (key: Goal, label: string, text: string) => ({ key, label, lo: t.lo, hi: t.hi, text: text + (ctx.s.goal === key ? now : "") });
  return [
    g("zvyseni", "Zlepšit", "Zátěž týdne se počítá z kondice tak, aby rostla o 3 body týdně (nad kondicí 45 o 4) – bezpečná hrana podle TrainingPeaks a Friela. 3 týdny přidává, 4. je lehčí (o 40–50 % méně). Kvality těžknou, když je zvládáš."),
    g("udrzeni", "Udržet", "Zátěž týdne = 7 × kondice, tedy tolik, aby kondice zůstala. Kvality zůstávají stejně těžké, jen se střídají."),
    g("pokles", "Zima", "Mimo sezónu: kondice klesá k zimnímu základu (vrchol sezóny − 42,5 %, trenéři uvádějí 30–40 %), hned po sezóně rychleji, u základu se zastaví a drží. Zimní délky: Z2 i dlouhá do 2 h. Jedna lehčí kvalita týdně drží intenzitu."),
    g("zavod", "Závod", `Příprava na ${ctx.s.goal_name || "závod"}${ctx.s.goal_date ? ` (${dm(ctx.s.goal_date)})` : ""}: Základ, pak Rozvoj a posledních 10–14 dní ladění.`),
  ];
}

/** Zátěž po týdnech: 4 ukončené týdny, tento týden (hotovo + plán) a příští (plán), s cílovým pásmem. */
function weekLoadsView(ctx: CtxT, plan: Awaited<ReturnType<typeof planFor>>) {
  const mon = mondayOf(ctx.T);
  const doneToday = ctx.acts.some((a) => a.date === ctx.T);
  const sum = (from: string, to: string) => Math.round(ctx.acts.filter((a) => a.date >= from && a.date <= to).reduce((s, a) => s + (a.load ?? 0), 0));
  const future = (d: string) => d > ctx.T || (d === ctx.T && !doneToday);
  const out: { from: string; done: number; planned: number; current: boolean; future: boolean; sessions: number }[] = [];
  for (let w = -4; w <= 1; w++) {
    const f = addDays(mon, 7 * w), t = addDays(f, 6);
    const pDays = plan.days.filter((d) => d.date >= f && d.date <= t && future(d.date));
    const done = w <= 0 ? sum(f, t) : 0;
    const sessions = new Set(ctx.acts.filter((a) => a.date >= f && a.date <= t && (a.moving_s ?? 0) >= 20 * 60).map((a) => a.date)).size + pDays.filter((d) => d.name).length;
    out.push({ from: f, done, planned: Math.round(pDays.reduce((s, d) => s + (d.load ?? 0), 0)), current: w === 0, future: w > 0, sessions });
  }
  return { weeks: out, target: plan.weeklyTarget };
}

/**
 * Průběh aktivity (tep, výkon, výška, rychlost) zmenšený na ~600 bodů, cache v KV.
 * Zdroj intervals.icu, u starších aktivit (intervals.icu je nemá) Garmin. Navíc 1. vs. 2. polovina a hranice zón pro barvy.
 */
api.get("/activity/:id/streams", async (c) => {
  const id = c.req.param("id");
  // ?from=&to= (s od startu): výřez úseku v plném rozlišení (okruh / interval), jinak celá aktivita po ~600 bodech
  const fromQ = Number(c.req.query("from")), toQ = Number(c.req.query("to"));
  const part = c.req.query("from") != null && isFinite(fromQ) && isFinite(toQ) && toQ > fromQ;
  const key = `streams:v5:${id}${part ? `:${Math.round(fromQ)}-${Math.round(toQ)}` : ""}`;
  const cached = await c.env.KV.get(key, "json");
  if (cached) return c.json(cached);
  const row = await first<{ icu_id: string | null; date: string }>(c.env.DB, "SELECT icu_id, date FROM activities WHERE id = ?", id);
  if (!row) return c.json({ error: "Aktivitu nemám." }, 404);
  let get: (t: string) => (number | null)[] | null;
  // hlavní zdroj Garmin (všechny kanály vč. kadence, teploty, dechu, výkonnostního stavu a trasy, celá historie)
  let src = "Garmin";
  // výřez úseku: plné rozlišení Garminu (1 bod za sekundu), celá aktivita ~1500 bodů
  const g = await new GarminClient(c.env).activityStreams(id, part ? 100000 : 1500).catch(() => null);
  if (g && (g.time?.length ?? 0) > 10) {
    get = (t) => g[t] ?? null;
  } else if (row.icu_id) {
    const icu = new IntervalsClient(c.env);
    const raw = await icu.req<{ type: string; data: (number | null)[] }[]>("GET", `/activity/${row.icu_id}/streams?types=time,watts,heartrate,altitude,velocity_smooth,distance,cadence,temp,respiration`);
    const alias: Record<string, string> = { resp: "respiration" };
    get = (t) => raw.find((s) => s.type === (alias[t] ?? t))?.data ?? null;
    src = "intervals.icu";
  } else return c.json({ error: "Průběh nemám (ani v Garminu, ani v intervals.icu)." }, 404);
  let time = get("time") ?? [];
  if (part) {
    const i0 = time.findIndex((v) => v != null && v >= fromQ - 1);
    let i1 = time.length - 1;
    while (i1 > 0 && (time[i1] == null || time[i1]! > toQ + 1)) i1--;
    if (i0 < 0 || i1 - i0 < 3) return c.json({ error: "Úsek je mimo průběh." }, 404);
    const base = get;
    get = (t) => { const a = base(t); return a ? a.slice(i0, i1 + 1) : null; };
    time = time.slice(i0, i1 + 1);
  }
  const n = time.length;
  // úsek: do ~30 min po 1 s, delší po 2 s; celá aktivita ~600 bodů
  const step = part ? Math.max(1, Math.ceil(n / 1800)) : Math.max(1, Math.ceil(n / 600));
  const pick = (arr: (number | null)[] | null, dec = 0) => {
    if (!arr) return null;
    const out: (number | null)[] = [];
    for (let i = 0; i < n; i += step) {
      let s = 0, k = 0;
      for (let j = i; j < Math.min(n, i + step); j++) if (arr[j] != null) { s += arr[j]!; k++; }
      out.push(k ? Math.round((s / k) * 10 ** dec) / 10 ** dec : null);
    }
    return out;
  };
  const spd = get("velocity_smooth");
  // zóny platné v den aktivity (stará jízda se barví podle tehdejšího FTP, ne dnešního)
  const s0 = await getSettings(c.env.DB);
  const zd = zonesFor(await loadZoneHistory(c.env.DB), row.date, s0);
  const s = { ...s0, hr_zones: zd.hr };
  const ftp = zd.ftp ?? 250;
  const out = {
    src,
    t: pick(time),
    dist: pick(get("distance")),
    watts: pick(get("watts")),
    hr: pick(get("heartrate")),
    alt: pick(get("altitude"), 1),
    speed: spd ? pick(spd.map((v) => (v == null ? null : v * 3.6)), 1) : null,
    cad: pick(get("cadence")),
    temp: pick(get("temp"), 1),
    resp: pick(get("resp"), 1),
    perf: pick(get("perf")),
    halves: halvesOf(time, get("heartrate"), get("watts"), spd),
    splits: { 1: splitsOf(time, get, 1000), 5: splitsOf(time, get, 5000), 10: splitsOf(time, get, 10000) },
    route: part ? null : routeOf(get("polyLat"), get("polyLon"), get("lat"), get("lon"), spd, get("heartrate"), get("watts"), get("altitude")),
    // hranice zón pro barvy grafu: tep = dolní hranice Z2..Z5, výkon = horní hranice Z1..Z6 (W)
    hrFloors: s.hr_zones?.floors?.slice(1) ?? null,
    pwrTops: (s.power_zones_pct ?? [55, 75, 90, 105, 120, 150]).map((p) => Math.round((ftp * p) / 100)),
  };
  await c.env.KV.put(key, JSON.stringify(out), { expirationTtl: 30 * 86400 });
  return c.json(out);
});

/** Ruční okruhy po `every` metrech z plného průběhu: čas, rychlost, tep, výkon, převýšení. */
function splitsOf(time: (number | null)[], get: (t: string) => (number | null)[] | null, every: number) {
  const dist = get("distance");
  if (!dist) return null;
  const total = Math.max(0, ...dist.filter((x): x is number => x != null));
  if (total < every * 1.2 || total / every > 400) return null;
  const hr = get("heartrate"), w = get("watts"), alt = get("altitude"), cad = get("cadence");
  const out: { km: number; dist: number; s: number; kmh: number; hr: number | null; w: number | null; cad: number | null; up: number }[] = [];
  let startI = 0, next = every;
  const flush = (endI: number, d: number) => {
    const t = (time[endI] ?? 0) - (time[startI] ?? 0);
    if (t <= 0) return;
    let hs = 0, hn = 0, ws = 0, wn = 0, cs = 0, cn = 0, up = 0;
    for (let i = startI + 1; i <= endI; i++) {
      const dt = Math.max(0, Math.min(30, (time[i] ?? 0) - (time[i - 1] ?? 0)));
      if (hr?.[i] != null) { hs += hr[i]! * dt; hn += dt; }
      if (w?.[i] != null) { ws += w[i]! * dt; wn += dt; }
      if (cad?.[i] != null && cad[i]! > 0) { cs += cad[i]! * dt; cn += dt; }
      if (alt?.[i] != null && alt[i - 1] != null && alt[i]! > alt[i - 1]!) up += alt[i]! - alt[i - 1]!;
    }
    out.push({ km: Math.round(next / 100) / 10, dist: Math.round(d), s: Math.round(t), kmh: Math.round((d / t) * 36) / 10, hr: hn ? Math.round(hs / hn) : null, w: wn ? Math.round(ws / wn) : null, cad: cn ? Math.round(cs / cn) : null, up: Math.round(up) });
  };
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    if (d == null) continue;
    if (d >= next) {
      flush(i, d - (dist[startI] ?? 0));
      startI = i;
      next += every;
    }
  }
  const lastD = (dist[dist.length - 1] ?? 0) - (dist[startI] ?? 0);
  if (lastD > 200) { next = total; flush(dist.length - 1, lastD); }
  return out;
}

/** Trasa pro mapu: [[lat, lon, km/h, tep, W, m n. m.], …] max. ~800 bodů (hodnoty průměr úseku, výkon vyhlazený). */
type Arr = (number | null)[] | null;
function routeOf(pLat: Arr, pLon: Arr, lat: Arr, lon: Arr, spd: Arr, hr: Arr, w: Arr, alt: Arr) {
  const useStream = lat && lon && lat.some((x) => x != null);
  const A = useStream ? lat! : pLat, B = useStream ? lon! : pLon;
  if (!A || !B || !A.some((x) => x != null && x !== 0)) return null;
  const n = A.length, step = Math.max(1, Math.ceil(n / 800));
  // průměr přes okno kolem bodu (výkon kolísá → širší okno)
  const avg = (arr: Arr, i: number, half: number, k = 1) => {
    if (!useStream || !arr) return null;
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) if (arr[j] != null) { s += arr[j]!; c++; }
    return c ? Math.round((s / c) * k) / (k === 36 ? 10 : 1) : null;
  };
  const half = Math.max(1, Math.floor(step / 2));
  const out: [number, number, number | null, number | null, number | null, number | null][] = [];
  for (let i = 0; i < n; i += step) {
    if (A[i] == null || B[i] == null || (A[i] === 0 && B[i] === 0)) continue;
    out.push([Math.round(A[i]! * 1e5) / 1e5, Math.round(B[i]! * 1e5) / 1e5, avg(spd, i, half, 36), avg(hr, i, half), avg(w, i, Math.max(5, half)), avg(alt, i, 0)]);
  }
  return out.length > 2 ? out : null;
}

/** 1. vs. 2. polovina času v pohybu: průměrný tep, výkon, rychlost a decoupling (Pw:HR, bez výkonu rychlost:HR). */
function halvesOf(time: (number | null)[], hr: (number | null)[] | null, w: (number | null)[] | null, spd: (number | null)[] | null) {
  if (!hr || time.length < 60) return null;
  const n = time.length;
  // jen úseky v pohybu (rychlost > 1 m/s, bez rychlosti výkon > 0)
  const moving = (i: number) => (spd ? (spd[i] ?? 0) > 1 : w ? (w[i] ?? 0) > 0 : true);
  const dts: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const dt = i ? Math.min(10, Math.max(0, (time[i] ?? 0) - (time[i - 1] ?? 0))) : 1;
    const v = moving(i) && hr[i] != null ? dt : 0;
    dts.push(v);
    total += v;
  }
  if (total < 20 * 60) return null;
  const acc = [0, 1].map(() => ({ t: 0, hr: 0, w: 0, wt: 0, s: 0, st: 0 }));
  let run = 0;
  for (let i = 0; i < n; i++) {
    const dt = dts[i]!;
    if (!dt) continue;
    const h = run < total / 2 ? acc[0]! : acc[1]!;
    run += dt;
    h.t += dt;
    h.hr += hr[i]! * dt;
    if (w && w[i] != null) { h.w += w[i]! * dt; h.wt += dt; }
    if (spd && spd[i] != null) { h.s += spd[i]! * 3.6 * dt; h.st += dt; }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const hrA = acc.map((h) => r1(h.hr / h.t));
  const wA = w && acc.every((h) => h.wt > 0 && h.w > 0) ? acc.map((h) => Math.round(h.w / h.wt)) : null;
  const sA = spd && acc.every((h) => h.st > 0) ? acc.map((h) => r1(h.s / h.st)) : null;
  const ef = wA ? wA.map((x, i) => x / hrA[i]!) : sA ? sA.map((x, i) => x / hrA[i]!) : null;
  const dec = ef && ef[0]! > 0 ? r1(((ef[0]! - ef[1]!) / ef[0]!) * 100) : null;
  return { hr: hrA, w: wA, spd: sA, ef: ef ? ef.map((x) => Math.round(x * 1000) / 1000) : null, dec, by: wA ? "power" : "speed" };
}

/** Den po hodinách: tep po 2 min a energie (vlastní výpočet z energy_day; bez něj klíčové body Body Battery z Garminu). */
api.get("/day", async (c) => {
  const ctx = await loadCtx(c.env);
  const date = c.req.query("date") ?? ctx.T;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "bad date" }, 400);
  const key = `day:v3:${date}`;
  // energie se čte vždy čerstvá z D1 (přepočet každých 15 min), cache je jen pro data z Garminu
  const en = await first<{ data: string }>(c.env.DB, "SELECT data FROM energy_day WHERE date = ?", date);
  const energy = (() => { try { return en ? JSON.parse(en.data) : null; } catch { return null; } })();
  const withSnaps = (o: any) => energy
    ? { ...o, bb: energy.pts, bbEvents: energy.events, bbCharged: energy.charged, bbDrained: energy.drained, stressSeries: energy.stress, restSpans: energy.rest, energySource: "vypocet" }
    : { ...o, bb: o.bbKey ?? [], stressSeries: [], restSpans: [], energySource: "garmin" };
  const cached = await c.env.KV.get(key, "json");
  if (cached) return c.json(withSnaps(cached));
  const g = new GarminClient(c.env);
  const [hr, bb, hrvN, stress, acts] = await Promise.all([
    g.dailyHeartRate(date).catch(() => null),
    g.bodyBatteryDay(date).catch(() => null),
    g.hrvNight(date).catch(() => []),
    g.stressDay(date).catch(() => null),
    all<{ id: string; name: string | null; sport: string; start_local: string; duration_s: number | null; moving_s: number | null; distance_m: number | null; calories: number | null; load: number | null }>(c.env.DB, "SELECT id, name, sport, start_local, duration_s, moving_s, distance_m, calories, load FROM activities WHERE date = ? ORDER BY start_local", date),
  ]);
  const s = ctx.s;
  const out = {
    date,
    hr: hr?.values ?? [],
    hrRest: hr?.rest ?? null,
    hrMin: hr?.min ?? null,
    hrMax: hr?.max ?? null,
    hrFloors: s.hr_zones?.floors ?? null,
    bbKey: bb?.values ?? [],
    bbEvents: bb?.events ?? [],
    bbCharged: bb?.charged ?? null,
    bbDrained: bb?.drained ?? null,
    hrvNight: hrvN,
    stress,
    acts,
    tzOffsetMin: tzOffsetMin(c.env.TZ_NAME, date),
  };
  await c.env.KV.put(key, JSON.stringify(out), { expirationTtl: date === ctx.T ? 900 : 7 * 86400 });
  return c.json(withSnaps(out));
});

/**
 * Přehled zátěže jako v Garmin Connect: denní součet bodů zátěže Garminu (activityTrainingLoad),
 * rozdělený podle hlavního přínosu aktivity, který určil Garmin (tréninkový efekt) – žádný vlastní odhad.
 */
const TE_CAT: Record<string, "low" | "high" | "ana"> = { RECOVERY: "low", AEROBIC_BASE: "low", TEMPO: "high", LACTATE_THRESHOLD: "high", VO2MAX: "high", ANAEROBIC_CAPACITY: "ana", SPEED: "ana" };
function loadDaysOf(ctx: Awaited<ReturnType<typeof loadCtx>>, days: number) {
  const out: { date: string; acts: { id: string; name: string | null; sport: string; load: number; garmin: boolean; cat: "low" | "high" | "ana" | "unknown"; te: string | null }[] }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(ctx.T, -i);
    const acts = ctx.acts.filter((a) => a.date === d).map((a) => {
      const extra = (() => { try { const x = (a as any).extra; return typeof x === "string" ? JSON.parse(x) : x ?? {}; } catch { return {}; } })();
      const te = (extra?.te_label as string | undefined) ?? null;
      // zátěž = TSS (stejné číslo v intervals.icu i Garminu), ne body zátěže Garminu (EPOC – jiná stupnice)
      const ld = a.load ?? 0;
      return { id: a.id, name: a.name, sport: a.sport, load: Math.round(ld), garmin: a.garmin_load != null, cat: (te && TE_CAT[te]) || ("unknown" as const), te };
    }).filter((a) => a.load > 0);
    out.push({ date: d, acts });
  }
  return out;
}

/** Křivka výkonu 1 s – 5 h z intervals.icu (42 dní, 90 dní, 1 rok), cache 6 h. */
api.get("/power-curve", async (c) => {
  const key = "pcurve:v1";
  const cached = await c.env.KV.get(key, "json");
  if (cached) return c.json(cached);
  const icu = new IntervalsClient(c.env);
  const r = await icu.req<{ list: { id: string; label: string; secs: number[]; values: number[] }[] }>("GET", `/athlete/${c.env.INTERVALS_ATHLETE_ID}/power-curves?type=Ride&curves=42d,90d,1y`);
  const want = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200, 10800, 14400];
  const curves = (r?.list ?? []).map((l) => {
    const m = new Map(l.secs.map((s, i) => [s, l.values[i]]));
    return { id: l.id, label: l.label, points: want.filter((s) => m.has(s)).map((s) => ({ secs: s, w: m.get(s) ?? null })) };
  });
  const s = await getSettings(c.env.DB);
  const out = { curves, ftp: s.ftp, weight: [...(await all<{ weight_kg: number }>(c.env.DB, "SELECT weight_kg FROM wellness WHERE weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1"))][0]?.weight_kg ?? null };
  await c.env.KV.put(key, JSON.stringify(out), { expirationTtl: 6 * 3600 });
  return c.json(out);
});

/** Jiný sport pro den (ride | run | xc_ski | walk | rest = volno) → přepočet návrhu. Ve dni volna přidá jednotku. */
api.post("/plan/sport", async (c) => {
  const { dates, sport } = (await c.req.json()) as { dates: string[]; sport: string };
  if (!Array.isArray(dates) || !dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) || !["ride", "run", "xc_ski", "walk", "rest"].includes(sport)) return c.json({ error: "bad input" }, 400);
  for (const d of dates) {
    // výběr sportu ve dni „nepojedu / nemůžu“ = rozmyslel jsem si to → omezení zrušit
    if (sport !== "rest") for (const k of ["nepojedu", "nemuzu", "dovolena"]) await removeConstraint(c.env, d, k);
    await addConstraint(c.env, d, "sport", sport);
  }
  const ctx = await loadCtx(c.env);
  const p = await planFor(ctx);
  const id = await saveProposal(c.env, "dashboard", p.changes);
  return c.json({ id, changes: p.changes });
});

api.get("/activities", async (c) => {
  const q = c.req.query("days") ?? "60";
  const days = q === "all" ? 36500 : Math.min(36500, Number(q) || 60);
  const rows = await all<any>(c.env.DB, "SELECT id, date, start_local, sport, name, distance_m, moving_s, elev_gain, load, avg_hr, avg_power, np, is_quality, quality_type, json_extract(icu_event, '$.name') AS plan_name, icu_compliance, (SELECT company FROM activity_tags t WHERE t.activity_id = activities.id) AS company FROM activities WHERE date >= date('now', ?) ORDER BY start_local DESC", `-${days} days`);
  return c.json(rows);
});

api.get("/activity/:id", async (c) => {
  const ctx = await loadCtx(c.env);
  let a = ctx.acts.find((x) => x.id === c.req.param("id"));
  if (!a) {
    const r = await first<any>(c.env.DB, "SELECT * FROM activities WHERE id = ?", c.req.param("id"));
    if (!r) return c.json({ error: "not found" }, 404);
    const { parseAct } = await import("../report/context");
    a = parseAct(r);
  }
  const raw = a as unknown as { icu_pwhr_z2: number | null; icu_pwhr_z2_min: number | null; icu_decoupling: number | null };
  const floors = zonesFor(ctx.zh, a.date, ctx.s).hr?.floors;
  const z2Top = floors && floors.length > 2 ? floors[2]! - 1 : null;
  const z2Power = raw?.icu_pwhr_z2 && z2Top ? { w: Math.round(raw.icu_pwhr_z2 * z2Top), hr: z2Top, ratio: Math.round(raw.icu_pwhr_z2 * 100) / 100, min: raw.icu_pwhr_z2_min } : null;
  const { gear, links } = await loadGear(c.env.DB);
  const gearId = resolveGear(a as any, gear, links);
  const extra = (() => { try { return typeof (a as any).extra === "string" ? JSON.parse((a as any).extra) : (a as any).extra ?? null; } catch { return null; } })();
  const tag = await first<{ company: string | null; rpe: number | null }>(c.env.DB, "SELECT company, rpe FROM activity_tags WHERE activity_id = ?", a.id).catch(() => null);
  const company = tag?.company ?? null;
  const rep = activityReport(ctx, a);
  if (company) {
    // společná jízda: tempo určuje skupina (dotahování, kopce, střídání) → přetažená Z2 není chyba plánu ani tvoje
    const who = company === "skupina" ? "ve skupině" : `s ${company}`;
    rep.goal = rep.goal.replace("Jízda byla nad záměrem Z2, část času mimo Z2.", `Jízda byla nad záměrem Z2 – jel jsi ${who}, tempo určovala skupina, takže to je v pořádku. Zátěž se počítá normálně.`);
    if (!rep.goal.includes("jel jsi")) rep.goal += a.sport === "run" ? ` 👥 Běh ${who}.` : ` 👥 Jízda ${who}.`;
  }
  return c.json({
    ...rep, company, rpe: tag?.rpe ?? null, id: a.id, sport: a.sport, hasStreams: (a.moving_s ?? 0) > 60, strain: a.icu_strain, calories: a.calories, drift: a.drift, icuDecoupling: raw?.icu_decoupling ?? null, z2Power,
    extra, aerobicTe: (a as any).aerobic_te ?? null, avgPower: a.avg_power ?? null, np: a.np ?? null, avgCad: a.avg_cad, minTemp: a.min_temp, maxTemp: a.max_temp, elevGain: a.elev_gain, distance: a.distance_m, moving: a.moving_s,
    gear: { id: gearId, manual: links.has(a.id), list: gear.filter((g) => !g.to_date || g.to_date >= a.date).map((g) => ({ id: g.id, name: g.name, kind: g.kind })) },
  });
});

/** AI zhodnocení aktivity (2–3 věty, cache v KV). ?force=1 = napsat znovu. */
api.get("/activity/:id/ai", async (c) => {
  const id = c.req.param("id");
  const force = c.req.query("force") === "1";
  if (!force) {
    const hit = await c.env.KV.get<{ text: string; model: string | null }>(`actai:v1:${id}`, "json").catch(() => null);
    if (hit?.text) return c.json({ ...hit, cached: true });
    if (await c.env.KV.get(`actai:fail:${id}`).catch(() => null)) return c.json({ text: null, model: null });
  }
  const ctx = await loadCtx(c.env);
  let a = ctx.acts.find((x) => x.id === c.req.param("id"));
  if (!a) {
    const r = await first<any>(c.env.DB, "SELECT * FROM activities WHERE id = ?", c.req.param("id"));
    if (!r) return c.json({ error: "not found" }, 404);
    const { parseAct } = await import("../report/context");
    a = parseAct(r);
  }
  const { activityAiFor } = await import("../report/aiBackground");
  const out = await activityAiFor(c.env, ctx, a, force);
  return c.json(out ?? { text: null, model: null });
});

/** S kým jsem jel: {company: "skupina" | jméno | null} */
api.post("/activity/:id/company", async (c) => {
  const { company } = (await c.req.json()) as { company: string | null };
  const v = (company ?? "").trim().slice(0, 40);
  // řádek se nemaže – nese i hodnocení náročnosti (rpe)
  await c.env.DB.prepare("INSERT INTO activity_tags (activity_id, company, created_at) VALUES (?, ?, ?) ON CONFLICT(activity_id) DO UPDATE SET company = excluded.company").bind(c.req.param("id"), v || null, new Date().toISOString()).run();
  return c.json({ ok: true, company: v || null });
});

/** Hodnocení náročnosti (RPE 1–10, 0 = přeskočeno, null = smazat) – src/core/rpe.ts */
api.post("/activity/:id/rpe", async (c) => {
  const { rpe } = (await c.req.json()) as { rpe: unknown };
  if (!rpeOk(rpe)) return c.json({ error: "Hodnocení musí být 1–10 (0 = přeskočit)." }, 400);
  await c.env.DB.prepare("INSERT INTO activity_tags (activity_id, rpe, created_at) VALUES (?, ?, ?) ON CONFLICT(activity_id) DO UPDATE SET rpe = excluded.rpe").bind(c.req.param("id"), rpe, new Date().toISOString()).run();
  return c.json({ ok: true, rpe });
});

/** Na kterou aktivitu se po otevření stránky zeptat (jeden dotaz do D1). */
api.get("/rpe", async (c) => {
  const T = localNow(new Date(), c.env.TZ_NAME).date;
  const rows = await all<{ id: string; date: string; start_local: string | null; sport: string; name: string | null; moving_s: number | null; is_quality: number; rpe: number | null }>(c.env.DB, "SELECT a.id, a.date, a.start_local, a.sport, a.name, a.moving_s, a.is_quality, (SELECT rpe FROM activity_tags t WHERE t.activity_id = a.id) AS rpe FROM activities a WHERE a.date > ? AND a.date <= ?", addDays(T, -RPE_ASK_DAYS), T).catch(() => []);
  const a = rpeToAsk(rows, T);
  return c.json({ ask: a ? { id: a.id, date: a.date, sport: a.sport, name: a.name, min: Math.round((a.moving_s ?? 0) / 60), quality: !!a.is_quality } : null, labels: RPE_LABEL });
});

/** Měsíce: celá historie po sportech (počet, čas, km, převýšení, zátěž) – souhrn měsíce a graf 12 měsíců v Aktivitách. */
api.get("/months", async (c) => {
  const ctx = await loadCtx(c.env);
  const y = +ctx.T.slice(0, 4), m = +ctx.T.slice(5, 7);
  const back = (k: number) => { const t = y * 12 + (m - 1) - k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  // celá historie (výběr měsíce a roku v souhrnu), aspoň 24 měsíců kvůli grafu a srovnání s loňskem
  const firstD = (await first<{ d: string | null }>(c.env.DB, "SELECT MIN(date) AS d FROM activities"))?.d ?? ctx.T;
  const span = Math.max(23, (y - +firstD.slice(0, 4)) * 12 + (m - +firstD.slice(5, 7)));
  const months: string[] = [];
  for (let k = Math.min(span, 240); k >= 0; k--) months.push(back(k));
  const rows = await all<{ m: string; sport: string; n: number; s: number; km: number; up: number; load: number }>(c.env.DB,
    "SELECT substr(date, 1, 7) AS m, sport, COUNT(*) AS n, SUM(COALESCE(moving_s, 0)) AS s, SUM(COALESCE(distance_m, 0)) / 1000.0 AS km, SUM(COALESCE(elev_gain, 0)) AS up, SUM(COALESCE(load, 0)) AS load FROM activities WHERE date >= ? GROUP BY m, sport",
    `${months[0]}-01`);
  return c.json({
    today: ctx.T,
    months: months.map((mm) => ({ month: mm, sports: rows.filter((r) => r.m === mm).map((r) => ({ sport: r.sport, n: r.n, s: Math.round(r.s), km: Math.round(r.km * 10) / 10, up: Math.round(r.up), load: Math.round(r.load) })) })),
  });
});

api.get("/ride", async (c) => {
  const ctx = await loadCtx(c.env);
  const rows = await all<any>(c.env.DB, "SELECT id, date, mmp, max20, pwr_z, distance_m, moving_s, load, sport FROM activities WHERE date >= ? AND sport IN ('ride','mtb','indoor')", addDays(ctx.T, -365));
  const acts = rows.map((r) => ({ ...r, mmp: r.mmp ? JSON.parse(r.mmp) : null, pwr_z: null }));
  const secs = [5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  const curve = (from: number, to = 0) => secs.map((s) => ({ secs: s, ...(bestIn(acts, addDays(ctx.T, -from), addDays(ctx.T, -to), s) ?? { w: null, date: null }) }));
  const weeks: { from: string; km: number; h: number; load: number; n: number }[] = [];
  const mon = mondayOf(ctx.T);
  for (let i = 25; i >= 0; i--) {
    const f = addDays(mon, -7 * i);
    const t = addDays(f, 6);
    const w = acts.filter((a) => a.date >= f && a.date <= t);
    weeks.push({ from: f, km: Math.round(w.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000), h: Math.round(w.reduce((s, a) => s + (a.moving_s ?? 0), 0) / 360) / 10, load: Math.round(w.reduce((s, a) => s + (a.load ?? 0), 0)), n: w.length });
  }
  return c.json({ curve42: curve(41), curvePrev42: curve(83, 42), curve365: curve(364), weeks, ftp: ctx.s.ftp });
});

api.get("/recovery", async (c) => {
  const ctx0 = await loadCtx(c.env);
  const T0 = ctx0.T;
  // ?date= : kterýkoli den v historii – spánek té noci, normy z 60 dní před ním
  const T = pastDate(c.req.query("date"), T0);
  // vždy aspoň 150 dní: pásmo normy v grafu 90 dní potřebuje 30 dní před prvním dnem
  // ?hist=400 pro graf za rok (týdenní průměry + pásmo normy)
  const back = Math.min(400, Math.max(150, Number(c.req.query("hist") ?? 150) || 150)) - 90;
  const ctx = await withHistory(c.env, ctx0, T < addDays(T0, -back) ? T : addDays(T0, -back));
  const hist = ctx.well.filter((w) => w.date >= addDays(T, -60) && w.date < T);
  const n = (k: "hrv" | "rhr" | "sleep_s" | "sleep_score" | "sleep_resp" | "stress_avg" | "bb_max") => {
    const x = norm(hist.map((w) => w[k]));
    if (!x.n) return null;
    if (k === "sleep_resp") return { n: x.n, mean: Math.round(x.mean * 10) / 10, sd: Math.round(Math.max(x.sd, 0.6) * 10) / 10, q: 1 };
    return { n: x.n, mean: Math.round(x.mean * 10) / 10, sd: Math.round(x.sd * 10) / 10 };
  };
  const r = await readiness(ctx);
  return c.json({
    date: T,
    today: T0,
    minDate: await firstDay(c.env, T0),
    sleepGoal: ctx.s.sleep_goal_min ?? 480,
    rows: ctx.well.filter((w) => w.date <= T).map((w) => ({
      date: w.date, hrv: w.hrv, rhr: w.rhr, sleep_s: w.sleep_s, sleep_need: (w as any).sleep_need_min ?? null, sleep_score: w.sleep_score, sleep_score_g: w.sleep_score_g ?? null, bb_max: w.bb_max, bb_min: w.bb_min,
      bb_charged: w.bb_charged, bb_drained: w.bb_drained, stress: w.stress_avg, stress_max: w.stress_max,
      deep: w.deep_s, rem: w.rem_s, light: w.light_s, awake: w.awake_s, sleep_hr: w.sleep_hr, sleep_stress: w.sleep_stress, resp: w.sleep_resp,
      stress_dist: (() => { try { return w.stress_dist ? JSON.parse(w.stress_dist) : null; } catch { return null; } })(),
      load: Math.round(ctx.acts.filter((a) => a.date === w.date).reduce((s, a) => s + (a.load ?? 0), 0)),
    })),
    sleep: sleepReport((ctx.well.find((w) => w.date === T) ?? null) as any, ctx.well.filter((w) => w.date <= T) as any),
    norms: { hrv: n("hrv"), rhr: n("rhr"), sleep: n("sleep_s"), score: n("sleep_score"), resp: n("sleep_resp"), stress: n("stress_avg"), bb: n("bb_max") },
    // semafor i pro minulý den (stejný výpočet, jen k tomu datu)
    recovery: T === T0 ? r.recovery : recoveryFor({ ...ctx, T, well: ctx.well.filter((w) => w.date <= T) } as any),
    sleepReg: sleepRegularity(ctx.well.filter((w) => w.date >= addDays(T, -14)).map((w) => w.wake_time)),
  });
});

api.get("/fitness", async (c) => {
  const ctx = await loadCtx(c.env);
  const T = ctx.T;
  const fit = fitnessTable(ctx);
  const p = await planFor(ctx);
  const last = ctx.metrics[ctx.metrics.length - 1];
  const done = ctx.acts.some((a) => a.date === T);
  const startDate = done ? T : addDays(T, -1);
  const st = ctx.metrics.find((m) => m.date === startDate);
  // výhled z trenéra (4 týdny podle plánu); bez trenéra 7 dní z plánu
  const out = ((p as any).coach?.outlook?.days ?? []) as { date: string; load: number }[];
  const outBy = new Map(out.map((x) => [x.date, x.load]));
  const end = out.length ? out[out.length - 1]!.date : addDays(T, 7);
  const dates: string[] = [];
  for (let d = addDays(startDate, 1); d <= end; d = addDays(d, 1)) dates.push(d);
  const proj = st ? project({ ctl: st.ctl, atl: st.atl }, startDate, dates.map((d) => outBy.get(d) ?? p.days.find((x) => x.date === d)?.load ?? 0)) : [];
  const ytd = c.req.query("range") === "ytd";
  const metrics = ytd
    ? await all<any>(c.env.DB, "SELECT * FROM daily_metrics WHERE date >= ? AND date <= ? ORDER BY date", `${T.slice(0, 4)}-01-01`, startDate)
    : ctx.metrics.filter((m) => m.date >= addDays(T, -90) && m.date <= startDate);
  return c.json({ range: ytd ? "ytd" : "90", loadDays: loadDaysOf(ctx, 28), ftp: ctx.s.ftp, eftp: eftpOf(ctx), ftpCheck: ftpCheckOf(ctx, await getState<string>(c.env.DB, "ftp_set_at")), ftpSetAt: await getState<string>(c.env.DB, "ftp_set_at"), metrics, today: ctx.metrics.find((m) => m.date === T) ?? last, projection: proj, chart: p.chart, table: fit, last, loadPast7: p.loadPast7, loadNext7: p.loadNext7, target: p.weeklyTarget, warnings: p.warnings });
});

/** Porovnání kondice dvou roků: CTL/ATL/forma po dnech (zarovnané na den v roce) a součty od 1. 1. do stejného dne. */
api.get("/fitness-years", async (c) => {
  const ctx = await loadCtx(c.env);
  const T = ctx.T, cy = T.slice(0, 4);
  const years = (await all<{ y: string }>(c.env.DB, "SELECT DISTINCT substr(date, 1, 4) AS y FROM daily_metrics WHERE ctl IS NOT NULL ORDER BY y DESC")).map((r) => r.y).filter((y) => y !== cy);
  const y = /^\d{4}$/.test(c.req.query("y") ?? "") && years.includes(c.req.query("y")!) ? c.req.query("y")! : years[0] ?? null;
  const md = T.slice(5);
  const of = async (yy: string) => {
    const to = `${yy}-${md}`;
    const rows = await all<{ date: string; ctl: number | null; atl: number | null; form: number | null }>(c.env.DB, "SELECT date, ctl, atl, form FROM daily_metrics WHERE date >= ? AND date <= ? ORDER BY date", `${yy}-01-01`, `${yy}-12-31`);
    const sum = await first<{ n: number; s: number; km: number; up: number; load: number; bike: number }>(c.env.DB,
      "SELECT COUNT(*) AS n, SUM(COALESCE(moving_s, 0)) AS s, SUM(COALESCE(distance_m, 0)) / 1000.0 AS km, SUM(COALESCE(elev_gain, 0)) AS up, SUM(COALESCE(load, 0)) AS load, SUM(CASE WHEN sport IN ('ride','mtb','indoor') THEN COALESCE(distance_m, 0) ELSE 0 END) / 1000.0 AS bike FROM activities WHERE date >= ? AND date <= ?",
      `${yy}-01-01`, to);
    const upTo = rows.filter((r) => r.date <= to && r.ctl != null);
    const peak = upTo.reduce((b, r) => (r.ctl! > (b?.ctl ?? -1) ? r : b), null as (typeof rows)[number] | null);
    return { year: yy, rows: rows.map((r) => ({ md: r.date.slice(5), ctl: r.ctl, atl: r.atl, form: r.form })), atDay: upTo[upTo.length - 1] ?? null, peak: peak ? { date: peak.date, ctl: peak.ctl } : null,
      ytd: { n: sum?.n ?? 0, h: Math.round(((sum?.s ?? 0) / 3600) * 10) / 10, km: Math.round(sum?.km ?? 0), bikeKm: Math.round(sum?.bike ?? 0), up: Math.round(sum?.up ?? 0), load: Math.round(sum?.load ?? 0) } };
  };
  return c.json({ today: T, years, cur: await of(cy), cmp: y ? await of(y) : null });
});

/** Počasí na 3 dny po hodinách (stránka Počasí z Přehledu) + souřadnice pro Windy / Ventusky. */
/** místa pro stránku Počasí: domov (Nastavení) a hory */
const WX_PLACES: Record<string, { name: string; lat: number; lon: number }> = { cinovec: { name: "Cínovec", lat: 50.732, lon: 13.769 } };
/** modely: best = nejlepší mix Open-Meteo (výchozí, stejné jako v plánu), aladin = ČHMÚ ALADIN 1 km (3 dny) */
const WX_MODELS: Record<string, string | null> = { best: null, aladin: "chmi_aladin_seamless" };

/** Počasí na 3 dny po hodinách (stránka Počasí z Přehledu) + souřadnice; ?model=best|aladin, ?loc=home|cinovec. */
api.get("/weather-hours", async (c) => {
  const ctx = await loadCtx(c.env);
  const T = ctx.T, end = addDays(T, 3);
  const model = c.req.query("model") === "aladin" ? "aladin" : "best";
  const loc = WX_PLACES[c.req.query("loc") ?? ""] ? c.req.query("loc")! : "home";
  const homeLat = ctx.s.place_lat ?? (c.env.LAT ? Number(c.env.LAT) : null), homeLon = ctx.s.place_lon ?? (c.env.LON ? Number(c.env.LON) : null);
  const base = { today: T, nowHour: ctx.now.hh, model, loc, places: [{ key: "home", name: ctx.s.place_name || "Domov" }, ...Object.entries(WX_PLACES).map(([key, p]) => ({ key, name: p.name }))] };
  // výchozí (domov, nejlepší mix): data, která už má sync v databázi
  if (model === "best" && loc === "home") {
    return c.json({ ...base, place: ctx.s.place_name, lat: homeLat, lon: homeLon,
      hours: ctx.hours.filter((h) => h.time >= T && h.time < end),
      updatedAt: await getState<number>(c.env.DB, "weather_at"),
      sun: ((await getState<{ date: string; rise: string | null; set: string | null }[]>(c.env.DB, "weather_sun")) ?? []).filter((x) => x.date >= T && x.date < end) });
  }
  // jiný model nebo místo: přímo z Open-Meteo, v KV na 1 h
  const p = loc === "home" ? { name: ctx.s.place_name || "Domov", lat: homeLat, lon: homeLon } : WX_PLACES[loc]!;
  if (p.lat == null || p.lon == null) return c.json({ error: "Nemám polohu – zadej místo v Nastavení." }, 400);
  const key = `wxh:${model}:${p.lat}:${p.lon}:${T}`;
  let data = (await c.env.KV.get(key, "json").catch(() => null)) as { hours: any[]; sun: any[]; updatedAt: number } | null;
  if (!data) {
    const m = WX_MODELS[model];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
      "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_gusts_10m,wind_speed_10m,weather_code" +
      `&daily=sunrise,sunset&timezone=Europe%2FPrague&forecast_days=3&wind_speed_unit=kmh${m ? `&models=${m}` : ""}`;
    const r = await fetch(url).catch(() => null);
    if (!r || !r.ok) return c.json({ error: `Open-Meteo teď neodpovídá (${r?.status ?? "síť"}).` }, 502);
    const j = (await r.json()) as { hourly: Record<string, (number | null)[]> & { time: string[] }; daily?: { time: string[]; sunrise: string[]; sunset: string[] } };
    const h = j.hourly, g = (k: string, i: number) => h[k]?.[i] ?? null;
    data = {
      hours: h.time.map((t, i) => ({ time: t.slice(0, 13) + ":00", temp: g("temperature_2m", i), feels: g("apparent_temperature", i), precip_prob: g("precipitation_probability", i), precip: g("precipitation", i), gust: g("wind_gusts_10m", i), wind: g("wind_speed_10m", i), code: g("weather_code", i) })),
      sun: (j.daily?.time ?? []).map((d, i) => ({ date: d, rise: j.daily!.sunrise[i]?.slice(11, 16) ?? null, set: j.daily!.sunset[i]?.slice(11, 16) ?? null })),
      updatedAt: Date.now(),
    };
    await c.env.KV.put(key, JSON.stringify(data), { expirationTtl: 3600 }).catch(() => {});
  }
  return c.json({ ...base, place: p.name, lat: p.lat, lon: p.lon, hours: data.hours.filter((x) => x.time >= T && x.time < end), sun: data.sun, updatedAt: data.updatedAt });
});

api.get("/body", async (c) => {
  const rows = await all<any>(c.env.DB, "SELECT date, weight_kg, fitness_age, vo2max FROM wellness WHERE weight_kg IS NOT NULL OR fitness_age IS NOT NULL OR vo2max IS NOT NULL ORDER BY date");
  return c.json(rows);
});

/**
 * VO2max zvlášť pro běh a kolo. Garmin (přes intervals.icu) posílá jedno číslo za den, mění ho po běhu
 * (odhad z tempa a tepu) nebo po jízdě s wattmetrem → hodnotu dne přiřadíme sportu aktivity v ten den.
 */
api.get("/vo2", async (c) => {
  const rows = await all<{ date: string; vo2max: number; sports: string | null }>(
    c.env.DB,
    "SELECT w.date, w.vo2max, (SELECT GROUP_CONCAT(a.sport) FROM activities a WHERE a.date = w.date AND COALESCE(a.moving_s, 0) >= 600) AS sports FROM wellness w WHERE w.vo2max IS NOT NULL ORDER BY w.date",
  );
  // přednost má VO2max z FIT souboru aktivity (zvlášť kolo / běh, src/datasource/fitScan.ts)
  const fit = await all<{ date: string; sport: string; v: number }>(
    c.env.DB,
    "SELECT date, sport, vo2_fit AS v FROM activities WHERE vo2_fit IS NOT NULL ORDER BY date, start_local",
  ).catch(() => [] as { date: string; sport: string; v: number }[]);
  const byKey = new Map<string, { date: string; v: number; sport: string; src: string }>();
  for (const f of fit) {
    const sport = f.sport === "run" ? "run" : "ride";
    byKey.set(`${f.date}|${sport}`, { date: f.date, v: Math.round(f.v), sport, src: "fit" });
  }
  const fitDays = new Set(fit.map((f) => f.date));
  for (const r of rows) {
    if (fitDays.has(r.date)) continue;
    const sp = (r.sports ?? "").split(",");
    const bike = sp.some((x) => BIKE_SPORTS.includes(x as any));
    const run = sp.includes("run");
    const sport = run && !bike ? "run" : bike && !run ? "ride" : run && bike ? "both" : null;
    if (sport) byKey.set(`${r.date}|${sport}`, { date: r.date, v: r.vo2max, sport, src: "icu" });
  }
  const out = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  const lastOf = (k: string) => [...out].reverse().find((x) => x.sport === k) ?? null;
  return c.json({ rows: out, run: lastOf("run"), ride: lastOf("ride") });
});

api.get("/steps", async (c) => {
  const rows = await all<any>(c.env.DB, "SELECT date, steps, intensity_min, floors_up, floors_down FROM wellness WHERE steps IS NOT NULL AND date >= date('now', '-120 days') ORDER BY date");
  return c.json(rows);
});

api.get("/strength", async (c) => {
  const rows = await all<any>(c.env.DB, "SELECT date, kind, note FROM training_log WHERE date >= date('now', '-90 days') ORDER BY date DESC");
  const acts = await all<any>(c.env.DB, "SELECT date, sport, name, moving_s FROM activities WHERE sport IN ('strength','mobility') AND date >= date('now', '-90 days') ORDER BY date DESC");
  return c.json({ log: rows, garmin: acts });
});

/** Zápis síly / mobility (dnešek), poznámka volitelná. */
api.post("/strength", async (c) => {
  const { kind, note } = (await c.req.json().catch(() => ({}))) as { kind?: string; note?: string };
  if (kind !== "sila" && kind !== "mobilita") return c.json({ error: "bad input" }, 400);
  const T = localNow(new Date(), c.env.TZ_NAME).date;
  const n = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
  await c.env.DB.prepare("INSERT INTO training_log (date, kind, note, created_at) VALUES (?, ?, ?, ?)").bind(T, kind, n, new Date().toISOString()).run();
  return c.json({ ok: true });
});

/** Workout dne jako FIT soubor (bez intervals.icu: nahraje se kabelem do Garmin/NewFiles). */
api.get("/plan/fit", async (c) => {
  const date = c.req.query("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "bad input" }, 400);
  const ctx = await loadCtx(c.env);
  const cal = ctx.calendar.find((x) => x.date === date && x.status === "planned" && x.steps_json);
  let w = cal ? JSON.parse(cal.steps_json!) : null;
  let name = cal?.name ?? "";
  if (!w) {
    const p = await planFor(ctx);
    // podrobný plán (8 dní), jinak náhled z výhledu trenéra (4 týdny)
    const hzDays = ((p as { coach?: { horizon?: { days: { date: string; name: string | null; workout: unknown }[] }[] } }).coach?.horizon ?? []).flatMap((x) => x.days);
    const d = p.days.find((x) => x.date === date && x.workout) ?? hzDays.find((x) => x.date === date && x.workout);
    if (d?.workout) { w = d.workout; name = d.name ?? "Workout"; }
  }
  if (!w) return c.json({ error: "Na tento den žádný workout není." }, 404);
  const { encodeWorkoutFit } = await import("../plan/fit");
  return new Response(encodeWorkoutFit(name, w), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${date}-workout.fit"`, "Cache-Control": "no-store" } });
});

api.get("/fuel", async (c) => {
  const ctx = await loadCtx(c.env);
  const p = await planFor(ctx);
  const lastW = [...ctx.well].reverse().find((w) => w.weight_kg != null)?.weight_kg ?? 75;
  const rides = p.days.filter((d) => d.name).map((d) => {
    const temp = d.weather ? Math.round((d.weather.tmax + d.weather.tmin) / 2) : null;
    const fp = fuelPlan(d.durationMin ?? 60, d.indoor ? 20 : temp, lastW, d.kind === "quality" ? "quality" : "z2");
    return { date: d.date, label: dayDm(d.date), name: d.name, min: d.durationMin, carbs: d.carbs, fuel: fp };
  });
  const goalRide = fuelPlan(240, 15, lastW, "quality");
  return c.json({
    rides,
    table: [
      { dur: "do 60 min", carbs: "jen voda" },
      { dur: "1–2 h", carbs: "30–60 g/h" },
      { dur: "2–3 h", carbs: "60–90 g/h" },
    ],
    examples: [60, 90, 120, 150, 180].map((m) => ({ min: m, z2: carbsFor(m, "z2").text, quality: carbsFor(m, "quality").text })),
    goalRide: { name: ctx.s.goal_name, plan: goalRide },
    weight: lastW,
    hint: SWEAT_TEST_HINT,
    note: "Nic nového nezkoušej poprvé na cílové jízdě – výživu otestuj na tréninku.",
  });
});

api.get("/week", async (c) => {
  const ctx = await loadCtx(c.env);
  const from = c.req.query("from") ?? (dow(ctx.T) === 7 ? mondayOf(ctx.T) : addDays(mondayOf(ctx.T), -7));
  return c.json(await weekly(ctx, from));
});

api.get("/settings", async (c) => c.json(await getSettings(c.env.DB)));

/** Profil sportovce: osobní údaje, výkon, zóny wattů a tepu (kolo i běh), VO2max, trenér – src/report/profile.ts */
api.get("/profile", async (c) => {
  const ctx = await loadCtx(c.env);
  const { athleteProfile } = await import("../report/profile");
  return c.json(athleteProfile(ctx));
});
/** FTP a zóny s datem platnosti (Nastavení) */
/** Verze plánu (nejnovější první): kdy, proč a které dny se změnily – src/core/coach/versions.ts. */
api.get("/plan/versions", async (c) => {
  const rows = await all<{ id: number; created_at: string; week_start: string; reason: string; changes: string }>(c.env.DB, "SELECT id, created_at, week_start, reason, changes FROM plan_versions ORDER BY id DESC LIMIT 20").catch(() => []);
  return c.json(rows.map((r) => ({ id: r.id, at: r.created_at, week: r.week_start, reason: r.reason, changes: (() => { try { return JSON.parse(r.changes) as string[]; } catch { return []; } })() })));
});

api.get("/zones/history", async (c) => {
  const rows = await all<{ date: string; ftp: number | null; hr_zones: string | null; source: string | null }>(c.env.DB, "SELECT date, ftp, hr_zones, source FROM zone_history ORDER BY date").catch(() => []);
  return c.json(rows.map((r) => { let lthr: number | null = null; try { lthr = r.hr_zones ? JSON.parse(r.hr_zones).lthr ?? null : null; } catch { lthr = null; } return { date: r.date, ftp: r.ftp, lthr, source: r.source }; }));
});

/** API klíče: stav (bez hodnot), uložení šifrovaně, test připojení. */
api.get("/secrets", (c) => c.json(secretInfo(c.env)));
/** Veřejný klíč Mapy.com pro dlaždice v prohlížeči (bez klíče jen OpenStreetMap / CyclOSM / OpenTopoMap). */
api.get("/mapkey", (c) => c.json({ mapy: c.env.MAPY_API_KEY ?? null }));
api.post("/secrets", async (c) => {
  const { key, value } = (await c.req.json()) as { key: string; value: string | null };
  if (!(secretsFor(c.env) as readonly string[]).includes(key)) return c.json({ error: "bad key" }, 400);
  const v = (value ?? "").trim();
  if (!v) await c.env.DB.prepare("DELETE FROM app_secrets WHERE key = ?").bind(key).run();
  else {
    if (v.length > 500) return c.json({ error: "příliš dlouhé" }, 400);
    await c.env.DB.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, await encryptSecret(c.env, v), new Date().toISOString()).run();
  }
  if (key === "GARMIN_API_KEY") await c.env.KV.delete("garmin:token");
  invalidateSecrets();
  await applySecrets(c.env);
  return c.json({ ok: true, info: secretInfo(c.env) });
});
api.post("/secrets/test", async (c) => {
  const out: { garmin: string; intervals: string } = { garmin: "", intervals: "" };
  try { await new GarminClient(c.env).getToken(true); out.garmin = "✅ připojeno"; } catch (e) { out.garmin = `❌ ${(e as Error).message.slice(0, 120)}`; }
  try { const a = await new IntervalsClient(c.env).athlete(); out.intervals = `✅ ${a?.name ?? "připojeno"}`; } catch (e) { out.intervals = `❌ ${(e as Error).message.slice(0, 120)}`; }
  return c.json(out);
});

api.post("/settings", async (c) => {
  const body = (await c.req.json()) as Partial<Settings>;
  // profil trenéra má vlastní cestu s kontrolou (/coach/profile)
  const allowed = (Object.keys(DEFAULTS) as (keyof Settings)[]).filter((k) => k !== "coach_profile" && k !== "status_log");
  const before = await getSettings(c.env.DB);
  // povinné údaje (časy zpráv, místo, tréninky týdně, cíl) nesmí být prázdné ani ve špatném tvaru – null by
  // v plánovači zpráv spadl (hm(null)) a ranní / večerní zprávy by tiše přestaly chodit
  const bad = (k: keyof Settings, v: unknown): string | null => {
    if (k === "rides_per_week") return Number.isInteger(v) && (v as number) >= 2 && (v as number) <= 5 ? null : "tréninky týdně 2–5";
    if (k === "sleep_goal_min") return Number.isInteger(v) && (v as number) >= 360 && (v as number) <= 600 ? null : "cíl spánku 6:00–10:00";
    if (k === "place_name") return typeof v === "string" && v.trim() ? null : "místo nesmí být prázdné";
    if (k === "first_name") return typeof v === "string" && v.trim() && v.length <= 40 ? null : "jméno 1–40 znaků";
    if (k === "goal") return ["udrzeni", "zvyseni", "pokles", "zavod"].includes(v as string) ? null : "neznámý cíl";
    if (k === "goal_date") return v == null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? null : "datum cíle";
    if (k === "goal_ctl" || k === "ftp" || k === "year_km_goal") return v == null || (typeof v === "number" && isFinite(v) && v > 0) ? null : "kladné číslo";
    if (k === "llm_model") return typeof v === "string" && /^(auto|(google|nvidia|workers):[\w@./:-]{1,120})$/.test(v) ? null : "neznámý AI model";
    if (k === "ride_temps") { const t = v as any; return t && [t.cold, t.hot, t.ideal].every((x) => typeof x === "number" && isFinite(x)) ? null : "teploty musí být čísla"; }
    return null;
  };
  const errs = allowed.filter((k) => k in body).map((k) => bad(k, (body as any)[k])).filter(Boolean);
  if (errs.length) return c.json({ error: `Neuloženo: ${errs.join(", ")}.` }, 400);
  for (const k of allowed) if (k in body) await setSetting(c.env.DB, k, (body as any)[k]);
  const after = await getSettings(c.env.DB);
  // jiné místo pro počasí → dohledat souřadnice a předpověď stáhnout znovu
  if (after.place_name && before.place_name !== after.place_name) {
    const g = await geocode(after.place_name).catch(() => null);
    if (g) {
      await setSetting(c.env.DB, "place_lat", g.lat);
      await setSetting(c.env.DB, "place_lon", g.lon);
      await c.env.DB.prepare("DELETE FROM weather_hourly").run();
      await setState(c.env.DB, "weather_at", 0);
    }
  }
  if (before.ftp !== after.ftp) {
    await setState(c.env.DB, "ftp_manual", true);
    await setState(c.env.DB, "ftp_set_at", localNow(new Date(), c.env.TZ_NAME).date);
  }
  // jiný cíl spánku → přepočítat skóre a potřebu spánku v celé historii
  if (before.sleep_goal_min !== after.sleep_goal_min) await recomputeSleep(c.env.DB, after.sleep_goal_min);
  if (before.ftp !== after.ftp || JSON.stringify(before.hr_zones) !== JSON.stringify(after.hr_zones)) {
    await recordZones(c.env.DB, localNow(new Date(), c.env.TZ_NAME).date, after);
    await recomputeLoads(c.env.DB, after);
  }
  // změna cíle → hned přepočítat naplánované tréninky (návrh změn k potvrzení)
  let proposal: { id: number; count: number } | null = null;
  if (before.goal !== after.goal) {
    // AI doporučení byla pro starý cíl (délky, kvalita) → pryč, plán se postaví znovu podle nového cíle
    await c.env.DB.prepare("DELETE FROM constraints WHERE note LIKE 'ai:%' AND date >= ?").bind(localNow(new Date(), c.env.TZ_NAME).date).run();
    const p = await planFor(await loadCtx(c.env));
    proposal = { id: await saveProposal(c.env, "cil", p.changes), count: p.changes.length };
  }
  return c.json({ ...after, proposal });
});

api.get("/status", async (c) => {
  const keys = ["last_sync_ok", "watch_data_until", "bf_act", "bf_well", "metrics_day", "weather_at", "settings_refresh", "vo2_refresh", "analysis_since"];
  const st: Record<string, unknown> = {};
  for (const k of keys) st[k] = await getState(c.env.DB, k);
  const counts = await first<any>(c.env.DB, "SELECT (SELECT COUNT(*) FROM activities) acts, (SELECT MIN(date) FROM activities) a_from, (SELECT COUNT(*) FROM wellness) days, (SELECT COUNT(*) FROM wellness WHERE sleep_s IS NOT NULL) nights, (SELECT COUNT(*) FROM planned_workouts WHERE status='planned') planned");
  const logs = await all<any>(c.env.DB, "SELECT at, level, msg FROM events_log ORDER BY id DESC LIMIT 60");
  const m0 = (await modelChain(c.env).catch(() => []))[0];
  return c.json({ state: st, counts, logs, source: c.env.DATA_SOURCE, llm: !!(c.env.AI || c.env.GEMINI_API_KEY || c.env.NVIDIA_API_KEY), model: m0 ? `${m0.p}:${m0.model}` : c.env.LLM_MODEL });
});

api.post("/plan/propose", async (c) => {
  const ctx = await loadCtx(c.env);
  const p = await planFor(ctx);
  const id = await saveProposal(c.env, "dashboard", p.changes);
  return c.json({ id, changes: p.changes });
});

api.post("/proposal/:id/apply", async (c) => {
  const id = Number(c.req.param("id"));
  const { codes } = (await c.req.json()) as { codes: string[] };
  const p = await getProposal(c.env, id);
  if (!p || p.status !== "open" || !(await claimProposal(c.env, id))) return c.json({ error: "Návrh už neplatí nebo se právě zapisuje – platí jen poslední." }, 409);
  const items = p.items.filter((x) => codes.includes(x.code));
  try {
    const r = await applyChanges(c.env, items);
    await finishProposal(c.env, id, p.items.filter((x) => !codes.includes(x.code)));
    return c.json(r);
  } catch (e) {
    await finishProposal(c.env, id, null);
    throw e;
  }
});

api.post("/constraint", async (c) => {
  const { date, kind, note } = (await c.req.json()) as { date: string; kind: string; note?: string };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["nemuzu", "bezky", "nemoc", "dovolena", "nepojedu", "sport", "typ", "jizda", "delka", "trenazer"].includes(kind)) return c.json({ error: "bad input" }, 400);
  // neplatný sport nebo nesmyslná délka by rozbily plán (neznámý sport dřív shodil celý plán)
  const n = note == null ? null : String(note);
  if (!constraintNoteOk(kind, n)) return c.json({ error: "bad note" }, 400);
  await addConstraint(c.env, date, kind, n);
  return c.json({ ok: true, label: `${kind} ${dm(date)}` });
});

/** Vrácení omezení (např. omylem „Dnes nepojedu“) → omezení pryč a nový návrh plánu. */
api.delete("/constraint", async (c) => {
  const { date, kind } = (await c.req.json()) as { date: string; kind?: string | null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "bad input" }, 400);
  const n = await removeConstraint(c.env, date, kind ?? null);
  const p = await planFor(await loadCtx(c.env));
  const id = await saveProposal(c.env, "dashboard", p.changes);
  return c.json({ ok: true, removed: n, proposal: id });
});
