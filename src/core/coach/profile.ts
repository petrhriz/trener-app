// Profil sportovce pro Trenéra v2: sporty, dny, hodiny, mix po měsících. Každý uživatel má svůj (settings.coach_profile).
import { PLAN_SPORTS, type PlanSport, type Sport } from "../../datasource/types";
import { addDays, dow, mondayOf, month } from "../../lib/time";

export interface SportPref {
  enabled: boolean;
  /** nejvýš tolikrát týdně (null = bez stropu) */
  maxPerWeek: number | null;
  /** nejdelší jednotka v minutách (null = bez stropu) */
  maxMin: number | null;
  /** smí mít intervaly (kvalitu) */
  quality: boolean;
}

export interface HoursBand {
  min: number;
  max: number;
}

export interface CoachProfile {
  v: 1;
  primary: "ride" | "run";
  sports: Record<PlanSport, SportPref>;
  /** podíl času vedlejších sportů (0–1) po měsících; co chybí do 1, je hlavní sport */
  mix: { months: number[]; share: Partial<Record<PlanSport, number>> }[];
  days: {
    /** dny, kdy trénuješ nejraději (1 = po … 7 = ne) */
    preferred: number[];
    /** dny, kdy nemůžeš */
    unavailable: number[];
    /** den dlouhého tréninku; null = vybere trenér */
    long: number | null;
  };
  hours: { season: HoursBand; winter: HoursBand; snow: HoursBand };
  winterMonths: number[];
  /** je sníh → běžky a hodiny „se sněhem“ */
  snow: boolean;
  /** nejvýš tréninků týdně (null = podle hodin) */
  maxSessions: number | null;
  /** růst kondice (CTL) za týden při cíli Zlepšit */
  ramp: number;
}

const pref = (enabled: boolean, maxPerWeek: number | null = null, maxMin: number | null = null, quality = false): SportPref => ({ enabled, maxPerWeek, maxMin, quality });

export const DEFAULT_PROFILE: CoachProfile = {
  v: 1,
  primary: "ride",
  sports: { ride: pref(true, null, null, true), run: pref(false, 1, 60), xc_ski: pref(false, 2, 120), walk: pref(false, 2, 90) },
  mix: [],
  days: { preferred: [], unavailable: [], long: null },
  hours: { season: { min: 4, max: 6 }, winter: { min: 3, max: 4 }, snow: { min: 3, max: 5 } },
  winterMonths: [11, 12, 1, 2],
  snow: false,
  maxSessions: null,
  ramp: 1.5,
};

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const numIn = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : null);
const dayList = (x: unknown): number[] | null => (Array.isArray(x) && x.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ? [...new Set(x as number[])].sort() : null);

/**
 * Kontrola a doplnění profilu (vstup z Nastavení nebo z AI). Neznámá pole zahodí, chybějící doplní výchozími.
 * `errors` = co bylo špatně (česky, pro uživatele / druhý pokus AI). Profil je vždy použitelný.
 */
