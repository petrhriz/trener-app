// Synchronizace po malých dávkách (free plán: 10 ms CPU, 50 fetchů, 50 D1 dotazů na spuštění).
import type { Env } from "../env";
import { GarminClient } from "../datasource/garmin";
import { IntervalsClient } from "../datasource/intervals";
import type { DataSource, NActivity, NWellness } from "../datasource/types";
import { BIKE_SPORTS } from "../datasource/types";
import { computeDrift } from "../core/activity";
import { activityLoad } from "../core/load";
import { classify, qualityFromName, type QualityType } from "../core/quality";
import { all, execAll, first, getState, lit, logEvent, setState, setStateSql, upsertSql } from "../lib/db";
import { HttpError } from "../lib/http";
import { getSettings, setSettingSql, type Settings } from "../lib/settings";
import { addDays, daysBetween, localNow } from "../lib/time";
import { recomputeMetrics } from "./metrics";
import { refreshWeather } from "./weather";
import { recomputeSleep } from "./sleep";
import { computeEnergy } from "./energy";
import { ENERGY_V } from "../core/energy";
import { SLEEP_CALC_V } from "../core/sleepCalc";

const ACT_COLS = [
  "id", "start_local", "date", "type_key", "sport", "name", "distance_m", "duration_s", "moving_s", "elev_gain",
  "avg_hr", "max_hr", "avg_power", "max_power", "np", "max20", "tss_garmin", "if_garmin", "garmin_load", "aerobic_te",
  "avg_cad", "min_temp", "max_temp", "lap_count", "calories", "hr_z", "pwr_z", "mmp", "load", "load_source",
  "is_quality", "quality_type", "extra", "updated_at",
];

const WELL_COLS = [
  "date", "hrv", "hrv_weekly", "hrv_status", "rhr", "sleep_s", "sleep_q", "steps",
  "stress_avg", "weight_kg", "vo2max", "intensity_min", "respiration", "fitness_age", "wake_time",
  "deep_s", "light_s", "rem_s", "awake_s", "awake_count", "sleep_stress", "sleep_hr", "sleep_resp",
  "sleep_feedback", "sleep_sub", "sleep_start", "bb_charged_g", "bb_drained_g", "bb_latest_g", "bb_max_g", "bb_min_g", "stress_max", "stress_dist",
  "icu_ctl", "icu_atl", "icu_ramp", "floors_up", "floors_down", "sleep_resp_lo", "sleep_resp_hi", "sleep_score_g", "sleep_need_g_min", "next_sleep_need_g_min", "updated_at",
];

/** Zátěž z intervals.icu má přednost (stejná čísla jako v intervals.icu). */
const ICU_LOAD_SQL = "UPDATE activities SET load = icu_load, load_source = 'icu' WHERE icu_load IS NOT NULL AND (load_source != 'icu' OR load != icu_load)";

/** intervals.icu wellness → kondice/únava (+ VO2max). */
function icuFitnessRows(w: any[]): NWellness[] {
  return w
    .filter((x) => x.ctl != null || x.vo2max != null)
    .map((x) => ({ date: String(x.id), icu_ctl: x.ctl ?? null, icu_atl: x.atl ?? null, icu_ramp: x.rampRate ?? null, vo2max: x.vo2max ?? null }));
}

/** Shrnutí spárovaného workoutu z intervals.icu (pro rozbor aktivity). */
function icuEventJson(ev: any): string {
  return JSON.stringify({
    id: ev.id,
    name: ev.name ?? null,
    description: ev.description ?? null,
    load: ev.icu_training_load ?? null,
    moving_time: ev.moving_time ?? null,
    type: ev.type ?? null,
    steps: ev.workout_doc?.steps ?? null,
  });
}

export function dataSource(env: Env): DataSource {
  // uživatel jen s intervals.icu (bez Garmin klíče) se stahuje z intervals.icu
  const icuOnly = !env.GARMIN_API_KEY && !!env.INTERVALS_API_KEY && !!env.INTERVALS_ATHLETE_ID;
  return env.DATA_SOURCE === "intervals" || icuOnly ? new IntervalsClient(env) : new GarminClient(env);
}

