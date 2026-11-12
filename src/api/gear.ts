// Vybavení (kola, lyže, boty): evidence v D1, km z aktivit. Garmin vybavení přes Personal API nedává.
import { Hono } from "hono";
import type { Env } from "../env";
import { all, run } from "../lib/db";

export interface Gear {
  id: number;
  name: string;
  kind: "bike" | "ski" | "shoe" | "other";
  default_for: string | null;
  from_date: string | null;
  to_date: string | null;
  start_km: number | null;
  note: string | null;
}

interface ActLite {
  id: string;
  date: string;
  start_local?: string;
  sport: string;
  distance_m: number | null;
  moving_s: number | null;
  elev_gain: number | null;
}

/** Výchozí vybavení pro aktivitu: ruční přiřazení, jinak výchozí pro sport platné v den aktivity (nejnovější od-data). */
export function resolveGear(a: ActLite, gear: Gear[], links: Map<string, number | null>): number | null {
  if (links.has(a.id)) return links.get(a.id) ?? null;
  const cand = gear.filter(
    (g) => (g.default_for ?? "").split(",").includes(a.sport) && (!g.from_date || a.date >= g.from_date) && (!g.to_date || a.date <= g.to_date),
  );
  if (!cand.length) return null;
  cand.sort((x, y) => (y.from_date ?? "").localeCompare(x.from_date ?? "") || y.id - x.id);
  return cand[0]!.id;
}

export async function loadGear(db: D1Database) {
  const [gear, linkRows] = await Promise.all([
    all<Gear>(db, "SELECT * FROM gear ORDER BY to_date IS NOT NULL, id"),
    all<{ activity_id: string; gear_id: number | null }>(db, "SELECT activity_id, gear_id FROM activity_gear"),
  ]);
  return { gear, links: new Map(linkRows.map((r) => [r.activity_id, r.gear_id])) };
}

export const gearApi = new Hono<{ Bindings: Env }>();

export interface Part {
  id: number;
  gear_id: number;
  name: string;
  action: string | null;
  interval_km: number | null;
  repeat_km: number | null;
  since: string;
  start_km: number | null;
  notified_km: number | null;
}

/** km dílu = start_km + vzdálenost aktivit s tímto vybavením od posledního servisu */
export function partKm(p: Part, acts: ActLite[], gear: Gear[], links: Map<string, number | null>): number {
  let km = p.start_km ?? 0;
  for (const a of acts) if ((a.start_local ?? a.date) >= p.since && resolveGear(a, gear, links) === p.gear_id) km += (a.distance_m ?? 0) / 1000;
  return Math.round(km * 10) / 10;
}

/** další hranice upozornění: interval, pak každých repeat km */
export function nextAlert(p: Part, km: number): number | null {
  if (!p.interval_km) return null;
  const rep = p.repeat_km || p.interval_km;
  let t = p.interval_km;
  while (t <= (p.notified_km ?? 0)) t += rep;
  return km >= t ? t : null;
}

async function loadAll(db: D1Database) {
  const [{ gear, links }, acts, parts] = await Promise.all([
    loadGear(db),
    all<ActLite>(db, "SELECT id, date, start_local, sport, distance_m, moving_s, elev_gain FROM activities ORDER BY start_local"),
    all<Part>(db, "SELECT * FROM gear_parts ORDER BY id").catch(() => [] as Part[]),
  ]);
  return { gear, links, acts, parts };
}

/** Upozornění na servis (bublina po otevření stránky). Po „Rozumím“ se posune notified_km (ackService). */
export async function serviceAlerts(db: D1Database): Promise<{ partId: number; hit: number; gearId: number; title: string; text: string }[]> {
  const { gear, links, acts, parts } = await loadAll(db);
  const out: { partId: number; hit: number; gearId: number; title: string; text: string }[] = [];
  for (const p of parts) {
    const g = gear.find((x) => x.id === p.gear_id);
    if (!g || g.to_date) continue;
    const km = partKm(p, acts, gear, links);
    const hit = nextAlert(p, km);
    if (hit == null) continue;
    const first = hit === p.interval_km;
    out.push({
      partId: p.id,
      hit,
      gearId: g.id,
      title: `${g.name} · ${p.name}`,
      text: `${Math.round(km)} km od ${p.since.slice(8, 10).replace(/^0/, "")}. ${p.since.slice(5, 7).replace(/^0/, "")}. – ${first ? "zkontroluj" : "pořád čeká na servis, zkontroluj"} (${(p.action || "servis").toLowerCase()} zapíšeš ve Vybavení).`,
    });
  }
  return out;
}

