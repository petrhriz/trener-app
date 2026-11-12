// Verze plánu: při každé změně budoucích dnů se uloží nová verze s důvodem (co se změnilo na vstupu) a seznamem
// změněných dnů – na stránce je pak vidět, proč se plán změnil.
import { addDays } from "../../lib/time";

export interface VersionDay {
  date: string;
  role: string;
  sport: string;
  minutes: number;
  load: number;
  name: string | null;
}

/** Co plán ovlivňuje – porovnáním dvou snímků se pozná důvod nové verze. */
export interface Drivers {
  week: string;
  goal: string;
  recovery: string | null;
  fatigue: number;
  notes: string[];
  reentry: string | null;
  /** tvoje úpravy a blokované dny (otisk) */
  mine: string;
  /** dny se špatným počasím v příštích 8 dnech */
  weatherBad: string[];
  /** dny s odjetým tréninkem v tomto týdnu */
  trained: string[];
  profile: string;
}

const ROLE_CZ: Record<string, string> = { key: "kvalita", long: "dlouhá", endurance: "Z2", easy: "lehce", rest: "volno" };
const DAY_CZ = ["po", "út", "st", "čt", "pá", "so", "ne"];
const dayDm = (d: string) => `${DAY_CZ[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]} ${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)} min`);
const label = (x: VersionDay | undefined) => (!x || x.role === "rest" ? "volno" : `${x.name ?? ROLE_CZ[x.role] ?? x.role}${x.sport !== "ride" ? ` (${x.sport === "run" ? "běh" : x.sport === "xc_ski" ? "běžky" : "chůze"})` : ""} ${hm(x.minutes)}`);

/** Změněné dny od `from` (včetně): jiný druh, sport, název nebo délka o 10+ min. Den, který v jedné verzi chybí, se nepočítá. */
export function diffDays(prev: VersionDay[], cur: VersionDay[], from: string): string[] {
  const out: string[] = [];
  const p = new Map(prev.map((x) => [x.date, x]));
  for (const c of cur) {
    if (c.date < from) continue;
    const o = p.get(c.date);
    if (!o) continue;
    const same = o.role === c.role && o.sport === c.sport && (o.name ?? "") === (c.name ?? "") && Math.abs(o.minutes - c.minutes) < 10;
    if (!same) out.push(`${dayDm(c.date)}: ${label(o)} → ${label(c)}`);
  }
  return out;
}

const EMOJI: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };

/** Důvody nové verze: co se na vstupu změnilo proti minulé verzi. */
export function reasonOf(prev: Drivers | null, cur: Drivers): string[] {
  if (!prev) return ["první uložený plán"];
  const r: string[] = [];
  if (prev.week !== cur.week) r.push("nový týden");
  if (prev.goal !== cur.goal) r.push("změna cíle");
  if (prev.profile !== cur.profile) r.push("profil sportovce");
  if (prev.mine !== cur.mine) r.push("tvoje úprava plánu (den, sport, délka, volno)");
  if (prev.recovery !== cur.recovery && cur.recovery) r.push(`ranní stav ${EMOJI[cur.recovery] ?? cur.recovery}`);
  const newNotes = cur.notes.filter((n) => !prev.notes.includes(n));
  if (newNotes.length) r.push(...newNotes);
  else if (prev.fatigue < 1 && cur.fatigue >= 1) r.push("únava odezněla");
  if (prev.reentry !== cur.reentry && cur.reentry) r.push(cur.reentry);
  if (cur.trained.some((d) => !prev.trained.includes(d))) r.push("odjetý trénink");
  if (JSON.stringify(prev.weatherBad) !== JSON.stringify(cur.weatherBad)) r.push("předpověď počasí");
  if (!r.length) r.push("přepočet podle nových dat (kondice, zátěž)");
  return r;
}

/** Den po dni pro uložení (tento a příští týden). */
export function versionDays(days: { date: string; role: string; sport: string; minutes: number; load: number; name: string | null; blocked?: boolean }[]): VersionDay[] {
  return days.map((x) => ({ date: x.date, role: x.blocked ? "rest" : x.role, sport: x.sport, minutes: Math.round(x.minutes), load: Math.round(x.load), name: x.name }));
}

/** Kolik verzí se drží (starší se mažou). */
export const KEEP_VERSIONS = 60;
export const weekEnd = (ws: string) => addDays(ws, 6);
