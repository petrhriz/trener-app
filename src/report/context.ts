// Načtení všeho potřebného z D1 jedním průchodem (pár dotazů, žádné externí volání).
import type { Env } from "../env";
import type { ActRow } from "../core/activity";
import type { CalItem, Constraint } from "../core/plan";
import type { Hour } from "../core/weather";
import { all, getState } from "../lib/db";
import { getSettings, type Settings } from "../lib/settings";
import { loadZoneHistory } from "../lib/zoneHistory";
import type { ZoneHistRow } from "../core/zones";
import { addDays, localNow, mondayOf, type LocalNow } from "../lib/time";

export interface WellRow {
  date: string;
  hrv: number | null;
  hrv_weekly: number | null;
  rhr: number | null;
  sleep_s: number | null;
  sleep_score: number | null;
  sleep_q: string | null;
  steps: number | null;
  bb_max: number | null;
  bb_min: number | null;
  stress_avg: number | null;
  weight_kg: number | null;
  vo2max: number | null;
  fitness_age: number | null;
  wake_time: string | null;
  intensity_min: number | null;
  deep_s: number | null;
  light_s: number | null;
  rem_s: number | null;
  awake_s: number | null;
  awake_count: number | null;
  sleep_stress: number | null;
  sleep_hr: number | null;
  sleep_resp: number | null;
  sleep_need_min: number | null;
  sleep_feedback: string | null;
  sleep_sub: string | null;
  sleep_start: string | null;
  bb_charged: number | null;
  bb_drained: number | null;
  bb_latest: number | null;
  stress_max: number | null;
  stress_dist: string | null;
  respiration: number | null;
  floors_up: number | null;
  floors_down: number | null;
  sleep_resp_lo: number | null;
  sleep_resp_hi: number | null;
  next_sleep_need_min: number | null;
  /** původní hodnoty z Garminu (sleep_score / sleep_need_min / next_sleep_need_min = vlastní výpočet) */
  sleep_score_g?: number | null;
  sleep_need_g_min?: number | null;
  next_sleep_need_g_min?: number | null;
}

/** Spárovaný workout z intervals.icu */
export interface IcuEvent {
  id: number;
  name: string | null;
  description: string | null;
  load: number | null;
  moving_time: number | null;
  type: string | null;
  steps: any[] | null;
}

export interface MetricRow {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  form: number;
  ramp: number | null;
}

export interface FullAct extends ActRow {
  max20: number | null;
  mmp: Record<string, number> | null;
  icu_load: number | null;
  analyzed_sent: number;
  seen_at: string | null;
  enrich_state: number;
  garmin_load: number | null;
  duration_s: number | null;
  avg_power: number | null;
  icu_id: string | null;
  icu_event: IcuEvent | null;
  icu_compliance: number | null;
  icu_eftp: number | null;
  icu_strain: number | null;
  icu_intensity: number | null;
  calories: number | null;
}

export interface Ctx {
  env: Env;
  now: LocalNow;
  T: string;
  s: Settings;
  well: WellRow[];
  acts: FullAct[];
  metrics: MetricRow[];
  calendar: CalItem[];
  constraints: Constraint[];
  hours: Hour[];
  weatherOk: boolean;
  lastSyncOk: string | null;
  /** FTP a zóny s datem platnosti (staré aktivity se hodnotí podle tehdejších) */
  zh?: ZoneHistRow[];
}

export function parseAct(r: any): FullAct {
  const j = (v: unknown) => (typeof v === "string" && v ? JSON.parse(v) : null);
  // aerobní drift: přednost má decoupling z intervals.icu (bez prvních 10 min a poslední části), vlastní výpočet jen když chybí
  return { ...r, drift: r.icu_decoupling ?? r.drift ?? null, hr_z: j(r.hr_z), pwr_z: j(r.pwr_z), mmp: j(r.mmp), laps: j(r.laps), icu_event: j(r.icu_event), extra: j(r.extra) };
}

export async function loadCtx(env: Env, at?: Date): Promise<Ctx> {
  const now = localNow(at ?? new Date(), env.TZ_NAME);
  const T = now.date;
  const db = env.DB;
  const [s, well, actsRaw, metrics, calendar, constraints, hours, wAt, lastSync, zh] = await Promise.all([
    getSettings(db),
    all<WellRow>(db, "SELECT * FROM wellness WHERE date >= ? ORDER BY date", addDays(T, -90)),
    all<any>(db, "SELECT * FROM activities WHERE date >= ? ORDER BY start_local", addDays(T, -90)),
    all<MetricRow>(db, "SELECT * FROM daily_metrics WHERE date >= ? ORDER BY date", addDays(T, -120)),
    all<CalItem>(db, "SELECT * FROM planned_workouts WHERE date >= ? AND date <= ? ORDER BY date, id", addDays(mondayOf(T), -14), addDays(T, 14)),
    all<Constraint>(db, "SELECT date, kind, note FROM constraints WHERE date >= ? AND date <= ?", addDays(T, -14), addDays(T, 21)),
    all<Hour>(db, "SELECT * FROM weather_hourly WHERE time >= ? ORDER BY time", addDays(T, -1)),
    getState<number>(db, "weather_at"),
    getState<string>(db, "last_sync_ok"),
    loadZoneHistory(db),
  ]);
  return {
    env,
    now,
    T,
    s,
    well,
    acts: actsRaw.map(parseAct),
    metrics,
    calendar,
    constraints,
    hours,
    weatherOk: !!wAt && Date.now() - wAt < 12 * 3600_000 && hours.length > 24,
    lastSyncOk: lastSync,
    zh,
  };
}
