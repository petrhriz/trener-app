// Vlastní skóre spánku a potřeba spánku (podle Bevelu) z nočních dat Garminu. Čistá funkce.
//
// Garmin bere potřebu jako 8 h + úpravy podle VST a tréninku a spánkový dluh z předchozích nocí nepřenáší;
// jeho skóre měří délku proti pevným 8 h mírnou křivkou → spánek „60+“ i po krátké noci.
// Bevel měří noc proti TVÉ potřebě: cíl + vážený dluh za 7 nocí, výpadek trestá strmě.
// Vzorec a konstanty jsou odhadnuté z 33 nocí Bevel × Garmin (8. 10.–9. 11. 2026):
// skóre ±2 body (průměrně 1,9), potřeba ±5–10 min proti Bevelu.

/** Výchozí cíl spánku (min), když ho uživatel nenastavil. */
export const SLEEP_GOAL_DEFAULT = 480;
/** Verze výpočtu – při změně se historie přepočítá znovu. */
export const SLEEP_CALC_V = 1;

const DEBT_DAYS = 7; // dluh za 7 nocí se rozkládá do 7 dní
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
 * Potřeba spánku (min) pro noc: cíl + vážený deficit 7 předchozích nocí / 7.
 * `prev` = délky spánku v sekundách, od nejstarší (7 nocí zpět) po včerejší; null = noc bez dat (bez deficitu).
 * Váhy 1/4 … 7/4, včerejší noc nejvíc. Přebytek se nepočítá (dluh nejde do mínusu).
 */
export function sleepNeedMin(prev: (number | null | undefined)[], goalMin: number): number {
  const last7 = prev.slice(-7);
  const off = 7 - last7.length;
  let debt = 0;
  last7.forEach((s, i) => {
    if (s == null) return;
    debt += ((i + off + 1) / 4) * (goalMin - s / 60);
  });
  return Math.round(goalMin + Math.max(0, debt) / DEBT_DAYS);
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

const shift = (d: string, n: number) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/**
 * Přepočet nocí s datem v [from, to]. `rows` musí obsahovat i 7 nocí před `from` (kvůli dluhu).
 * Kde nejde počítat (chybí fáze), zůstane hodnota z Garminu.
 */
export function recomputeSleepRows(rows: SleepCalcRow[], goalMin: number, from: string, to: string): SleepCalcOut[] {
  const by = new Map(rows.map((r) => [r.date, r]));
  const prevOf = (d: string) => Array.from({ length: 7 }, (_, i) => by.get(shift(d, i - 7))?.sleep_s ?? null);
  const out: SleepCalcOut[] = [];
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    const has = r.sleep_s != null && r.sleep_s > 0;
    const need = has ? sleepNeedMin(prevOf(r.date), goalMin) : null;
    const next = has ? sleepNeedMin([...prevOf(r.date).slice(1), r.sleep_s], goalMin) : null;
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