/** Upozornění na servis viděno: další přijde až po dalším intervalu km. */
export async function ackService(db: D1Database, partId: number, hit: number): Promise<void> {
  await run(db, "UPDATE gear_parts SET notified_km = ? WHERE id = ? AND (notified_km IS NULL OR notified_km < ?)", hit, partId, hit);
}

gearApi.get("/", async (c) => {
  const { gear, links, acts, parts } = await loadAll(c.env.DB);
  const svc = await all<{ part_id: number; at: string; km: number | null }>(c.env.DB, "SELECT part_id, at, km FROM gear_service ORDER BY at DESC").catch(() => []);
  const stat = new Map<number, { n: number; km: number; s: number; up: number; last: string | null; first: string | null }>();
  for (const a of acts) {
    const g = resolveGear(a, gear, links);
    if (g == null) continue;
    const x = stat.get(g) ?? { n: 0, km: 0, s: 0, up: 0, last: null, first: null };
    x.n++;
    x.km += (a.distance_m ?? 0) / 1000;
    x.s += a.moving_s ?? 0;
    x.up += a.elev_gain ?? 0;
    x.last = a.date;
    x.first = x.first ?? a.date;
    stat.set(g, x);
  }
  return c.json(
    gear.map((g) => {
      const s = stat.get(g.id) ?? { n: 0, km: 0, s: 0, up: 0, last: null, first: null };
      const ps = parts.filter((p) => p.gear_id === g.id).map((p) => {
        const km = partKm(p, acts, gear, links);
        return { ...p, km, history: svc.filter((x) => x.part_id === p.id).slice(0, 5), due: p.interval_km ? km >= p.interval_km : false };
      });
      return { ...g, n: s.n, km: Math.round(s.km + (g.start_km ?? 0)), actKm: Math.round(s.km), hours: Math.round(s.s / 360) / 10, up: Math.round(s.up), last: s.last, first: s.first, parts: ps };
    }),
  );
});

/** Aktivity s daným vybavením (ruční přiřazení i výchozí podle sportu), nejnovější první. */
gearApi.get("/:id/activities", async (c) => {
  const id = Number(c.req.param("id"));
  const { gear, links } = await loadGear(c.env.DB);
  const g = gear.find((x) => x.id === id);
  if (!g) return c.json({ error: "Vybavení nemám." }, 404);
  const acts = await all<ActLite & { name: string | null; start_local: string; avg_hr: number | null; np: number | null; avg_power: number | null; load: number | null }>(
    c.env.DB,
    "SELECT id, date, start_local, sport, name, distance_m, moving_s, elev_gain, avg_hr, np, avg_power, load FROM activities ORDER BY start_local DESC",
  );
  return c.json({ gear: g, acts: acts.filter((a) => resolveGear(a, gear, links) === id) });
});

const KINDS = ["bike", "ski", "shoe", "other"];
const clean = (b: any) => ({
  name: String(b.name ?? "").trim().slice(0, 80),
  kind: KINDS.includes(b.kind) ? b.kind : "other",
  default_for: Array.isArray(b.default_for) ? b.default_for.filter((x: unknown) => typeof x === "string").join(",") : (b.default_for ?? null) || null,
  from_date: /^\d{4}-\d{2}-\d{2}$/.test(b.from_date ?? "") ? b.from_date : null,
  to_date: /^\d{4}-\d{2}-\d{2}$/.test(b.to_date ?? "") ? b.to_date : null,
  start_km: Number(b.start_km) || 0,
  note: b.note ? String(b.note).slice(0, 300) : null,
});

gearApi.post("/", async (c) => {
  const g = clean(await c.req.json());
  if (!g.name) return c.json({ error: "Chybí název." }, 400);
  await run(c.env.DB, "INSERT INTO gear (name, kind, default_for, from_date, to_date, start_km, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", g.name, g.kind, g.default_for, g.from_date, g.to_date, g.start_km, g.note, new Date().toISOString());
  return c.json({ ok: true });
});

gearApi.put("/:id", async (c) => {
  const g = clean(await c.req.json());
  if (!g.name) return c.json({ error: "Chybí název." }, 400);
  await run(c.env.DB, "UPDATE gear SET name = ?, kind = ?, default_for = ?, from_date = ?, to_date = ?, start_km = ?, note = ? WHERE id = ?", g.name, g.kind, g.default_for, g.from_date, g.to_date, g.start_km, g.note, Number(c.req.param("id")));
  return c.json({ ok: true });
});