/** Aktivity → SQL (zátěž a kvalita spočítané hned při zápisu). */
export function activitySql(acts: NActivity[], s: Settings, plannedQ: Map<string, QualityType | null>): string[] {
  const now = new Date().toISOString();
  const rows = acts.map((a) => {
    const ld = activityLoad(a, { ftp: s.ftp, hr: s.hr_zones });
    const q = classify({ ...a, load: ld.load }, BIKE_SPORTS.includes(a.sport) ? plannedQ.get(a.date) ?? null : null);
    return [
      a.id, a.start_local, a.date, a.type_key, a.sport, a.name, a.distance_m, a.duration_s, a.moving_s, a.elev_gain,
      a.avg_hr, a.max_hr, a.avg_power, a.max_power, a.np, a.max20, a.tss_garmin, a.if_garmin, a.garmin_load, a.aerobic_te,
      a.avg_cad, a.min_temp, a.max_temp, a.lap_count, a.calories,
      a.hr_z ? JSON.stringify(a.hr_z) : null, a.pwr_z ? JSON.stringify(a.pwr_z) : null, a.mmp ? JSON.stringify(a.mmp) : null,
      ld.load, ld.source, q.isQuality ? 1 : 0, q.type, a.extra ? JSON.stringify(a.extra) : null, now,
    ];
  });
  return upsertSql("activities", ACT_COLS, rows, ["id"], "replace");
}

export function wellnessSql(ws: NWellness[]): string[] {
  const now = new Date().toISOString();
  const rows = ws
    .filter((w) => Object.entries(w).some(([k, v]) => k !== "date" && v != null))
    .map((w) => WELL_COLS.map((c) => (c === "updated_at" ? now : ((w as any)[c] ?? null))));
  return upsertSql("wellness", WELL_COLS, rows, ["date"], "merge");
}

async function plannedQualityMap(db: D1Database, dates: string[]): Promise<Map<string, QualityType | null>> {
  const m = new Map<string, QualityType | null>();
  if (!dates.length) return m;
  const rows = await all<{ date: string; quality_type: string | null; name: string }>(
    db,
    `SELECT date, quality_type, name FROM planned_workouts WHERE kind = 'quality' AND date IN (${dates.map(() => "?").join(",")})`,
    ...dates,
  );
  for (const r of rows) m.set(r.date, (r.quality_type as QualityType) ?? qualityFromName(r.name));
  return m;
}

