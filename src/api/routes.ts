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
import { all, first, getState } from "../lib/db";
import { dayDm, dm } from "../lib/format";
import { DEFAULTS, getSettings, setSetting, type Settings } from "../lib/settings";
import { addDays, dow, mondayOf } from "../lib/time";
import { addConstraint, applyChanges, getProposal, openProposal, saveProposal } from "../plan/proposals";
import { activityReport, fitnessTable, planFor, readiness, weatherMap, weekly } from "../report/build";
import { loadCtx } from "../report/context";
import { recomputeLoads } from "../sync/metrics";
import { verifyAccess } from "./access";
import { verifySession } from "./session";

export const api = new Hono<{ Bindings: Env }>();
const isBike = (s: string) => BIKE_SPORTS.includes(s as any);

api.use("*", async (c, next) => {
  const admin = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (c.env.ADMIN_TOKEN && admin && admin === c.env.ADMIN_TOKEN) return next();
  // 1) session z přihlášení přes Telegram, 2) Cloudflare Access JWT (pokud je nastavené)
  if (await verifySession(c.env, c.req.header("cookie"))) return next();
  const v = await verifyAccess(c.env, c.req.header("cf-access-jwt-assertion"));
  if (!v.ok) return c.json({ error: "login", message: "Nejsi přihlášený. Napiš botovi /dashboard a otevři odkaz, který ti pošle." }, 403);
  await next();
});

api.get("/overview", async (c) => {
  const ctx = await loadCtx(c.env);
  const T = ctx.T;
  const year = T.slice(0, 4);
  const yr = await first<{ km: number; n: number }>(c.env.DB, "SELECT SUM(distance_m)/1000.0 AS km, COUNT(*) AS n FROM activities WHERE date >= ? AND sport IN ('ride','mtb','indoor')", `${year}-01-01`);
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
  const wm = weatherMap(ctx, T, 3);
  return c.json({
    name: ctx.s.first_name,
    hour: ctx.now.hh,
    date: T,
    lastSync: ctx.lastSyncOk,
    goalLabel: GOAL_LABEL[ctx.s.goal as Goal],
    goal: { name: ctx.s.goal_name, date: ctx.s.goal_date, daysLeft: ctx.s.goal_date ? Math.round((Date.parse(ctx.s.goal_date) - Date.parse(T)) / 86400_000) : null },
    yearKm: {
      year, km, goal, rides: yr?.n ?? 0,
      paceToday: goal ? Math.round((goal * doy) / daysInYear) : null,
      perWeekNeeded: goal ? Math.max(0, Math.round((goal - km) / weeksLeft)) : null,
      last4wPerWeek: Math.round((last4?.km ?? 0) / 4),
      projection: Math.round(km + ((last4?.km ?? 0) / 28) * (daysInYear - doy)),
    },
    week,
    weather: [...wm.entries()].map(([d, w]) => ({ date: d, label: d === T ? "Dnes" : dayDm(d), w })),
    vitals: {
      state: r.recovery.state, label: r.recovery.stateLabel, emoji: r.recovery.emoji,
      hrv: r.recovery.hrv.today, hrvRating: r.recovery.hrv.rating, hrvRange: r.recovery.hrv.rangeText,
      rhr: r.recovery.rhr.today, rhrRating: r.recovery.rhr.rating,
      sleep: r.recovery.sleep.today, sleepScore: r.recovery.sleep.score, sleepRating: r.recovery.sleep.rating,
      bb: r.extras.bb, stress: r.extras.stress, steps: r.extras.steps,
    },
    form: { ctl: r.fitness.ctl, form: r.fitness.form, zone: r.fitness.form != null ? formZone(r.fitness.form) : null },
  });
});

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
  const open = await openProposal(c.env);
  return c.json({
    readiness: r,
    floor: [
      { label: "Dlouhá jízda o víkendu (≥ 1:30)", done: longRide, planned: longPlanned },
      { label: "Síla 1× týdně", done: (strength?.n ?? 0) >= 1, planned: false, count: strength?.n ?? 0 },
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
    goalLabel: GOAL_LABEL[ctx.s.goal as Goal],
    goal: ctx.s.goal,
  });
});

