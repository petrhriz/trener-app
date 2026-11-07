// Open-Meteo: hodinová předpověď na 8 dní (zdarma, bez klíče). Cache v D1.
import type { Env } from "../env";
import type { Hour } from "../core/weather";
import { all, execAll, getState, setStateSql, upsertSql } from "../lib/db";
import { fetchRetry } from "../lib/http";

export async function refreshWeather(env: Env, force = false): Promise<boolean> {
  const last = await getState<number>(env.DB, "weather_at");
  if (!force && last && Date.now() - last < 2 * 3600_000) return false;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${env.LAT}&longitude=${env.LON}` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_gusts_10m,wind_speed_10m,weather_code` +
    `&timezone=Europe%2FPrague&forecast_days=8&past_days=1&wind_speed_unit=kmh`;
  const res = await fetchRetry(url, {});
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = (await res.json()) as { hourly: Record<string, (number | null)[]> & { time: string[] } };
  const h = j.hourly;
  const rows = h.time.map((t, i) => [
    t.slice(0, 13) + ":00",
    h.temperature_2m?.[i] ?? null,
    h.apparent_temperature?.[i] ?? null,
    h.precipitation_probability?.[i] ?? null,
    h.precipitation?.[i] ?? null,
    h.wind_gusts_10m?.[i] ?? null,
    h.wind_speed_10m?.[i] ?? null,
    h.weather_code?.[i] ?? null,
  ]);
  const oldest = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
  await execAll(env.DB, [
    ...upsertSql("weather_hourly", ["time", "temp", "feels", "precip_prob", "precip", "gust", "wind", "code"], rows, ["time"], "replace"),
    `DELETE FROM weather_hourly WHERE time < '${oldest}'`,
    setStateSql("weather_at", Date.now()),
  ]);
  return true;
}

export async function loadHours(db: D1Database, from: string): Promise<Hour[]> {
  return all<Hour>(db, "SELECT * FROM weather_hourly WHERE time >= ? ORDER BY time", from);
}