export async function upsertActivities(env: Env, acts: NActivity[], s: Settings): Promise<{ newIds: string[]; minDate: string | null }> {
  if (!acts.length) return { newIds: [], minDate: null };
  const ids = acts.map((a) => a.id);
  const existing = new Set(
    (await all<{ id: string }>(env.DB, `SELECT id FROM activities WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)).map((r) => r.id),
  );
  const pq = await plannedQualityMap(env.DB, [...new Set(acts.map((a) => a.date))]);
  await execAll(env.DB, [...activitySql(acts, s, pq), `UPDATE activities SET seen_at = '${new Date().toISOString()}' WHERE seen_at IS NULL`, ICU_LOAD_SQL]);
  const newIds = ids.filter((i) => !existing.has(i));
  const minDate = acts.filter((a) => !existing.has(a.id)).reduce<string | null>((m, a) => (!m || a.date < m ? a.date : m), null);
  return { newIds, minDate };
}

async function markDirty(db: D1Database, date: string | null) {
  if (!date) return;
  const cur = await getState<string>(db, "metrics_dirty");
  if (!cur || date < cur) await setState(db, "metrics_dirty", date);
}

export interface SyncReport {
  steps: string[];
  errors: string[];
  newActivities: string[];
}

interface BfAct {
  start: number;
  done: boolean;
  count: number;
}
interface BfWell {
  cursor: string;
  done: boolean;
  empty: number;
}

/**
 * Jedno spuštění synchronizace. `force` = ignorovat rozvrh (ruční sync / backfill skript).
 */
/** `manual` = tlačítko na dashboardu: čerstvé aktivity, spánek, HRV, energie a metriky hned, bez dávek historie. */
export async function syncTick(env: Env, opts: { force?: boolean; manual?: boolean; backfillPages?: number } = {}): Promise<SyncReport> {
  const rep: SyncReport = { steps: [], errors: [], newActivities: [] };
  const now = localNow(new Date(), env.TZ_NAME);
  const T = now.date;
  const s = await getSettings(env.DB);
  const ds = dataSource(env);
  const icu = new IntervalsClient(env);
  const guard = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof HttpError ? `HTTP ${e.status}` : (e as Error).message;
      rep.errors.push(`${name}: ${msg}`);
      await logEvent(env.DB, "warn", `sync ${name}: ${msg}`);
    }
  };

  // 0) jednorázová inicializace nastavení (FTP z intervals.icu, zóny tepu z Garminu)
  await guard("init", async () => {
    const last = await getState<string>(env.DB, "settings_refresh");
    if (last === T && !opts.force) return;
    const sqls: string[] = [];
    if (!s.ftp && icu.configured) {
      const rs = await icu.rideSettings();
      if (rs?.ftp) {
        sqls.push(setSettingSql("ftp", rs.ftp));
        s.ftp = rs.ftp;
      }
    }
    if (ds instanceof GarminClient) {
      const hz = await ds.hrZones();
      if (hz && (!s.hr_zones || s.hr_zones.source !== "manual")) {
        const v = { ...hz, source: "garmin" };
        sqls.push(setSettingSql("hr_zones", v));
        s.hr_zones = v;
      }
    }
    if (!s.garmin_key_created) sqls.push(setSettingSql("garmin_key_created", T));
    if (!(await getState<string>(env.DB, "analysis_since"))) sqls.push(setStateSql("analysis_since", new Date().toISOString()));
    sqls.push(setStateSql("settings_refresh", T));
    await execAll(env.DB, sqls);
    rep.steps.push("nastavení");
  });

  // 1) nejnovější aktivity (každé spuštění)
  await guard("aktivity", async () => {
    const acts = await ds.activitiesPage(0, 10);
    const r = await upsertActivities(env, acts, s);
    rep.newActivities = r.newIds;
    for (const a of acts.filter((x) => r.newIds.includes(x.id))) await logEvent(env.DB, "info", `sync: 🏅 nová aktivita z ${a.start_local.slice(8, 10)}. ${a.start_local.slice(5, 7)}. ${a.start_local.slice(11, 16)} (${a.sport})`);
    await markDirty(env.DB, r.minDate);
    await setState(env.DB, "last_sync_ok", new Date().toISOString());
    rep.steps.push(`aktivity (${acts.length}, nové ${r.newIds.length})`);
  });

  // cron běží každých 5 min; těžší kroky jen jednou za 15 min / hodinu
  // podle času posledního běhu (ne minut na hodinách) – další uživatelé se v cronu střídají v různých minutách
  const lastQ = (await getState<number>(env.DB, "tick_quarter")) ?? 0;
  const lastH = (await getState<number>(env.DB, "tick_hour")) ?? 0;
  const quarter = opts.force || opts.manual || Date.now() - lastQ >= 14.5 * 60_000;
  const hourly = opts.force || opts.manual || Date.now() - lastH >= 59 * 60_000;
  if (quarter && !opts.manual) await setState(env.DB, "tick_quarter", Date.now());
  if (hourly && !opts.manual) await setState(env.DB, "tick_hour", Date.now());
  /** dávky historie (backfill) jen v cronu, ruční sync musí doběhnout rychle */
  const batch = !opts.manual;

  // 2) wellness posledních 3 dnů: ráno každých 15 min, jinak jednou za hodinu
  const morning = now.minutes >= 300 && now.minutes <= 12 * 60;
  // mimo to každých 5 min jen denní souhrn dneška (Body Battery, kroky, stres – 1 dotaz) → hustý průběh Body Battery
  {
    await guard("wellness", async () => {
      const full = (hourly || quarter) && (hourly || morning);
      const parts: ("daily" | "sleep" | "hrv" | "weight")[] = full ? ["daily", "sleep", "hrv"] : ["daily"];
      if (full && (now.hh === 7 || now.hh === 12 || now.hh === 20 || opts.force)) parts.push("weight");
      const ws = await ds.wellnessRange(full ? addDays(T, -2) : T, T, parts);
      await execAll(env.DB, wellnessSql(ws));
      // záznam synchronizace: hodinky → Garmin Connect (nová data) a stažený spánek
      const tw = ws.find((w) => w.date === T);
      const until = tw?.data_until ?? null;
      const prevUntil = await getState<number>(env.DB, "watch_data_until");
      if (until && until <= Date.now() + 60_000 && (!prevUntil || until > prevUntil + 60_000)) {
        await setState(env.DB, "watch_data_until", until);
        const hhmm = new Intl.DateTimeFormat("cs-CZ", { timeZone: env.TZ_NAME || "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(new Date(until));
        await logEvent(env.DB, "info", `sync: ⌚ hodinky synchronizovány s Garmin Connect – data do ${hhmm}`);
      }
      if (parts.includes("sleep") && tw?.sleep_s && (await getState<string>(env.DB, "sleep_logged")) !== T) {
        await setState(env.DB, "sleep_logged", T);
        await logEvent(env.DB, "info", "sync: 😴 spánek za dnešní noc stažen a přepočten");
      }
      // vlastní skóre a potřeba spánku (Garmin čísla zůstávají v *_g)
      if (parts.includes("sleep")) await recomputeSleep(env.DB, s.sleep_goal_min, addDays(T, -2), T);
      rep.steps.push(`wellness (${ws.length} dní)`);
    });
  }

  // 2c) energie (náhrada Body Battery, src/core/energy.ts): nejdřív 60 dní historie po 3 dnech, pak každých 15 min dnešek
  //     (dopoledne i včerejšek – noc přes půlnoc a pozdní synchronizace hodinek)
  await guard("energie", async () => {
    if (!(ds instanceof GarminClient) || !quarter) return;
    let done = await getState<string>(env.DB, "energy_done");
    if ((await getState<number>(env.DB, "energy_v")) !== ENERGY_V) done = null;
    const from = done ? addDays(done, 1) : addDays(T, -60);
    let dates: string[];
    let newDone: string | null = done;
    // historie až po včerejšek včetně (dnešek pak navazuje na jeho konec)
    if (from <= addDays(T, -1)) {
      dates = [];
      for (let d = from; d <= addDays(T, -1) && dates.length < 3; d = addDays(d, 1)) dates.push(d);
      newDone = dates[dates.length - 1]!;
    } else dates = now.hh < 12 ? [addDays(T, -1), T] : [T];
    const n = await computeEnergy(env, dates);
    await execAll(env.DB, [setStateSql("energy_done", newDone ?? addDays(T, -2)), setStateSql("energy_v", ENERGY_V)]);
    rep.steps.push(`energie (${n} dní: ${dates[0]}–${dates[dates.length - 1]})`);
  });

  // 2b) jednorázový přepočet spánku celé historie (nová verze výpočtu nebo jiný cíl spánku)
  await guard("spánek", async () => {
    if ((await getState<number>(env.DB, "sleep_calc_v")) === SLEEP_CALC_V) return;
    const n = await recomputeSleep(env.DB, s.sleep_goal_min);
    await execAll(env.DB, [setStateSql("sleep_calc_v", SLEEP_CALC_V)]);
    rep.steps.push(`spánek přepočten (${n} nocí)`);
  });

  // 3) doplnění aktivit z intervals.icu po dávkách: zátěž, spárovaný workout + plnění, eFTP, lapy; drift z Garminu
  await guard("doplnění", async () => {
    type Pend = { id: string; date: string; sport: string; np: number | null; seen_at: string | null; enrich_state: number; has_laps: number; has_drift: number };
    let rows = await all<Pend>(
      env.DB,
      "SELECT id, date, sport, np, seen_at, enrich_state, laps IS NOT NULL AS has_laps, drift IS NOT NULL AS has_drift FROM activities WHERE enrich_state != 1 AND enrich_state < 4 AND date >= ? ORDER BY date DESC LIMIT 25",
      addDays(T, -400),
    );
    if (!rows.length) return;
    // jedno okno max. 60 dní na jedno volání intervals.icu
    const newest = rows[0]!.date;
    rows = rows.filter((r) => daysBetween(r.date, newest) <= 60);
    const oldest = rows[rows.length - 1]!.date;
    const list = icu.configured ? await icu.activitiesRaw(oldest, newest) : [];
    const paired = list.filter((x) => x.paired_event_id != null);
    const events = paired.length ? await icu.events(oldest, newest).catch(() => [] as any[]) : [];
    const evById = new Map(events.map((e: any) => [String(e.id), e]));
    let lapQuota = 3;
    let driftQuota = 2;
    const sqls: string[] = [];
    let minDate: string | null = null;
    for (const a of rows) {
      const bike = BIKE_SPORTS.includes(a.sport as any);
      const recent = a.date >= addDays(T, -120);
      const sameDay = list.filter((x) => String(x.start_date_local ?? "").slice(0, 10) === a.date);
      const icuRow = list.find((x) => String(x.external_id ?? "") === a.id || String(x.external_id ?? "").includes(a.id)) ?? (sameDay.length === 1 ? sameDay[0] : null);
      let drift: number | null = null;
      let laps: unknown = null;
      let pending = false;
      if (bike && recent && !a.has_drift && ds.activitySamples) {
        if (driftQuota-- > 0) {
          const smp = await ds.activitySamples(a.id).catch(() => null);
          if (smp) drift = computeDrift(smp, !!a.np);
        } else pending = true;
      }
      if (icuRow && (bike || a.sport === "run") && recent && !a.has_laps) {
        if (lapQuota-- > 0) laps = await icu.laps(String(icuRow.id)).catch(() => null);
        else pending = true;
      }
      const ev = icuRow?.paired_event_id != null ? evById.get(String(icuRow.paired_event_id)) : null;
      const fresh = a.seen_at && Date.now() - Date.parse(a.seen_at) < 6 * 3600_000;
      const ok = !icu.configured || !!icuRow || !bike || !recent;
      const state = pending ? a.enrich_state : ok ? 1 : fresh ? 0 : a.enrich_state + 1;
      if (icuRow?.icu_training_load != null && (!minDate || a.date < minDate)) minDate = a.date;
      sqls.push(
        `UPDATE activities SET drift = COALESCE(${lit(drift)}, drift), icu_id = COALESCE(${lit(icuRow ? String(icuRow.id) : null)}, icu_id), ` +
          `icu_load = COALESCE(${lit(icuRow?.icu_training_load ?? null)}, icu_load), icu_decoupling = COALESCE(${lit(icuRow?.decoupling ?? null)}, icu_decoupling), ` +
          `laps = COALESCE(${lit(laps ? JSON.stringify(laps) : null)}, laps), icu_event = COALESCE(${lit(ev ? icuEventJson(ev) : null)}, icu_event), ` +
          `icu_compliance = COALESCE(${lit(icuRow?.compliance ?? null)}, icu_compliance), icu_eftp = COALESCE(${lit(icuRow?.icu_rolling_ftp ?? null)}, icu_eftp), ` +
          `icu_strain = COALESCE(${lit(icuRow?.strain_score ?? null)}, icu_strain), icu_intensity = COALESCE(${lit(icuRow?.icu_intensity ?? null)}, icu_intensity), ` +
          `icu_pwhr_z2 = COALESCE(${lit(icuRow?.icu_power_hr_z2 ?? null)}, icu_pwhr_z2), icu_pwhr_z2_min = COALESCE(${lit(icuRow?.icu_power_hr_z2_mins ?? null)}, icu_pwhr_z2_min), ` +
          `enrich_state = ${state} WHERE id = ${lit(a.id)}`,
      );
    }
    sqls.push(ICU_LOAD_SQL);
    await execAll(env.DB, sqls);
    await markDirty(env.DB, minDate);
    rep.steps.push(`doplnění (${rows.length})`);
  });

  // 3c) VO2max z FIT souboru (kolo i běh zvlášť): 1 aktivita za běh, 150 dní zpět, max. 3 pokusy
  await guard("vo2 z FIT", async () => {
    if (!(ds instanceof GarminClient)) return;
    const a = await first<{ id: string; vo2_try: number }>(
      env.DB,
      `SELECT id, vo2_try FROM activities WHERE vo2_fit IS NULL AND vo2_try < 3 AND sport IN ('ride','mtb','indoor','run') AND COALESCE(moving_s, 0) >= 600 AND date >= ? ORDER BY date DESC LIMIT 1`,
      addDays(T, -150),
    );
    if (!a) return;
    let v: number | null = null;
    let failed = false;
    try { v = await ds.activityVo2(a.id); } catch { failed = true; }
    // bez hodnoty v souboru → vo2_try 3 (už nezkoušet), chyba stažení → další pokus
    await execAll(env.DB, [`UPDATE activities SET vo2_fit = ${lit(v)}, vo2_try = ${failed ? a.vo2_try + 1 : 3} WHERE id = ${lit(a.id)}`]);
    rep.steps.push(`vo2 z FIT (${v ?? "–"})`);
  });

  // 3b) kondice / únava z intervals.icu: každou hodinu poslední 4 dny, jinak backfill historie po 180 dnech
  await guard("icu kondice", async () => {
    if (!icu.configured) return;
    if (hourly || rep.newActivities.length) {
      const w = await icu.wellnessRaw(addDays(T, -3), T);
      await execAll(env.DB, wellnessSql(icuFitnessRows(w)));
      await markDirty(env.DB, addDays(T, -3));
      rep.steps.push("icu kondice");
    }
    const st = (await getState<{ cursor: string; done: boolean }>(env.DB, "icu_fit_bf")) ?? { cursor: T, done: false };
    if (st.done || !quarter || !batch) return;
    const from = addDays(st.cursor, -179);
    const w = await icu.wellnessRaw(from, st.cursor);
    const rows = icuFitnessRows(w);
    await execAll(env.DB, wellnessSql(rows));
    const oldestAct = await first<{ d: string }>(env.DB, "SELECT MIN(date) AS d FROM activities");
    st.cursor = addDays(from, -1);
    if (!rows.length || (oldestAct?.d && st.cursor < oldestAct.d)) st.done = true;
    await setState(env.DB, "icu_fit_bf", st);
    await markDirty(env.DB, from);
    rep.steps.push(`icu kondice backfill (do ${from}${st.done ? ", hotovo" : ""})`);
  });

  // 4) backfill aktivit (celá historie), několik stránek po 20
  await guard("backfill aktivit", async () => {
    const st = (await getState<BfAct>(env.DB, "bf_act")) ?? { start: 0, done: false, count: 0 };
    if (st.done || !quarter || !batch) return;
    const pages = opts.backfillPages ?? 4;
    let minDate: string | null = null;
    for (let i = 0; i < pages; i++) {
      const acts = await ds.activitiesPage(st.start, 20);
      if (acts.length) {
        const r = await upsertActivities(env, acts, s);
        if (r.minDate && (!minDate || r.minDate < minDate)) minDate = r.minDate;
        st.start += acts.length;
        st.count += acts.length;
      }
      if (acts.length < 20) {
        st.done = true;
        break;
      }
    }
    await setState(env.DB, "bf_act", st);
    await markDirty(env.DB, minDate);
    rep.steps.push(`backfill aktivit (${st.count}${st.done ? ", hotovo" : ""})`);
  });

  // 4b) jednorázové znovustažení starších aktivit (nová pole: běžecká dynamika, dopad na Body Battery) – vlastní kurzor,
  //     bf_act ani metriky neblokuje; jen Garmin
  await guard("doplnění polí aktivit", async () => {
    if (!(ds instanceof GarminClient) || !quarter || !batch) return;
    const V = 2;
    const st = (await getState<{ v: number; start: number; done: boolean }>(env.DB, "act_refetch")) ?? { v: 0, start: 10, done: true };
    if (st.v !== V) Object.assign(st, { v: V, start: 10, done: false });
    if (st.done) return;
    for (let i = 0; i < 2; i++) {
      const acts = await ds.activitiesPage(st.start, 20);
      if (acts.length) await upsertActivities(env, acts, s);
      st.start += acts.length;
      if (acts.length < 20) { st.done = true; break; }
    }
    await setState(env.DB, "act_refetch", st);
    rep.steps.push(`doplnění polí aktivit (${st.start}${st.done ? ", hotovo" : ""})`);
  });

  // 5) backfill wellness po 28 dnech dozadu
  await guard("backfill wellness", async () => {
    const st = (await getState<BfWell>(env.DB, "bf_well")) ?? { cursor: addDays(T, -3), done: false, empty: 0 };
    if (st.done || !quarter || !batch) return;
    const from = addDays(st.cursor, -27);
    const ws = await ds.wellnessRange(from, st.cursor);
    const useful = ws.filter((w) => w.hrv != null || w.rhr != null || w.sleep_s != null || w.steps != null);
    await execAll(env.DB, wellnessSql(ws));
    // dluh se přenáší 7 nocí dopředu → přepočet i týden za koncem stažené dávky
    await recomputeSleep(env.DB, s.sleep_goal_min, from, addDays(st.cursor, 7));
    st.empty = useful.length ? 0 : st.empty + 1;
    st.cursor = addDays(from, -1);
    const oldest = await first<{ d: string }>(env.DB, "SELECT MIN(date) AS d FROM activities");
    const bfAct = await getState<BfAct>(env.DB, "bf_act");
    if (st.empty >= 4 || (bfAct?.done && oldest?.d && st.cursor < addDays(oldest.d, -30)) || daysBetween(st.cursor, T) > 3650) st.done = true;
    await setState(env.DB, "bf_well", st);
    rep.steps.push(`backfill wellness (do ${from}${st.done ? ", hotovo" : ""})`);
  });

  // 6) VO2max z intervals.icu (Garmin ho Personal API nevrací) – jednou denně, 120 dní
  await guard("vo2max", async () => {
    if (!icu.configured) return;
    const last = await getState<string>(env.DB, "vo2_refresh");
    if (last === T && !opts.force) return;
    const w = await icu.wellnessRaw(addDays(T, -120), T);
    const rows = icuFitnessRows(w);
    await execAll(env.DB, [...wellnessSql(rows), setStateSql("vo2_refresh", T)]);
    // FTP z intervals.icu (tam je zadaný test) – jen když ho uživatel nenastavil ručně
    const rs = await icu.rideSettings().catch(() => null);
    // Ruční FTP z dashboardu platí, dokud se v intervals.icu neobjeví NOVÉ číslo (nový test) – to pak má přednost.
    if (rs?.ftp) {
      const seen = await getState<number>(env.DB, "icu_ftp_seen");
      const manual = await getState<boolean>(env.DB, "ftp_manual");
      const changedInIcu = seen != null && seen !== rs.ftp;
      if (rs.ftp !== s.ftp && (!manual || changedInIcu)) {
        await execAll(env.DB, [setSettingSql("ftp", rs.ftp), setStateSql("ftp_set_at", T), setStateSql("ftp_manual", false)]);
        s.ftp = rs.ftp;
      }
      if (seen !== rs.ftp) await execAll(env.DB, [setStateSql("icu_ftp_seen", rs.ftp)]);
    }
    await markDirty(env.DB, addDays(T, -120));
    rep.steps.push(`vo2max + kondice (${rows.length})`);
  });

  // 7) fitness age jednou denně
  await guard("fitness age", async () => {
    if (!(ds instanceof GarminClient)) return;
    const last = await getState<string>(env.DB, "fa_refresh");
    if (last === T && !opts.force) return;
    const fa = await ds.fitnessAge(T);
    await execAll(env.DB, [...wellnessSql([{ date: T, fitness_age: fa }]), setStateSql("fa_refresh", T)]);
  });

  // 8) počasí každé 2 h
  await guard("počasí", async () => {
    if (await refreshWeather(env, opts.force)) rep.steps.push("počasí");
  });

  // 9) přepočet kondice / únavy / formy (až po stažení historie aktivit)
  await guard("metriky", async () => {
    const bf = await getState<BfAct>(env.DB, "bf_act");
    const dirty = await getState<string>(env.DB, "metrics_dirty");
    const lastDay = await getState<string>(env.DB, "metrics_day");
    if (!bf?.done) return;
    if (!dirty && lastDay === T) return;
    const n = await recomputeMetrics(env.DB, T);
    await execAll(env.DB, [setStateSql("metrics_dirty", null), setStateSql("metrics_day", T)]);
    rep.steps.push(`metriky (${n} změn)`);
  });

  return rep;
}
