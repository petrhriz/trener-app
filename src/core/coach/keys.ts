// Trenér v3 – vyhodnocení kvalit a stupně náročnosti. Trenér si u kvality v den tréninku uloží, co naplánoval
// (kategorie, stupeň, cílové úseky). Po odjetí se jednotka vyhodnotí z okruhů (výkon proti pásmu, dokončené úseky;
// logika z v2 – progress.ts / qualityDesign.ts) a stupeň kategorie se posune: zvládnutá → o stupeň těžší,
// nezvládnutá → o stupeň lehčí, jinak stejný. Posun jen po splnění
// tréninku tak, jak byl předepsaný (zdroj v docs/trener/zdroje.md). Udržet a Zima stupeň po splnění nezvyšují (cílem není růst).
import type { PlanSport } from "../../datasource/types";
import { daysBetween } from "../../lib/time";
import type { Goal } from "../fitness";
import type { Outcome } from "../qualityDesign";
import { type EngineAct, EVAL_WAIT_DAYS, type ProgressRow, matchKey } from "./common";
import { RPE_KEY_MAX } from "../rpe";
import type { Cat, WorkPlan } from "./library";
import { nextLevel, outcomeOf } from "./progress";

export interface KeyRecord {
  date: string;
  sport: PlanSport;
  cat: Cat;
  /** stupeň, na kterém byla kvalita naplánovaná */
  level: number;
  /** základní stupeň kategorie v den plánu (kvalita bývá o stupeň níž – zima, lehčí týden); starší záznamy ho nemají */
  base?: number;
  /** trénink z knihovny (kolo s wattmetrem) – ať se na stejném stupni tréninky střídají */
  wid?: string | null;
  plan: WorkPlan | null;
  minutes: number;
  name: string | null;
  /** pending = čeká na aktivitu; done = vyhodnoceno; missed = neodjeto; ambiguous = víc kandidátů; other = jiný trénink */
  state: "pending" | "done" | "missed" | "ambiguous" | "other";
  outcome?: Outcome;
  text?: string;
  newLevel?: number;
}

/** Kolik záznamů si pamatovat (asi 3 měsíce kvalit). */
const KEEP = 40;

/** Uloží / přepíše dnešní a dřívější kvality z plánu (nevyhodnocené se smí přepsat – plán dne se ještě mohl změnit). */
export function recordKeys(records: KeyRecord[], planned: Omit<KeyRecord, "state">[], today: string): KeyRecord[] {
  const out = records.filter((r) => !(r.state === "pending" && planned.some((p) => p.date === r.date && p.date <= today)));
  for (const p of planned) if (p.date <= today && !out.some((r) => r.date === p.date)) out.push({ ...p, state: "pending" });
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-KEEP);
}

/**
 * Vyhodnotí kvality, které už proběhly. Stupeň kategorie se změní jen jednou za kvalitu a jen když platí ten,
 * na kterém byla naplánovaná (dvě rychle po sobě se nesečtou).
 */
export function evaluateKeys(records: KeyRecord[], acts: EngineAct[], today: string, goal: Goal, levels: Record<string, ProgressRow>): { records: KeyRecord[]; updates: { key: string; level: number; last: string; outcome: string }[] } {
  const updates: { key: string; level: number; last: string; outcome: string }[] = [];
  const cur: Record<string, number> = Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v.level]));
  const recs = records.map((r) => ({ ...r }));
  for (const r of recs) {
    if (r.state !== "pending" || r.date >= today) continue;
    const m = matchKey({ sport: r.sport, minutes: r.minutes, plan: r.plan }, acts.filter((a) => a.date === r.date));
    if (m.kind === "one") {
      let o = outcomeOf({ date: r.date, plan: r.plan, laps: m.act.laps, compliance: m.act.compliance });
      // zvládnuto: počkat den na hodnocení náročnosti; RPE 9+ = na hraně → stupeň drží
      if (o.outcome === "posun" && m.act.rpe == null && daysBetween(r.date, today) < 2) continue;
      if (o.outcome === "posun" && (m.act.rpe ?? 0) >= RPE_KEY_MAX) o = { outcome: "zopakovat", text: `${o.text}, ale RPE ${m.act.rpe} – stupeň drží` };
      const key = `${r.sport}:${r.cat}`;
      // posun se počítá od základního stupně kategorie: neúspěch ho sníží i na sníženém stupni, úspěch na
      // sníženém stupni ho nezvýší (byl to lehčí trénink, než kategorie má)
      const base = r.base ?? r.level;
      const now = cur[key] ?? base;
      const reduced = r.level < base;
      const nl = now !== base ? now : o.outcome === "posun" && reduced ? base : nextLevel(base, o.outcome, goal);
      Object.assign(r, { state: "done", outcome: o.outcome, text: o.text, newLevel: nl });
      if (nl !== now) { cur[key] = nl; updates.push({ key, level: nl, last: r.date, outcome: o.text }); }
      else updates.push({ key, level: now, last: r.date, outcome: o.text });
    } else if (m.kind === "many") r.state = "ambiguous";
    else if (daysBetween(r.date, today) >= EVAL_WAIT_DAYS) r.state = m.kind === "other" ? "other" : "missed";
  }
  return { records: recs, updates };
}
