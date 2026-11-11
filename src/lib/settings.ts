import type { Anchor } from "../core/coach/budget";
import type { CoachProfile } from "../core/coach/profile";
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
  /** cílová kondice (CTL) k datu cíle; null = návrh +4 body týdně */
  goal_ctl: number | null;
  morning_from: string;
  morning_to: string;
  evening_time: string;
  weekly_dow: number;
  weekly_time: string;
  llm_enabled: boolean;
  llm_polish: boolean;
  /** AI model: "auto" (Gemma → Nemotron → Workers AI podle zadaných klíčů) nebo "google:<id>" / "nvidia:<id>" / "workers:<id>" */
  llm_model: string;
  icu_sync: boolean;
  garmin_key_created: string | null;
  rides_per_week: number;
  dashboard_url: string | null;
  /** stav jako v Bevelu: aktivní / nemocný / zraněný / dovolená; until = poslední den (null = do odvolání) */
  status: { kind: "active" | "sick" | "injured" | "vacation"; from: string | null; until: string | null };
  /** síla v minimu týdne */
  floor_strength: boolean;
  /** místo pro počasí na Přehledu */
  place_name: string;
  /** osobní hranice počasí: pocitově °C – pod „cold“ zima, nad „hot“ vedro, okno co nejblíž „ideal“ */
  ride_temps: { cold: number; hot: number; ideal: number };
  /** souřadnice místa pro počasí (dohledané z place_name); null = výchozí z wrangler.jsonc */
  place_lat: number | null;
  place_lon: number | null;
  /** cíl spánku (min) – základ potřeby spánku a skóre spánku (src/core/sleepCalc.ts) */
  sleep_goal_min: number;
  /** Trenér v2: nový plánovač (uložený týden, profil sportů) místo v1 */
  coach_v2: boolean;
  /** Trenér v2: profil sportovce (sporty, dny, hodiny); null = odhadne se z historie */
  coach_profile: CoachProfile | null;
  /** Trenér v2: začátek trajektorie kondice (den nastavení cíle) */
  goal_anchor: Anchor | null;
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
  goal_ctl: null,
  morning_from: "05:30",
  morning_to: "11:00",
  evening_time: "20:00",
  weekly_dow: 7,
  weekly_time: "19:30",
  llm_enabled: true,
  llm_polish: false,
  llm_model: "auto",
  icu_sync: true,
  garmin_key_created: null,
  rides_per_week: 3,
  dashboard_url: null,
  status: { kind: "active", from: null, until: null },
  floor_strength: false,
  place_name: "Hostomice",
  ride_temps: { cold: 3, hot: 30, ideal: 18 },
  place_lat: null,
  place_lon: null,
  sleep_goal_min: 480,
  coach_v2: false,
  coach_profile: null,
  goal_anchor: null,
};

/** Platný stav k datu (po „until“ automaticky zpět aktivní). */
export function statusOn(s: Settings, date: string): Settings["status"] {
  const st = s.status ?? DEFAULTS.status;
  if (st.kind === "active") return st;
  if (st.until && date > st.until) return { kind: "active", from: null, until: null };
  if (st.from && date < st.from) return { kind: "active", from: null, until: null };
  return st;
}

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
