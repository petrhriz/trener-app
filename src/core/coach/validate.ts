// Závěrečná kontrola týdne – běží nad celým týdnem až po všech úpravách (řešič, počasí, zotavení,
// vyvážení formy, výběr z knihovny). Plán, který porušuje vlastní pravidla, se nesmí tvářit jako v pořádku.
//  - error: porušené pravidlo, které nikdo nezvolil (plán není v pořádku),
//  - warn: požadavek týdne se nesplnil (dlouhý trénink, počet kvalit, 80/20) – plán jde, ale říká to,
//  - exception: pravidlo porušené tvou výslovnou volbou (vynucená kvalita, délka, vlastní jízda) – zaznamenané.
import { dayDm, num } from "../../lib/format";
import { addDays } from "../../lib/time";
import type { PlanSport } from "../../datasource/types";
import { MAX_STREAK, type PastDay, type Role, isHardRole } from "./common";

export type ValidationLevel = "error" | "warn" | "exception";
export type ValidationCode = "streak" | "key_after_hard" | "tsb_floor" | "tiz" | "cap" | "long_missing" | "keys_short";

export interface ValidationItem {
  code: ValidationCode;
  level: ValidationLevel;
  date: string | null;
  text: string;
}

export interface WeekValidation {
  /** žádná chyba (výjimky z tvé volby a upozornění nevadí) */
  ok: boolean;
  items: ValidationItem[];
}

export interface ValDay {
  date: string;
  role: Role;
  sport: PlanSport;
  minutes: number;
  tiz: number;
  blocked: boolean;
  own: boolean;
  /** kvalitu si na den dal uživatel */
  userQuality: boolean;
  /** délku zadal uživatel */
  userMinutes: boolean;
  /** jakákoli tvoje volba dne (sport, druh, délka, vlastní jízda) – řada dní kvůli ní je výjimka */
  mine?: boolean;
  /** délka převzatá z pondělního plánu – strop, který mezitím klesl, ji nezkracuje */
  keepMin?: number;
  /** proč se role dne proti kostře snížila (vědomá úprava), null = nesnížila */
  downgraded: string | null;
}

export interface ValidateInput {
  weekStart: string;
  /** první plánovaný den; dřívější dny týdne a 3 dny před týdnem jsou v `past` */
  from: string;
  /** plánované dny (od `from`) */
  days: ValDay[];
  past: Map<string, PastDay>;
  /** kolik kvalit a jestli dlouhý trénink týden chce */
  keys: number;
  long: boolean;
  caps: { easy: number; long: number; key: number };
  runCap: number;
  tsbFloor: number | null;
  /** výhled formy na plánované dny */
  forms: { date: string; form: number }[];
  /** výhled formy, kdyby byl týden celý volno – propad, který nastane i tak, není chyba plánu */
  formsRest?: { date: string; form: number }[];
  /** strop délky pro sporty mimo kolo a běh (běžky, chůze) podle druhu dne */
  otherCap?: (sport: PlanSport, role: Role) => number;
}

/** Tolerance délky: knihovna zaokrouhluje dojezd na 5 min a přidává rozjetí. */
const CAP_TOL = 15;

