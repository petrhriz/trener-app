// Zotavení – osobní normy (kap. 4 / pripravenost kap. 3). Rozhoduje kód, ne LLM.
import { addDays } from "../lib/time";

export interface WRow {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleep_s: number | null;
  sleep_score: number | null;
  sleep_q: string | null;
  /** průměrný tep a dech ve spánku – jen pro upozornění na možnou nemoc (illnessHint) */
  sleep_hr?: number | null;
  sleep_resp?: number | null;
}

export interface Norm {
  n: number;
  mean: number;
  sd: number;
}

export const MIN_VALUES = 21;
/** Spánek kratší než tohle je červený ukazatel. */
export const SLEEP_RED_S = 5 * 3600;

/**
 * Týdenní VST pod normou (únava v cíli týdne): 7denní hodnota ln VST (aspoň 4 noci) proti 7denním hodnotám
 * z předchozích 60 dní – srovnává se týden s rozptylem týdnů, ne s rozptylem jednotlivých nocí (ten je mnohem větší,
 * takže hranice „průměr − 1 SD nocí“ zachytila jen velký propad). Plews a kol. 2012 sledují 7denní průměr ln rMSSD;
 * tady je to medián, aby jedna odlehlá noc (K-05) týden neposunula. Medián a hranice 1 SD jsou vlastní volba.
 */
/** Týdny historie se nepřekrývají (posun o 7 dní): překrývající se okna by rozptyl týdnů podhodnotila. */
export const HRV_WEEK = { min7: 4, minWeeks: 5, sd: 1 };
export function hrvWeekLow(rows: { date: string; hrv: number | null }[], today: string): boolean {
  const ln = new Map(rows.filter((r) => r.hrv != null && r.hrv > 0).map((r) => [r.date, Math.log(r.hrv!)]));
  const weekOf = (end: string): number | null => {
    const v = [0, 1, 2, 3, 4, 5, 6].map((i) => ln.get(addDays(end, -i))).filter((x): x is number => x != null);
    if (v.length < HRV_WEEK.min7) return null;
    const s = [...v].sort((a, b) => a - b), h = Math.floor(s.length / 2);
    return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
  };
  const now = weekOf(today);
  if (now == null) return false;
  // předchozí týdny celé v D−60 … D−7 (bez dnešního týdne), bez překryvu: končí D−7, D−14 … D−49
  const past: number[] = [];
  for (let e = addDays(today, -7); e >= addDays(today, -54); e = addDays(e, -7)) { const m = weekOf(e); if (m != null) past.push(m); }
  if (past.length < HRV_WEEK.minWeeks) return false;
  const n = norm(past);
  return n.sd > 0 && now < n.mean - HRV_WEEK.sd * n.sd;
}

/** Norma VST v ln(ms) – průměr a SD logaritmů (stejná transformace jako skóre zotavení a týdenní VST). */
export function hrvLnNorm(rows: { hrv: number | null }[]): Norm {
  return norm(rows.map((r) => (r.hrv != null && r.hrv > 0 ? Math.log(r.hrv) : null)));
}

/**
 * VST v ranním semaforu (vše v ln ms proti normě D−60 … D−1): 🟡 = 7denní průměr pod normou − 0,5 SD,
 * 🔴 = dnešní noc pod − 2 SD. SD aspoň 0,03 jako SD_FLOOR ve skóre zotavení. Hranice 0,5 a 2 SD jsou vlastní volba
 * (docs/trener/zdroje.md); 7denní průměr ln VST sledují Plews a kol. 2012.
 */
export const HRV_SEM = { min7: 4, yellowSd: 0.5, redSd: 2, sdFloor: 0.03 };