api.get("/activities", async (c) => {
  const days = Math.min(400, Number(c.req.query("days") ?? 60));
  const rows = await all<any>(c.env.DB, "SELECT id, date, start_local, sport, name, distance_m, moving_s, elev_gain, load, avg_hr, np, is_quality FROM activities WHERE date >= date('now', ?) ORDER BY start_local DESC", `-${days} days`);
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
  return c.json(activityReport(ctx, a));
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
  const ctx = await loadCtx(c.env);
  const T = ctx.T;
  const hist = ctx.well.filter((w) => w.date >= addDays(T, -60) && w.date < T);
  const n = (k: "hrv" | "rhr" | "sleep_s" | "sleep_score") => {
    const x = norm(hist.map((w) => w[k]));
    return x.n ? { n: x.n, mean: Math.round(x.mean * 10) / 10, sd: Math.round(x.sd * 10) / 10 } : null;
  };
  const r = await readiness(ctx);
  return c.json({
    rows: ctx.well.map((w) => ({ date: w.date, hrv: w.hrv, rhr: w.rhr, sleep_s: w.sleep_s, sleep_score: w.sleep_score, bb_max: w.bb_max, bb_min: w.bb_min, stress: w.stress_avg })),
    norms: { hrv: n("hrv"), rhr: n("rhr"), sleep: n("sleep_s"), score: n("sleep_score") },
    recovery: r.recovery,
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
  const dates: string[] = [];
  for (let d = addDays(startDate, 1); d <= addDays(T, 7); d = addDays(d, 1)) dates.push(d);
  const proj = st ? project({ ctl: st.ctl, atl: st.atl }, startDate, dates.map((d) => p.days.find((x) => x.date === d)?.load ?? 0)) : [];
  return c.json({ metrics: ctx.metrics.filter((m) => m.date >= addDays(T, -90)), projection: proj, chart: p.chart, table: fit, last, loadPast7: p.loadPast7, loadNext7: p.loadNext7, target: p.weeklyTarget, warnings: p.warnings });
});

api.get("/body", async (c) => {
  const rows = await all<any>(c.env.DB, "SELECT date, weight_kg, fitness_age, vo2max FROM wellness WHERE weight_kg IS NOT NULL OR fitness_age IS NOT NULL OR vo2max IS NOT NULL ORDER BY date");
  return c.json(rows);
});

api.get("/steps", async (c) => {
  const rows = await all<any>(c.env.DB, "SELECT date, steps, intensity_min FROM wellness WHERE steps IS NOT NULL AND date >= date('now', '-120 days') ORDER BY date");
  return c.json(rows);
});

api.get("/strength", async (c) => {
  const rows = await all<any>(c.env.DB, "SELECT date, kind, note FROM training_log WHERE date >= date('now', '-90 days') ORDER BY date DESC");
  const acts = await all<any>(c.env.DB, "SELECT date, sport, name, moving_s FROM activities WHERE sport IN ('strength','mobility') AND date >= date('now', '-90 days') ORDER BY date DESC");
  return c.json({ log: rows, garmin: acts });
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

api.post("/settings", async (c) => {
  const body = (await c.req.json()) as Partial<Settings>;
  const allowed = Object.keys(DEFAULTS) as (keyof Settings)[];
  const before = await getSettings(c.env.DB);
  for (const k of allowed) if (k in body) await setSetting(c.env.DB, k, (body as any)[k]);
  const after = await getSettings(c.env.DB);
  if (before.ftp !== after.ftp || JSON.stringify(before.hr_zones) !== JSON.stringify(after.hr_zones)) await recomputeLoads(c.env.DB, after);
  return c.json(after);
});

api.get("/status", async (c) => {
  const keys = ["last_sync_ok", "bf_act", "bf_well", "metrics_day", "weather_at", "settings_refresh", "vo2_refresh", "analysis_since"];
  const st: Record<string, unknown> = {};
  for (const k of keys) st[k] = await getState(c.env.DB, k);
  const counts = await first<any>(c.env.DB, "SELECT (SELECT COUNT(*) FROM activities) acts, (SELECT MIN(date) FROM activities) a_from, (SELECT COUNT(*) FROM wellness) days, (SELECT COUNT(*) FROM wellness WHERE sleep_s IS NOT NULL) nights, (SELECT COUNT(*) FROM planned_workouts WHERE status='planned') planned");
  const logs = await all<any>(c.env.DB, "SELECT at, level, msg FROM events_log ORDER BY id DESC LIMIT 20");
  return c.json({ state: st, counts, logs, source: c.env.DATA_SOURCE, llm: !!c.env.AI, model: c.env.LLM_MODEL });
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
  if (!p || p.status !== "open") return c.json({ error: "Návrh už neplatí – platí jen poslední." }, 409);
  const items = p.items.filter((x) => codes.includes(x.code));
  const r = await applyChanges(c.env, items);
  const rest = p.items.filter((x) => !codes.includes(x.code));
  await c.env.DB.prepare(rest.length ? "UPDATE proposals SET items = ? WHERE id = ?" : "UPDATE proposals SET status = 'applied', items = ? WHERE id = ?").bind(JSON.stringify(rest), id).run();
  return c.json(r);
});

api.post("/constraint", async (c) => {
  const { date, kind, note } = (await c.req.json()) as { date: string; kind: string; note?: string };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["nemuzu", "hokej", "bezky", "nemoc", "dovolena", "nepojedu"].includes(kind)) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, kind, note ?? null);
  return c.json({ ok: true, label: `${kind} ${dm(date)}` });
});