gearApi.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM gear WHERE id = ?", id);
  await run(c.env.DB, "DELETE FROM activity_gear WHERE gear_id = ?", id);
  await run(c.env.DB, "DELETE FROM gear_parts WHERE gear_id = ?", id);
  return c.json({ ok: true });
});

/** Přiřazení vybavení k aktivitě: gear_id číslo, null = bez vybavení, "auto" = podle výchozího. */
gearApi.post("/assign", async (c) => {
  const { activity_id, gear_id } = (await c.req.json()) as { activity_id: string; gear_id: number | null | "auto" };
  if (!activity_id) return c.json({ error: "bad input" }, 400);
  if (gear_id === "auto") await run(c.env.DB, "DELETE FROM activity_gear WHERE activity_id = ?", activity_id);
  else await run(c.env.DB, "INSERT INTO activity_gear (activity_id, gear_id) VALUES (?, ?) ON CONFLICT(activity_id) DO UPDATE SET gear_id = excluded.gear_id", activity_id, gear_id);
  return c.json({ ok: true });
});

// ---- díly a servis ----
const nowLocal = (tz: string) => {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date());
  return p.replace("T", " ");
};
const cleanPart = (b: any) => ({
  name: String(b.name ?? "").trim().slice(0, 60),
  action: b.action ? String(b.action).trim().slice(0, 40) : null,
  interval_km: Number(b.interval_km) > 0 ? Number(b.interval_km) : null,
  repeat_km: Number(b.repeat_km) > 0 ? Number(b.repeat_km) : null,
  start_km: Number(b.start_km) > 0 ? Number(b.start_km) : 0,
  since: /^\d{4}-\d{2}-\d{2}$/.test(b.since ?? "") ? `${b.since} 00:00:00` : null,
});

gearApi.post("/:id/parts", async (c) => {
  const gearId = Number(c.req.param("id"));
  const p = cleanPart(await c.req.json());
  if (!p.name) return c.json({ error: "Chybí název dílu." }, 400);
  await run(c.env.DB, "INSERT INTO gear_parts (gear_id, name, action, interval_km, repeat_km, since, start_km, notified_km, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)", gearId, p.name, p.action, p.interval_km, p.repeat_km, p.since ?? nowLocal(c.env.TZ_NAME), p.start_km, new Date().toISOString());
  return c.json({ ok: true });
});

gearApi.put("/parts/:pid", async (c) => {
  const p = cleanPart(await c.req.json());
  if (!p.name) return c.json({ error: "Chybí název dílu." }, 400);
  await run(c.env.DB, "UPDATE gear_parts SET name = ?, action = ?, interval_km = ?, repeat_km = ?, start_km = ?, since = COALESCE(?, since) WHERE id = ?", p.name, p.action, p.interval_km, p.repeat_km, p.start_km, p.since, Number(c.req.param("pid")));
  return c.json({ ok: true });
});

gearApi.delete("/parts/:pid", async (c) => {
  const id = Number(c.req.param("pid"));
  await run(c.env.DB, "DELETE FROM gear_parts WHERE id = ?", id);
  await run(c.env.DB, "DELETE FROM gear_service WHERE part_id = ?", id);
  return c.json({ ok: true });
});

/** Servis provedený (vyměněno / navoskováno): zapíše záznam a km dílu začnou znovu od nuly. */
gearApi.post("/parts/:pid/reset", async (c) => {
  const id = Number(c.req.param("pid"));
  const { gear, links, acts, parts } = await loadAll(c.env.DB);
  const p = parts.find((x) => x.id === id);
  if (!p) return c.json({ error: "Díl nemám." }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { note?: string; date?: string };
  const km = partKm(p, acts, gear, links);
  const at = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? `${body.date} 23:59:59` : nowLocal(c.env.TZ_NAME);
  await run(c.env.DB, "INSERT INTO gear_service (part_id, gear_id, at, km, note) VALUES (?, ?, ?, ?, ?)", id, p.gear_id, at, km, body.note ? String(body.note).slice(0, 200) : null);
  await run(c.env.DB, "UPDATE gear_parts SET since = ?, start_km = 0, notified_km = 0 WHERE id = ?", at, id);
  return c.json({ ok: true, km });
});