/** Průměr ln(VST) za D−6 … D (aspoň HRV_SEM.min7 nocí), jinak null. */
export function hrvLnWeek(rows: { date: string; hrv: number | null }[], D: string): number | null {
  const from = addDays(D, -6);
  const v = rows.filter((r) => r.date >= from && r.date <= D && r.hrv != null && r.hrv > 0).map((r) => Math.log(r.hrv!));
  return v.length >= HRV_SEM.min7 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Slovní hodnocení VST podle odchylky 7denního průměru (bez týdne podle dnešní noci) – obdoba Garminova stavu VST. */
export function hrvRating(z: number | null): string | null {
  if (z == null) return null;
  if (z < -1) return "Nízké";
  if (z < -HRV_SEM.yellowSd) return "Nevyvážené";
  if (z > HRV_SEM.yellowSd) return "Vysoké";
  return "Vyvážené";
}

/**
 * Možná nastupující nemoc: tep ve spánku (bez normy klidový tep) i dech ve spánku nad průměr + 2 SD a zároveň
 * aspoň +3 bpm / +1 dech/min, a to 2 noci po sobě (D a D−1, každá proti 60 nocím před ní, aspoň 21 hodnot).
 * Mishra a kol. 2020 (tep), Natarajan a kol. 2020 (dech); +3 bpm, +1 dech/min a 2 noci jsou vlastní volba.
 * Jen informace – semafor ani plán nemění, stav Nemocný se nastavuje ručně.
 */
export const ILLNESS_HINT = { sd: 2, hrMin: 3, respMin: 1, nights: 2 };
export const ILLNESS_HINT_TEXT = "Možná nastupuje nemoc – tep i dech ve spánku jsou 2 noci nad tvou normou. Zvaž lehčí den.";
type HintRow = { date: string; rhr: number | null; sleep_hr?: number | null; sleep_resp?: number | null };
const above = (hist: HintRow[], v: number | null | undefined, get: (r: HintRow) => number | null | undefined, min: number): boolean | null => {
  const n = norm(hist.map(get));
  if (n.n < MIN_VALUES || v == null) return null;
  return v > n.mean + ILLNESS_HINT.sd * n.sd && v >= n.mean + min;
};
function nightElevated(rows: HintRow[], d: string): boolean {
  const night = rows.find((r) => r.date === d);
  if (!night) return false;
  const hist = rows.filter((r) => r.date >= addDays(d, -60) && r.date < d);
  const hr = above(hist, night.sleep_hr, (r) => r.sleep_hr, ILLNESS_HINT.hrMin) ?? above(hist, night.rhr, (r) => r.rhr, ILLNESS_HINT.hrMin);
  const resp = above(hist, night.sleep_resp, (r) => r.sleep_resp, ILLNESS_HINT.respMin);
  return hr === true && resp === true;
}
export function illnessHint(rows: HintRow[], D: string): string | null {
  for (let i = 0; i < ILLNESS_HINT.nights; i++) if (!nightElevated(rows, addDays(D, -i))) return null;
  return ILLNESS_HINT_TEXT;
}

/** Minulá noc VST proti normě (z v ln): jen informace vedle týdenního hodnocení, 🔴 noci odpovídá „výrazně pod normou“. */
export function hrvNightRating(z: number | null): string | null {
  if (z == null) return null;
  if (z < -HRV_SEM.redSd) return "výrazně pod normou";
  if (z < -1) return "pod normou";
  if (z > 1) return "nad normou";
  return "v normě";
}

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
  /** VST: zhodnocení samotné minulé noci (jen informace, semafor rozhoduje podle týdne) */
  night?: string | null;
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
  flags: { yellow: number; red: number; counted: string[] };
  dayAfter: string | null;
  illness: boolean;
  /** jen informace: tep i dech ve spánku 2 noci nad normou (illnessHint), semafor ani plán nemění */
  illnessHint: string | null;
  normDays: number;
  reasons: string[];
  /** Zotavení 0–100 % (src/core/readinessScore.ts recoveryScore); null = málo dat */
  score: number | null;
  /** co skóre nejvíc stáhlo / zvedlo (text) */
  scoreDrags: string[];
  scoreBoosts: string[];
  /** vstupy skóre, které ten den chyběly (počítají se jako v normě) */
  scoreMissing: string[];
}

