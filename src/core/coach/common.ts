// Trenér – společné kusy: aktivity pro trenéra, omezení dne (tvoje volby), sazba zátěže, párování kvality s aktivitou.
import { BIKE_SPORTS, PLAN_SPORTS, type NLap, type PlanSport, type Sport } from "../../datasource/types";
import { addDays } from "../../lib/time";
import { type OwnRide, readOwnRide } from "../ownRide";
import type { Constraint } from "../plan";
import { EASY_LOAD_H, type StepEdit, type WorkPlan, readStepEdit } from "./library";

const isBike = (s: Sport) => BIKE_SPORTS.includes(s);
const planSport = (s: Sport): PlanSport | null => (isBike(s) ? "ride" : s === "run" ? "run" : s === "xc_ski" ? "xc_ski" : s === "walk" || s === "hike" ? "walk" : null);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };

export type Role = "rest" | "easy" | "endurance" | "key" | "long";
export const MAX_STREAK = 3;
/** Těžký den = kvalita nebo dlouhý trénink (jedna definice pro řešič i závěrečnou kontrolu). */
export const isHardRole = (r: Role | null | undefined): boolean => r === "key" || r === "long";
/** Nejdelší trénink, který jde zadat ručně (min) – ochrana proti nesmyslným vstupům. */
export const MAX_DAY_MIN: Record<PlanSport, number> = { ride: 420, run: 240, xc_ski: 300, walk: 300 };
/** Nejdelší vlastní jízda (min). */
export const MAX_OWN_MIN = 600;
/** Strop délky běhu: 1,5× nejdelšího běhu za 4 týdny, aspoň hodina (tvoje volba), nejvýš 3 h. */
export const runCapOf = (longest: number): number => Math.min(180, Math.max(60, Math.round(longest * 1.5)));
export const isPlanSport =(s: unknown): s is PlanSport => typeof s === "string" && (PLAN_SPORTS as string[]).includes(s);

/** Úprava dne od uživatele (nebo stav): má přednost před pravidly. */
export interface Fixed {
  /** nelze trénovat (nemoc, nepojedu, dovolená…) – text důvodu */
  blocked?: string;
  /** volno zvolené uživatelem */
  rest?: boolean;
  sport?: PlanSport;
  type?: "z2" | "quality";
  minutes?: number;
  own?: OwnRide;
  /** tvoje úprava kroků kvality (počet, délka úseku, intenzita) */
  edit?: StepEdit;
}

/** Skutečnost dne (odjeté aktivity). */

/** Skutečnost dne (pro závěrečnou kontrolu týdne). */
export interface PastDay {
  trained: boolean;
  /** těžký den (kvalita nebo dlouhý / velká zátěž) – den po něm nesmí být klíčový */
  hard: boolean;
  /** kvalita (podle času v zónách) – počítá se do klíčových dnů týdne */
  key: boolean;
  minutes: number;
  sport: PlanSport | null;
  /** dlouhý trénink týdne už proběhl (den byl v plánu jako dlouhý, nebo byl opravdu dlouhý) */
  long?: boolean;
}

export interface EngineAct {
  id: string;
  date: string;
  sport: Sport;
  load: number | null;
  moving_s: number | null;
  /** kvalita podle času v zónách (počítá se do klíčových dnů) */
  quality: boolean;
  hr_z: number[] | null;
  pwr_z: number[] | null;
  laps: NLap[] | null;
  compliance: number | null;
  /** hodnocení náročnosti 1–10 (0 = přeskočeno), src/core/rpe.ts */
  rpe?: number | null;
}

export interface ProgressRow {
  level: number;
  last: string | null;
}

/** Za kolik dní bez aktivity se kvalita považuje za neodjetou. */
export const EVAL_WAIT_DAYS = 3;

/** Zátěž za hodinu lehké jednotky z historie uživatele (60 dní), v rozumných mezích kolem teorie. */
export function easyRate(acts: EngineAct[], today: string, sport: PlanSport, power: boolean): { rate: number; calib: number } {
  const theory = sport === "ride" && power ? EASY_LOAD_H.power : sport === "run" ? EASY_LOAD_H.run : EASY_LOAD_H.hr;
  const v = acts
    .filter((a) => a.date > addDays(today, -60) && planSport(a.sport) === sport && !a.quality && (a.moving_s ?? 0) >= 40 * 60 && (a.load ?? 0) > 0)
    .map((a) => a.load! / (a.moving_s! / 3600));
  const m = v.length >= 3 ? median(v)! : theory;
  const rate = Math.max(theory * 0.8, Math.min(theory * 1.35, m));
  return { rate, calib: rate / theory };
}

/**
 * Kontrola poznámky omezení dne před uložením (API, AI). Prázdná poznámka = zrušení volby.
 * Sport jen ze seznamu, délka 20 min až strop sportu (nejvýš 7 h), vlastní jízda 20 min až 10 h.
 */
