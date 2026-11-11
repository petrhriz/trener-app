// Kostra týdne Trenéra v2: role dnů (volno / lehký / vytrvalost / klíčový / dlouhý), sport a délky.
// Malý řešič: projde kombinace dnů a rolí, tvrdá pravidla vyřadí, zbytek oboduje. Stejný vstup = stejný výsledek.
// Žádné nastavené dny: trénovat jde kdykoli. Pořadí důležitosti je kvalita → dlouhý → vytrvalost, takže když
// v týdnu zbývá málo dnů (něco jsi vynechal), zůstane to důležité a vytrvalost propadne.
import type { PlanSport } from "../../datasource/types";
import { addDays, dow } from "../../lib/time";
import type { OwnRide } from "../ownRide";
import { KEY_MIN } from "./budget";
import type { CoachProfile } from "./profile";

export type Role = "rest" | "easy" | "endurance" | "key" | "long";
export const MAX_STREAK = 3;

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
}

/** Skutečnost dne (odjeté aktivity). */
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

export interface SolveInput {
  weekStart: string;
  /** první plánovaný den; dřívější dny týdne se berou podle skutečnosti */
  from: string;
  profile: CoachProfile;
  /** nabízené hodiny, počet tréninků a kvalit v týdnu */
  hours: number;
  sessions: number;
  keys: number;
  /** skutečnost: dny týdne před `from` a 3 dny před týdnem */
  past: Map<string, PastDay>;
  fixed: Map<string, Fixed>;
  /** dny se špatným počasím na jízdu venku */
  weatherBad: Set<string>;
  /** dřívější kostra týdne – řešič se jí drží, pokud to pravidla dovolí */
  prev: Map<string, Role> | null;
  /** dny, kdy nesmí být klíčový trénink (🟡 ráno, po nemoci) */
  noKey: Set<string>;
  /** dny jen lehce (🔴 ráno) */
  easyOnly: Set<string>;
  run: { experienced: boolean; longest: number };
  /** nejdelší jízda za 6 týdnů (min) */
  longestRide: number;
}

export interface SolvedDay {
  date: string;
  role: Role;
  sport: PlanSport;
  minutes: number;
  /** den má úpravu uživatele */
  fixed: boolean;
  blocked: string | null;
  userRest: boolean;
  own: OwnRide | null;
}

const r15 = (x: number) => Math.round(x / 15) * 15;
const r5 = (x: number) => Math.round(x / 5) * 5;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function* combos<T>(arr: T[], k: number, start = 0, cur: T[] = []): Generator<T[]> {
  if (cur.length === k) { yield [...cur]; return; }
  for (let i = start; i <= arr.length - (k - cur.length); i++) {
    cur.push(arr[i]!);
    yield* combos(arr, k, i + 1, cur);
    cur.pop();
  }
}