export const STATE_LABEL: Record<State, string> = {
  green: "Zotavený",
  yellow: "Částečně zotavený",
  red: "Nezotavený",
};

/** Slovní hodnocení spánku podle skóre 0–100 (vlastní výpočet z nočních dat Garminu) nebo kvalifikátoru Q1–Q4. */
export function sleepRating(score: number | null, q: string | null): string | null {
  if (score != null) {
    if (score >= 90) return "Výborný";
    if (score >= 80) return "Dobrý";
    if (score >= 60) return "Průměrný";
    return "Špatný";
  }
  switch (q) {
    case "Q1":
      return "Výborný";
    case "Q2":
      return "Dobrý";
    case "Q3":
      return "Průměrný";
    case "Q4":
      return "Špatný";
  }
  return null;
}

export interface RecoveryInput {
  date: string;
  /** řádky wellness D−60 … D (dnešek včetně) */
  rows: WRow[];
  /** důvod očekávaného poklesu: „dlouhých běžkách“, „jízdě se zátěží 135“ (včerejšek) */
  dayAfter: string | null;
  illness: boolean;
  /** Zotavení v % z recoveryScore: pod 34 % aspoň 🟡, pod 15 % 🔴 */
  score?: { score: number | null; drags: string[]; boosts: string[]; missing?: string[] } | null;
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
  // Vše v ln(ms) jako ve skóre zotavení (readinessScore.ts): VST je zešikmená, v ln je rozptyl stejný při nízké
  // i vysoké VST (Plews a kol. 2012 pracují s ln rMSSD). 🟡 = 7denní průměr ln VST (D−6 … D, aspoň 4 noci) pod
  // normou − 0,5 SD (týdenní trend jako Garminův stav VST), 🔴 = dnešní noc pod − 2 SD. `norm` zůstává v ms.
  const hN = norm(hist.map((r) => r.hrv));
  const ln0 = hrvLnNorm(hist);
  const lN: Norm = { ...ln0, sd: Math.max(HRV_SEM.sdFloor, ln0.sd) };
  const week = hrvLnWeek(inp.rows, D);
  const hrv: Indicator = {
    today: today?.hrv ?? null,
    avg7: week != null ? Math.exp(week) : null,
    norm: hN,
    status: "ok",
    flag: "none",
    rating: null,
    expected: false,
    rangeText: lN.n ? `${Math.round(Math.exp(lN.mean - lN.sd))}–${Math.round(Math.exp(lN.mean + lN.sd))}` : "–",
  };
  const zH = (v: number | null | undefined) => (v != null && v > 0 ? (Math.log(v) - lN.mean) / lN.sd : null);
  let hrvRed2Days = false;
  if (lN.n < MIN_VALUES) hrv.status = "insufficient";
  else if (hrv.today == null) hrv.status = "missing";
  else {
    const zw = week != null ? (week - lN.mean) / lN.sd : null;
    if ((zH(hrv.today) ?? 0) < -HRV_SEM.redSd) hrv.flag = "red";
    else if (zw != null && zw < -HRV_SEM.yellowSd) hrv.flag = "yellow";
    hrv.rating = hrvRating(zw ?? zH(hrv.today));
    hrv.night = hrvNightRating(zH(hrv.today));
    const zy = zH(yest?.hrv);
    if (hrv.flag === "red" && zy != null && zy < -HRV_SEM.redSd) hrvRed2Days = true;
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
    if (s != null && s < SLEEP_RED_S) sleep.flag = "red";
    else if (lowScore) sleep.flag = "yellow";
    else if (s != null && s < 6 * 3600 && yest?.sleep_s != null && yest.sleep_s < 6 * 3600) {
      sleep.flag = "yellow";
      reasons.push("spánek pod 6:00 h dvě noci po sobě");
    }
  }

