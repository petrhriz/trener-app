// intervals.icu REST API: doplněk (lapy, VO2max, srovnání) + zrcadlo plánu do kalendáře + plán B.
import type { Env } from "../env";
import { HttpError, fetchRetry } from "../lib/http";
import { sportFromGarmin } from "./normalize";
import type { DataSource, NActivity, NLap, NWellness } from "./types";

const BASE = "https://intervals.icu/api/v1";
type J = Record<string, any>;

export class IntervalsClient implements DataSource {
  name = "intervals" as const;
  constructor(private env: Env) {}

  get configured(): boolean {
    return !!(this.env.INTERVALS_API_KEY && this.env.INTERVALS_ATHLETE_ID);
  }

  private auth() {
    return "Basic " + btoa(`API_KEY:${this.env.INTERVALS_API_KEY}`);
  }

  async req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.configured) throw new Error("intervals.icu není nastavené");
    const url = `${BASE}${path}`;
    const res = await fetchRetry(url, {
      method,
      headers: {
        Authorization: this.auth(),
        Accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, url, text.slice(0, 200));
    return (text ? JSON.parse(text) : null) as T;
  }

  private get ath() {
    return `/athlete/${this.env.INTERVALS_ATHLETE_ID}`;
  }

  athlete() {
    return this.req<J>("GET", this.ath);
  }

  /** FTP, LTHR a zóny pro kolo ze sport settings */
  async rideSettings(): Promise<{ ftp: number | null; lthr: number | null; maxHr: number | null; hrZones: number[] | null; powerZones: number[] | null } | null> {
    const a = await this.athlete();
    const s = (a?.sportSettings ?? []).find((x: J) => (x.types ?? []).includes("Ride")) ?? a?.sportSettings?.[0];
    if (!s) return null;
    return { ftp: s.ftp ?? null, lthr: s.lthr ?? null, maxHr: s.max_hr ?? null, hrZones: s.hr_zones ?? null, powerZones: s.power_zones ?? null };
  }

  wellnessRaw(from: string, to: string) {
    return this.req<J[]>("GET", `${this.ath}/wellness?oldest=${from}&newest=${to}`);
  }

  activitiesRaw(from: string, to: string) {
    return this.req<J[]>("GET", `${this.ath}/activities?oldest=${from}&newest=${to}`);
  }

  /** Jen vybraná pole (odpověď ~50× menší – dočítání historie se vejde do limitu CPU). */
  activitiesFields(from: string, to: string, fields: string[]) {
    return this.req<J[]>("GET", `${this.ath}/activities?oldest=${from}&newest=${to}&fields=${fields.join(",")}`);
  }

  async laps(icuId: string): Promise<NLap[]> {
    const r = await this.req<{ icu_intervals?: J[] }>("GET", `/activity/${icuId}/intervals`);
    return (r?.icu_intervals ?? []).map((x, i) => ({
      i,
      type: x.type ?? "WORK",
      label: x.label ?? null,
      start_s: x.start_time ?? 0,
      moving_s: x.moving_time ?? 0,
      elapsed_s: x.elapsed_time ?? 0,
      distance_m: x.distance ?? null,
      avg_power: x.average_watts ?? null,
      np: x.weighted_average_watts ?? null,
      avg_hr: x.average_heartrate ?? null,
      max_hr: x.max_heartrate ?? null,
      avg_cad: x.average_cadence ?? null,
      elev_gain: x.total_elevation_gain ?? null,
      avg_speed: x.average_speed ?? null,
      decoupling: x.decoupling ?? null,
    }));
  }

  // ---- kalendář (events) ----
  events(from: string, to: string) {
    return this.req<J[]>("GET", `${this.ath}/events?oldest=${from}&newest=${to}`);
  }
  createEvent(ev: J) {
    return this.req<J>("POST", `${this.ath}/events`, ev);
  }
  updateEvent(id: string | number, ev: J) {
    return this.req<J>("PUT", `${this.ath}/events/${id}`, ev);
  }
  deleteEvent(id: string | number) {
    return this.req<unknown>("DELETE", `${this.ath}/events/${id}`);
  }

  // ---- plán B: DataSource z intervals.icu ----
  async activitiesPage(start: number, limit: number): Promise<NActivity[]> {
    // intervals.icu stránkuje podle data – plán B bere posledních 400 dní najednou a stránkuje lokálně
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
    const all = (await this.activitiesRaw(from, to)).sort((a, b) => String(b.start_date_local).localeCompare(String(a.start_date_local)));
    return all.slice(start, start + limit).map(normActivityIcu);
  }

  async wellnessRange(from: string, to: string): Promise<NWellness[]> {
    return (await this.wellnessRaw(from, to)).map((w) => ({
      date: w.id,
      hrv: w.hrv ?? null,
      rhr: w.restingHR ?? null,
      sleep_s: w.sleepSecs ?? null,
      sleep_score_g: w.sleepScore ?? null,
      sleep_q: w.sleepQuality ? `Q${w.sleepQuality}` : null,
      steps: w.steps ?? null,
      weight_kg: w.weight ?? null,
      vo2max: w.vo2max ?? null,
      stress_avg: w.stress ?? null,
    }));
  }
}

export function normActivityIcu(a: J): NActivity {
  const start = String(a.start_date_local ?? "").replace("T", " ").slice(0, 19);
  const typeMap: Record<string, string> = {
    Ride: "road_biking",
    VirtualRide: "indoor_cycling",
    MountainBikeRide: "mountain_biking",
    GravelRide: "gravel_cycling",
    Run: "running",
    Walk: "walking",
    Hike: "hiking",
    NordicSki: "cross_country_skiing_ws",
    IceSkate: "skating",
    WeightTraining: "strength_training",
    Yoga: "yoga",
  };
  const tk = typeMap[a.type] ?? String(a.type ?? "other").toLowerCase();
  const pz = Array.isArray(a.icu_zone_times)
    ? a.icu_zone_times.filter((z: J) => /^Z\d$/.test(z.id)).map((z: J) => z.secs ?? 0)
    : null;
  return {
    id: String(a.external_id ?? a.id),
    start_local: start,
    date: start.slice(0, 10),
    type_key: tk,
    sport: a.trainer ? "indoor" : sportFromGarmin(tk, a.name),
    name: a.name ?? null,
    distance_m: a.distance ?? null,
    duration_s: a.elapsed_time ?? null,
    moving_s: a.moving_time ?? null,
    elev_gain: a.total_elevation_gain ?? null,
    avg_hr: a.average_heartrate ?? null,
    max_hr: a.max_heartrate ?? null,
    avg_power: a.device_watts ? (a.icu_average_watts ?? null) : null,
    max_power: null,
    np: a.device_watts ? (a.icu_weighted_avg_watts ?? null) : null,
    max20: null,
    tss_garmin: null,
    if_garmin: null,
    garmin_load: null,
    aerobic_te: null,
    avg_cad: a.average_cadence ?? null,
    min_temp: a.min_temp ?? null,
    max_temp: a.max_temp ?? null,
    lap_count: a.icu_lap_count ?? null,
    calories: a.calories ?? null,
    hr_z: Array.isArray(a.icu_hr_zone_times) ? a.icu_hr_zone_times.slice(0, 5) : null,
    pwr_z: pz && pz.length ? pz : null,
    mmp: null,
  };
}
