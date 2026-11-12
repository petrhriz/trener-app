// Profil sportovce pro Trenéra – schválně malý: hlavní sport, další sporty a „je sníh“.
// Dny ani hodiny se nenastavují: zátěž týdne se počítá z kondice a z posledních týdnů (target.ts).
import { PLAN_SPORTS, type PlanSport, type Sport } from "../../datasource/types";
import { addDays, mondayOf } from "../../lib/time";
import { blockWeeksFor } from "./budget";

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
  /** rok narození – od 40 let lehčí týden po 2 zátěžových (2+1 místo 3+1); null = nevyplněno */
  birthYear?: number | null;
}

export const DEFAULT_PROFILE: CoachProfile = {
  v: 2,
  primary: "ride",
  sports: { ride: { enabled: true, quality: true }, run: { enabled: false, quality: false }, xc_ski: { enabled: false, quality: false }, walk: { enabled: false, quality: false } },
  snow: false,
  birthYear: null,
};

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);

/** Kontrola a doplnění profilu (i starší podoby s hodinami a dny – ty se zahodí). Profil je vždy použitelný. */
export function validateProfile(input: unknown, base: CoachProfile = DEFAULT_PROFILE): { profile: CoachProfile; errors: string[] } {
  const errors: string[] = [];
  const p: CoachProfile = { v: 2, primary: base.primary, sports: JSON.parse(JSON.stringify(base.sports)), snow: base.snow, birthYear: base.birthYear ?? null };
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
  if (input.birthYear === null || input.birthYear === "") p.birthYear = null;
  else if (input.birthYear !== undefined) {
    const y = Number(input.birthYear);
    if (Number.isInteger(y) && y >= 1920 && y <= 2015) p.birthYear = y;
    else errors.push("rok narození musí být celé číslo 1920–2015");
  }
  p.sports[p.primary] = { enabled: true, quality: true };
  p.sports.walk.quality = false;
  return { profile: p, errors };
}

const SPORT_CZ: Record<PlanSport, string> = { ride: "kolo", run: "běh", xc_ski: "běžky", walk: "chůze" };

/** Shrnutí profilu lidsky – přesně to, co trenér s profilem dělá (src/core/coach/engine.ts, „další sporty z profilu“). */
export function profileSummary(p: CoachProfile, today?: string): string[] {
  const other: PlanSport = p.primary === "ride" ? "run" : "ride";
  const out = [`Hlavní sport: ${SPORT_CZ[p.primary]}.`];
  const word = (s: PlanSport) => SPORT_CZ[s][0]!.toUpperCase() + SPORT_CZ[s].slice(1);
  if (p.sports[other].enabled) out.push(`${word(other)}: nejvýš jeden vytrvalostní den týdně místo ${p.primary === "ride" ? "jízdy" : "běhu"}${other === "run" ? " (délka ve stropech běhu podle toho, kolik běháš)" : ""}${p.sports[other].quality ? "; když si u dne zvolíš kvalitu, smí mít i intervaly" : ""}.`);
  if (p.sports.xc_ski.enabled) out.push(p.snow ? "Je sníh – jeden vytrvalostní den týdně na běžkách." : "Běžky se plánují, až zapneš „Je sníh“ (pak jeden vytrvalostní den týdně).");
  if (p.birthYear) out.push(`Rok narození ${p.birthYear}: lehčí týden po ${blockWeeksFor(p.birthYear, today ?? `${new Date().getFullYear()}-01-01`)} zátěžových.`);
  if (!p.sports[other].enabled && !p.sports.xc_ski.enabled) out.push("Jiné sporty trenér sám neplánuje (u dne si je můžeš zvolit).");
  return out;
}

export interface HistAct {
  date: string;
  sport: Sport;
  moving_s: number | null;
}

const groupOf = (s: Sport): PlanSport | null => (s === "ride" || s === "mtb" || s === "indoor" ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);

/**
 * Výchozí profil nového uživatele z historie (12 týdnů): hlavní sport = kde je nejvíc času, další sporty, které dělá.
 * Je to jen návrh – uloží se jednou a v Nastavení se dá změnit. Intervaly ve vedlejším sportu jen při pravidelné
 * historii (aspoň 12 aktivit, v aspoň 8 z 12 týdnů, průměrně aspoň 30 min, poslední 4 týdny ne prázdné) –
 * samotný počet aktivit nestačí a kolo běžeckou zkušenost nepřidává (sporty se počítají zvlášť).
 */
export function profileFromHistory(acts: HistAct[], today: string): CoachProfile {
  const p: CoachProfile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  const from = addDays(mondayOf(today), -84);
  const recent = addDays(mondayOf(today), -28);
  const time: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  const count: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  const weeks: Record<PlanSport, Set<string>> = { ride: new Set(), run: new Set(), xc_ski: new Set(), walk: new Set() };
  const last4: Record<PlanSport, number> = { ride: 0, run: 0, xc_ski: 0, walk: 0 };
  for (const x of acts) {
    const g = groupOf(x.sport);
    if (!g || x.date < from || x.date > today || (x.moving_s ?? 0) < 20 * 60) continue;
    time[g] += x.moving_s ?? 0;
    count[g]++;
    weeks[g].add(mondayOf(x.date));
    if (x.date >= recent) last4[g]++;
  }
  if (time.run > time.ride) p.primary = "run";
  p.sports[p.primary] = { enabled: true, quality: true };
  const other = p.primary === "ride" ? "run" : "ride";
  const regular = count[other] >= 12 && weeks[other].size >= 8 && time[other] / count[other] >= 30 * 60 && last4[other] > 0;
  if (count[other] >= 4) p.sports[other] = { enabled: true, quality: regular };
  if (count.xc_ski >= 2) p.sports.xc_ski.enabled = true;
  return p;
}
