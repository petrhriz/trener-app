// Víc uživatelů bez přepisu všech dotazů: každý další uživatel má vlastní sadu tabulek (u<id>_activities, …)
// a vlastní prostor v KV (u<id>:…). Kód dostane „env“, ve kterém DB a KV dotazy přesměrují na tabulky uživatele.
// Vlastník (id 1) používá původní tabulky beze změny. Uživatel tak k datům jiného nemá přístup – jeho env
// jiné tabulky vůbec neadresuje.
import type { Env } from "../env";
import m0001 from "../../migrations/0001_init.sql";
import m0002 from "../../migrations/0002_icu_sleep_sport.sql";
import m0003 from "../../migrations/0003_feedback2.sql";
import m0004 from "../../migrations/0004_round3.sql";
import m0006 from "../../migrations/0006_round6.sql";
import m0007 from "../../migrations/0007_round7.sql";
import m0009 from "../../migrations/0009_sleep_calc.sql";
import m0010 from "../../migrations/0010_vo2_fit.sql";
import m0011 from "../../migrations/0011_coach_v2.sql";
import m0012 from "../../migrations/0012_zone_history.sql";
import m0013 from "../../migrations/0013_rpe.sql";
import m0015 from "../../migrations/0015_plan_versions.sql";
import m0016 from "../../migrations/0016_no_hockey.sql";

export const OWNER_ID = 1;

/** Migrace pro tabulky uživatele (0005, 0008 a 0014 = tabulka users a účty, ty jsou společné). */
export const TENANT_MIGRATIONS: { name: string; sql: string }[] = [
  { name: "0001", sql: m0001 },
  { name: "0002", sql: m0002 },
  { name: "0003", sql: m0003 },
  { name: "0004", sql: m0004 },
  { name: "0006", sql: m0006 },
  { name: "0007", sql: m0007 },
  { name: "0009", sql: m0009 },
  { name: "0010", sql: m0010 },
  { name: "0011", sql: m0011 },
  { name: "0012", sql: m0012 },
  { name: "0013", sql: m0013 },
  { name: "0015", sql: m0015 },
  { name: "0016", sql: m0016 },
];

/** Tabulky s daty uživatele (vše kromě users). */
export const TENANT_TABLES = [
  "settings", "sync_state", "activities", "activity_laps", "wellness", "weekly_reviews", "daily_metrics", "planned_workouts",
  "constraints", "proposals", "weather_hourly", "sent_messages", "training_log", "events_log", "gear", "activity_gear",
  "app_secrets", "gear_parts", "gear_service", "activity_tags", "energy_day", "coach_weeks", "coach_progress",
  "zone_history", "plan_versions",
] as const;

const TBL = TENANT_TABLES.join("|");
// tabulka za klíčovým slovem (FROM x, JOIN x, INTO x, UPDATE x, TABLE x, EXISTS x, ON x – index)
const KW = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|TABLE|EXISTS|ON)(\\s+)(${TBL})\\b(?!\\s*\\.)`, "gi");
// kvalifikovaný sloupec „planned_workouts.date“
const QUAL = new RegExp(`(?<![\\w.'"$])(${TBL})\\.(?=[A-Za-z_])`, "g");
// názvy indexů musí být v databázi jedinečné
const IDX = /\b(INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?)([A-Za-z_]\w*)/gi;

export function rewriteSql(sql: string, prefix: string): string {
  // textové hodnoty v apostrofech ('Ride from gear shop') se nepřepisují – jen SQL mimo ně
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 ? part : part
      .replace(IDX, (_m, a: string, n: string) => `${a}${prefix}${n}`)
      .replace(KW, (_m, kw: string, sp: string, t: string) => `${kw}${sp}${prefix}${t}`)
      .replace(QUAL, (_m, t: string) => `${prefix}${t}.`)))
    .join("");
}

/** Příkazy migrace: bez komentářů, rozdělené po střednících na konci řádku. */
export function splitSql(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s && !/\busers\b/i.test(s)); // tabulka users je společná
}

function proxyDb(db: D1Database, prefix: string): D1Database {
  return {
    prepare: (sql: string) => db.prepare(rewriteSql(sql, prefix)),
    batch: (stmts: D1PreparedStatement[]) => db.batch(stmts),
    exec: (sql: string) => db.exec(rewriteSql(sql, prefix)),
    dump: () => { throw new Error("dump není pro uživatele povolený"); },
    withSession: () => { throw new Error("withSession není podporované"); },
  } as unknown as D1Database;
}

/** Klíče, které jsou společné (přihlašovací odkazy, pozvánky) – bez předpony. */
const SHARED_KV = /^(login|invite):/;

