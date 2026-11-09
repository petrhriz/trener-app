// Energie (náhrada Body Battery, podle „Energy Bank“ v Bevelu) z tepu po 2 min, spánku, aktivit a denního stresu Garminu.
// Čistá funkce. Konstanty odhadnuté z 15 dní Bevel × Garmin (26. 10.–9. 11. 2026): odchylka ±3 body,
// i bez resetu 15 dní po sobě ±3,7 bodu; součty nabito / vybito sedí (např. 31. 10. +31 / −57, Bevel +31 / −56).
//
// Jak to funguje (stejně jako v grafech Bevelu):
//  • hladina plyne přes půlnoc bez resetu (ráno se nenastavuje na „max“),
//  • ve spánku se nabíjí k 100 tím rychleji, čím lepší zotavení (+ % podle toho, kolik zbývá do plna),
//  • přes den ubývá podle stresu (Garmin dává jen minuty v pásmech → rozprostřeme podle tepu: nejvyšší tep = nejvyšší stres),
//    u nízké hladiny pomaleji (nespadne natvrdo na 0 a nedrží se celý den na 5),
//  • v klidu (stres pod 25) se mírně dobíjí, při aktivitě ubývá podle tepu.

export const ENERGY_V = 1;

const K = {
  sleep0: 0.0201, // nabíjení ve spánku za hodinu (podíl zbytku do 100) při zotavení 0 %
  sleepRec: 0.1339, // + navíc při zotavení 100 %
  base: 0.4998, // bazální výdej (body / h)
  stress: 6.2762, // výdej při stresu 100 (body / h nad hranicí klidu 25)
  act: 20.98, // výdej při aktivitě (body / h při tepu o 120 nad klidovým, úměrně hladině)
  rest: 1.8483, // dobíjení v klidu (body / h při prázdné baterii)
  half: 12.62, // pod touto hladinou se výdej zpomaluje
  gapStress: 36, // stres, který se předpokládá ve výpadku dat (hodinky nenošené přes den)
};
const ACT_TAIL = 10 * 60_000; // po aktivitě se ještě 10 min počítá zvýšený tep jako aktivita
const GAP = 15 * 60_000; // delší mezera mezi vzorky = výpadek dat
const SMOOTH = 15 * 60_000; // vybíjení přes den z průměru stresu ±15 min (plynulá křivka jako v Bevelu)

export interface EnergySleep {
  start: number;
  end: number;
  /** zotavení noci 0–100 (null = 50) */
  recovery: number | null;
}
export interface EnergyAct {
  start: number;
  end: number;
}
/** podíly dne v pásmech stresu z Garminu (0–1); rest zahrnuje i spánek */
export interface StressDist {
  rest: number | null;
  low: number | null;
  med: number | null;
  high: number | null;
  act?: number | null;
}
export interface EnergyInput {
  hr: [number, number | null][];
  sleeps: EnergySleep[];
  acts: EnergyAct[];
  rhr: number | null;
  dist: StressDist | null;
  /** hladina na začátku (konec předchozího dne) */
  start: number;
}
export interface EnergyEvent {
  type: "SLEEP" | "ACTIVITY";
  start: number;
  dur: number;
  impact: number;
}
export interface EnergyDay {
  /** [čas ms, hladina] po 2 min */
  pts: [number, number][];
  /** [čas ms, stres 0–100] – mimo spánek */
  stress: [number, number][];
  /** chvíle klidu, které dobíjejí (spánek i klid přes den) [od, do] */
  rest: [number, number][];
  events: EnergyEvent[];
  charged: number;
  drained: number;
  max: number;
  min: number;
  end: number;
}

type Cat = "sleep" | "act" | "rest" | "low" | "med" | "high" | "move";
interface Smp { t: number; h: number; cat: Cat; sv: number }

const BANDS: Record<"rest" | "low" | "med" | "high" | "move", [number, number]> = { rest: [0, 25], low: [26, 50], med: [51, 75], high: [76, 100], move: [40, 100] };

