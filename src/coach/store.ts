// Trenér v2 – uložení plánu (D1): týdny a postup v žebříčcích. Dva dotazy na čtení, jedna dávka na zápis.
import type { EngineOutput, ProgressRow, StoredWeek } from "../core/coach/engine";
import { all, execAll, upsertSql } from "../lib/db";
import { addDays, mondayOf } from "../lib/time";

export interface CoachState {
  stored: Map<string, StoredWeek>;
  progress: Record<string, ProgressRow>;
}

/** Uložené týdny (minulý, tento, příští) a stupně žebříčků. */
export async function loadCoachState(db: D1Database, today: string): Promise<CoachState> {
  const [weeks, prog] = await Promise.all([
    all<{ week_start: string; data: string }>(db, "SELECT week_start, data FROM coach_weeks WHERE week_start >= ? ORDER BY week_start", addDays(mondayOf(today), -7)),
    all<{ key: string; level: number; last_date: string | null }>(db, "SELECT key, level, last_date FROM coach_progress"),
  ]);
  const stored = new Map<string, StoredWeek>();
  for (const w of weeks) {
    try { stored.set(w.week_start, JSON.parse(w.data) as StoredWeek); } catch { /* poškozený týden se postaví znovu */ }
  }
  const progress: Record<string, ProgressRow> = {};
  for (const p of prog) progress[p.key] = { level: p.level, last: p.last_date };
  return { stored, progress };
}

/** Zapíše jen to, co se změnilo (týdny, stupně). Bez změny žádný dotaz. */
export async function saveCoachState(db: D1Database, out: Pick<EngineOutput, "save" | "progress">): Promise<void> {
  const now = new Date().toISOString();
  const sqls = [
    ...upsertSql("coach_weeks", ["week_start", "data", "hash", "updated_at"], out.save.map((w) => [w.weekStart, JSON.stringify(w), w.hash, now]), ["week_start"]),
    ...upsertSql("coach_progress", ["key", "level", "last_date", "last_outcome"], out.progress.map((p) => [p.key, p.level, p.last, p.outcome.slice(0, 200)]), ["key"]),
  ];
  await execAll(db, sqls);
}

/** Zahodí uložený plán od tohoto týdne → postaví se znovu od nuly (změna profilu, „Vrátit moje úpravy“). */
export async function resetCoachWeeks(db: D1Database, today: string): Promise<void> {
  await db.prepare("DELETE FROM coach_weeks WHERE week_start >= ?").bind(mondayOf(today)).run();
}
