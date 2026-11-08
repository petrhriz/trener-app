// Zotavení – osobní normy (kap. 4 / pripravenost kap. 3). Rozhoduje kód, ne LLM.
import { addDays } from "../lib/time";

export interface WRow {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleep_s: number | null;
  sleep_score: number | null;
  sleep_q: string | null;
}

export interface Norm {
  n: number;
  mean: number;
  sd: number;
}

export const MIN_VALUES = 21;

export function norm(values: (number | null | undefined)[]): Norm {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const n = v.length;
  if (n === 0) return { n: 0, mean: NaN, sd: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}

export function avg(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export type Flag = "none" | "yellow" | "red";
export type Status = "ok" | "missing" | "insufficient";

export interface Indicator {
  today: number | null;
  avg7: number | null;
  norm: Norm;
  status: Status;
  flag: Flag;
  rating: string | null;
  /** příznak je očekávaný po zátěži a nepočítá se */
  expected: boolean;
  /** text normy do tabulky (např. „73–79“, „do 52“) */
  rangeText: string;
}

export interface SleepIndicator extends Indicator {
  score: number | null;
  q: string | null;
  scoreAvg7: number | null;
  scoreAvg60: number | null;
}

export type State = "green" | "yellow" | "red";

export interface RecoveryResult {
  date: string;
  hrv: Indicator;
  rhr: Indicator & { yellowThr: number | null; redThr: number | null; streak3: boolean };
  sleep: SleepIndicator;
  state: State;
  stateLabel: string;
  emoji: string;
  flags: { yellow: number; red: number; counted: string[] };
  dayAfter: string | null;
  illness: boolean;
  hrvYellow2Days: boolean;
  normDays: number;
  reasons: string[];
}

export const STATE_LABEL: Record<State, string> = {
  green: "Zregenerovaný",
  yellow: "Částečně",
  red: "Nedoregenerovaný",
};
export const STATE_EMOJI: Record<State, string> = { green: "🟢", yellow: "🟡", red: "🔴" };

/** Slovní hodnocení spánku podle skóre (Garmin 0–100) nebo kvalifikátoru Q1–Q4. */
export function sleepRating(score: number | null, q: string | null): string | null {
  if (score != null) {
    if (score >= 90) return "Výborný";
    if (score >= 80) return "Dobrý";
    if (score >= 60) return "Uspokojivý";
    return "Špatný";
  }
  switch (q) {
    case "Q1":
      return "Výborný";
    case "Q2":
      return "Dobrý";
    case "Q3":
      return "Uspokojivý";
    case "Q4":
      return "Špatný";
  }
  return null;
}

export interface RecoveryInput {
  date: string;
  /** řádky wellness D−60 … D (dnešek včetně) */
  rows: WRow[];
  /** důvod očekávaného poklesu: „hokeji“, „dlouhých běžkách“, „jízdě se zátěží 135“ (včerejšek) */
  dayAfter: string | null;
  illness: boolean;
}

export function evaluateRecovery(inp: RecoveryInput): RecoveryResult {
  const D = inp.date;
  const byDate = new Map(inp.rows.map((r) => [r.date, r]));
  const hist = inp.rows.filter((r) => r.date >= addDays(D, -60) && r.date <= addDays(D, -1));
  const last7 = inp.rows.filter((r) => r.date >= addDays(D, -7) && r.date <= addDays(D, -1));
  const today = byDate.get(D);
  const yest = byDate.get(addDays(D, -1));
  const yest2 = byDate.get(addDays(D, -2));
  const reasons: string[] = [];

  // ---- HRV ----
  const hN = norm(hist.map((r) => r.hrv));
  const hrv: Indicator = {
    today: today?.hrv ?? null,
    avg7: avg(last7.map((r) => r.hrv)),
    norm: hN,
    status: "ok",
    flag: "none",
    rating: null,
    expected: false,
    rangeText: hN.n ? `${Math.round(hN.mean - hN.sd)}–${Math.round(hN.mean + hN.sd)}` : "–",
  };
  let hrvYellow2Days = false;
  if (hN.n < MIN_VALUES) hrv.status = "insufficient";
  else if (hrv.today == null) hrv.status = "missing";
  else {
    const v = hrv.today;
    if (v < hN.mean - 2 * hN.sd) {
      hrv.flag = "red";
      hrv.rating = "Nízké";
    } else if (v < hN.mean - hN.sd) {
      hrv.flag = "yellow";
      hrv.rating = "Nevyvážené";
    } else if (v > hN.mean + hN.sd) hrv.rating = "Vysoké";
    else hrv.rating = "Vyvážené";
    if (hrv.flag !== "none" && yest?.hrv != null && yest.hrv < hN.mean - hN.sd) hrvYellow2Days = true;
  }

  // ---- Klidový tep ----
  const rN = norm(hist.map((r) => r.rhr));
  const yellowThr = rN.n ? Math.max(rN.mean + 2 * rN.sd, rN.mean + 3) : null;
  const redThr = rN.n && yellowThr != null ? Math.max(rN.mean + 3 * rN.sd, yellowThr) : null;
  const rhr: RecoveryResult["rhr"] = {
    today: today?.rhr ?? null,
    avg7: avg(last7.map((r) => r.rhr)),
    norm: rN,
    status: "ok",
    flag: "none",
    rating: null,
    expected: false,
    rangeText: yellowThr != null ? `do ${Math.round(yellowThr)}` : "–",
    yellowThr,
    redThr,
    streak3: false,
  };
  if (rN.n < MIN_VALUES) rhr.status = "insufficient";
  else if (rhr.today == null) rhr.status = "missing";
  else {
    const above = (x: number | null | undefined) => x != null && yellowThr != null && x > yellowThr;
    if (redThr != null && rhr.today > redThr) {
      rhr.flag = "red";
      rhr.rating = "Vysoký";
    } else if (above(rhr.today)) {
      rhr.flag = "yellow";
      rhr.rating = "Zvýšený";
      if (above(yest?.rhr) && above(yest2?.rhr)) {
        rhr.flag = "red";
        rhr.rating = "Vysoký";
        rhr.streak3 = true;
        reasons.push("klidový tep zvýšený 3 dny po sobě");
      }
    } else rhr.rating = "Normální";
  }

  // ---- Spánek ----
  const sN = norm(hist.map((r) => r.sleep_s));
  const scN = norm(hist.map((r) => r.sleep_score));
  const sleep: SleepIndicator = {
    today: today?.sleep_s ?? null,
    avg7: avg(last7.map((r) => r.sleep_s)),
    norm: sN,
    status: "ok",
    flag: "none",
    rating: sleepRating(today?.sleep_score ?? null, today?.sleep_q ?? null),
    expected: false,
    rangeText: "",
    score: today?.sleep_score ?? null,
    q: today?.sleep_q ?? null,
    scoreAvg7: avg(last7.map((r) => r.sleep_score)),
    scoreAvg60: scN.n ? scN.mean : null,
  };
  if (sleep.today == null && sleep.score == null && sleep.q == null) sleep.status = "missing";
  else if (sN.n < MIN_VALUES) sleep.status = "insufficient";
  else {
    const s = sleep.today;
    const lowScore = (sleep.score != null && sleep.score < 60) || (sleep.score == null && sleep.q === "Q4");
    if (s != null && s < 5 * 3600) sleep.flag = "red";
    else if (lowScore) sleep.flag = "yellow";
    else if (s != null && s < 6 * 3600 && yest?.sleep_s != null && yest.sleep_s < 6 * 3600) {
      sleep.flag = "yellow";
      reasons.push("spánek pod 6:00 h dvě noci po sobě");
    }
  }

  // ---- Rozhodnutí ----
  // Den po hokeji / dlouhých běžkách / zátěži nad 120: jeden 🟡 (HRV nebo klidový tep) nepočítat.
  if (inp.dayAfter) {
    if (hrv.flag === "yellow") hrv.expected = true;
    else if (rhr.flag === "yellow") rhr.expected = true;
  }
  const inds: [string, Indicator][] = [
    ["VST", hrv],
    ["klidový tep", rhr],
    ["spánek", sleep],
  ];
  let yellow = 0;
  let red = 0;
  const counted: string[] = [];
  for (const [name, i] of inds) {
    if (i.status !== "ok" || i.expected) continue;
    if (i.flag === "red") {
      red++;
      counted.push(`${name} 🔴`);
    } else if (i.flag === "yellow") {
      yellow++;
      counted.push(`${name} 🟡`);
    }
  }
  let state: State = "green";
  if (inp.illness) {
    state = "red";
    reasons.push("příznaky nemoci");
  } else if (red > 0 || yellow + red >= 3) state = "red";
  else if (yellow >= 2 || (hrvYellow2Days && !hrv.expected)) {
    state = "yellow";
    if (hrvYellow2Days && yellow < 2) reasons.push("VST pod normou druhý den po sobě");
  }

  return {
    date: D,
    hrv,
    rhr,
    sleep,
    state,
    stateLabel: STATE_LABEL[state],
    emoji: STATE_EMOJI[state],
    flags: { yellow, red, counted },
    dayAfter: inp.dayAfter,
    illness: inp.illness,
    hrvYellow2Days,
    normDays: hist.length,
    reasons,
  };
}

/** Co s dnešní jednotkou podle stavu (kap. 4 Rozhodnutí). */
export function decisionFor(state: State, kind: "quality" | "z2" | "long" | "recovery" | "rest" | null) {
  if (state === "green") return { action: "beze změny" as const, label: "Jet beze změny" };
  if (state === "yellow") {
    if (kind === "quality") return { action: "lehci" as const, label: "Lehčí" };
    if (kind === "z2" || kind === "long") return { action: "zkratit" as const, label: "Lehčí" };
    return { action: "beze změny" as const, label: "Volno" };
  }
  return { action: "volno" as const, label: "Volno" };
}
