// Přepočet skóre a potřeby spánku v tabulce wellness (výpočet v src/core/sleepCalc.ts).
// Jeden SELECT + dávka UPSERTů – vejde se do limitů free plánu i pro celou historii.
import { recomputeSleepRows, SLEEP_GOAL_DEFAULT, type SleepCalcRow } from "../core/sleepCalc";
import { all, execAll, upsertSql } from "../lib/db";
import { addDays } from "../lib/time";

const COLS = "date, sleep_s, deep_s, rem_s, awake_s, awake_count, sleep_score_g, sleep_need_g_min, next_sleep_need_g_min";

/**
 * Přepočítá noci v [from, to] (bez rozsahu = celá historie). Noci se vzájemně ovlivňují přes spánkový dluh,
 * proto volající po změně dat posílá `to` aspoň o 7 dní dál než poslední změněná noc.
 */
export async function recomputeSleep(db: D1Database, goalMin: number | null | undefined, from?: string, to?: string): Promise<number> {
  const rows = from
    ? await all<SleepCalcRow>(db, `SELECT ${COLS} FROM wellness WHERE date >= ? AND date <= ? ORDER BY date`, addDays(from, -7), to ?? "9999-12-31")
    : await all<SleepCalcRow>(db, `SELECT ${COLS} FROM wellness ORDER BY date`);
  if (!rows.length) return 0;
  const out = recomputeSleepRows(rows, goalMin || SLEEP_GOAL_DEFAULT, from ?? rows[0]!.date, to ?? rows[rows.length - 1]!.date);
  await execAll(
    db,
    upsertSql("wellness", ["date", "sleep_score", "sleep_need_min", "next_sleep_need_min"], out.map((o) => [o.date, o.sleep_score, o.sleep_need_min, o.next_sleep_need_min]), ["date"], "replace"),
  );
  return out.length;
}
