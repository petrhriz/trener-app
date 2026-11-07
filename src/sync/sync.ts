// Synchronizace po malých dávkách (free plán: 10 ms CPU, 50 fetchů, 50 D1 dotazů na spuštění).
import type { Env } from "../env";
import { GarminClient } from "../datasource/garmin";
import { IntervalsClient } from "../datasource/intervals";
import type { DataSource, NActivity, NWellness } from "../datasource/types";
import { BIKE_SPORTS } from "../datasource/types";
import { computeDrift } from "../core/activity";
import { activityLoad } from "../core/load";
import { classify, qualityFromName, type QualityType } from "../core/quality";
import { all, execAll, first, getState, logEvent, run, setState, setStateSql, upsertSql } from "../lib/db";
import { HttpError } from "../lib/http";
import { getSettings, setSettingSql, type Settings } from "../lib/settings";
import { addDays, daysBetween, localNow } from "../lib/time";
import { recomputeMetrics } from "./metrics";
import { refreshWeather } from "./weather";

const ACT_COLS = [
  "id", "start_local", "date", "type_key", "sport", "name", "distance_m", "duration_s", "moving_s", "elev_gain",
  "avg_hr", "max_hr", "avg_power", "max_power", "np", "max20", "tss_garmin", "if_garmin", "garmin_load", "aerobic_te",
  "avg_cad", "min_temp", "max_temp", "lap_count", "calories", "hr_z", "pwr_z", "mmp", "load", "load_source",
  "is_quality", "quality_type", "updated_at",
];

const WELL_COLS = [
  "date", "hrv", "hrv_weekly", "hrv_status", "rhr", "sleep_s", "sleep_score", "sleep_q", "steps", "bb_max", "bb_min",
  "stress_avg", "weight_kg", "vo2max", "intensity_min", "respiration", "fitness_age", "wake_time", "updated_at",
];

export function dataSource(env: Env): DataSource {
  return env.DATA_SOURCE === "intervals" ? new IntervalsClient(env) : new GarminClient(env);
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
      ld.load, ld.source, q.isQuality ? 1 : 0, q.type, now,
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
  await execAll(env.DB, [...activitySql(acts, s, pq), `UPDATE activities SET seen_at = '${new Date().toISOString()}' WHERE seen_at IS NULL`]);
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
export async function syncTick(env: Env, opts: { force?: boolean; backfillPages?: number } = {}): Promise<SyncReport> {
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
    await markDirty(env.DB, r.minDate);
    await setState(env.DB, "last_sync_ok", new Date().toISOString());
    rep.steps.push(`aktivity (${acts.length}, nové ${r.newIds.length})`);
  });

  // 2) wellness posledních 3 dnů: ráno každých 15 min, jinak jednou za hodinu
  const morning = now.minutes >= 300 && now.minutes <= 12 * 60;
  if (opts.force || morning || now.mm < 15) {
    await guard("wellness", async () => {
      const parts: ("daily" | "sleep" | "hrv" | "weight")[] = ["daily", "sleep", "hrv"];
      if (now.hh === 7 || now.hh === 12 || now.hh === 20 || opts.force) parts.push("weight");
      const ws = await ds.wellnessRange(addDays(T, -2), T, parts);
      await execAll(env.DB, wellnessSql(ws));
      rep.steps.push(`wellness (${ws.length} dní)`);
    });
  }

  // 3) doplnění aktivit: lapy z intervals.icu, drift z Garmin průběhu (max. 2 na spuštění)
  await guard("doplnění", async () => {
    const rows = await all<{ id: string; date: string; sport: string; np: number | null; seen_at: string | null; enrich_state: number }>(
      env.DB,
      "SELECT id, date, sport, np, seen_at, enrich_state FROM activities WHERE enrich_state != 1 AND enrich_state < 4 AND date >= ? ORDER BY date DESC LIMIT 2",
      addDays(T, -100),
    );
    for (const a of rows) {
      const bike = BIKE_SPORTS.includes(a.sport as any);
      let drift: number | null = null;
      let icuRow: any = null;
      let laps: unknown = null;
      if (bike && ds.activitySamples) {
        const smp = await ds.activitySamples(a.id).catch(() => null);
        if (smp) drift = computeDrift(smp, !!a.np);
      }
      if (icu.configured) {
        const list = await icu.activitiesRaw(a.date, a.date);
        icuRow = list.find((x) => String(x.external_id ?? "").includes(a.id)) ?? (list.length === 1 ? list[0] : null);
        if (icuRow && bike) laps = await icu.laps(String(icuRow.id));
      }
      const fresh = a.seen_at && Date.now() - Date.parse(a.seen_at) < 6 * 3600_000;
      const ok = !icu.configured || !!icuRow || !bike;
      const state = ok ? 1 : fresh ? 0 : a.enrich_state + 1;
      await run(
        env.DB,
        "UPDATE activities SET drift = COALESCE(?, drift), icu_id = COALESCE(?, icu_id), icu_load = COALESCE(?, icu_load), icu_decoupling = COALESCE(?, icu_decoupling), laps = COALESCE(?, laps), enrich_state = ? WHERE id = ?",
        drift,
        icuRow ? String(icuRow.id) : null,
        icuRow?.icu_training_load ?? null,
        icuRow?.decoupling ?? null,
        laps ? JSON.stringify(laps) : null,
        state,
        a.id,
      );
    }
    if (rows.length) rep.steps.push(`doplnění (${rows.length})`);
  });

  // 4) backfill aktivit (celá historie), několik stránek po 20
  await guard("backfill aktivit", async () => {
    const st = (await getState<BfAct>(env.DB, "bf_act")) ?? { start: 0, done: false, count: 0 };
    if (st.done) return;
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

  // 5) backfill wellness po 28 dnech dozadu
  await guard("backfill wellness", async () => {
    const st = (await getState<BfWell>(env.DB, "bf_well")) ?? { cursor: addDays(T, -3), done: false, empty: 0 };
    if (st.done) return;
    const from = addDays(st.cursor, -27);
    const ws = await ds.wellnessRange(from, st.cursor);
    const useful = ws.filter((w) => w.hrv != null || w.rhr != null || w.sleep_s != null || w.steps != null);
    await execAll(env.DB, wellnessSql(ws));
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
    const rows = w.filter((x) => x.vo2max).map((x) => ({ date: x.id as string, vo2max: x.vo2max as number }));
    await execAll(env.DB, [...wellnessSql(rows), setStateSql("vo2_refresh", T)]);
    rep.steps.push(`vo2max (${rows.length})`);
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
