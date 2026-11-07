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
}

export interface NWellness {
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
}

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
