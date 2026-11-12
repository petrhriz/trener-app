// Výpočet energie po dnech (src/core/energy.ts): tep z Garminu (1 dotaz na den), spánek, aktivity a stres z D1.
// Den navazuje na konec předchozího (energy_end). Výsledek: souhrn do wellness (bb_*), průběh do energy_day.
import type { Env } from "../env";
import { energyDay, type StressDist } from "../core/energy";
import { recoveryScore, type NightRow } from "../core/readinessScore";
import { GarminClient } from "../datasource/garmin";
import { all, execAll, lit, upsertSql } from "../lib/db";
import { addDays, localIsoToMs } from "../lib/time";

/** Výchozí hladina, když předchozí den nemáme (první výpočet) – za pár dní se srovná. */
const START_DEFAULT = 50;

interface WRow {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleep_hr: number | null;
  sleep_s: number | null;
  sleep_need_min: number | null;
  sleep_score: number | null;
  sleep_resp: number | null;
  sleep_start: string | null;
  wake_time: string | null;
  stress_dist: string | null;
  energy_end: number | null;
}

/**
 * Spočítá dny `dates` (vzestupně, navazující) a uloží je. Vrací počet spočítaných dnů.
 * `hrOf` = tep dne (Garmin dailyHeartRate) – v testech náhrada.
 */
export async function computeEnergy(
  env: Env,
  dates: string[],
  hrOf: (date: string) => Promise<[number, number | null][] | null> = async (d) => (await new GarminClient(env).dailyHeartRate(d)).values,
): Promise<number> {
  if (!dates.length) return 0;
  const tz = env.TZ_NAME || "Europe/Prague";
  const first = dates[0]!, last = dates[dates.length - 1]!;
  const rows = await all<WRow>(
    env.DB,
    "SELECT date, hrv, rhr, sleep_hr, sleep_s, sleep_need_min, sleep_score, sleep_resp, sleep_start, wake_time, stress_dist, energy_end FROM wellness WHERE date >= ? AND date <= ? ORDER BY date",
    addDays(first, -70), addDays(last, 1),
  );
  const acts = await all<{ start_local: string; duration_s: number | null; moving_s: number | null }>(
    env.DB, "SELECT start_local, duration_s, moving_s FROM activities WHERE date >= ? AND date <= ?", addDays(first, -1), last,
  );
  const by = new Map(rows.map((r) => [r.date, r]));
  const nights: NightRow[] = rows.map((r) => ({ date: r.date, hrv: r.hrv, rhr: r.rhr, sleep_hr: r.sleep_hr, sleep_s: r.sleep_s, sleep_need_min: r.sleep_need_min, sleep_score: r.sleep_score, sleep_resp: r.sleep_resp }));
  const recOf = (d: string) => recoveryScore(nights.find((n) => n.date === d) ?? null, nights).score;
  const sleepOf = (d: string) => {
    const r = by.get(d);
    if (!r?.sleep_start || !r.wake_time) return null;
    return { start: localIsoToMs(r.sleep_start, tz), end: localIsoToMs(r.wake_time, tz), recovery: recOf(d) };
  };
  const actList = acts.map((a) => {
    const s = localIsoToMs(a.start_local.replace(" ", "T"), tz);
    return { start: s, end: s + (a.duration_s ?? a.moving_s ?? 0) * 1000 };
  });

  let prevEnd: number | null = by.get(addDays(first, -1))?.energy_end ?? null;
  const sqls: string[] = [];
  const now = new Date().toISOString();
  let n = 0;
  for (const d of dates) {
    const hr = await hrOf(d).catch(() => null);
    if (!hr || !hr.some((p) => typeof p[1] === "number")) { prevEnd = by.get(d)?.energy_end ?? prevEnd; continue; }
    const r = by.get(d);
    let dist: StressDist | null = null;
    try { dist = r?.stress_dist ? JSON.parse(r.stress_dist) : null; } catch { dist = null; }
    const e = energyDay({
      hr,
      sleeps: [sleepOf(d), sleepOf(addDays(d, 1))].filter((x): x is NonNullable<typeof x> => !!x),
      acts: actList,
      rhr: r?.rhr ?? null,
      dist,
      start: prevEnd ?? START_DEFAULT,
    });
    const latest = e.pts.length ? e.pts[e.pts.length - 1]![1] : null;
    sqls.push(
      ...upsertSql("wellness", ["date", "bb_max", "bb_min", "bb_charged", "bb_drained", "bb_latest", "energy_end"], [[d, e.max, e.min, e.charged, e.drained, latest != null ? Math.round(latest) : null, e.end]], ["date"], "replace"),
      `INSERT INTO energy_day (date, data, updated_at) VALUES (${lit(d)}, ${lit(JSON.stringify({ ...e, start: prevEnd ?? START_DEFAULT }))}, ${lit(now)}) ON CONFLICT(date) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    );
    prevEnd = e.end;
    n++;
  }
  await execAll(env.DB, sqls);
  return n;
}