export function constraintNoteOk(kind: string, note: string | null | undefined): boolean {
  const empty = note == null || note === "" || note === "0";
  if (kind === "sport") return note === "rest" || isPlanSport(note);
  if (kind === "typ") return empty || note === "z2" || note === "quality" || note === "auto";
  if (kind === "delka") { if (empty) return true; const n = Number(note); return Number.isFinite(n) && n >= 20 && n <= Math.max(...Object.values(MAX_DAY_MIN)); }
  if (kind === "jizda") { if (empty) return true; const o = readOwnRide(note!); return !!o && o.min >= 20 && o.min <= MAX_OWN_MIN; }
  if (kind === "kroky") return empty || readStepEdit(note) != null;
  return note == null || note.length <= 200;
}

/** Pořadí zpracování omezení dne: výsledek nesmí záviset na pořadí řádků z databáze (výslovně zvolený sport má přednost před „běžky“). */
const CON_ORDER = ["nemoc", "nepojedu", "dovolena", "nemuzu", "bezky", "sport", "typ", "delka", "jizda", "kroky"];

/**
 * Která aktivita dne je plánovaná kvalita. Nebere se „ta s největší zátěží“: kandidát je aktivita stejného
 * sportu (aspoň 20 min), která je kvalitou podle času v zónách, má splnění z intervals.icu (spárovaná
 * s plánem), nebo má okruhy a délku blízkou plánu. Víc kandidátů → když jen jeden sedí délkou, ten; jinak nejasné.
 */
export function matchKey(d: { sport: PlanSport; minutes: number; plan: WorkPlan | null }, acts: EngineAct[]): { kind: "one"; act: EngineAct } | { kind: "many"; n: number } | { kind: "other" | "none" } {
  const same = acts.filter((a) => planSport(a.sport) === d.sport && (a.moving_s ?? 0) >= 20 * 60);
  const close = (a: EngineAct) => d.minutes > 0 && Math.abs((a.moving_s ?? 0) / 60 - d.minutes) <= d.minutes * 0.3;
  const cand = same.filter((a) => a.quality || a.compliance != null || (!!d.plan && !!a.laps?.length && close(a)));
  if (cand.length === 1) return { kind: "one", act: cand[0]! };
  if (cand.length > 1) {
    // spárovaná s plánem v intervals.icu má přednost
    const paired = cand.filter((a) => a.compliance != null);
    if (paired.length === 1) return { kind: "one", act: paired[0]! };
    const fit = cand.filter(close);
    if (fit.length === 1) return { kind: "one", act: fit[0]! };
    return { kind: "many", n: cand.length };
  }
  return { kind: same.length ? "other" : "none" };
}

export function fixedFromConstraints(cons: Constraint[]): Map<string, Fixed> {
  const out = new Map<string, Fixed>();
  const get = (d: string) => { let f = out.get(d); if (!f) out.set(d, (f = {})); return f; };
  const rank = (k: string) => { const i = CON_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  const sorted = [...cons].sort((a, b) => a.date.localeCompare(b.date) || rank(a.kind) - rank(b.kind) || String(a.note ?? "").localeCompare(String(b.note ?? "")));
  for (const c of sorted) {
    // doporučení z dřívějšího „AI návrhu týdne“ (předpona ai:) v2 nepoužívá
    if (typeof c.note === "string" && c.note.startsWith("ai:")) continue;
    if (typeof c.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
    const f = get(c.date);
    if (c.kind === "nemoc") f.blocked = "Nemoc: volno, nic nedohánět.";
    else if (c.kind === "nepojedu") f.blocked = f.blocked ?? "Dnes nepojedu.";
    else if (c.kind === "dovolena") f.blocked = f.blocked ?? "Dovolená.";
    else if (c.kind === "nemuzu") f.blocked = f.blocked ?? "Nemůžu (tvoje poznámka).";
    else if (c.kind === "bezky") f.sport = "xc_ski";
    // neznámý sport se ignoruje (dřív shodil celý plán)
    else if (c.kind === "sport" && c.note) { if (c.note === "rest") f.rest = true; else if (isPlanSport(c.note)) f.sport = c.note; }
    else if (c.kind === "typ" && (c.note === "z2" || c.note === "quality")) f.type = c.note;
    else if (c.kind === "delka" && Number.isFinite(Number(c.note)) && Number(c.note) >= 20) f.minutes = Math.min(Math.max(...Object.values(MAX_DAY_MIN)), Math.round(Number(c.note)));
    else if (c.kind === "jizda") { const o = readOwnRide(c.note); if (o && Number.isFinite(o.min)) f.own = { ...o, min: Math.min(MAX_OWN_MIN, Math.round(o.min)) }; }
    else if (c.kind === "kroky") { const e = readStepEdit(c.note); if (e) f.edit = e; }
  }
  for (const [d, f] of out) {
    if (f.rest && !f.blocked) out.set(d, { rest: true });
    else if (f.own) { f.sport = f.sport ?? "ride"; delete f.type; delete f.minutes; delete f.edit; }
    if (!Object.keys(out.get(d)!).length) out.delete(d);
  }
  return out;
}
