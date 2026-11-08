import type { Env } from "../env";
import { HttpError, fetchRetry, sleep } from "../lib/http";
import { addDays, daysBetween } from "../lib/time";
import {
  mergeWellness,
  normActivityGarmin,
  normDaily,
  normHrv,
  normSleep,
  normWeight,
} from "./normalize";
import type { DataSource, NActivity, NWellness, WellnessPart } from "./types";

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
const TOKEN_KV_KEY = "garmin:token";
/** Token platí 24 h a nejde obnovit; nový bereme, když je starší než 20 h. */
const TOKEN_MAX_AGE_MS = 20 * 3600 * 1000;
const PAUSE_MS = 150;

interface StoredToken {
  token: string;
  obtainedAt: number;
}

/** Odpověď tokenu je podle dokumentace čistý text; pro jistotu zvládneme i JSON. */
export function parseTokenResponse(body: string): string {
  const t = body.trim();
  if (t.startsWith("{")) {
    const j = JSON.parse(t) as Record<string, unknown>;
    const v = j.access_token ?? j.accessToken ?? j.token;
    if (typeof v === "string" && v) return v;
    throw new Error("Garmin token: neznámý formát odpovědi");
  }
  const unq = t.replace(/^"|"$/g, "");
  if (!unq) throw new Error("Garmin token: prázdná odpověď");
  return unq;
}

export class GarminClient implements DataSource {
  name = "garmin" as const;
  constructor(private env: Env) {}

