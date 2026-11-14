// Upozornění jako bublina po otevření stránky: servis vybavení, končící Garmin klíč, zdravotní a tréninková
// varování (src/report/build.ts alertsFrom). Každé upozornění má klíč; po „Rozumím“ se stejné znovu neukáže.
import { Hono } from "hono";
import type { Env } from "../env";
import { getState, setState } from "../lib/db";
import { dm } from "../lib/format";
import { addDays, daysBetween } from "../lib/time";
import { alertsFrom, fitnessTable, recoveryFor } from "../report/build";
import { loadCtx } from "../report/context";
import { ackService, serviceAlerts } from "./gear";

export interface Alert {
  key: string;
  icon: string;
  title: string;
  text: string;
  /** kam vede odkaz v bublině (hash stránky) */
  href?: string;
}

const SEEN = "alerts_seen";
const SEEN_MAX = 200;

/** krátký otisk textu (stejné varování ve stejný den = stejný klíč) */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export async function alertsFor(env: Env): Promise<Alert[]> {
  const ctx = await loadCtx(env);
  const out: Alert[] = [];
  for (const s of await serviceAlerts(env.DB)) out.push({ key: `servis:${s.partId}:${s.hit}`, icon: "vybaveni", title: s.title, text: s.text, href: `#/vybaveni/${s.gearId}` });
  if (ctx.s.garmin_key_created) {
    const expires = addDays(ctx.s.garmin_key_created, 365);
    const left = daysBetween(ctx.T, expires);
    if (left <= 30 && left >= 0)
      out.push({ key: `garmin-key:${expires}`, icon: "klic", title: `Garmin klíč končí za ${left} dní (${dm(expires)})`, text: "Nový: Garmin Connect → Nastavení → Personal API → vytvořit klíč a vlož ho v Nastavení → Klíče.", href: "#/nastaveni" });
  }
  for (const w of alertsFrom(ctx, recoveryFor(ctx), fitnessTable(ctx))) out.push({ key: `warn:${ctx.T}:${hash(w)}`, icon: "varovani", title: "Upozornění", text: w });
  const seen = new Set((await getState<string[]>(env.DB, SEEN)) ?? []);
  return out.filter((a) => !seen.has(a.key));
}

export const alertsApi = new Hono<{ Bindings: Env; Variables: { uid: number } }>();

alertsApi.get("/alerts", async (c) => c.json(await alertsFor(c.env)));

/** Viděno („Rozumím“): servis posune hranici km, ostatní se zapamatují. */
alertsApi.post("/alerts/seen", async (c) => {
  const { key } = (await c.req.json().catch(() => ({}))) as { key?: string };
  if (typeof key !== "string" || !key || key.length > 120) return c.json({ error: "bad input" }, 400);
  const m = /^servis:(\d+):(\d+(?:\.\d+)?)$/.exec(key);
  if (m) {
    await ackService(c.env.DB, Number(m[1]), Number(m[2]));
    return c.json({ ok: true });
  }
  const seen = (await getState<string[]>(c.env.DB, SEEN)) ?? [];
  if (!seen.includes(key)) await setState(c.env.DB, SEEN, [...seen, key].slice(-SEEN_MAX));
  return c.json({ ok: true });
});
