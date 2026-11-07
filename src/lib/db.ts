// Pomocníci pro D1. Hromadné zápisy jedním příkazem (limit 50 dotazů a 100 parametrů na spuštění).

export function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `'${s.replace(/'/g, "''")}'`;
}

const MAX_SQL = 90_000;

/**
 * INSERT … ON CONFLICT DO UPDATE pro více řádků najednou (hodnoty jako literály).
 * mode 'merge' = NULL hodnoty nepřepisují existující (více zdrojů pro jeden den).
 */
export function upsertSql(
  table: string,
  cols: string[],
  rows: unknown[][],
  key: string[],
  mode: "merge" | "replace" = "replace",
): string[] {
  if (!rows.length) return [];
  const upd = cols
    .filter((c) => !key.includes(c))
    .map((c) => (mode === "merge" ? `${c}=COALESCE(excluded.${c}, ${table}.${c})` : `${c}=excluded.${c}`))
    .join(", ");
  const head = `INSERT INTO ${table} (${cols.join(", ")}) VALUES `;
  const tail = upd ? ` ON CONFLICT(${key.join(", ")}) DO UPDATE SET ${upd}` : ` ON CONFLICT DO NOTHING`;
  const out: string[] = [];
  let buf: string[] = [];
  let len = head.length + tail.length;
  for (const r of rows) {
    const v = `(${r.map(lit).join(", ")})`;
    if (buf.length && len + v.length + 2 > MAX_SQL) {
      out.push(head + buf.join(", ") + tail);
      buf = [];
      len = head.length + tail.length;
    }
    buf.push(v);
    len += v.length + 2;
  }
  if (buf.length) out.push(head + buf.join(", ") + tail);
  return out;
}

export async function execAll(db: D1Database, sqls: string[]): Promise<void> {
  if (!sqls.length) return;
  await db.batch(sqls.map((s) => db.prepare(s)));
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...params).all<T>();
  return r.results ?? [];
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function run(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).run();
}

export async function getState<T>(db: D1Database, key: string): Promise<T | null> {
  const r = await first<{ value: string }>(db, "SELECT value FROM sync_state WHERE key = ?", key);
  return r ? (JSON.parse(r.value) as T) : null;
}

export async function setState(db: D1Database, key: string, value: unknown): Promise<void> {
  await run(
    db,
    "INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

export function setStateSql(key: string, value: unknown): string {
  return `INSERT INTO sync_state (key, value, updated_at) VALUES (${lit(key)}, ${lit(JSON.stringify(value))}, ${lit(
    new Date().toISOString(),
  )}) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`;
}

export async function logEvent(db: D1Database, level: "info" | "warn" | "error", msg: string) {
  // Bez tokenů a bez zdravotních hodnot – jen technické zprávy.
  try {
    await run(db, "INSERT INTO events_log (at, level, msg) VALUES (?, ?, ?)", new Date().toISOString(), level, msg.slice(0, 500));
    await run(db, "DELETE FROM events_log WHERE id < (SELECT MAX(id) - 500 FROM events_log)");
  } catch {
    /* log nesmí shodit běh */
  }
}

/** Jednorázovost zpráv: vrací true, když klíč ještě nebyl použit (a zapíše ho). */
export async function once(db: D1Database, key: string): Promise<boolean> {
  const r = await run(db, "INSERT INTO sent_messages (key, sent_at) VALUES (?, ?) ON CONFLICT DO NOTHING", key, new Date().toISOString());
  return (r.meta.changes ?? 0) > 0;
}
export async function wasSent(db: D1Database, key: string): Promise<boolean> {
  return (await first(db, "SELECT 1 AS x FROM sent_messages WHERE key = ?", key)) != null;
}
