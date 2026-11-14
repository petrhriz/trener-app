// Vlastní skóre spánku a potřeba spánku z nočních dat Garminu. Čistá funkce.
//
// Potřeba se neměří proti pevným 8 h (ani proti ručnímu cíli), ale proti tomu, kolik daný člověk obvykle spí:
// základ = medián délky spánku za posledních 60 dní. Kdo dlouhodobě spí 6:30 a je na to zvyklý, nemá pořád
// „dluh“; kdo spí 8 h, má potřebu kolem 8 h. Jedno pravidlo pro všechny, bez nastavení.
// Dluh = vážený součet odchylek od základu za 7 nocí (novější víc). Spánek se nedospává 1 : 1
// (Banks a kol., 2010) → potřebu na další noc zvedne jen čtvrtina dluhu, nejvýš o hodinu.
// Doporučení pro dospělé je aspoň 7 h (Watson a kol., 2015, AASM/SRS) – při kratším základu to stránka
// jen připomene, skóre a dluh se dál měří proti zvyku. Konstanty skóre jsou odhadnuté empiricky (vlastní kalibrace).

/** Základ spánku (min), dokud není dost historie. */
export const SLEEP_BASE_DEFAULT = 480;
/** Verze výpočtu – při změně se historie přepočítá znovu. */
export const SLEEP_CALC_V = 2;

/** Okno pro základ (dny) a kolik nocí v něm musí být. */
export const BASE_DAYS = 60;
export const BASE_MIN_NIGHTS = 14;
/** Pojistka proti nesmyslným datům (hodinky na stole, noci po směnách): základ 6–9 h. */
export const BASE_RANGE: readonly [number, number] = [360, 540];
/** Doporučené minimum pro dospělé (AASM/SRS) – jen pro upozornění. */
export const SLEEP_REC_MIN = 420;
/** Váha noci v bilanci: 0,74^stáří (dnešní 1, včerejší 0,74 … před 6 dny 0,16). */
export const BANK_DECAY = 0.74;
const REPAY = 0.25; // čtvrtina dluhu do potřeby další noci (vlastní volba)
const REPAY_MAX = 60; // nejvýš +60 min (vlastní volba)

const POW = 3; // strmost trestu za výpadek (90 % potřeby → 73 % bodů, 80 % → 51 %)
const DEEP_T = 0.15; // cíl hlubokého spánku = 15 % potřeby
const REM_T = 0.25; // cíl REM = 25 % potřeby
// váhy složek (součet > 100, výsledek se ořízne na 100 – noc s plným REM i hlubokým spánkem dosáhne 100 i o něco kratší;
// v datech, ze kterých jsou váhy, byl REM vždy pod cílem); pokles tepu (váha 1,1) se neukládá → konstantně polovina
const W = { dur: 43.2, deep: 21.6, rem: 36.8, dip: 1.1, eff: 7.1, cont: 12.2 };
const EFF_LO = 85; // efektivita pod 85 % = 0 bodů, 100 % = plné body
const AWAKE_MAX = 5; // 5 a víc probuzení = 0 bodů za kontinuitu

const cl = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Základ spánku (min): medián délky spánku nocí v okně (sekundy, null = noc bez dat).
 * Méně než 14 nocí → 8 h. Výsledek v mezích 6–9 h.
 */
export function sleepBaseMin(nights: (number | null | undefined)[]): number {
  const v = nights.filter((s): s is number => typeof s === "number" && s > 0).map((s) => s / 60).sort((a, b) => a - b);
  if (v.length < BASE_MIN_NIGHTS) return SLEEP_BASE_DEFAULT;
  const m = v.length % 2 ? v[v.length >> 1]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
  return Math.round(Math.max(BASE_RANGE[0], Math.min(BASE_RANGE[1], m)));
}

/**
 * Bilance (min) za 7 nocí proti základu: Σ 0,74^stáří × (spánek − základ). `last7` od nejstarší po nejnovější
 * (nejnovější má váhu 1); null = noc bez dat (nepočítá se). Záporná = spánkový dluh.
 */
export function sleepBankMin(last7: (number | null | undefined)[], baseMin: number): number {
  const w = last7.slice(-7);
  return w.reduce<number>((t, s, i) => (s == null || s <= 0 ? t : t + (s / 60 - baseMin) * BANK_DECAY ** (w.length - 1 - i)), 0);
}