export function solveWeek(inp: SolveInput): SolvedDay[] {
  const { profile: p, weekStart } = inp;
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i));
  const T = inp.hours * 60;
  const isPast = (d: string) => d < inp.from;
  const fx = (d: string) => inp.fixed.get(d);
  const cannot = (d: string) => { const f = fx(d); return !!f?.blocked || !!f?.rest; };
  const must = (d: string) => { const f = fx(d); return !!f && !f.blocked && !f.rest && (!!f.sport || !!f.type || !!f.minutes || !!f.own); };
  const pastTrained = (d: string) => !!inp.past.get(d)?.trained;
  const pastHard = (d: string) => !!inp.past.get(d)?.hard;

  const future = dates.filter((d) => !isPast(d));
  const forced = future.filter((d) => must(d));
  const free = future.filter((d) => !must(d) && !cannot(d));
  const donePast = dates.filter((d) => isPast(d) && pastTrained(d)).length;
  const keysPast = dates.filter((d) => isPast(d) && !!inp.past.get(d)?.key).length;
  const longPast = dates.some((d) => isPast(d) && !!inp.past.get(d)?.long);
  const wantKeys = Math.max(0, inp.keys - keysPast);
  const needLong = inp.hours >= 3 && !longPast;

  // řada dní tréninku za sebou (3 dny před týdnem + týden); hlídá se jen řada, do které patří plánovaný den
  const seqOk = (train: Set<string>): boolean => {
    let run = 0, hasFuture = false;
    for (let i = -3; i < 7; i++) {
      const d = addDays(weekStart, i);
      const t = i < 0 || isPast(d) ? pastTrained(d) : train.has(d);
      if (!t) { run = 0; hasFuture = false; continue; }
      run++;
      if (i >= 0 && !isPast(d)) hasFuture = true;
      if (run > MAX_STREAK && hasFuture) return false;
    }
    return true;
  };

  interface Cand { train: string[]; keys: string[]; long: string | null; score: number; sig: string }
  const st: { best: Cand | null } = { best: null };
  const roleOf = (c: { train: Set<string>; keys: Set<string>; long: string | null }, d: string): Role =>
    !c.train.has(d) ? "rest" : inp.easyOnly.has(d) ? "easy" : c.keys.has(d) ? "key" : c.long === d ? "long" : "endurance";

  const evalCand = (trainArr: string[], keyArr: string[], long: string | null) => {
    const train = new Set(trainArr), keys = new Set(keyArr);
    // pořadí důležitosti: kvalita, pak dlouhý
    let s = keyArr.length * 5 + (long ? 4 : 0);
    // tvrdé pravidlo klíčového dne: ne den po klíčovém ani po dlouhém. Kvalitu, kterou sis na den dal sám,
    // řešič nechá – ale snaží se těžký den před ní odsunout.
    for (const k of keyArr) {
      const y = addDays(k, -1);
      const yHard = isPast(y) || y < weekStart ? pastHard(y) : keys.has(y) || long === y;
      if (!yHard) continue;
      if (fx(k)?.type !== "quality") return;
      s -= 8;
    }
    for (const d of trainArr) if (inp.weatherBad.has(d) && !keys.has(d)) s -= long === d ? 4 : 1.5;
    if (!train.has(dates[0]!) && !isPast(dates[0]!)) s += 1; // pondělí spíš volno
    if (long) s += (dow(long) >= 6 ? 3 : 0) + dow(long) / 14; // dlouhý o víkendu, spíš ke konci týdne
    for (const k of keyArr) {
      const y = addDays(k, -1), t = addDays(k, 1);
      const yTrain = isPast(y) || y < weekStart ? pastTrained(y) : train.has(y);
      s += yTrain ? -1 : 2; // kvalita nejlíp po volnu
      if (long === t) s -= 1;
    }
    if (keyArr.length === 2) s += Math.abs(dates.indexOf(keyArr[0]!) - dates.indexOf(keyArr[1]!)) >= 3 ? 1 : 0;
    // tři dny za sebou jsou povolené, ale ne zadarmo
    let run = 0;
    for (const d of dates) { run = (isPast(d) ? pastTrained(d) : train.has(d)) ? run + 1 : 0; if (run === 3) s -= 1.5; }
    // stabilita: držet se dřívější kostry
    if (inp.prev) for (const d of future) {
      const was = inp.prev.get(d);
      if (!was) continue;
      const now = roleOf({ train, keys, long }, d);
      if (was === now) s += 2.5;
      else if ((was === "rest") !== (now === "rest")) s -= 1;
    }
    const sig = dates.map((d) => roleOf({ train, keys, long }, d)[0]).join("");
    const cb = st.best;
    if (!cb || s > cb.score + 1e-9 || (Math.abs(s - cb.score) <= 1e-9 && sig < cb.sig)) st.best = { train: trainArr, keys: keyArr, long, score: s, sig };
  };

  const maxFree = Math.max(0, Math.min(free.length, inp.sessions - donePast - forced.length));
  for (let nFree = maxFree; nFree >= 0 && !st.best; nFree--) {
    for (const pick of combos(free, nFree)) {
      const trainArr = [...forced, ...pick].sort();
      if (!seqOk(new Set(trainArr))) continue;
      const mustKey = trainArr.filter((d) => fx(d)?.type === "quality");
      const keyable = trainArr.filter((d) => !mustKey.includes(d) && !inp.noKey.has(d) && !inp.easyOnly.has(d) && fx(d)?.type !== "z2" && !fx(d)?.own);
      const longable = (keys: string[]) => trainArr.filter((d) => !keys.includes(d) && !inp.easyOnly.has(d) && (!fx(d)?.minutes || fx(d)!.minutes! >= 90));
      let found = false;
      for (let k = Math.min(keyable.length, Math.max(0, wantKeys - mustKey.length)); k >= 0 && !found; k--) {
        for (const kc of combos(keyable, k)) {
          const keys = [...mustKey, ...kc];
          const ownLong = trainArr.find((d) => (fx(d)?.own?.min ?? 0) >= 120) ?? null;
          const lc = ownLong ? [ownLong] : needLong ? longable(keys) : [];
          const before: Cand | null = st.best;
          if (!lc.length) evalCand(trainArr, keys, null);
          else for (const l of lc) evalCand(trainArr, keys, l);
          if (st.best !== before) found = true;
        }
      }
    }
  }
  const b: Cand = st.best ?? { train: forced, keys: [], long: null, score: 0, sig: "" };
  const train = new Set(b.train), keys = new Set(b.keys);

  // ---- role, sport ----
  const out: SolvedDay[] = future.map((d) => {
    const f = fx(d);
    const role = roleOf({ train, keys, long: b.long }, d);
    return { date: d, role, sport: f?.sport ?? p.primary, minutes: 0, fixed: !!f && !f.blocked, blocked: f?.blocked ?? null, userRest: !!f?.rest, own: f?.own ?? null };
  });
  const day = (d: string) => out.find((x) => x.date === d);
  // další sporty („občas taky“): každý nejvýš jednou týdně místo jednoho vytrvalostního dne, když jich je dost
  const pastSport = (s: PlanSport) => dates.some((d) => isPast(d) && inp.past.get(d)?.sport === s);
  const others = (["run", "ride", "xc_ski"] as PlanSport[]).filter((s) => s !== p.primary && p.sports[s].enabled && (s !== "xc_ski" || p.snow));
  for (const s of others) {
    if (pastSport(s) || out.some((x) => x.role !== "rest" && x.sport === s)) continue;
    const pool = out.filter((x) => x.role === "endurance" && !fx(x.date)?.sport && !x.own && x.sport === p.primary);
    // hlavnímu sportu musí zůstat aspoň jeden vytrvalostní den
    if (pool.length < 2) continue;
    const ok = pool.find((x) => s !== "run" || inp.run.experienced || (inp.past.get(addDays(x.date, -1))?.sport !== "run" && day(addDays(x.date, 1))?.sport !== "run"));
    if (ok) ok.sport = s;
  }
  for (const x of out) {
    if (x.role === "rest") continue;
    // chůze je regenerace; vedlejší sport má kvalitu, jen když ji má povolenou (běh navíc jen při pravidelném běhání)
    if (x.sport === "walk") x.role = "easy";
    if (x.role === "key" && x.sport !== p.primary && fx(x.date)?.type !== "quality" && !(p.sports[x.sport].quality && (x.sport !== "run" || inp.run.experienced))) x.role = "endurance";
  }

  // ---- délky ----
  const doneMin = dates.filter(isPast).reduce((t, d) => t + (inp.past.get(d)?.minutes ?? 0), 0);
  const R = Math.max(0, T - doneMin);
  const runCap = Math.min(150, Math.max(p.primary === "run" ? 45 : 30, Math.round(inp.run.longest * 1.1)));
  const capOf = (x: SolvedDay) => (x.sport === "run" ? runCap : 600);
  const rnd = (x: SolvedDay, m: number) => (x.sport === "run" ? r5(m) : r15(m));
  let left = R;
  const open: SolvedDay[] = [];
  for (const x of out) {
    if (x.role === "rest") continue;
    const f = fx(x.date);
    if (x.own) x.minutes = x.own.min;
    else if (f?.minutes) x.minutes = f.minutes;
    else if (x.role === "key") x.minutes = x.sport === "ride" ? KEY_MIN : Math.min(capOf(x), x.sport === "run" ? 50 : KEY_MIN);
    else if (x.role === "easy") x.minutes = Math.min(capOf(x), 40);
    else { open.push(x); continue; }
    left -= x.minutes;
  }
  const longDay = open.find((x) => x.role === "long");
  const ends = open.filter((x) => x.role === "endurance");
  const longCap = (x: SolvedDay) => (x.sport === "run" ? runCap : Math.max(120, r15(inp.longestRide * 1.2)));
  if (longDay) {
    const cap = longCap(longDay);
    const lo = longDay.sport === "run" ? Math.min(45, cap) : 90;
    const minEnd = ends.reduce((t, x) => t + (x.sport === "run" ? 30 : 45), 0);
    longDay.minutes = rnd(longDay, clamp(Math.max(0.33 * T, ends.length ? 0 : left), lo, Math.max(lo, Math.min(cap, left - minEnd))));
    left -= longDay.minutes;
  }
  ends.forEach((x, i) => {
    const lo = x.sport === "run" ? Math.min(30, capOf(x)) : 45;
    const hi = Math.min(capOf(x), 150, longDay ? Math.max(lo, longDay.minutes - 15) : 150);
    x.minutes = rnd(x, clamp(left / (ends.length - i), lo, Math.max(lo, hi)));
    left -= x.minutes;
  });
  // co se nevešlo do vytrvalostních dnů, jde do dlouhého (do jeho stropu)
  if (longDay && left >= 15) longDay.minutes = rnd(longDay, Math.min(longCap(longDay), longDay.minutes + left));
  return out;
}
