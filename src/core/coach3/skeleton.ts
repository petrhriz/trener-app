// Trenér v3 – kostra týdne: které dny trénovat a co (kvalita, dlouhý, Z2). Řešič projde všechny možnosti,
// vyřadí ty, které porušují pravidla, a vybere nejlépe hodnocenou. Nic se nenastavuje, trénovat jde kterýkoli den.
import { addDays, dow } from "../../lib/time";
import type { Role } from "./sport";

export interface SkDay {
  date: string;
  /** den se nedá trénovat (nemoc, nepojedu, dovolená, 🔴 ráno) */
  blocked?: boolean;
  /** tvoje volba: volno */
  rest?: boolean;
  /** tvoje volba: druh dne */
  type?: "z2" | "quality";
  /** tvoje volba: trénink tento den (sport, délka nebo vlastní jízda) */
  must?: boolean;
  /** tvoje vlastní jízda – je to dlouhý den, když má aspoň 2 h */
  ownLong?: boolean;
  /** dnes nesmí být kvalita (🟡 ráno) */
  noKey?: boolean;
  /** špatné počasí (déšť, nárazy) – dlouhý ani Z2 venku sem nepatří */
  badWeather?: boolean;
}

export interface PastDay {
  date: string;
  trained: boolean;
  /** těžký den (kvalita, dlouhý, hodně zátěže) */
  hard: boolean;
}

export interface SkInput {
  /** plánované dny po sobě (od prvního plánovaného do neděle) */
  days: SkDay[];
  /** 3 dny před prvním plánovaným (skutečnost nebo předchozí plán) – pravidla platí přes hranu */
  tail: PastDay[];
  sessions: number;
  keys: number;
  long: boolean;
  /** jak často v minulosti trénuješ v jednotlivé dny týdne (1 = po … 7 = ne), 0–1 */
  habit?: Record<number, number>;
}

export interface SkResult {
  roles: Map<string, Role>;
  /** kolik se opravdu vešlo */
  sessions: number;
  keys: number;
  long: boolean;
  notes: string[];
}

/** Nejvýš tolik tréninkových dní za sebou. */
export const MAX_STREAK = 3;

function* combos<T>(arr: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) { acc.push(arr[i]!); yield* combos(arr, k, i + 1, acc); acc.pop(); }
}