/** Potřeba spánku (min) pro noc: základ + čtvrtina dluhu z 7 předchozích nocí, nejvýš +60 min. Přebytek potřebu nesnižuje. */
export function sleepNeedMin(prev7: (number | null | undefined)[], baseMin: number): number {
  const debt = Math.max(0, -sleepBankMin(prev7, baseMin));
  return Math.round(baseMin + Math.min(REPAY_MAX, debt * REPAY));
}

export interface SleepNightIn {
  sleep_s: number | null;
  deep_s: number | null;
  rem_s: number | null;
  awake_s: number | null;
  awake_count: number | null;
}

export interface SleepScoreParts {
  score: number;
  /** podíl bodů 0–1 za jednotlivé složky */
  dur: number;
  deep: number;
  rem: number;
  eff: number;
  cont: number;
}

/** Skóre spánku 0–100 proti potřebě. Bez délky a fází (hluboký, REM) null. */
export function sleepScoreCalc(n: SleepNightIn, needMin: number): SleepScoreParts | null {
  if (!n.sleep_s || n.deep_s == null || n.rem_s == null || !needMin) return null;
  const sleepMin = n.sleep_s / 60;
  const inBed = n.sleep_s + (n.awake_s ?? 0);
  const dur = cl(sleepMin / needMin) ** POW;
  const deep = cl(n.deep_s / 60 / (DEEP_T * needMin)) ** POW;
  const rem = cl(n.rem_s / 60 / (REM_T * needMin)) ** POW;
  const eff = cl(((n.sleep_s / inBed) * 100 - EFF_LO) / (100 - EFF_LO));
  const cont = cl(1 - (n.awake_count ?? 0) / AWAKE_MAX);
  const raw = W.dur * dur + W.deep * deep + W.rem * rem + W.dip * 0.5 + W.eff * eff + W.cont * cont;
  return { score: Math.min(100, Math.round(raw)), dur, deep, rem, eff, cont };
}

export interface SleepCalcRow extends SleepNightIn {
  date: string;
  sleep_score_g: number | null;
  sleep_need_g_min: number | null;
  next_sleep_need_g_min: number | null;
}

export interface SleepCalcOut {
  date: string;
  sleep_score: number | null;
  sleep_need_min: number | null;
  next_sleep_need_min: number | null;
}

export const shiftDay = (d: string, n: number) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Délky spánku (s) za `n` dní před dnem `d` (od nejstaršího), podle data – mezera v datech = null. */
export function nightsBefore(by: Map<string, { sleep_s: number | null }>, d: string, n: number): (number | null)[] {
  return Array.from({ length: n }, (_, i) => by.get(shiftDay(d, i - n))?.sleep_s ?? null);
}

/** Základ spánku pro noc `d` z nocí 60 dní před ní. */
export function baseFor(by: Map<string, { sleep_s: number | null }>, d: string): number {
  return sleepBaseMin(nightsBefore(by, d, BASE_DAYS));
}

/**
 * Přepočet nocí s datem v [from, to]. `rows` musí obsahovat i 60 dní před `from` (kvůli základu a dluhu).
 * Kde nejde počítat skóre (chybí fáze), zůstane hodnota z Garminu.
 */
export function recomputeSleepRows(rows: SleepCalcRow[], from: string, to: string): SleepCalcOut[] {
  const by = new Map(rows.map((r) => [r.date, r]));
  const out: SleepCalcOut[] = [];
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    const has = r.sleep_s != null && r.sleep_s > 0;
    const prev7 = nightsBefore(by, r.date, 7);
    const need = has ? sleepNeedMin(prev7, baseFor(by, r.date)) : null;
    const next = has ? sleepNeedMin([...prev7.slice(1), r.sleep_s], baseFor(by, shiftDay(r.date, 1))) : null;
    const sc = need ? sleepScoreCalc(r, need) : null;
    out.push({
      date: r.date,
      sleep_score: sc?.score ?? r.sleep_score_g,
      sleep_need_min: need ?? r.sleep_need_g_min,
      next_sleep_need_min: next ?? r.next_sleep_need_g_min,
    });
  }
  return out;
}