  async getToken(force = false): Promise<string> {
    if (!this.env.GARMIN_API_KEY) throw new Error("GARMIN_API_KEY chybí");
    if (!force) {
      const cached = await this.env.KV.get<StoredToken>(TOKEN_KV_KEY, "json");
      if (cached && Date.now() - cached.obtainedAt < TOKEN_MAX_AGE_MS) return cached.token;
    }
    const res = await fetchRetry(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `ApiKey ${this.env.GARMIN_API_KEY}`, Accept: "*/*" },
    });
    const body = await res.text();
    if (!res.ok) throw new HttpError(res.status, TOKEN_URL, body.slice(0, 200));
    const token = parseTokenResponse(body);
    await this.env.KV.put(TOKEN_KV_KEY, JSON.stringify({ token, obtainedAt: Date.now() } satisfies StoredToken), {
      expirationTtl: 23 * 3600,
    });
    return token;
  }

  /** GET na Garmin endpoint. Při 401 jednou obnoví token. */
  async get<T = unknown>(path: string): Promise<T> {
    let token = await this.getToken();
    for (let i = 0; i < 2; i++) {
      const url = `${BASE}${path}`;
      const res = await fetchRetry(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.status === 401 && i === 0) {
        await res.body?.cancel();
        token = await this.getToken(true);
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, url, text.slice(0, 200));
      await sleep(PAUSE_MS);
      return (text ? JSON.parse(text) : null) as T;
    }
    throw new Error("Garmin: nepodařilo se autorizovat");
  }

  /**
   * Rozsahový dotaz: při HTTP 500 (odpověď > ~256 KB) rozdělí rozsah napůl a zkusí znovu.
   */
  private async range<T>(from: string, to: string, fn: (f: string, t: string) => Promise<T[]>): Promise<T[]> {
    try {
      return await fn(from, to);
    } catch (e) {
      if (e instanceof HttpError && e.status === 500 && daysBetween(from, to) >= 1) {
        const mid = addDays(from, Math.floor(daysBetween(from, to) / 2));
        return [...(await this.range(from, mid, fn)), ...(await this.range(addDays(mid, 1), to, fn))];
      }
      throw e;
    }
  }

  async activitiesPage(start = 0, limit = 20): Promise<NActivity[]> {
    const raw = await this.get<Record<string, unknown>[]>(
      `/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`,
    );
    return (raw ?? []).map(normActivityGarmin);
  }

  /** Raw seznam (fáze 0 / diagnostika) */
  activities(start = 0, limit = 20) {
    return this.get<GarminActivity[]>(`/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`);
  }

  async wellnessRange(from: string, to: string, parts: WellnessPart[] = ["daily", "sleep", "hrv", "weight"]): Promise<NWellness[]> {
    const out: (NWellness | null)[] = [];
    if (parts.includes("daily")) {
      const d = await this.range(from, to, async (f, t) => {
        const r = await this.get<{ data?: any[] }>(`/usersummary-service/v2/dailysummaries?startDate=${f}&endDate=${t}`);
        return r?.data ?? [];
      });
      out.push(...d.map(normDaily));
    }
    if (parts.includes("sleep")) {
      const s = await this.range(from, to, async (f, t) => {
        const r = await this.get<any>(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${f}&endDate=${t}`);
        return Array.isArray(r) ? r : r ? [r] : [];
      });
      out.push(...s.map(normSleep));
    }
    if (parts.includes("hrv")) {
      const h = await this.range(from, to, async (f, t) => {
        const r = await this.get<{ hrvSummaries?: any[] }>(`/hrv-service/hrv/daily/${f}/${t}`);
        return r?.hrvSummaries ?? [];
      });
      out.push(...h.map(normHrv));
    }
    if (parts.includes("weight")) {
      const w = await this.range(from, to, async (f, t) => {
        const r = await this.get<{ dailyWeightSummaries?: any[] }>(`/weight-service/weight/range/${f}/${t}`);
        return r?.dailyWeightSummaries ?? [];
      });
      out.push(...w.map(normWeight));
    }
    return mergeWellness(out);
  }

  async fitnessAge(date: string): Promise<number | null> {
    const r = await this.get<{ fitnessAge?: number }>(`/fitnessage-service/fitnessage/v2/${date}`);
    return typeof r?.fitnessAge === "number" ? Math.round(r.fitnessAge * 10) / 10 : null;
  }

  async hrZones(): Promise<{ floors: number[]; max: number; lthr: number | null; rest: number | null } | null> {
    const r = await this.get<any[]>(`/biometric-service/heartRateZones/v2`);
    const z = (r ?? []).find((x) => x.sport === "CYCLING") ?? (r ?? []).find((x) => x.sport === "DEFAULT") ?? r?.[0];
    if (!z?.zone1Floor) return null;
    return {
      floors: [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor],
      max: z.maxHeartRateUsed,
      lthr: z.lactateThresholdHeartRateUsed ?? null,
      rest: z.restingHeartRateUsed ?? null,
    };
  }

  /** Tep během dne (vzorek po 2 min): [[ms, bpm|null], …] */
  async dailyHeartRate(date: string): Promise<{ values: [number, number | null][]; rest: number | null; min: number | null; max: number | null }> {
    const r = await this.get<any>(`/wellness-service/wellness/dailyHeartRate?date=${date}`);
    return { values: (r?.heartRateValues ?? []).filter((x: any) => Array.isArray(x)), rest: r?.restingHeartRate ?? null, min: r?.minHeartRate ?? null, max: r?.maxHeartRate ?? null };
  }

  /** Body Battery dne: klíčové body [[ms, level]] + události (spánek, odpočinek, aktivita). */
  async bodyBatteryDay(date: string): Promise<{ values: [number, number][]; events: { type: string; start: number; dur: number; impact: number | null }[]; charged: number | null; drained: number | null }> {
    const r = await this.get<any[]>(`/wellness-service/wellness/bodyBattery/reports/daily?startDate=${date}&endDate=${date}`);
    const d = (r ?? []).find((x) => x?.date === date) ?? r?.[0];
    return {
      values: (d?.bodyBatteryValuesArray ?? []).filter((x: any) => Array.isArray(x) && typeof x[1] === "number"),
      events: (d?.bodyBatteryActivityEvent ?? []).map((e: any) => ({
        type: String(e.eventType ?? ""),
        start: Date.parse(String(e.eventStartTimeGmt ?? "").replace(/\.0$/, "") + "Z"),
        dur: Number(e.durationInMilliseconds ?? 0),
        impact: typeof e.bodyBatteryImpact === "number" ? e.bodyBatteryImpact : null,
      })),
      charged: d?.charged ?? null,
      drained: d?.drained ?? null,
    };
  }

  /** VST přes noc po 5 min: [[ms, ms VST]] */
  async hrvNight(date: string): Promise<[number, number][]> {
    const r = await this.get<any>(`/hrv-service/hrv/${date}`);
    return (r?.hrvReadings ?? [])
      .map((x: any) => [Date.parse(String(x.readingTimeGMT ?? "").replace(/\.0$/, "") + "Z"), x.hrvValue] as [number, number])
      .filter((x: [number, number]) => Number.isFinite(x[0]) && typeof x[1] === "number");
  }

  /** Stres dne: čas v klidu / nízký / střední / vysoký (s) a celková úroveň. */
  async stressDay(date: string): Promise<{ rest: number; low: number; med: number; high: number; level: number | null } | null> {
    const r = await this.get<any[]>(`/usersummary-service/stats/stress/daily/${date}/${date}`);
    const v = r?.[0]?.values;
    if (!v) return null;
    return { rest: v.restStressDuration ?? 0, low: v.lowStressDuration ?? 0, med: v.mediumStressDuration ?? 0, high: v.highStressDuration ?? 0, level: v.overallStressLevel ?? null };
  }

  /** Průběh aktivity z Garminu (záloha, když aktivita není v intervals.icu): čas, tep, výkon, rychlost, výška, vzdálenost, kadence. */
  async activityStreams(id: string, points = 1500): Promise<Record<string, (number | null)[] | null> | null> {
    const d = await this.get<any>(`/activity-service/activity/${id}/details?maxChartSize=${points}&maxPolylineSize=1500`);
    const desc: { key: string; metricsIndex: number }[] = d?.metricDescriptors ?? [];
    const rows: { metrics: (number | null)[] }[] = d?.activityDetailMetrics ?? [];
    if (!rows.length) return null;
    const col = (...keys: string[]) => {
      const i = keys.map((k) => desc.find((m) => m.key === k)?.metricsIndex ?? -1).find((x) => x >= 0) ?? -1;
      return i < 0 ? null : rows.map((r) => (typeof r.metrics[i] === "number" ? (r.metrics[i] as number) : null));
    };
    return {
      time: col("sumElapsedDuration", "sumDuration") ?? rows.map((_, i) => i),
      heartrate: col("directHeartRate"),
      watts: col("directPower"),
      velocity_smooth: col("directSpeed"),
      altitude: col("directElevation"),
      distance: col("sumDistance"),
      cadence: col("directBikeCadence", "directDoubleCadence", "directRunCadence"),
      temp: col("directAirTemperature"),
      resp: col("directRespirationRate"),
      perf: col("directPerformanceCondition"),
      lat: col("directLatitude"),
      lon: col("directLongitude"),
      // trasa pro mapu (zjednodušená polyline Garminu)
      polyLat: (d?.geoPolylineDTO?.polyline ?? []).map((p: any) => (typeof p?.lat === "number" ? p.lat : null)),
      polyLon: (d?.geoPolylineDTO?.polyline ?? []).map((p: any) => (typeof p?.lon === "number" ? p.lon : null)),
    };
  }

  /** ~300 bodů průběhu jízdy (pro aerobní drift). */
  async activitySamples(id: string): Promise<[number, number | null, number | null, number | null][] | null> {
    const d = await this.get<any>(`/activity-service/activity/${id}/details?maxChartSize=300&maxPolylineSize=0`);
    const desc: { key: string; metricsIndex: number }[] = d?.metricDescriptors ?? [];
    const idx = (k: string) => desc.find((m) => m.key === k)?.metricsIndex ?? -1;
    const iT = idx("sumMovingDuration") >= 0 ? idx("sumMovingDuration") : idx("sumDuration");
    const iP = idx("directPower");
    const iH = idx("directHeartRate");
    const iS = idx("directSpeed");
    const rows: { metrics: (number | null)[] }[] = d?.activityDetailMetrics ?? [];
    if (!rows.length || iT < 0) return null;
    const v = (r: (number | null)[], i: number) => (i >= 0 && typeof r[i] === "number" ? (r[i] as number) : null);
    return rows.map((r) => [v(r.metrics, iT) ?? 0, v(r.metrics, iP), v(r.metrics, iH), v(r.metrics, iS)]);
  }
}

export interface GarminActivity {
  activityId: number;
  activityName?: string;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
  distance?: number;
  duration?: number;
  [k: string]: unknown;
}
