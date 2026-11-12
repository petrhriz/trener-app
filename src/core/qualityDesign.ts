// Vyhodnocení odjeté kvalitní jednotky proti plánu: zvládnutá → posun, hraniční → zopakovat, nedokončená → ubrat.
import type { NLap } from "../datasource/types";
import { dm } from "../lib/format";
import type { QualityType } from "./quality";

export interface Format {
  reps: number;
  work_s: number;
  rest_s: number;
  sets?: number; // pro 30/15: počet sérií
}

export type Outcome = "posun" | "zopakovat" | "ubrat" | "nove";

export interface PastQuality {
  date: string;
  type: QualityType;
  /** cíle z plánu (pokud byl workout v kalendáři) */
  plan: { reps: number; work_s: number; lo: number; hi: number; sets?: number } | null;
  laps: NLap[] | null;
}

/** Krok 3: jak jsem zvládl poslední jednotku stejného zaměření. */
export function evaluatePast(p: PastQuality | null): { outcome: Outcome; text: string; workW: number[]; format: Format | null } {
  if (!p) return { outcome: "nove", text: "bez předchozí jednotky stejného zaměření", workW: [], format: null };
  if (!p.plan) return { outcome: "nove", text: `${dm(p.date)} bez plánovaného workoutu, dávku nehodnotím`, workW: [], format: null };
  if (!p.laps?.length) return { outcome: "zopakovat", text: `${dm(p.date)} lapy nejsou, opakuji dávku`, workW: [], format: planFormat(p.plan) };
  const pl = p.plan;
  // jen pracovní intervaly s délkou z plánu (±25 %) – úseky Z2 a vyjetí vynechat
  const work = p.laps.filter((l) => l.moving_s >= pl.work_s * 0.75 && l.moving_s <= pl.work_s * 1.25 && (l.avg_power ?? 0) >= pl.lo - 40);
  const expected = pl.reps * (pl.sets ?? 1);
  const w = work.map((l) => Math.round(l.avg_power ?? 0));
  const below = work.filter((l) => (l.avg_power ?? 0) < pl.lo).length;
  const hr = work.map((l) => l.avg_hr ?? 0).filter((x) => x > 0);
  const hrRise = hr.length >= 2 ? hr[hr.length - 1]! - hr[0]! : 0;
  const fmt = planFormat(pl);
  if (work.length < expected || below >= 2)
    return { outcome: "ubrat", text: `${dm(p.date)} ${work.length < expected ? `dokončeno ${work.length} z ${expected}` : `${below} intervaly pod pásmem`}`, workW: w, format: fmt };
  const lastBelow = (work[work.length - 1]?.avg_power ?? 0) < pl.lo;
  if (lastBelow || hrRise > 8)
    return { outcome: "zopakovat", text: `${dm(p.date)} hraniční (${lastBelow ? "poslední interval pod pásmem" : `tep +${hrRise} bpm`})`, workW: w, format: fmt };
  const holds = w.length < 2 || w[w.length - 1]! >= w[0]! * 0.98;
  if (holds && hrRise <= 5)
    return { outcome: "posun", text: `${dm(p.date)} zvládnuto čistě (${w.join(", ")} W)`, workW: w, format: fmt };
  return { outcome: "zopakovat", text: `${dm(p.date)} výkon nedržel (${w.join(", ")} W)`, workW: w, format: fmt };
}

function planFormat(pl: NonNullable<PastQuality["plan"]>): Format {
  return { reps: pl.reps, work_s: pl.work_s, rest_s: 0, sets: pl.sets };
}
