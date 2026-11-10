// Normalizované záznamy – vše nad adaptérem pracuje jen s nimi.

export type Sport =
  | "ride"
  | "mtb"
  | "indoor"
  | "run"
  | "hockey"
  | "skate"
  | "xc_ski"
  | "walk"
  | "hike"
  | "strength"
  | "mobility"
  | "padel"
  | "other";

export const BIKE_SPORTS: Sport[] = ["ride", "mtb", "indoor"];

export interface NActivity {
  id: string;
  start_local: string;
  date: string;
  type_key: string | null;
  sport: Sport;
  name: string | null;
  distance_m: number | null;
  duration_s: number | null;
  moving_s: number | null;
  elev_gain: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power: number | null;
  max_power: number | null;
  np: number | null;
  max20: number | null;
  tss_garmin: number | null;
  if_garmin: number | null;
  garmin_load: number | null;
  aerobic_te: number | null;
  avg_cad: number | null;
  min_temp: number | null;
  max_temp: number | null;
  lap_count: number | null;
  calories: number | null;
  hr_z: number[] | null;
  pwr_z: number[] | null;
  mmp: Record<string, number> | null;
  /** doplňkové údaje (JSON do sloupce extra) */
  extra?: ActExtra | null;
}

export interface ActExtra {
  max_speed?: number | null; // km/h
  avg_speed?: number | null; // km/h
  max_cad?: number | null;
  strokes?: number | null; // otáčky / kroky celkem
  avg_resp?: number | null;
  min_resp?: number | null;
  max_resp?: number | null;
  min_elev?: number | null;
  max_elev?: number | null;
  elev_loss?: number | null;
  ana_te?: number | null;
  te_label?: string | null;
  device?: string | null;
  run_cad?: number | null;
  /** běh: délka kroku (m), kontakt se zemí (ms), vertikální oscilace (cm) a poměr (%) */
  stride_m?: number | null;
  gct_ms?: number | null;
  vosc_cm?: number | null;
  vratio?: number | null;
  /** čistý dopad aktivity na Body Battery (Garmin, např. −10) */
  bb_diff?: number | null;
  /** Garmin: text přínosu (IMPROVING_LACTATE_THRESHOLD_12 …) */
  te_msg?: string | null;
}

export interface NWellness {
  floors_up?: number | null;
  floors_down?: number | null;
  sleep_resp_lo?: number | null;
  sleep_resp_hi?: number | null;
  next_sleep_need_min?: number | null;
  /** původní hodnoty z Garminu (sleep_score / sleep_need_min / next_sleep_need_min jsou přepočtené, src/core/sleepCalc.ts) */
  sleep_score_g?: number | null;
  sleep_need_g_min?: number | null;
  next_sleep_need_g_min?: number | null;
  date: string;
  hrv?: number | null;
  hrv_weekly?: number | null;
  hrv_status?: string | null;
  rhr?: number | null;
  sleep_s?: number | null;
  sleep_score?: number | null;
  sleep_q?: string | null;
  steps?: number | null;
  bb_max?: number | null;
  bb_min?: number | null;
  stress_avg?: number | null;
  weight_kg?: number | null;
  vo2max?: number | null;
  intensity_min?: number | null;
  respiration?: number | null;
  fitness_age?: number | null;
  wake_time?: string | null;
  deep_s?: number | null;
  light_s?: number | null;
  rem_s?: number | null;
  awake_s?: number | null;
  awake_count?: number | null;
  sleep_stress?: number | null;
  sleep_hr?: number | null;
  sleep_resp?: number | null;
  sleep_need_min?: number | null;
  sleep_feedback?: string | null;
  sleep_sub?: string | null;
  sleep_start?: string | null;
  bb_charged?: number | null;
  bb_drained?: number | null;
  bb_latest?: number | null;
  /** Body Battery z Garminu (bb_* = vlastní energie) */
  bb_max_g?: number | null;
  bb_min_g?: number | null;
  bb_charged_g?: number | null;
  bb_drained_g?: number | null;
  bb_latest_g?: number | null;
  energy_end?: number | null;
  /** do kdy jsou v Garmin Connect data z hodinek (ms, GMT) – jen pro záznam synchronizace */
  data_until?: number | null;
  stress_max?: number | null;
  stress_dist?: string | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_ramp?: number | null;
}

/** Sporty, které plán umí naplánovat. */
export type PlanSport = "ride" | "run" | "xc_ski" | "walk";
export const PLAN_SPORTS: PlanSport[] = ["ride", "run", "xc_ski", "walk"];
/** Vytrvalostní sporty, které „odjedou“ plánovanou jednotku (jakýkoli trénink, ne jen kolo). */
export const ENDURANCE_SPORTS: Sport[] = ["ride", "mtb", "indoor", "run", "xc_ski", "walk", "hike"];

export interface NLap {
  i: number;
  type: "WORK" | "RECOVERY" | string;
  label: string | null;
  start_s: number;
  moving_s: number;
  elapsed_s: number;
  distance_m: number | null;
  avg_power: number | null;
  np: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cad: number | null;
  elev_gain: number | null;
  avg_speed: number | null; // m/s
  decoupling: number | null;
}

/** Adaptér zdroje dat (garmin | intervals). */
export interface DataSource {
  name: "garmin" | "intervals";
  activitiesPage(start: number, limit: number): Promise<NActivity[]>;
  wellnessRange(from: string, to: string, parts?: WellnessPart[]): Promise<NWellness[]>;
  /** zjednodušený průběh jízdy pro drift: [čas s, výkon W | null, tep | null, rychlost m/s | null] */
  activitySamples?(id: string): Promise<[number, number | null, number | null, number | null][] | null>;
}

export type WellnessPart = "daily" | "sleep" | "hrv" | "weight";
