// FTP a zóny tepu s datem platnosti (tabulka zone_history). Výpočty jsou v src/core/zones.ts.
import { type HrZones, type ZoneHistRow, type ZonesOfDay, zonesAt, zonesChanged } from "../core/zones";
import { all, run } from "./db";
import type { Settings } from "./settings";

export async function loadZoneHistory(db: D1Database): Promise<ZoneHistRow[]> {
  const rows = await all<{ date: string; ftp: number | null; hr_zones: string | null }>(db, "SELECT date, ftp, hr_zones FROM zone_history ORDER BY date");
  return rows.map((r) => {
    let hr: HrZones | null = null;
    try { hr = r.hr_zones ? JSON.parse(r.hr_zones) : null; } catch { hr = null; }
    return { date: r.date, ftp: r.ftp, hr };
  });
}

/** FTP a zóny platné v den `date` (bez historie = dnešní nastavení). */
export function zonesFor(hist: ZoneHistRow[] | undefined, date: string, s: Pick<Settings, "ftp" | "hr_zones">): ZonesOfDay {
  return zonesAt(hist ?? [], date, { ftp: s.ftp, hr: s.hr_zones });
}

/** Když se dnešní FTP nebo zóny liší od historie, zapíše řádek s platností od dneška. Vrací true při zápisu. */
export async function recordZones(db: D1Database, today: string, s: Pick<Settings, "ftp" | "hr_zones">, hist?: ZoneHistRow[]): Promise<boolean> {
  const h = hist ?? (await loadZoneHistory(db));
  const ch = zonesChanged(h, today, { ftp: s.ftp, hr: s.hr_zones });
  if (!ch.ftp && !ch.hr) return false;
  await run(
    db,
    "INSERT INTO zone_history (date, ftp, hr_zones, source, created_at) VALUES (?, ?, ?, 'settings', ?) ON CONFLICT(date) DO UPDATE SET ftp = COALESCE(excluded.ftp, ftp), hr_zones = COALESCE(excluded.hr_zones, hr_zones), source = 'settings'",
    today,
    ch.ftp ? s.ftp : null,
    ch.hr && s.hr_zones ? JSON.stringify(s.hr_zones) : null,
    new Date().toISOString(),
  );
  return true;
}
