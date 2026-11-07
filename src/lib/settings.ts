import { all, lit } from "./db";

export interface Settings {
  first_name: string;
  ftp: number | null;
  /** Hranice zón tepu (dolní hranice Z1..Z5) + max, z Garminu nebo ručně */
  hr_zones: { floors: number[]; max: number; lthr: number | null; rest: number | null; source: string } | null;
  /** horní hranice Z1..Z6 v % FTP (Coggan, jako výchozí intervals.icu) */
  power_zones_pct: number[];
  goal: "udrzeni" | "zvyseni" | "pokles" | "zavod";
  goal_name: string | null;
  goal_date: string | null;
  year_km_goal: number | null;
  morning_from: string;
  morning_to: string;
  evening_time: string;
  weekly_dow: number;
  weekly_time: string;
  llm_enabled: boolean;
  llm_polish: boolean;
  icu_sync: boolean;
  garmin_key_created: string | null;
  rides_per_week: number;
  dashboard_url: string | null;
}

export const DEFAULTS: Settings = {
  first_name: "Petr",
  ftp: null,
  hr_zones: null,
  power_zones_pct: [55, 75, 90, 105, 120, 150],
  goal: "zvyseni",
  goal_name: "120 km pod 4 h i s kopci (volitelné)",
  goal_date: null,
  year_km_goal: null,
  morning_from: "05:30",
  morning_to: "11:00",
  evening_time: "20:00",
  weekly_dow: 7,
  weekly_time: "19:30",
  llm_enabled: true,
  llm_polish: false,
  icu_sync: true,
  garmin_key_created: null,
  rides_per_week: 3,
  dashboard_url: null,
};

export async function getSettings(db: D1Database): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>(db, "SELECT key, value FROM settings");
  const s: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) {
    if (r.key in DEFAULTS) {
      try {
        s[r.key] = JSON.parse(r.value);
      } catch {
        /* ignorovat poškozenou hodnotu */
      }
    }
  }
  return s as unknown as Settings;
}

export function setSettingSql(key: keyof Settings, value: unknown): string {
  return `INSERT INTO settings (key, value) VALUES (${lit(key)}, ${lit(JSON.stringify(value))}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
}

export async function setSetting(db: D1Database, key: keyof Settings, value: unknown): Promise<void> {
  await db.prepare(setSettingSql(key, value)).run();
}
