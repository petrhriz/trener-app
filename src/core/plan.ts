// Typy plánu (Trenér v3: src/core/coach/) a pomocné texty pro zprávy. Plánovač je v src/core/coach/engine.ts.
import { num } from "../lib/format";
import type { PlanSport } from "../datasource/types";
import { formZone } from "./fitness";
import type { OwnRide } from "./ownRide";
import type { QualityType } from "./quality";
import type { DayWeather } from "./weather";
import type { Workout } from "./workout";

export type Kind = "z2" | "quality" | "long" | "recovery" | "rest";

export interface CalItem {
  id: number;
  date: string;
  kind: Kind;
  quality_type: string | null;
  name: string;
  indoor: number;
  duration_min: number | null;
  steps_json: string | null;
  steps_text: string | null;
  target_load: number | null;
  reason: string | null;
  status: string;
  sport?: string | null;
  goal?: string | null;
  icu_event_id?: string | null;
}

export interface Constraint {
  date: string;
  /** sport = náhrada kola jiným sportem, note = ride | run | xc_ski | walk; typ = vynucený druh jednotky, note = z2 | quality */
  /** kroky = tvoje úprava kvality, note = JSON {reps, work_s, pct} (Trenér v2) */
  /** trenazer = kde pojedeš (kolo), note = 1 (trenažér) | 0 (venku); bez záznamu rozhodne trenér (počasí, zima) */
  kind: "nemuzu" | "bezky" | "nemoc" | "dovolena" | "nepojedu" | "sport" | "typ" | "jizda" | "delka" | "kroky" | "trenazer";
  note: string | null;
}

export type ChangeAction = "nová" | "upravit" | "přesunout" | "smazat";

export interface Payload {
  date: string;
  kind: Kind;
  quality_type: string | null;
  name: string;
  indoor: number;
  duration_min: number;
  steps_json: string;
  steps_text: string;
  target_load: number;
  reason: string;
  moved_from?: string | null;
  sport?: PlanSport;
  goal?: string;
}

export interface Change {
  code: string;
  date: string;
  action: ChangeAction;
  name: string;
  why: string;
  targetId?: number;
  payload?: Payload;
}

export interface PlanDay {
  date: string;
  isToday: boolean;
  orientational: boolean;
  kind: Kind | "xc_ski" | "blocked";
  tag: string;
  tagClass: "q" | "e" | "";
  name: string | null;
  indoor: boolean;
  durationMin: number | null;
  workout: Workout | null;
  steps: string[];
  targetText: string | null;
  /** odhad jídla a pití na trénink podle délky, intenzity, teploty a hmotnosti (src/core/extras.ts) */
  fuel: string[];
  load: number;
  loadNote: string;
  form: number | null;
  formZone: string | null;
  weather: DayWeather | null;
  weatherText: string;
  note: string;
  qualityType: QualityType | null;
  calId: number | null;
  /** kalendářní položka, která se mění (pro diff) */
  changed: ChangeAction | null;
  /** sport jednotky (ride | run | xc_ski | walk) */
  sport: PlanSport;
  /** volno zvolené uživatelem */
  userRest?: boolean;
  /** vlastní jízda zadaná uživatelem (délka, s kým) */
  own?: OwnRide | null;
  /** den upravený uživatelem (sport, druh, délka, volno, vlastní jízda) */
  mine?: boolean;
  /** tvoje volba místa jízdy: true = trenažér, false = venku, null = rozhodne trenér */
  indoorChoice?: boolean | null;
}

export interface PlanResult {
  from: string;
  to: string;
  days: PlanDay[];
  changes: Change[];
  chart: { date: string; load: number; planned: boolean; quality: boolean; today: boolean }[];
  loadPast7: number;
  loadNext7: number;
  qualityWeeks: { from: string; to: string; count: number; limit: number }[];
  warnings: string[];
  weeklyTarget: { lo: number; hi: number; mid: number };
  missed: { id: number; date: string; name: string; kind: Kind }[];
  done: { id: number; date: string }[];
}

export function formText(f: number | null): string {
  if (f == null) return "–";
  const z = formZone(f);
  return `${f > 0 ? "+" : f < 0 ? "−" : ""}${num(Math.abs(f), 1)} (${z})`;
}