export function validateProfile(input: unknown, base: CoachProfile = DEFAULT_PROFILE): { profile: CoachProfile; errors: string[] } {
  const errors: string[] = [];
  const p: CoachProfile = JSON.parse(JSON.stringify(base));
  if (!isObj(input)) return { profile: p, errors: ["profil není objekt"] };
  if (input.primary != null) {
    if (input.primary === "ride" || input.primary === "run") p.primary = input.primary;
    else errors.push("hlavní sport musí být kolo (ride) nebo běh (run)");
  }
  if (isObj(input.sports)) {
    for (const s of PLAN_SPORTS) {
      const x = input.sports[s];
      if (!isObj(x)) continue;
      const cur = p.sports[s];
      if (typeof x.enabled === "boolean") cur.enabled = x.enabled;
      if ("maxPerWeek" in x) {
        if (x.maxPerWeek == null) cur.maxPerWeek = null;
        else if (numIn(x.maxPerWeek, 0, 7) != null) cur.maxPerWeek = Math.round(x.maxPerWeek);
        else errors.push(`${s}: počet týdně 0–7`);
      }
      if ("maxMin" in x) {
        if (x.maxMin == null) cur.maxMin = null;
        else if (numIn(x.maxMin, 20, 600) != null) cur.maxMin = Math.round(x.maxMin);
        else errors.push(`${s}: nejdelší jednotka 20–600 min`);
      }
      if (typeof x.quality === "boolean") cur.quality = x.quality;
    }
  }
  p.sports[p.primary].enabled = true;
  if (Array.isArray(input.mix)) {
    const mix: CoachProfile["mix"] = [];
    for (const m of input.mix) {
      const months = isObj(m) && Array.isArray(m.months) && m.months.every((x: unknown) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 12) ? (m.months as number[]) : null;
      if (!months || !isObj(m.share)) { errors.push("mix: měsíce 1–12 a podíly sportů"); continue; }
      const share: Partial<Record<PlanSport, number>> = {};
      let sum = 0;
      for (const s of PLAN_SPORTS) {
        if (s === p.primary || m.share[s] == null) continue;
        const v = numIn(m.share[s], 0, 1);
        if (v == null) { errors.push(`mix ${s}: podíl 0–1`); continue; }
        if (v > 0) { share[s] = v; sum += v; }
      }
      if (sum > 0.8) { errors.push("mix: vedlejší sporty dohromady nejvýš 80 % času"); continue; }
      mix.push({ months: [...new Set(months)].sort((a, b) => a - b), share });
    }
    p.mix = mix;
  }
  if (isObj(input.days)) {
    const pr = dayList(input.days.preferred), un = dayList(input.days.unavailable);
    if (input.days.preferred != null) pr ? (p.days.preferred = pr) : errors.push("oblíbené dny: čísla 1–7");
    if (input.days.unavailable != null) un ? (p.days.unavailable = un) : errors.push("dny, kdy nemůžeš: čísla 1–7");
    if ("long" in input.days) {
      if (input.days.long == null || input.days.long === "auto") p.days.long = null;
      else if (Number.isInteger(input.days.long) && input.days.long >= 1 && input.days.long <= 7) p.days.long = input.days.long;
      else errors.push("dlouhý den: 1–7 nebo prázdné");
    }
    if (p.days.unavailable.length >= 6) { errors.push("aspoň 2 dny v týdnu musí být volné pro trénink"); p.days.unavailable = base.days.unavailable; }
    p.days.preferred = p.days.preferred.filter((d) => !p.days.unavailable.includes(d));
    if (p.days.long != null && p.days.unavailable.includes(p.days.long)) p.days.long = null;
  }
  if (isObj(input.hours)) {
    for (const k of ["season", "winter", "snow"] as const) {
      const h = input.hours[k];
      if (!isObj(h)) continue;
      const lo = numIn(h.min, 1, 30), hi = numIn(h.max, 1, 30);
      if (lo == null || hi == null || lo > hi) errors.push(`hodiny (${k}): od–do v rozsahu 1–30, od ≤ do`);
      else p.hours[k] = { min: lo, max: hi };
    }
  }
  if (input.winterMonths != null) {
    if (Array.isArray(input.winterMonths) && input.winterMonths.every((x: unknown) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 12)) p.winterMonths = [...new Set(input.winterMonths as number[])];
    else errors.push("zimní měsíce: čísla 1–12");
  }
  if (typeof input.snow === "boolean") p.snow = input.snow;
  if ("maxSessions" in input) {
    if (input.maxSessions == null) p.maxSessions = null;
    else if (numIn(input.maxSessions, 2, 7) != null) p.maxSessions = Math.round(input.maxSessions);
    else errors.push("tréninků týdně: 2–7 nebo prázdné");
  }
  if (input.ramp != null) {
    const r = numIn(input.ramp, 0.5, 3);
    r != null ? (p.ramp = r) : errors.push("růst kondice za týden: 0,5–3");
  }
  return { profile: p, errors };
}

export const isWinter = (p: CoachProfile, date: string) => p.winterMonths.includes(month(date));

/** Hodinové pásmo pro týden (podle období a sněhu). */
export function hoursFor(p: CoachProfile, date: string): HoursBand {
  if (!isWinter(p, date)) return p.hours.season;
  return p.snow && p.sports.xc_ski.enabled ? p.hours.snow : p.hours.winter;
}

/** Podíl času vedlejších sportů v daném měsíci (jen zapnuté sporty; běžky jen se sněhem). */
export function mixFor(p: CoachProfile, date: string): Partial<Record<PlanSport, number>> {
  const m = p.mix.find((x) => x.months.includes(month(date)));
  const out: Partial<Record<PlanSport, number>> = {};
  if (!m) return out;
  for (const s of PLAN_SPORTS) {
    const v = m.share[s];
    if (!v || s === p.primary || !p.sports[s].enabled) continue;
    if (s === "xc_ski" && !p.snow) continue;
    out[s] = v;
  }
  return out;
}