function proxyKv(kv: KVNamespace, prefix: string): KVNamespace {
  const k = (key: string) => (SHARED_KV.test(key) ? key : prefix + key);
  return {
    get: (key: string, opt?: any) => kv.get(k(key), opt),
    getWithMetadata: (key: string, opt?: any) => kv.getWithMetadata(k(key), opt),
    put: (key: string, v: any, opt?: any) => kv.put(k(key), v, opt),
    delete: (key: string) => kv.delete(k(key)),
    list: (opt?: KVNamespaceListOptions) => kv.list({ ...opt, prefix: prefix + (opt?.prefix ?? "") }),
  } as unknown as KVNamespace;
}

export interface UserRow {
  id: number;
  name: string | null;
  username: string | null;
  role: string;
  active: number;
  schema_ver: number | null;
}

/** Vytvoří / doplní tabulky uživatele (spustí chybějící migrace s předponou). */
export async function ensureTenantSchema(base: Env, u: Pick<UserRow, "id" | "schema_ver">): Promise<void> {
  const done = u.schema_ver ?? 0;
  if (u.id === OWNER_ID || done >= TENANT_MIGRATIONS.length) return;
  const prefix = `u${u.id}_`;
  for (let i = done; i < TENANT_MIGRATIONS.length; i++) {
    const stmts = splitSql(TENANT_MIGRATIONS[i]!.sql).map((st) => rewriteSql(st, prefix));
    // celá migrace jednou dávkou (1 dotaz místo desítek); když něco už existuje (rozpracovaná migrace), po jednom
    let batched = false;
    try { await base.DB.batch(stmts.map((st) => base.DB.prepare(st))); batched = true; } catch { /* níže po jednom */ }
    if (!batched) for (const st of splitSql(TENANT_MIGRATIONS[i]!.sql)) {
      try {
        await base.DB.prepare(rewriteSql(st, prefix)).run();
      } catch (e) {
        const msg = (e as Error).message;
        if (!/duplicate column|already exists/i.test(msg)) throw new Error(`migrace ${TENANT_MIGRATIONS[i]!.name} pro uživatele ${u.id}: ${msg}`);
      }
    }
    await base.DB.prepare("UPDATE users SET schema_ver = ? WHERE id = ?").bind(i + 1, u.id).run();
  }
}

const userCache = new Map<number, { at: number; u: UserRow }>();
export function forgetUser(id: number) {
  userCache.delete(id);
}

export async function getUser(base: Env, id: number): Promise<UserRow | null> {
  const c = userCache.get(id);
  if (c && Date.now() - c.at < 60_000) return c.u;
  const u = await base.DB.prepare("SELECT id, name, username, role, active, schema_ver FROM users WHERE id = ?").bind(id).first<UserRow>().catch(() => null);
  if (u) userCache.set(id, { at: Date.now(), u });
  return u;
}

/**
 * Env pro uživatele. Vlastník = původní env. Ostatní: DB a KV s předponou,
 * žádné klíče vlastníka (Garmin, intervals.icu) – každý si zadá svoje v Nastavení. Mapové klíče jsou společné.
 */
export async function envFor(base: Env, id: number): Promise<Env | null> {
  if (id === OWNER_ID) return base;
  const u = await getUser(base, id);
  if (!u || !u.active) return null;
  await ensureTenantSchema(base, u);
  if ((u.schema_ver ?? 0) < TENANT_MIGRATIONS.length) forgetUser(id);
  return {
    ...base,
    DB: proxyDb(base.DB, `u${id}_`),
    KV: proxyKv(base.KV, `u${id}:`),
    GARMIN_API_KEY: undefined,
    INTERVALS_API_KEY: undefined,
    INTERVALS_ATHLETE_ID: undefined,
    __uid: id,
    __base: base,
  } as Env;
}

/** Aktivní uživatelé (pro plánovač). */
export async function activeUsers(base: Env): Promise<number[]> {
  try {
    const r = await base.DB.prepare("SELECT id FROM users WHERE active = 1 ORDER BY id").all<{ id: number }>();
    const ids = (r.results ?? []).map((x) => x.id);
    return ids.includes(OWNER_ID) ? ids : [OWNER_ID, ...ids];
  } catch {
    return [OWNER_ID];
  }
}

/**
 * Kdo je na řadě v tomto spuštění cronu (každou minutu): vlastník každých 5 min jako dřív,
 * ostatní se střídají ve zbylých 4 minutách z 5 (free plán: na jedno spuštění jen jeden uživatel kvůli CPU).
 */
export function userForTick(ids: number[], minuteIndex: number): number | null {
  const others = ids.filter((x) => x !== OWNER_ID);
  const p = minuteIndex % 5;
  if (p === 0) return OWNER_ID;
  if (!others.length) return null;
  // do 4 dalších uživatelů má každý svou minutu (sync každých 5 min jako vlastník), víc → střídají se
  if (others.length <= 4) return others[p - 1] ?? null;
  const slot = Math.floor(minuteIndex / 5) * 4 + (p - 1);
  return others[slot % others.length]!;
}