  // ---- Rozhodnutí ----
  // Den po dlouhých běžkách / zátěži nad 120: jeden 🟡 (VST nebo klidový tep) nepočítat.
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
      counted.push(`${name} (červená)`);
    } else if (i.flag === "yellow") {
      yellow++;
      counted.push(`${name} (žlutá)`);
    }
  }
  // 🔴 (volno) jen s potvrzením: červený ukazatel dva dny po sobě (VST, spánek pod 5 h, klidový tep 3 dny), nebo
  // červený spolu s dalším signálem, nebo tři signály. Jedna noc mimo normu bez dalšího signálu je nejvýš 🟡 –
  // jednotlivé měření je šum (Plews a kol. 2012: rozhodovat podle trendu, ne podle jednoho dne). Pravidlo dvou
  // signálů je vlastní volba (docs/trener/zdroje.md).
  const sleepRed2Days = sleep.flag === "red" && sleep.status === "ok" && yest?.sleep_s != null && yest.sleep_s < SLEEP_RED_S;
  const rhrRed2Days = rhr.flag === "red" && !rhr.expected && rN.n >= MIN_VALUES && redThr != null && yest?.rhr != null && yest.rhr > redThr;
  const persistent = (hrvRed2Days && !hrv.expected) || sleepRed2Days || rhr.streak3 || rhrRed2Days;
  // 🟡 VST je už týdenní trend (7denní průměr), ne jedna noc → stačí sám na 🟡 (dřív „VST 🟡 druhý den po sobě“)
  const hrvWeekYellow = hrv.status === "ok" && hrv.flag === "yellow" && !hrv.expected;
  let state: State = "green";
  if (inp.illness) {
    state = "red";
    reasons.push("příznaky nemoci");
  } else if (persistent || (red > 0 && yellow + red >= 2) || yellow + red >= 3) {
    state = "red";
    if (hrvRed2Days && !hrv.expected) reasons.push("VST výrazně pod normou druhou noc po sobě");
    if (sleepRed2Days) reasons.push("spánek pod 5 h druhou noc po sobě");
    if (rhrRed2Days && !rhr.streak3) reasons.push("klidový tep vysoký druhý den po sobě");
  } else if (red > 0 || yellow >= 2 || hrvWeekYellow) {
    state = "yellow";
    if (red > 0) reasons.push(`${counted.find((c) => c.endsWith("(červená)"))!.replace(" (červená)", "")} jednu noc výrazně mimo normu – bez dalšího signálu jen lehčí den`);
    else if (hrvWeekYellow && yellow < 2) reasons.push("VST: průměr 7 dní pod normou");
  }
  // Zotavení v % (pod 34 špatné) – stav jen zhorší, nikdy nezlepší (nemoc ani 🔴 příznak nepřebije). Skóre je
  // jedna noc: pod 15 % dá 🔴 jen spolu s dalším signálem, samo nejvýš 🟡.
  const sc = inp.score?.score ?? null;
  if (sc != null && !inp.illness) {
    const why = inp.score!.drags.length ? ` (${inp.score!.drags.join(", ")})` : "";
    // skóre stojí na téže noci (VST, tep, spánek) – jako další signál se počítá, jen když jsou mimo normu aspoň dva ukazatele
    if (sc < 15 && state !== "red" && yellow + red >= 2) {
      state = "red";
      reasons.push(`zotavení jen ${sc} %${why}`);
    } else if (sc < 15 && state !== "red") {
      state = "yellow";
      reasons.push(`zotavení jen ${sc} %${why} – jedna noc, bez dalšího signálu jen lehčí den`);
    } else if (sc < 34 && state === "green") {
      state = "yellow";
      reasons.push(`zotavení ${sc} % – pod 34 %${why}`);
    }
  }

  return {
    date: D,
    hrv,
    rhr,
    sleep,
    state,
    stateLabel: STATE_LABEL[state],
    flags: { yellow, red, counted },
    dayAfter: inp.dayAfter,
    illness: inp.illness,
    illnessHint: illnessHint(inp.rows, D),
    normDays: hist.length,
    reasons,
    score: sc,
    scoreDrags: inp.score?.drags ?? [],
    scoreBoosts: inp.score?.boosts ?? [],
    scoreMissing: inp.score?.missing ?? [],
  };
}