const DAY = ["po", "út", "st", "čt", "pá", "so", "ne"];
const SPORT_CZ: Record<PlanSport, string> = { ride: "kolo", run: "běh", xc_ski: "běžky", walk: "chůze" };
const MON = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const h1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Shrnutí profilu lidsky (potvrzení po zadání přes AI, přehled v Nastavení). */
export function profileSummary(p: CoachProfile): string[] {
  const out: string[] = [`Hlavní sport: ${SPORT_CZ[p.primary]}.`];
  for (const s of PLAN_SPORTS) {
    if (s === p.primary || !p.sports[s].enabled) continue;
    const x = p.sports[s];
    out.push(`${SPORT_CZ[s][0]!.toUpperCase() + SPORT_CZ[s].slice(1)}: ${x.maxPerWeek != null ? `nejvýš ${x.maxPerWeek}× týdně` : "bez stropu"}${x.maxMin ? `, do ${x.maxMin} min` : ""}${x.quality ? ", i intervaly" : ", jen lehce"}${s === "xc_ski" ? " (jen když je sníh)" : ""}.`);
  }
  for (const m of p.mix) {
    const parts = PLAN_SPORTS.filter((s) => m.share[s]).map((s) => `${SPORT_CZ[s]} ${Math.round(m.share[s]! * 100)} %`);
    if (parts.length) out.push(`Mix (${m.months.map((x) => MON[x - 1]).join(", ")}): ${parts.join(", ")} času.`);
  }
  if (p.days.preferred.length) out.push(`Nejraději trénuješ: ${p.days.preferred.map((d) => DAY[d - 1]).join(", ")}.`);
  if (p.days.unavailable.length) out.push(`Nemůžeš: ${p.days.unavailable.map((d) => DAY[d - 1]).join(", ")}.`);
  out.push(`Dlouhý trénink: ${p.days.long ? DAY[p.days.long - 1] : "vybere trenér"}.`);
  out.push(`Hodiny týdně: sezóna ${h1(p.hours.season.min)}–${h1(p.hours.season.max)} h, zima ${h1(p.hours.winter.min)}–${h1(p.hours.winter.max)} h${p.sports.xc_ski.enabled ? `, se sněhem ${h1(p.hours.snow.min)}–${h1(p.hours.snow.max)} h` : ""}.`);
  if (p.maxSessions) out.push(`Nejvýš ${p.maxSessions} tréninků týdně.`);
  return out;
}

export interface HistAct {
  date: string;
  sport: Sport;
  moving_s: number | null;
}

/**
 * Výchozí profil nového uživatele z historie (12 týdnů): nejčastější sport, obvyklé dny, medián hodin.
 * Bez historie opatrný začátek 3–4 h týdně.
 */
export function profileFromHistory(acts: HistAct[], today: string): CoachProfile {
  const p: CoachProfile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  const from = addDays(mondayOf(today), -84);
  const a = acts.filter((x) => x.date >= from && x.date < mondayOf(today) && (x.moving_s ?? 0) >= 20 * 60);
  const grp = (s: Sport): PlanSport | null => (s === "ride" || s === "mtb" || s === "indoor" ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);
  const time: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  const count: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  const weeks = new Map<string, number>();
  for (const x of a) {
    const g = grp(x.sport);
    if (!g || g === "walk") continue;
    time[g] += x.moving_s ?? 0;
    count[g]++;
    byDow[dow(x.date) - 1]!++;
    weeks.set(mondayOf(x.date), (weeks.get(mondayOf(x.date)) ?? 0) + (x.moving_s ?? 0) / 3600);
  }
  if (!a.length || time.ride + time.run + time.xc_ski === 0) return p;
  p.primary = time.run > time.ride ? "run" : "ride";
  p.sports[p.primary] = pref(true, null, null, true);
  const other = p.primary === "ride" ? "run" : "ride";
  if (count[other] >= 4) p.sports[other] = pref(true, Math.max(1, Math.min(3, Math.round(count[other] / 12))), other === "run" ? 60 : 120, count[other] >= 12);
  if (count.xc_ski >= 2) p.sports.xc_ski.enabled = true;
  const total = byDow.reduce((s, x) => s + x, 0);
  p.days.preferred = byDow.map((n, i) => ({ n, d: i + 1 })).filter((x) => x.n >= Math.max(3, total / 7)).map((x) => x.d);
  if (p.days.preferred.length < 2 || p.days.preferred.length > 5) p.days.preferred = [];
  // medián hodin z týdnů, kdy se trénovalo
  const hs = [...weeks.values()].sort((x, y) => x - y);
  const med = hs.length ? hs[Math.floor(hs.length / 2)]! : 3.5;
  const lo = Math.max(2, Math.round(med * 0.8 * 2) / 2), hi = Math.max(lo + 1, Math.round(med * 1.2 * 2) / 2);
  p.hours = { season: { min: lo, max: hi }, winter: { min: Math.max(2, Math.round(lo * 0.7 * 2) / 2), max: Math.max(3, Math.round(hi * 0.7 * 2) / 2) }, snow: { min: lo, max: hi } };
  return p;
}

/** Popis profilu pro AI (text → JSON). */
export const PROFILE_SCHEMA_TEXT = `{
 "primary": "ride" | "run",                       // hlavní sport
 "sports": {                                      // ride, run, xc_ski (běžky), walk
   "run": {"enabled": true, "maxPerWeek": 1, "maxMin": 60, "quality": false}
 },
 "mix": [{"months": [11,12,1,2], "share": {"run": 0.35}}],   // podíl času vedlejších sportů 0–1 po měsících
 "days": {"preferred": [5,6,7], "unavailable": [], "long": 7}, // 1 = pondělí … 7 = neděle; long null = vybere trenér
 "hours": {"season": {"min": 6, "max": 10}, "winter": {"min": 3, "max": 4}, "snow": {"min": 5, "max": 7}},
 "winterMonths": [11,12,1,2],
 "snow": false,
 "maxSessions": null,                             // nejvýš tréninků týdně, null = podle hodin
 "ramp": 1.5                                      // růst kondice za týden při cíli Zlepšit (0.5–3)
}`;
