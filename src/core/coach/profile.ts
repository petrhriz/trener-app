// Profil sportovce pro Trenéra v2 – schválně malý: hlavní sport, další sporty a „je sníh“.
// Dny ani hodiny se nenastavují: obvyklý objem si trenér bere z toho, co uživatel opravdu jezdí (habitOf).
import { PLAN_SPORTS, type PlanSport, type Sport } from "../../datasource/types";
import { addDays, mondayOf, month } from "../../lib/time";

export interface SportPref {
  /** sport se smí plánovat (hlavní sport je zapnutý vždy) */
  enabled: boolean;
  /** smí mít intervaly (kvalitu) */
  quality: boolean;
}

export interface CoachProfile {
  v: 2;
  primary: "ride" | "run";
  sports: Record<PlanSport, SportPref>;
  /** je sníh → běžky místo části vytrvalosti */
  snow: boolean;
}

export const DEFAULT_PROFILE: CoachProfile = {
  v: 2,
  primary: "ride",
  sports: { ride: { enabled: true, quality: true }, run: { enabled: false, quality: false }, xc_ski: { enabled: false, quality: false }, walk: { enabled: false, quality: false } },
  snow: false,
};

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);

/** Kontrola a doplnění profilu (i starší podoby s hodinami a dny – ty se zahodí). Profil je vždy použitelný. */
export function validateProfile(input: unknown, base: CoachProfile = DEFAULT_PROFILE): { profile: CoachProfile; errors: string[] } {
  const errors: string[] = [];
  const p: CoachProfile = { v: 2, primary: base.primary, sports: JSON.parse(JSON.stringify(base.sports)), snow: base.snow };
  if (!isObj(input)) return { profile: p, errors: ["profil není objekt"] };
  if (input.primary != null) {
    if (input.primary === "ride" || input.primary === "run") p.primary = input.primary;
    else errors.push("hlavní sport musí být kolo (ride) nebo běh (run)");
  }
  if (isObj(input.sports))
    for (const s of PLAN_SPORTS) {
      const x = input.sports[s];
      if (!isObj(x)) continue;
      if (typeof x.enabled === "boolean") p.sports[s].enabled = x.enabled;
      if (typeof x.quality === "boolean") p.sports[s].quality = x.quality;
    }
  if (typeof input.snow === "boolean") p.snow = input.snow;
  p.sports[p.primary] = { enabled: true, quality: true };
  p.sports.walk.quality = false;
  return { profile: p, errors };
}

export const WINTER_MONTHS = [11, 12, 1, 2];
export const isWinter = (date: string) => WINTER_MONTHS.includes(month(date));

const SPORT_CZ: Record<PlanSport, string> = { ride: "kolo", run: "běh", xc_ski: "běžky", walk: "chůze" };

/** Shrnutí profilu lidsky. */
export function profileSummary(p: CoachProfile): string[] {
  const other = PLAN_SPORTS.filter((s) => s !== p.primary && p.sports[s].enabled);
  const out = [`Hlavní sport: ${SPORT_CZ[p.primary]}.`];
  out.push(other.length ? `Občas taky: ${other.map((s) => `${SPORT_CZ[s]}${p.sports[s].quality ? " (i intervaly)" : ""}`).join(", ")}.` : "Jiné sporty trenér sám neplánuje (u dne si je můžeš zvolit).");
  if (p.sports.xc_ski.enabled) out.push(p.snow ? "Je sníh – běžky se plánují." : "Běžky se plánují, až zapneš „Je sníh“.");
  return out;
}

export interface HistAct {
  date: string;
  sport: Sport;
  moving_s: number | null;
}

const groupOf = (s: Sport): PlanSport | null => (s === "ride" || s === "mtb" || s === "indoor" ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);

/** Výchozí profil nového uživatele z historie (12 týdnů): hlavní sport = kde je nejvíc času, další sporty, které dělá. */
export function profileFromHistory(acts: HistAct[], today: string): CoachProfile {
  const p: CoachProfile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  const from = addDays(mondayOf(today), -84);
  const time: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  const count: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  for (const x of acts) {
    const g = groupOf(x.sport);
    if (!g || x.date < from || (x.moving_s ?? 0) < 20 * 60) continue;
    time[g] += x.moving_s ?? 0;
    count[g]++;
  }
  if (time.run > time.ride) p.primary = "run";
  p.sports[p.primary] = { enabled: true, quality: true };
  const other = p.primary === "ride" ? "run" : "ride";
  if (count[other] >= 4) p.sports[other] = { enabled: true, quality: count[other] >= 12 };
  if (count.xc_ski >= 2) p.sports.xc_ski.enabled = true;
  return p;
}

export interface Habit {
  /** obvyklé hodiny týdně (vytrvalostní sporty), null = bez historie */
  hours: number | null;
  /** obvyklý počet tréninků týdně */
  sessions: number | null;
  /** kolik ukončených týdnů z 8 se trénovalo */
  weeks: number;
}

/**
 * Obvyklý objem z posledních 8 ukončených týdnů. Bere se horní čtvrtina (3. kvartil) týdnů, kdy se trénovalo:
 * pár vynechaných týdnů (zkoušky, nemoc, hnusně) tak plán nestáhne dolů.
 */
export function habitOf(acts: HistAct[], today: string): Habit {
  const mon = mondayOf(today);
  const hours: number[] = [], sessions: number[] = [];
  for (let w = 1; w <= 8; w++) {
    const from = addDays(mon, -7 * w), to = addDays(from, 6);
    const a = acts.filter((x) => x.date >= from && x.date <= to && groupOf(x.sport) && groupOf(x.sport) !== "walk" && (x.moving_s ?? 0) >= 20 * 60);
    if (!a.length) continue;
    hours.push(a.reduce((t, x) => t + (x.moving_s ?? 0), 0) / 3600);
    sessions.push(new Set(a.map((x) => x.date)).size);
  }
  if (!hours.length) return { hours: null, sessions: null, weeks: 0 };
  const q3 = (v: number[]) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.75))]!; };
  return { hours: Math.round(q3(hours) * 4) / 4, sessions: q3(sessions), weeks: hours.length };
}
