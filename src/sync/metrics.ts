// Inkrementální přepočet daily_metrics: zapisují se jen změněné řádky.
import { type Anchor, computeMetrics } from "../core/fitness";
import { activityLoad } from "../core/load";
import { all, execAll, upsertSql } from "../lib/db";
import type { Settings } from "../lib/settings";
import { loadZoneHistory, zonesFor } from "../lib/zoneHistory";

export async function recomputeMetrics(db: D1Database, today: string): Promise<number> {
  // delta = trenažér, kde aplikace počítá vyšší zátěž z tepu (hr_indoor), než intervals.icu započítalo do své kondice
  const loads = await all<{ date: string; load: number; delta: number }>(db, "SELECT date, SUM(COALESCE(load, 0)) AS load, SUM(CASE WHEN load_source = 'hr_indoor' AND icu_load IS NOT NULL THEN load - icu_load ELSE 0 END) AS delta FROM activities GROUP BY date ORDER BY date");
  if (!loads.length) return 0;
  const map = new Map(loads.map((r) => [r.date, r.load]));
  const deltas = new Map(loads.filter((r) => Math.abs(r.delta ?? 0) > 0.05).map((r) => [r.date, r.delta]));
  const icu = await all<{ date: string; icu_ctl: number; icu_atl: number; icu_ramp: number | null }>(
    db,
    "SELECT date, icu_ctl, icu_atl, icu_ramp FROM wellness WHERE icu_ctl IS NOT NULL AND icu_atl IS NOT NULL",
  );
  const anchors = new Map<string, Anchor>(icu.map((r) => [r.date, { ctl: r.icu_ctl, atl: r.icu_atl, ramp: r.icu_ramp }]));
  // kde intervals.icu hodnotu má, platí ta; jinak (např. před první synchronizací dne) pokračuje výpočet
  const series = computeMetrics(map, loads[0]!.date, today, { ctl: 0, atl: 0 }, anchors, deltas);
  const existing = new Map(
    (await all<{ date: string; load: number; ctl: number; atl: number; form: number; ramp: number | null }>(db, "SELECT * FROM daily_metrics")).map((r) => [r.date, r]),
  );
  const changed = series.filter((m) => {
    const e = existing.get(m.date);
    return !e || Math.abs(e.ctl - m.ctl) > 0.005 || Math.abs(e.atl - m.atl) > 0.005 || Math.abs(e.load - m.load) > 0.05 || (e.ramp ?? -999) !== (m.ramp ?? -999);
  });
  await execAll(
    db,
    upsertSql("daily_metrics", ["date", "load", "ctl", "atl", "form", "ramp"], changed.map((m) => [m.date, m.load, m.ctl, m.atl, m.form, m.ramp]), ["date"], "replace"),
  );
  return changed.length;
}

/** Po změně FTP / zón: přepočítat zátěž aktivit, které na nich závisí. */
export async function recomputeLoads(db: D1Database, s: Settings): Promise<number> {
  const rows = await all<any>(db, "SELECT id, date, sport, moving_s, np, tss_garmin, hr_z, avg_hr, load, load_source FROM activities WHERE load_source IN ('np_ftp', 'hr_avg', 'hr_zones', 'hr_indoor', 'none') OR load IS NULL OR sport = 'indoor'");
  const upd: unknown[][] = [];
  // FTP a zóny platné v den aktivity, ne dnešní
  const hist = await loadZoneHistory(db);
  for (const r of rows) {
    const z = zonesFor(hist, r.date, s);
    const ld = activityLoad({ ...r, hr_z: r.hr_z ? JSON.parse(r.hr_z) : null }, { ftp: z.ftp, hr: z.hr });
    // trenažér se zátěží z Garminu / intervals.icu: přepsat jen tam, kde vyšší zátěž dává tep
    if (r.sport === "indoor" && ld.source !== "hr_indoor" && r.load_source !== "hr_indoor" && r.load != null) continue;
    if (ld.load !== r.load) upd.push([r.id, ld.load, ld.source]);
  }
  // UPDATE přes INSERT … ON CONFLICT (jen existující id)
  const sqls = upd.map((u) => `UPDATE activities SET load = ${u[1]}, load_source = '${u[2]}' WHERE id = '${String(u[0]).replace(/'/g, "''")}'`);
  for (let i = 0; i < sqls.length; i += 40) await execAll(db, sqls.slice(i, i + 40));
  if (upd.length) await db.prepare("INSERT INTO sync_state (key, value) VALUES ('metrics_dirty', '\"1900-01-01\"') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  return upd.length;
}
