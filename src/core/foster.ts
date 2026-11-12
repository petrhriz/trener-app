// Monotónnost a strain podle Fostera: jednotvárná zátěž (každý den podobně, málo volna) zvyšuje riziko
// přetížení a nemoci i při stejném objemu.
// Zdroj: Foster C. (1998) Monitoring training in athletes with reference to overtraining syndrome, Med Sci Sports
// Exerc 30(7):1164–1168 – monotónnost = průměr denní zátěže / směrodatná odchylka za 7 dní (dny volna = 0),
// strain = týdenní zátěž × monotónnost; monotónnost nad 2,0 spojená s nemocemi a přetížením.
// Foster počítal v jednotkách session-RPE, tady je zátěž TSS – pevná hranice strainu (např. 6000) proto nedává
// smysl; vysoký strain = nad tvým obvyklým (průměr + 1,5 SD za posledních 8 týdnů). To je vlastní volba.

export interface FosterWeek {
  /** průměr / SD denní zátěže za 7 dní; null = žádná zátěž */
  monotony: number | null;
  /** týdenní zátěž × monotónnost */
  strain: number | null;
  load7: number;
}
export interface FosterResult extends FosterWeek {
  /** obvyklý strain (průměr a SD posledních 8 týdnů) */
  usual: { mean: number; sd: number } | null;
  /** monotónnost nad 2,0 při zátěži aspoň obvyklé */
  monotonyHigh: boolean;
  /** strain nad obvyklým (průměr + 1,5 SD) */
  strainHigh: boolean;
  note: string | null;
}

export const MONOTONY_MAX = 2.0;
/** stejná zátěž každý den → SD 0; monotónnost se omezí, ať se dá porovnávat */
const MONOTONY_CAP = 10;

const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Monotónnost a strain 7 dní končících dnem `end` (včetně). `daily` = zátěž po dnech (chybějící den = 0). */
export function fosterWeek(daily: Map<string, number>, end: string): FosterWeek {
  const v = [6, 5, 4, 3, 2, 1, 0].map((i) => daily.get(add(end, -i)) ?? 0);
  const sum = v.reduce((t, x) => t + x, 0);
  if (sum <= 0) return { monotony: null, strain: null, load7: 0 };
  const mean = sum / 7;
  const sd = Math.sqrt(v.reduce((t, x) => t + (x - mean) ** 2, 0) / 7);
  const monotony = sd > 0 ? Math.min(MONOTONY_CAP, mean / sd) : MONOTONY_CAP;
  return { monotony: Math.round(monotony * 100) / 100, strain: Math.round(sum * monotony), load7: Math.round(sum) };
}

/**
 * Dnešní stav (7 dní do včerejška) proti obvyklému: strain týdnů končících každou neděli posledních 8 týdnů.
 * Upozornění jen při skutečné zátěži – lehký jednotvárný týden (třeba 4× procházka) přetížení není.
 */
export function fosterOf(acts: { date: string; load: number | null }[], today: string): FosterResult {
  const daily = new Map<string, number>();
  for (const a of acts) if (a.load) daily.set(a.date, (daily.get(a.date) ?? 0) + a.load);
  const end = add(today, -1);
  const now = fosterWeek(daily, end);
  const past = Array.from({ length: 8 }, (_, i) => fosterWeek(daily, add(end, -7 * (i + 1))));
  const strains = past.map((w) => w.strain).filter((x): x is number => x != null);
  const loads = past.map((w) => w.load7);
  const usual = strains.length >= 4 ? (() => { const m = strains.reduce((t, x) => t + x, 0) / strains.length; return { mean: Math.round(m), sd: Math.round(Math.sqrt(strains.reduce((t, x) => t + (x - m) ** 2, 0) / strains.length)) }; })() : null;
  const usualLoad = loads.length ? loads.reduce((t, x) => t + x, 0) / loads.length : 0;
  const monotonyHigh = now.monotony != null && now.monotony > MONOTONY_MAX && now.load7 >= usualLoad && now.load7 > 0;
  const strainHigh = !!usual && now.strain != null && now.strain > usual.mean + 1.5 * usual.sd && (now.monotony ?? 0) > 1.5;
  const n2 = (x: number) => x.toFixed(1).replace(".", ",");
  const note = strainHigh
    ? `strain ${now.strain} je nad tvým obvyklým (${usual!.mean}) – hodně zátěže a málo střídání lehkých dnů (monotónnost ${n2(now.monotony!)})`
    : monotonyHigh ? `jednotvárná zátěž: monotónnost ${n2(now.monotony!)} (nad 2,0) – zařaď den volna nebo lehčí den` : null;
  return { ...now, usual, monotonyHigh, strainHigh, note };
}
