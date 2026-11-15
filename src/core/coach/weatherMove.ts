// Trenér – přesun tréninku kvůli počasí v rozběhnutém týdnu. Pondělní plán se drží, ale když na den s jízdou venku
// vyjde předpověď „celý den špatně“ (déšť, nárazy, mráz a žádné 3h okno), trenér navrhne přesun na volný den téhož
// týdne s dobrým počasím – jen když přesun neporuší pravidla (nejvýš 3 dny za sebou, kvalita ne po těžkém dni).
// Nejde-li to, zůstává dosavadní náhrada: trenažér.
import type { PlanSport } from "../../datasource/types";
import { addDays } from "../../lib/time";
import { MAX_STREAK } from "./common";
import type { PastDay } from "./skeleton";
import type { Role } from "./sport";

export interface MoveDay {
  date: string;
  role: Role;
  sport: PlanSport;
  /** den nejde měnit (tvoje volba, volno, blokovaný den, místo zvolené tebou) */
  locked: boolean;
  /** celý den špatné počasí (žádné okno na jízdu) */
  bad: boolean;
  /** předpověď je známá a den je na jízdu venku dobrý */
  good: boolean;
}

export interface WeatherMove {
  from: string;
  to: string;
}

/** Venku se přesouvá jen jízda (běh a běžky se v dešti dají, kolo na trenažér jde, ale raději venku jiný den). */
const MOVABLE: PlanSport[] = ["ride"];

/** Přesuny (z → na) po dnech od nejbližšího; každý den nejvýš jednou. */
export function weatherMoves(days: MoveDay[], tail: PastDay[]): WeatherMove[] {
  const roles = new Map(days.map((d) => [d.date, d.role]));
  const tailBy = new Map(tail.map((t) => [t.date, t]));
  const first = days[0]?.date;
  if (!first) return [];
  const used = new Set<string>();
  const moves: WeatherMove[] = [];
  const valid = (r: Map<string, Role>): boolean => {
    let run = 0;
    for (let i = -3; i < days.length; i++) {
      const d = addDays(first, i);
      const t = i < 0 ? !!tailBy.get(d)?.trained : r.get(d) !== "rest";
      run = t ? run + 1 : 0;
      if (run > MAX_STREAK) return false;
    }
    for (const [d, x] of r) {
      if (x !== "key") continue;
      const y = addDays(d, -1);
      const yr = r.get(y);
      if (yr === "key" || yr === "long" || (yr === undefined && tailBy.get(y)?.hard)) return false;
    }
    return true;
  };
  for (const d of days) {
    const role = roles.get(d.date)!;
    if (role === "rest" || d.locked || !d.bad || !MOVABLE.includes(d.sport) || used.has(d.date)) continue;
    const cands = days
      .filter((t) => t.date !== d.date && roles.get(t.date) === "rest" && !t.locked && t.good && !used.has(t.date))
      .sort((a, b) => Math.abs(dayDiff(a.date, d.date)) - Math.abs(dayDiff(b.date, d.date)) || b.date.localeCompare(a.date));
    for (const t of cands) {
      const r = new Map(roles);
      r.set(t.date, role);
      r.set(d.date, "rest");
      if (!valid(r)) continue;
      roles.set(t.date, role);
      roles.set(d.date, "rest");
      used.add(t.date).add(d.date);
      moves.push({ from: d.date, to: t.date });
      break;
    }
  }
  return moves;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}
