// Nedělní vyhodnocení plnění: jak se odjel minulý týden proti jeho pondělnímu plánu. Když se hodně vynechalo,
// tento týden se uleví (×0,85) – plán se nemá dál stavět na tom, co se nestihlo. Přidávat se tu nikdy nebude:
// růst řídí cíl kondice (budget.ts).
// Hranice (2+ vynechané tréninky, plnění pod 50 %, zátěž pod 60 %) a ×0,85 jsou vlastní volba. Přesun tréninku
// na jiný den není vynechání (počítají se dny s tréninkem v týdnu); týden bez plánovaných tréninků se nehodnotí.
import { addDays } from "../../lib/time";

export interface AdherenceDay {
  date: string;
  /** v plánu trénink (ne volno) */
  training: boolean;
  load: number;
}
export interface AdherenceAct {
  date: string;
  load: number | null;
  moving_s: number | null;
}
export interface Adherence {
  weekStart: string;
  /** tréninky v plánu (bez dnů nemoci / volna od trenéra) */
  planned: number;
  /** dny s tréninkem (aspoň 20 min) v týdnu, nejvýš tolik, kolik bylo v plánu */
  trained: number;
  missed: number;
  /** % splněných tréninků; null = nebylo co hodnotit */
  pct: number | null;
  loadPlanned: number;
  loadDone: number;
  /** násobek zátěže pro tento týden (1 = beze změny) */
  factor: number;
  note: string | null;
}

/** Hranice: 2 a víc vynechaných tréninků, plnění pod 50 % nebo odjeto méně než 60 % plánované zátěže. */
export const ADHERENCE_CUT = 0.85;

export function weekAdherence(weekStart: string, plan: AdherenceDay[], acts: AdherenceAct[], skip: Set<string>): Adherence {
  const end = addDays(weekStart, 6);
  const days = plan.filter((d) => d.date >= weekStart && d.date <= end && d.training && !skip.has(d.date));
  const inWeek = acts.filter((a) => a.date >= weekStart && a.date <= end);
  const trainedDays = new Set(inWeek.filter((a) => (a.moving_s ?? 0) >= 20 * 60).map((a) => a.date)).size;
  const planned = days.length;
  const trained = Math.min(planned, trainedDays);
  const missed = planned - trained;
  const loadPlanned = Math.round(days.reduce((t, d) => t + d.load, 0));
  const loadDone = Math.round(inWeek.reduce((t, a) => t + (a.load ?? 0), 0));
  const pct = planned ? Math.round((trained / planned) * 100) : null;
  const base = { weekStart, planned, trained, missed, pct, loadPlanned, loadDone };
  if (!planned) return { ...base, factor: 1, note: null };
  const lowLoad = loadPlanned > 0 && loadDone < loadPlanned * 0.6;
  if (missed >= 2 || (pct != null && pct < 50) || lowLoad) {
    const why = missed >= 2 || (pct != null && pct < 50) ? `odjeto ${trained} z ${planned} tréninků` : `odjeto ${loadDone} z plánovaných ${loadPlanned} zátěže`;
    return { ...base, factor: ADHERENCE_CUT, note: `minulý týden ${why} → tento týden o ${Math.round((1 - ADHERENCE_CUT) * 100)} % lehčí (plán se nestaví na tom, co se nestihlo)` };
  }
  return { ...base, factor: 1, note: null };
}