/** Kostra týdne. Když se požadavek nevejde (pravidla, blokované dny), ubírá: nejdřív Z2, pak dlouhý, pak kvalitu. */
export function solveWeek(inp: SkInput): SkResult {
  const notes: string[] = [];
  const days = inp.days;
  const open = days.filter((d) => !d.blocked && !d.rest);
  const must = open.filter((d) => d.must || d.type);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const tailBy = new Map(inp.tail.map((t) => [t.date, t]));
  const first = days[0]?.date;

  const want = { s: Math.max(inp.sessions, must.length), k: inp.keys, l: inp.long };
  // pořadí ubírání: Z2 → dlouhý → kvalita → tréninky úplně
  const attempts: { s: number; k: number; l: boolean }[] = [];
  for (let s = Math.min(want.s, open.length); s >= must.length; s--)
    for (const l of want.l ? [true, false] : [false])
      for (let k = Math.min(want.k, s - (l ? 1 : 0)); k >= 0; k--) if (s > 0 || (!l && k === 0)) attempts.push({ s, k, l });
  // nejdřív se drží kvalita, pak dlouhý, ubírá se Z2 (počet tréninků)
  attempts.sort((x, y) => y.k - x.k || Number(y.l) - Number(x.l) || y.s - x.s);

  for (const a of attempts) {
    let best: { score: number; roles: Map<string, Role> } | null = null;
    for (const set of combos(open, a.s)) {
      if (!must.every((m) => set.includes(m))) continue;
      const trained = new Set(set.map((d) => d.date));
      // nejvýš MAX_STREAK dní za sebou (i se 3 dny před týdnem)
      if (!streakOk(first!, days.length, trained, tailBy)) continue;
      // tvoje volba kvality platí i při 🟡 ráně
      const keyable = set.filter((d) => d.type !== "z2" && !d.ownLong && (!d.noKey || d.type === "quality"));
      const mustKey = set.filter((d) => d.type === "quality");
      const k = Math.max(a.k, mustKey.length);
      for (const keys of combos(keyable, Math.min(k, keyable.length))) {
        if (keys.length < k) continue;
        if (!mustKey.every((m) => keys.includes(m))) continue;
        const longCands = a.l ? set.filter((d) => !keys.includes(d) && d.type !== "quality") : [];
        const ownLong = set.find((d) => d.ownLong && !keys.includes(d));
        const longOpts: (SkDay | null)[] = a.l ? (ownLong ? [ownLong] : longCands) : [null];
        for (const lg of longOpts) {
          if (a.l && !lg) continue;
          const roles = new Map<string, Role>();
          for (const d of days) roles.set(d.date, trained.has(d.date) ? "endurance" : "rest");
          for (const kd of keys) roles.set(kd.date, "key");
          if (lg) roles.set(lg.date, "long");
          if (!keyRuleOk(roles, tailBy, byDate)) continue;
          const score = scoreOf(roles, days, tailBy, inp.habit);
          if (!best || score > best.score + 1e-9) best = { score, roles };
        }
      }
    }
    if (best) {
      const r = best.roles;
      const n = [...r.values()].filter((x) => x !== "rest").length;
      const kk = [...r.values()].filter((x) => x === "key").length;
      const ll = [...r.values()].includes("long");
      if (n < inp.sessions) notes.push(`Tréninků ${n} místo ${inp.sessions} – víc se mezi volné a blokované dny nevejde podle pravidel (nejvýš ${MAX_STREAK} dny za sebou).`);
      if (kk < inp.keys) notes.push(`Kvalita ${kk}× místo ${inp.keys}× – nevešla se (ne den po kvalitě ani po dlouhém${days.some((d) => d.noKey) ? ", dnes ne kvůli rannímu stavu" : ""}).`);
      if (inp.long && !ll) notes.push("Dlouhý trénink se tento týden nevešel.");
      return { roles: r, sessions: n, keys: kk, long: ll, notes };
    }
  }
  const roles = new Map<string, Role>(days.map((d) => [d.date, "rest"]));
  return { roles, sessions: 0, keys: 0, long: false, notes: inp.sessions ? ["Tento týden se trénink nevešel (blokované dny)."] : [] };
}

function streakOk(first: string, n: number, trained: Set<string>, tail: Map<string, PastDay>): boolean {
  let run = 0;
  for (let i = -3; i < n; i++) {
    const d = addDays(first, i);
    const t = i < 0 ? !!tail.get(d)?.trained : trained.has(d);
    run = t ? run + 1 : 0;
    if (run > MAX_STREAK && i >= 0) return false;
  }
  return true;
}

/** Kvalita ne den po kvalitě, dlouhém ani jiném těžkém dni (i přes hranu týdne). Dlouhý den po kvalitě smí. */
function keyRuleOk(roles: Map<string, Role>, tail: Map<string, PastDay>, _by: Map<string, SkDay>): boolean {
  for (const [d, r] of roles) {
    if (r !== "key") continue;
    const y = addDays(d, -1);
    const yr = roles.get(y);
    if (yr === "key" || yr === "long") return false;
    if (yr === undefined && tail.get(y)?.hard) return false;
  }
  return true;
}

function scoreOf(roles: Map<string, Role>, days: SkDay[], tail: Map<string, PastDay>, habit?: Record<number, number>): number {
  let s = 0;
  const trainedOn = (d: string) => { const r = roles.get(d); return r === undefined ? !!tail.get(d)?.trained : r !== "rest"; };
  for (const day of days) {
    const r = roles.get(day.date)!;
    const w = dow(day.date);
    if (r === "rest") continue;
    // rozložení: dva tréninky po sobě jsou horší než s volnem mezi
    if (trainedOn(addDays(day.date, -1))) s -= 1.5;
    if (r === "key") {
      if (!trainedOn(addDays(day.date, -1))) s += 3;
      if (w >= 2 && w <= 4) s += 1;
    }
    if (r === "long") {
      if (w >= 6) s += 3;
      if (day.badWeather) s -= 3;
    }
    if (r === "endurance" && day.badWeather) s -= 1;
    if (habit) s += (habit[w] ?? 0) * 1.5;
  }
  return s;
}