export function validateWeek(v: ValidateInput): WeekValidation {
  const items: ValidationItem[] = [];
  const add = (code: ValidationCode, level: ValidationLevel, date: string | null, text: string) => items.push({ code, level, date, text });
  const plan = new Map(v.days.map((d) => [d.date, d]));
  const isPlanned = (d: string) => d >= v.from && d >= v.weekStart;
  const trained = (d: string) => (isPlanned(d) ? (plan.get(d)?.role ?? "rest") !== "rest" : !!v.past.get(d)?.trained);
  const hard = (d: string) => (isPlanned(d) ? isHardRole(plan.get(d)?.role) : !!v.past.get(d)?.hard);

  // 1) nejvýš MAX_STREAK dní tréninku za sebou (3 dny před týdnem + týden), hlídá se řada s plánovaným dnem
  let run = 0, hasPlanned = false, flagged = false;
  for (let i = -3; i < 7; i++) {
    const d = addDays(v.weekStart, i);
    if (!trained(d)) { run = 0; hasPlanned = false; flagged = false; continue; }
    run++;
    if (isPlanned(d)) hasPlanned = true;
    if (run > MAX_STREAK && hasPlanned && !flagged) {
      flagged = true;
      const user = v.days.some((x) => x.date <= d && x.date > addDays(d, -run) && (x.userQuality || x.userMinutes || x.own || x.mine));
      add("streak", user ? "exception" : "error", d, `${dayDm(d)}: ${run} dny tréninku za sebou (nejvýš ${MAX_STREAK})${user ? " – tvoje volba" : ""}.`);
    }
  }

  // 2) kvalita ne den po těžkém dni (kvalita nebo dlouhý); dlouhý den po kvalitě je dovolený (víkendový blok)
  for (const d of v.days) {
    if (d.role !== "key") continue;
    const y = addDays(d.date, -1);
    if (!hard(y)) continue;
    if (d.userQuality) add("key_after_hard", "exception", d.date, `${dayDm(d.date)}: kvalita den po těžkém dni – je to tvoje volba.`);
    else add("key_after_hard", "error", d.date, `${dayDm(d.date)}: kvalita den po těžkém dni.`);
  }

  // 3) forma nesmí spadnout pod hranici
  if (v.tsbFloor != null) {
    const rest = new Map((v.formsRest ?? []).map((f) => [f.date, f.form]));
    // plán k propadu přispívá: forma je níž, než kdyby byl týden volno
    const byPlan = (f: { date: string; form: number }) => !rest.has(f.date) || f.form < rest.get(f.date)! - 0.5;
    const low = v.forms.find((f) => f.form < v.tsbFloor! && byPlan(f));
    const past = v.forms.find((f) => f.form < v.tsbFloor! && !byPlan(f));
    // k propadu vedou tvoje dny (vlastní jízda, tvoje délka, vynucená kvalita) → výjimka z tvé volby
    const userBy = low && v.days.some((x) => x.date <= low.date && x.role !== "rest" && (x.userQuality || x.userMinutes || x.own || x.mine));
    if (low && userBy) add("tsb_floor", "exception", low.date, `Forma ${dayDm(low.date)} ${num(low.form, 1)} – pod hranicí ${num(v.tsbFloor)} kvůli tvým tréninkům.`);
    else if (low) add("tsb_floor", "error", low.date, `Forma ${dayDm(low.date)} ${num(low.form, 1)} – pod hranicí ${num(v.tsbFloor)} i po zkrácení plánu.`);
    else if (past) add("tsb_floor", "warn", past.date, `Forma ${dayDm(past.date)} ${num(past.form, 1)} je pod hranicí ${num(v.tsbFloor)} z minulých dní – ani volno ji hned nezvedne.`);
  }

  // 4) stropy délek (tvoje délka / vlastní jízda = výjimka)
  for (const d of v.days) {
    if (d.role === "rest" || d.blocked || d.minutes <= 0) continue;
    const cap = d.sport === "run" ? v.runCap : d.sport !== "ride" && v.otherCap ? v.otherCap(d.sport, d.role) : d.role === "long" ? v.caps.long : d.role === "key" ? v.caps.key + 20 : d.role === "easy" ? 45 : v.caps.easy;
    if (d.minutes <= Math.max(cap, d.keepMin ?? 0) + CAP_TOL) continue;
    if (d.userMinutes || d.own) add("cap", "exception", d.date, `${dayDm(d.date)}: ${d.minutes} min nad strop ${cap} min – tvoje délka.`);
    else add("cap", "error", d.date, `${dayDm(d.date)}: ${d.minutes} min nad strop ${cap} min.`);
  }

  // 5) pojistka 80/20: plánovaný čas nad Z2 nejvýš 20 % týdne (25 % pod 5 h)
  const pastMin = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(v.weekStart, i)).filter((d) => !isPlanned(d)).reduce((t, d) => t + (v.past.get(d)?.minutes ?? 0), 0);
  const total = pastMin + v.days.reduce((t, d) => t + (d.role === "rest" ? 0 : d.minutes), 0);
  const tiz = v.days.reduce((t, d) => t + d.tiz, 0);
  const lim = total < 300 ? 0.25 : 0.2;
  if (total > 0 && tiz / total > lim + 0.02) add("tiz", "warn", null, `Nad Z2 je v plánu ${Math.round((tiz / total) * 100)} % času (pojistka ${Math.round(lim * 100)} %).`);

  // 6) požadavky týdne: dlouhý trénink a počet kvalit (vědomé snížení = výjimka, jinak upozornění)
  const weekDates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(v.weekStart, i));
  const keysDone = weekDates.filter((d) => (isPlanned(d) ? plan.get(d)?.role === "key" : !!v.past.get(d)?.key)).length;
  const longDone = weekDates.some((d) => (isPlanned(d) ? plan.get(d)?.role === "long" : !!v.past.get(d)?.long));
  const downKey = v.days.find((d) => d.downgraded && d.role !== "key");
  if (v.long && !longDone) {
    const why = v.days.find((d) => d.downgraded)?.downgraded;
    if (why) add("long_missing", "exception", null, `Dlouhý trénink tento týden není (${why}).`);
    else add("long_missing", "warn", null, "Dlouhý trénink se do týdne nevešel.");
  }
  if (keysDone < v.keys) {
    if (downKey) add("keys_short", "exception", null, `Kvalita ${keysDone}× místo ${v.keys}× (${downKey.downgraded}).`);
    else add("keys_short", "warn", null, `Kvalita ${keysDone}× místo ${v.keys}×.`);
  }

  return { ok: !items.some((i) => i.level === "error"), items };
}

/** Kódy, u kterých se datum může jen posunout se stejným porušením (řada dní, propad formy) → počítá se počet. */
const COUNTED: ReadonlySet<ValidationCode> = new Set(["streak", "tsb_floor"]);

/**
 * Porušení pravidel, která úprava plánu (AI trenér) nově způsobila – v celém týdnu, nejen na upravených dnech:
 * přesun může vytvořit řadu dní za sebou, kvalitu po nově těžkém dni nebo propad formy o pár dní dál.
 * Hlídají se chyby a výjimky (upozornění ne). U řady dní a propadu formy rozhoduje počet výskytů, ne datum,
 * aby posun už existujícího porušení nezablokoval jinak neškodnou úpravu.
 */
export function newViolations(before: ValidationItem[], after: ValidationItem[]): ValidationItem[] {
  const guarded = (v: ValidationItem) => v.level === "error" || v.level === "exception";
  const key = (v: ValidationItem) => (COUNTED.has(v.code) ? v.code : `${v.code}|${v.date ?? ""}`);
  const left = new Map<string, number>();
  for (const v of before.filter(guarded)) left.set(key(v), (left.get(key(v)) ?? 0) + 1);
  const out: ValidationItem[] = [];
  for (const v of after.filter(guarded)) {
    const n = left.get(key(v)) ?? 0;
    if (n > 0) left.set(key(v), n - 1);
    else out.push(v);
  }
  return out;
}
