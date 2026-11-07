import type { Env } from "../env";
import { HttpError, fetchRetry, sleep } from "../lib/http";

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
const TOKEN_KV_KEY = "garmin:token";
/** Token platí 24 h a nejde obnovit; nový bereme, když je starší než 20 h. */
const TOKEN_MAX_AGE_MS = 20 * 3600 * 1000;
const PAUSE_MS = 250;

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

export class GarminClient {
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
    // 1 zápis do KV za ~20 h – hluboko pod limitem 1 000 zápisů/den
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

  /** Stránka aktivit (nejnovější první). */
  activities(start = 0, limit = 20) {
    return this.get<GarminActivity[]>(
      `/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`,
    );
  }
}

export interface GarminActivity {
  activityId: number;
  activityName?: string;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
  distance?: number;
  duration?: number;
  movingDuration?: number;
  elevationGain?: number;
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  activityTrainingLoad?: number;
  aerobicTrainingEffect?: number;
  avgPower?: number;
  normPower?: number;
  trainingStressScore?: number;
  intensityFactor?: number;
  [k: string]: unknown;
}
