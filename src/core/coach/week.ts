// Kostra týdne Trenéra v2: role dnů (volno / lehký / vytrvalost / klíčový / dlouhý), sport a délky.
// Malý řešič: projde kombinace dnů a rolí, tvrdá pravidla vyřadí, zbytek oboduje. Stejný vstup = stejný výsledek.
// Žádné nastavené dny: trénovat jde kdykoli. Pořadí důležitosti je kvalita → dlouhý → vytrvalost, takže když
// v týdnu zbývá málo dnů (něco jsi vynechal), zůstane to důležité a vytrvalost propadne.
import { PLAN_SPORTS, type PlanSport } from "../../datasource/types";
import { addDays, dow } from "../../lib/time";
import type { OwnRide } from "../ownRide";
import type { CoachProfile } from "./profile";

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
  /** cíl zátěže týdne, co už je odjeto, počet tréninků a kvalit, dlouhý den ano / ne */
  load: number;
  doneLoad: number;
  sessions: number;
  keys: number;
  long: boolean;
  /** zátěž za hodinu lehké jednotky (hlavní sport) a běhu; stropy délek (min) */
  rate: number;
  runRate: number;
  caps: { easy: number; long: number; key: number };
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

/** Co týden chtěl a co se do něj opravdu vešlo. Vyšší vrstva rozhodne, co s tím. */
export interface SolveReport {
  requested: { keys: number; long: boolean; sessions: number };
  fulfilled: { keys: number; long: boolean; sessions: number };
  /** požadavek, který se nesplnil (není to tvoje volba) */
  violations: { code: "long_missing" | "keys_short"; text: string }[];
  /** vědomá výjimka z pravidla – tvoje úprava dne */
  exceptions: { code: "key_after_hard"; date: string; text: string }[];
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
  return solveWeekFull(inp).days;
}

export function solveWeekFull(inp: SolveInput): { days: SolvedDay[]; report: SolveReport } {
  const { profile: p, weekStart } = inp;
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i));
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
  const needLong = inp.long && !longPast;

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

  // dlouhý trénink má přednost před vytrvalostí: když počet tréninků vyčerpaly lehčí dny (počet se během
  // týdne přepočítává), dlouhý dostane místo navíc – pokud na něj ještě zbývá zátěž (aspoň 75 min lehce)
  const longRoom = needLong && !forced.length && inp.load - inp.doneLoad >= 75 * Math.max(0.4, inp.rate / 60) ? 1 : 0;
  const maxFree = Math.max(0, Math.min(free.length, Math.max(inp.sessions - donePast - forced.length, longRoom)));
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

  // ---- délky: ze zátěže týdne (ne z hodin), se stropy podle toho, co sportovec opravdu jezdí ----
  const perMin = Math.max(0.4, inp.rate / 60);
  // běh v plánu cyklisty (a naopak) dostane délku podle STEJNÉ ZÁTĚŽE, ne podle stejných minut
  const runPerMin = Math.max(0.4, (p.primary === "run" ? inp.rate : inp.runRate) / 60);
  const pm = (x: SolvedDay) => (x.sport === "run" ? runPerMin : perMin);
  const runCap = runCapOf(inp.run.longest);
  const rnd = (x: SolvedDay, m: number) => (x.sport === "run" ? r5(m) : r15(m));
  let left = Math.max(0, inp.load - inp.doneLoad);
  const open: SolvedDay[] = [];
  for (const x of out) {
    if (x.role === "rest") continue;
    const f = fx(x.date);
    if (x.own) { x.minutes = x.own.min; left -= x.minutes * perMin; }
    else if (f?.minutes) { x.minutes = Math.min(f.minutes, MAX_DAY_MIN[x.sport]); left -= x.minutes * pm(x) * (x.role === "key" ? 1.45 : 1); }
    else if (x.role === "key") {
      // zátěž kvality v hlavním sportu → tolik minut druhého sportu, aby zátěž vyšla podobně
      const keyLoad = inp.caps.key * perMin * 1.45;
      x.minutes = x.sport === "run" && p.primary !== "run" ? Math.max(Math.min(30, runCap), Math.min(runCap, r5(keyLoad / (runPerMin * 1.3)))) : x.sport === "run" ? Math.min(runCap, 50) : inp.caps.key;
      left -= keyLoad;
    }
    else if (x.role === "easy") { x.minutes = Math.min(x.sport === "run" ? runCap : 45, 40); left -= x.minutes * pm(x) * 0.7; }
    else open.push(x);
  }
  left = Math.max(0, left);
  const longDay = open.find((x) => x.role === "long");
  const ends = open.filter((x) => x.role === "endurance");
  if (longDay) {
    const cap = longDay.sport === "run" ? runCap : inp.caps.long;
    const lo = longDay.sport === "run" ? Math.min(40, cap) : Math.min(75, cap);
    // dlouhý den dostane větší díl zbylé zátěže, lehké dny zbytek
    longDay.minutes = rnd(longDay, clamp(((ends.length ? 0.6 : 1) * left) / pm(longDay), lo, cap));
    left = Math.max(0, left - longDay.minutes * pm(longDay));
  }
  ends.forEach((x, i) => {
    const cap = x.sport === "run" ? Math.min(runCap, 90) : Math.min(inp.caps.easy, longDay ? Math.max(45, longDay.minutes - 15) : inp.caps.easy);
    const lo = x.sport === "run" ? Math.min(30, cap) : 45;
    // den přepnutý na jiný sport dostane zátěž, jakou by měl v hlavním sportu (strop délky hlavního sportu)
    const share = Math.min(left / (ends.length - i), inp.caps.easy * perMin);
    x.minutes = rnd(x, clamp(share / pm(x), lo, Math.max(lo, cap)));
    left = Math.max(0, left - x.minutes * pm(x));
  });

  // ---- co se splnilo ----
  const keysDone = keysPast + out.filter((x) => x.role === "key").length;
  const longDone = longPast || out.some((x) => x.role === "long");
  const report: SolveReport = {
    requested: { keys: inp.keys, long: inp.long, sessions: inp.sessions },
    fulfilled: { keys: keysDone, long: longDone, sessions: donePast + out.filter((x) => x.role !== "rest").length },
    violations: [],
    exceptions: [],
  };
  if (inp.long && !longDone) report.violations.push({ code: "long_missing", text: "Dlouhý trénink se do týdne nevešel (málo volných dnů nebo tvoje kratší délky)." });
  if (keysDone < inp.keys) report.violations.push({ code: "keys_short", text: `Kvalita ${keysDone}× místo ${inp.keys}× – víc se jich do týdne podle pravidel nevešlo.` });
  for (const x of out) {
    if (x.role !== "key") continue;
    const y = addDays(x.date, -1);
    const yHard = isPast(y) || y < weekStart ? pastHard(y) : isHardRole(day(y)?.role);
    if (yHard) report.exceptions.push({ code: "key_after_hard", date: x.date, text: "kvalita den po těžkém dni – je to tvoje volba" });
  }
  return { days: out, report };
}