/** Stres každého vzorku: pásma a minuty z Garminu, pořadí podle tepu. Bez rozpadu stresu odhad z tepu nad klidovým. */
function assignStress(s: Smp[], dist: StressDist | null, rhr: number) {
  const awake = s.filter((x) => x.cat !== "sleep" && x.cat !== "act");
  if (!awake.length) return;
  const sorted = [...awake].sort((a, b) => a.h - b.h);
  const hasDist = dist && dist.rest != null && dist.low != null && dist.med != null && dist.high != null;
  if (!hasDist) {
    for (const x of sorted) {
      x.sv = Math.max(0, Math.min(100, (x.h - rhr) / 0.8));
      x.cat = x.sv <= 25 ? "rest" : x.sv <= 50 ? "low" : x.sv <= 75 ? "med" : "high";
    }
    return;
  }
  const total = s.length;
  const sleepN = s.filter((x) => x.cat === "sleep").length;
  const parts: [keyof typeof BANDS, number][] = [
    ["rest", Math.max(0, dist!.rest! * total - sleepN)],
    ["low", dist!.low! * total],
    ["med", dist!.med! * total],
    ["high", dist!.high! * total],
    ["move", (dist!.act ?? 0) * total],
  ];
  const sum = parts.reduce((a, p) => a + p[1], 0) || 1;
  let k = 0;
  for (const [name, w] of parts) {
    const n = Math.round((w / sum) * sorted.length);
    const [lo, hi] = BANDS[name];
    for (let j = 0; j < n && k < sorted.length; j++, k++) {
      sorted[k]!.cat = name;
      sorted[k]!.sv = lo + (hi - lo) * (n > 1 ? j / (n - 1) : 0.5);
    }
  }
  for (; k < sorted.length; k++) { sorted[k]!.cat = "move"; sorted[k]!.sv = 80; }
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function energyDay(inp: EnergyInput): EnergyDay {
  const rhr = inp.rhr ?? 55;
  const sleepAt = (t: number) => inp.sleeps.find((s) => t >= s.start && t < s.end) ?? null;
  const inAct = (t: number) => inp.acts.some((a) => t >= a.start && t <= a.end + ACT_TAIL);
  const smp: Smp[] = inp.hr
    .filter((p): p is [number, number] => typeof p[1] === "number" && p[1] > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([t, h]) => ({ t, h, cat: sleepAt(t) ? "sleep" : inAct(t) ? "act" : "low", sv: 0 }));
  for (const x of smp) if (x.cat === "act") x.sv = Math.max(0, Math.min(100, (x.h - rhr) / 1.2));
  assignStress(smp, inp.dist, rhr);

  // klouzavý průměr ±15 min přes bdění (bez spánku a aktivit): podíl klidu a stres nad hranicí klidu (0–1)
  const smooth = new Map<Smp, { rest: number; stress: number }>();
  {
    const aw = smp.filter((x) => x.cat !== "sleep" && x.cat !== "act");
    let lo = 0, hi = 0, sumR = 0, sumS = 0;
    const r = (x: Smp) => (x.cat === "rest" ? 1 : 0), s = (x: Smp) => Math.max(0, x.sv - 25) / 75;
    for (const x of aw) {
      while (hi < aw.length && aw[hi]!.t <= x.t + SMOOTH) { sumR += r(aw[hi]!); sumS += s(aw[hi]!); hi++; }
      while (aw[lo]!.t < x.t - SMOOTH) { sumR -= r(aw[lo]!); sumS -= s(aw[lo]!); lo++; }
      const n = hi - lo;
      smooth.set(x, { rest: sumR / n, stress: sumS / n });
    }
  }
  let L = Math.max(0, Math.min(100, inp.start));
  let charged = 0, drained = 0;
  const pts: [number, number][] = [];
  const stress: [number, number][] = [];
  const restRuns: [number, number][] = [];
  const lf = () => (L / (L + K.half)) * ((50 + K.half) / 50);
  const apply = (x: number) => {
    L = Math.max(0, Math.min(100, L + x));
    if (x > 0) charged += x;
    else drained -= x;
  };
  let prev: number | null = null;
  for (const x of smp) {
    if (prev != null) {
      let dt = (x.t - prev) / 3.6e6;
      if (x.t - prev > GAP) {
        // výpadek dat: ve spánku nabíjí, jinak běžný výdej (jako přerušovaná čára v Bevelu)
        const s = sleepAt(x.t - 60_000);
        const gapH = dt - 1 / 30;
        if (s) apply((K.sleep0 + (K.sleepRec * (s.recovery ?? 50)) / 100) * (100 - L) * gapH);
        else apply(-(K.base + (K.stress * (K.gapStress - 25)) / 75) * lf() * gapH);
        dt = 1 / 30;
      }
      if (x.cat === "sleep") {
        const s = sleepAt(x.t)!;
        apply((K.sleep0 + (K.sleepRec * (s.recovery ?? 50)) / 100) * (100 - L) * dt);
      } else if (x.cat === "act") {
        apply(-(K.base * lf() + ((K.act * x.sv) / 100) * (L / 50)) * dt);
      } else {
        // bdění: stres i klid zprůměrované za ±15 min → plynulé klesání (stejný součet jako bez průměru)
        const w = smooth.get(x)!;
        apply(((K.rest * (100 - L)) / 100) * w.rest * dt - (K.base + K.stress * w.stress) * lf() * dt);
      }
    }
    prev = x.t;
    pts.push([x.t, r1(L)]);
    // stres jen v bdění mimo aktivitu (jako Bevel – při aktivitě je v grafu mezera, výdej se počítá z tepu)
    if (x.cat !== "sleep" && x.cat !== "act") stress.push([x.t, Math.round(x.sv)]);
    if (x.cat === "sleep" || x.cat === "rest") {
      const last = restRuns[restRuns.length - 1];
      if (last && x.t - last[1] <= 5 * 60_000) last[1] = x.t;
      else restRuns.push([x.t, x.t]);
    }
  }

  const at = (t: number) => {
    let v: number | null = null;
    for (const p of pts) { if (p[0] > t) break; v = p[1]; }
    return v;
  };
  const events: EnergyEvent[] = [];
  const t0 = pts[0]?.[0] ?? Infinity, t1 = pts[pts.length - 1]?.[0] ?? -Infinity;
  const inDay = (a: number, b: number) => b > t0 && a < t1;
  for (const s of inp.sleeps) {
    const a = at(s.start) ?? pts[0]?.[1], b = at(s.end);
    if (inDay(s.start, s.end) && a != null && b != null) events.push({ type: "SLEEP", start: s.start, dur: s.end - s.start, impact: Math.round(b - a) });
  }
  for (const ac of inp.acts) {
    const a = at(ac.start), b = at(ac.end + ACT_TAIL);
    if (inDay(ac.start, ac.end) && a != null && b != null) events.push({ type: "ACTIVITY", start: ac.start, dur: ac.end - ac.start, impact: Math.round(b - a) });
  }
  const vals = pts.map((p) => p[1]);
  return {
    pts,
    stress,
    rest: restRuns.filter(([a, b]) => b - a >= 2 * 60_000),
    events,
    charged: Math.round(charged),
    drained: Math.round(drained),
    max: vals.length ? Math.round(Math.max(...vals)) : Math.round(L),
    min: vals.length ? Math.round(Math.min(...vals)) : Math.round(L),
    end: r1(L),
  };
}
