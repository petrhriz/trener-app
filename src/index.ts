import { Hono } from "hono";
import type { Env } from "./env";
import { secretStatus } from "./env";
import { api } from "./api/routes";
import { loadCtx } from "./report/context";
import { runScheduler } from "./scheduler";
import { recomputeLoads, recomputeMetrics } from "./sync/metrics";
import { syncTick } from "./sync/sync";
import { getSettings } from "./lib/settings";
import { logEvent } from "./lib/db";
import { applySecrets } from "./lib/secrets";
import { authApp } from "./api/accounts";
import { createLoginLink, createViewLink, sessionInfo } from "./api/session";
import { localNow } from "./lib/time";
import { OWNER_ID, activeUsers, envFor, userForTick } from "./lib/tenant";

const app = new Hono<{ Bindings: Env }>();
// API klíče zadané v dashboardu mají přednost před secrets Workeru
app.use("*", async (c, next) => {
  await applySecrets(c.env);
  await next();
  // bezpečnostní hlavičky i pro odpovědi Workeru (statické soubory je mají z public/_headers)
  const h = c.res.headers;
  try {
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "DENY");
    h.set("Referrer-Policy", h.get("Referrer-Policy") ?? "strict-origin-when-cross-origin");
    if ((h.get("content-type") ?? "").startsWith("text/html")) h.set("Content-Security-Policy", "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  } catch { /* neměnné hlavičky (odpověď z fetch) – nechat */ }
});

/** Porovnání v konstantním čase. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- admin (ADMIN_TOKEN) ----
app.use("/admin/*", async (c, next) => {
  const want = c.env.ADMIN_TOKEN;
  const got = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!want || !got || !safeEqual(got, want)) return c.json({ error: "unauthorized" }, 401);
  await next();
});
app.get("/admin/secrets", (c) => c.json(secretStatus(c.env)));
/** Jednorázový přihlašovací odkaz (15 min) – první přihlášení na novém zařízení nebo zapomenuté heslo. */
app.post("/admin/login-link", async (c) => c.json({ url: await createLoginLink(c.env, Number(c.req.query("uid") ?? OWNER_ID) || OWNER_ID) }));
/** Odkaz pro náhled pro někoho dalšího: jednorázový, jen čtení, platí do dnešní půlnoci (nebo ?hours=N). */
app.post("/admin/view-link", async (c) => {
  const now = localNow(new Date(), c.env.TZ_NAME);
  const h = Number(c.req.query("hours") ?? 0);
  const until = h > 0 ? Date.now() + Math.min(h, 72) * 3600_000 : Date.now() + (1440 - now.minutes) * 60_000;
  return c.json({ url: await createViewLink(c.env, Number(c.req.query("uid") ?? OWNER_ID), until), until: new Date(until).toISOString() });
});
app.post("/admin/sync", async (c) => c.json(await syncTick(c.env, { force: c.req.query("force") === "1", backfillPages: Number(c.req.query("pages") ?? 4) })));
app.post("/admin/scheduler", async (c) => c.json(await runScheduler(c.env)));
app.post("/admin/recompute", async (c) => {
  const s = await getSettings(c.env.DB);
  const n = await recomputeLoads(c.env.DB, s);
  const m = await recomputeMetrics(c.env.DB, (await loadCtx(c.env)).T);
  return c.json({ loads: n, metrics: m });
});
app.get("/admin/llm", async (c) => {
  const { runLlm, numbersOk } = await import("./llm/llm");
  const ctx = { forma: 19.1, kondice: 48.7, zatez_7_dni: 193, hrv_ms: 62, hrv_hodnoceni: "Nevyvážené", cil: "zlepšení kondice" };
  const q = c.req.query("q") ?? "Jak jsem na tom?";
  const sys = "Jsi osobní trenér cyklistiky. Piš česky, krátce, celými větami. Používej jen čísla z kontextu. Max. 3 věty.";
  const out = await runLlm(c.env, sys, `KONTEXT: ${JSON.stringify(ctx)}\nOTÁZKA: ${q}`);
  return c.json({ model: c.env.LLM_MODEL, answer: out, numbersOk: out ? numbersOk(out, { ...ctx, q }) : null });
});
// surová odpověď zdroje (diagnostika): /admin/raw?src=garmin|icu&path=/...
app.get("/admin/raw", async (c) => {
  const path = c.req.query("path") ?? "";
  if (!path.startsWith("/")) return c.json({ error: "path" }, 400);
  if (c.req.query("src") === "icu") {
    const { IntervalsClient } = await import("./datasource/intervals");
    return c.json(await new IntervalsClient(c.env).req("GET", path.replace("{ath}", `/athlete/${c.env.INTERVALS_ATHLETE_ID}`)));
  }
  const { GarminClient } = await import("./datasource/garmin");
  const { HttpError } = await import("./lib/http");
  try {
    // ?uid= : Garmin účet jiného uživatele (diagnostika)
    const uid = Number(c.req.query("uid") ?? OWNER_ID) || OWNER_ID;
    const env = await envFor(c.env, uid);
    if (!env) return c.json({ error: "uživatel" }, 404);
    if (uid !== OWNER_ID) await applySecrets(env);
    return c.json(await new GarminClient(env).get(path));
  } catch (e) {
    return c.json({ upstreamError: e instanceof HttpError ? e.status : String(e) }, 502);
  }
});
/** Trenér v3 na ostrých datech bez přepnutí uživatele (jen čte; ?goal= zkusí jiný cíl). */
app.get("/admin/coach", async (c) => {
  const ctx = await loadCtx(c.env);
  const g = c.req.query("goal");
  if (g === "pokles" || g === "udrzeni" || g === "zvyseni" || g === "zavod") ctx.s.goal = g;
  const { planForCoach, recoveryFor } = await import("./report/build");
  const p = (await planForCoach(ctx, recoveryFor(ctx), { dryRun: true })) as any;
  return c.json({ goal: ctx.s.goal, coach: p.coach, warnings: p.warnings, days: p.days.map((d: any) => ({ date: d.date, tag: d.tag, name: d.name, min: d.durationMin, load: d.load, sport: d.sport, indoor: d.indoor, steps: d.steps, note: d.note, form: d.form })), changes: p.changes.length });
});
app.get("/admin/ctx", async (c) => {
  const { env: _e, ...ctx } = await loadCtx(c.env);
  return c.json(ctx);
});
// ---- přihlášení jednorázovým odkazem (npm run admin -- login-link) a odkaz pro náhled ----
const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kadence</title><body style="font-family:system-ui;padding:32px 20px;background:#f3f2ef;color:#1b1916;text-align:center;max-width:440px;margin:auto"><img src="/apple-touch-icon.png?v=2" width="72" height="72" style="border-radius:18px" alt="">${body}</body>`;
app.get("/auth", async (c) => {
  const t = c.req.query("t") ?? "";
  // odkaz pro náhled: náhledy odkazů (Messenger, WhatsApp, iMessage…) by ho jinak spotřebovaly → nejdřív tlačítko
  if (/^[A-Za-z0-9_-]{20,64}$/.test(t) && (await c.env.KV.get(`login:${t}`))?.startsWith("{")) {
    return c.html(page(`<h2>Náhled aplikace Kadence</h2><p>Přístup jen pro čtení, platí do půlnoci a odkaz jde otevřít jen jednou.</p><form method="post" action="/auth"><input type="hidden" name="t" value="${t}"><button style="font:inherit;font-weight:700;font-size:17px;padding:12px 28px;border:0;border-radius:12px;background:#e0600f;color:#fff">Otevřít náhled</button></form>`), 200, { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  }
  const { consumeLogin } = await import("./api/session");
  const cookie = await consumeLogin(c.env, t);
  if (!cookie) return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px;background:#121110;color:#f2efeb"><h2>Odkaz už neplatí</h2><p>Přihlas se jménem a heslem na <a href="/" style="color:#f2a65a">úvodní stránce</a>.</p></body>`, 403);
  return new Response(null, { status: 302, headers: { Location: "/#/prehled", "Set-Cookie": cookie, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
app.post("/auth", async (c) => {
  const f = await c.req.parseBody();
  const { consumeLogin } = await import("./api/session");
  const cookie = await consumeLogin(c.env, String(f.t ?? ""));
  if (!cookie) return c.html(page(`<h2>Odkaz už neplatí</h2><p>Byl už jednou otevřený, nebo vypršel. Požádej o nový.</p>`), 403);
  return new Response(null, { status: 303, headers: { Location: "/#/prehled", "Set-Cookie": cookie, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
app.get("/logout", async (c) => {
  const { logoutCookie } = await import("./api/session");
  return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": logoutCookie() } });
});

// ---- přihlášení jménem a heslem, registrace z pozvánky ----
app.route("/auth", authApp);

// ---- dashboard API: env podle přihlášeného uživatele (vlastní tabulky, KV a klíče) ----
const apiRoot = new Hono<{ Bindings: Env }>().route("/api", api);
app.all("/api/*", async (c) => {
  const si = await sessionInfo(c.env, c.req.header("cookie"));
  let uid = si?.uid ?? null;
  // odkaz pro náhled: jen čtení, bez klíčů a správy uživatelů, bez AI chatu
  // cesta dekódovaná stejně jako ji vidí router (jinak by /api/%75sers kontrolu obešlo)
  const path = (() => { try { return decodeURIComponent(new URL(c.req.url).pathname).toLowerCase(); } catch { return null; } })();
  if (si?.ro && (c.req.method !== "GET" || path == null || /^\/+api\/+(secrets|users|status)(?![a-z])/.test(path))) return c.json({ error: "Jen náhled – tady nic měnit nejde." }, 403);
  // admin token (skripty) smí za uživatele: hlavička x-uid
  const admin = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (uid == null && c.env.ADMIN_TOKEN && admin && safeEqual(admin, c.env.ADMIN_TOKEN)) uid = Number(c.req.header("x-uid") ?? OWNER_ID) || OWNER_ID;
  let env = c.env;
  if (uid != null && uid !== OWNER_ID) {
    const e = await envFor(c.env, uid);
    if (!e) return c.json({ error: "login", message: "Účet je vypnutý nebo neexistuje. Přihlas se znovu." }, 403);
    await applySecrets(e);
    env = e;
  }
  return apiRoot.fetch(c.req.raw, env, c.executionCtx);
});

/**
 * Stav pro hlídání zvenku (UptimeRobot apod.): databáze odpovídá a synchronizace běží. Veřejné, proto bez
 * podrobností – jen ok / stale. 503 = databáze nejde, 200 s sync „stale“ = cron nebo Garmin stojí přes 6 h.
 */
app.get("/health", async (c) => {
  try {
    const r = await c.env.DB.prepare("SELECT value FROM sync_state WHERE key = 'last_sync_ok'").first<{ value: string }>();
    const at = r ? Date.parse(JSON.parse(r.value) as string) : NaN;
    const stale = !isFinite(at) || Date.now() - at > 6 * 3600_000;
    return c.json({ ok: !stale, db: "ok", sync: stale ? "stale" : "ok" }, 200, { "Cache-Control": "no-store" });
  } catch {
    return c.json({ ok: false, db: "error" }, 503, { "Cache-Control": "no-store" });
  }
});

export default {
  fetch: app.fetch,
  // cron každou minutu: vlastník každých 5 min, další uživatelé ve zbylých minutách – jeden za spuštění
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const run = async () => {
      await applySecrets(env);
      const ids = await activeUsers(env);
      const minute = Math.floor(Date.now() / 60_000);
      const uid = userForTick(ids, minute);
      const { aiBackground } = await import("./report/aiBackground");
      // volná minuta (nikdo se nesynchronizuje): AI shrnutí na pozadí, uživatelé se střídají – po otevření stránky
      // už čekají hotová
      const aiUid = uid == null ? ids[Math.floor(minute / 5) % ids.length]! : null;
      const who = uid ?? aiUid;
      if (who == null) return;
      const e = await envFor(env, who);
      if (!e) return;
      await applySecrets(e);
      if (who !== OWNER_ID && !e.GARMIN_API_KEY && !e.INTERVALS_API_KEY) return; // ještě nezadal klíče
      if (aiUid != null) { await aiBackground(e); return; }
      await runScheduler(e);
      // 4 a víc dalších uživatelů = žádná volná minuta → AI úloha hned po synchronizaci
      if (ids.filter((x) => x !== OWNER_ID).length >= 4) await aiBackground(e);
    };
    ctx.waitUntil(run().catch((e) => logEvent(env.DB, "error", `cron: ${(e as Error).message}`)));
  },
} satisfies ExportedHandler<Env>;
