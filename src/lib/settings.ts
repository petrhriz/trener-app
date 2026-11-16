import type { CoachProfile } from "../core/coach/profile";
import { all, lit } from "./db";

export interface Settings {
  first_name: string;
  ftp: number | null;
  /** Hranice zón tepu (dolní hranice Z1..Z5) + max, z Garminu nebo ručně */
  hr_zones: { floors: number[]; max: number; lthr: number | null; rest: number | null; source: string } | null;
  /** Zóny tepu pro běh přímo z Garminu (sport RUNNING); Garmin podle nich počítá čas v zónách u běhu */
  hr_zones_run: { floors: number[]; max: number; lthr: number | null; rest: number | null; source: string } | null;
  /** horní hranice Z1..Z6 v % FTP (Coggan, jako výchozí intervals.icu) */
  power_zones_pct: number[];
  goal: "udrzeni" | "zvyseni" | "pokles" | "zavod";
  goal_name: string | null;
  goal_date: string | null;
  year_km_goal: number | null;
  /** cílová kondice (CTL) k datu cíle; null = návrh +4 body týdně */
  goal_ctl: number | null;
  llm_enabled: boolean;
  /** AI nedostane zdravotní údaje (VST, spánek, klidový tep, stres, Body Battery, váha) – src/core/privacy.ts */
  ai_private: boolean;
  /** AI model: "auto" (Gemma → Nemotron → Workers AI podle zadaných klíčů) nebo "google:<id>" / "nvidia:<id>" / "workers:<id>" */
  llm_model: string;
  /** AI zhodnocení nahoře na stránce aktivity; vypnuté = jen text z kódu (a AI se na to nevolá) */
  act_ai: boolean;
  icu_sync: boolean;
  garmin_key_created: string | null;
  rides_per_week: number;
  /** stav: aktivní / nemocný / zraněný / dovolená; until = poslední den (null = do odvolání) */
  status: { kind: "active" | "sick" | "injured" | "vacation"; from: string | null; until: string | null };
  /** ukončená období stavu Nemocný / Zraněný / Dovolená (trenér je nepočítá do průměru posledních týdnů) */
  status_log: { kind: string; from: string; until: string }[];
  /** místo pro počasí na Přehledu */
  place_name: string;
  /** osobní hranice počasí: teplota vzduchu °C – pod „cold“ zima, nad „hot“ vedro, okno co nejblíž „ideal“ */
  ride_temps: { cold: number; hot: number; ideal: number };
  /** souřadnice místa pro počasí (dohledané z place_name); null = výchozí z wrangler.jsonc */
  place_lat: number | null;
  place_lon: number | null;
  /** druhé místo pro počasí (hory, chata) – přepínač na stránce Počasí; null = žádné */
  place2_name: string | null;
  /** souřadnice druhého místa (dohledané z place2_name) */
  place2_lat: number | null;
  place2_lon: number | null;
  /** Trenér: profil sportovce (hlavní sport, další sporty); null = odhadne se z historie */
  coach_profile: CoachProfile | null;
  /** Trenér zapnutý; vypnutý = nic se neplánuje, jen odjeté tréninky proti zátěži na udržení kondice */
  coach_on: boolean;
}

export const DEFAULTS: Settings = {
  first_name: "",
  ftp: null,
  hr_zones: null,
  hr_zones_run: null,
  power_zones_pct: [55, 75, 90, 105, 120, 150],
  goal: "zvyseni",
  goal_name: null,
  goal_date: null,
  year_km_goal: null,
  goal_ctl: null,
  llm_enabled: true,
  ai_private: false,
  llm_model: "auto",
  act_ai: true,
  icu_sync: true,
  garmin_key_created: null,
  rides_per_week: 3,
  status: { kind: "active", from: null, until: null },
  status_log: [],
  place_name: "Praha",
  ride_temps: { cold: 3, hot: 30, ideal: 18 },
  place_lat: null,
  place_lon: null,
  place2_name: "Cínovec",
  place2_lat: 50.73,
  place2_lon: 13.77,
  coach_profile: null,
  coach_on: true,
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
