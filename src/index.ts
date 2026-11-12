import { Hono } from "hono";
import type { Env } from "./env";
import { secretStatus } from "./env";
import { runPhase0 } from "./admin/phase0";
import { api } from "./api/routes";
import { loadCtx } from "./report/context";
import { runScheduler } from "./scheduler";
import { recomputeLoads, recomputeMetrics } from "./sync/metrics";
import { syncTick } from "./sync/sync";
import { getSettings } from "./lib/settings";
import { logEvent } from "./lib/db";
import { applySecrets } from "./lib/secrets";
import { tgCall } from "./telegram/api";
import { cmdPlan, cmdRano, cmdTyden, cmdZitra, handleUpdate } from "./telegram/bot";
import { authApp } from "./api/accounts";
import { createViewLink, sessionInfo, userIdForChat } from "./api/session";
import { localNow } from "./lib/time";
import { OWNER_ID, activeUsers, envFor, forgetUser, userForTick } from "./lib/tenant";

const app = new Hono<{ Bindings: Env }>();
// API klíče zadané v dashboardu mají přednost před secrets Workeru
app.use("*", async (c, next) => {
  await applySecrets(c.env);
  await next();
});

/** Porovnání v konstantním čase. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- Telegram webhook: ověření X-Telegram-Bot-Api-Secret-Token; chat_id ověřuje handleUpdate ----
app.post("/telegram/webhook", async (c) => {
  const want = c.env.TELEGRAM_WEBHOOK_SECRET;
  const got = c.req.header("x-telegram-bot-api-secret-token") ?? "";
  if (!want || !safeEqual(got, want)) return c.text("forbidden", 403);
  const update = await c.req.json().catch(() => null);
  if (update) {
    c.executionCtx.waitUntil(
      routeTelegram(c.env, update).catch((e) => logEvent(c.env.DB, "error", `telegram: ${(e as Error).message}`)),
    );
  }
  return c.text("ok");
});

// ---- admin (ADMIN_TOKEN) ----
app.use("/admin/*", async (c, next) => {
  const want = c.env.ADMIN_TOKEN;
  const got = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!want || !got || !safeEqual(got, want)) return c.json({ error: "unauthorized" }, 401);
  await next();
});
app.get("/admin/secrets", (c) => c.json(secretStatus(c.env)));
/** Odkaz pro náhled pro někoho dalšího: jednorázový, jen čtení, platí do dnešní půlnoci (nebo ?hours=N). */
app.post("/admin/view-link", async (c) => {
  const now = localNow(new Date(), c.env.TZ_NAME);
  const h = Number(c.req.query("hours") ?? 0);
  const until = h > 0 ? Date.now() + Math.min(h, 72) * 3600_000 : Date.now() + (1440 - now.minutes) * 60_000;
  return c.json({ url: await createViewLink(c.env, Number(c.req.query("uid") ?? OWNER_ID), until), until: new Date(until).toISOString() });
});
app.get("/admin/phase0", async (c) => c.json(await runPhase0(c.env, { probes: c.req.query("probes") !== "0", telegram: c.req.query("telegram") !== "0" })));
app.post("/admin/sync", async (c) => c.json(await syncTick(c.env, { force: c.req.query("force") === "1", backfillPages: Number(c.req.query("pages") ?? 4) })));
app.post("/admin/scheduler", async (c) => c.json(await runScheduler(c.env)));
app.post("/admin/recompute", async (c) => {
  const s = await getSettings(c.env.DB);
  const n = await recomputeLoads(c.env.DB, s);
  const m = await recomputeMetrics(c.env.DB, (await loadCtx(c.env)).T);
  return c.json({ loads: n, metrics: m });
});
app.post("/admin/send/:what", async (c) => {
  const w = c.req.param("what");
  if (w === "rano") await cmdRano(c.env);
  else if (w === "zitra") await cmdZitra(c.env);
  else if (w === "tyden") await cmdTyden(c.env);
  else if (w === "plan") await cmdPlan(c.env);
  else return c.json({ error: "unknown" }, 400);
  return c.json({ ok: true });
});
app.get("/admin/preview/:what", async (c) => {
  const { readiness, planFor, activityReport, findActivity } = await import("./report/build");
  const { readinessMessage, planMessage, tomorrowMessage, activityMessage } = await import("./telegram/render");
  const ctx = await loadCtx(c.env);
  const w = c.req.param("what");
  const t0 = Date.now();
  let html = "";
  if (w === "rano") html = readinessMessage(await readiness(ctx), c.env.PUBLIC_URL);
  else if (w === "plan") html = planMessage(await planFor(ctx), "Plán", c.env.PUBLIC_URL);
  else if (w === "zitra") html = tomorrowMessage(await planFor(ctx), c.env.PUBLIC_URL);
  else if (w === "aktivita") html = findActivity(ctx, c.req.query("q")).map((a) => activityMessage(activityReport(ctx, a), c.env.PUBLIC_URL)).join("\n\n");
  return c.text(`${html}\n\n[${Date.now() - t0} ms wall]`);
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
    return c.json(await new GarminClient(c.env).get(path));
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
app.post("/admin/setup-webhook", async (c) => {
  const url = `${c.env.PUBLIC_URL}/telegram/webhook`;
  await tgCall(c.env, "setWebhook", { url, secret_token: c.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
  await tgCall(c.env, "setMyCommands", {
    commands: [
      ["menu", "Menu a nápověda"], ["rano", "Připravenost"],["stav", "Celý denní report"], ["plan", "Plán na 7 dní"], ["zitra", "Zítřek"],
      ["aktivita", "Rozbor aktivity"], ["tyden", "Týdenní review"], ["pocasi", "Počasí a okna"], ["nepojedu", "Dnes nepojedu"], ["sport", "Jiný sport místo kola"],
      ["nemuzu", "Nemůžu <den>"], ["hokej", "Hokej <den>"], ["nemoc", "Jsem nemocný"], ["cil", "Cíl: zlepseni/udrzeni/pokles"],
      ["ftp", "Nastavit FTP"], ["vaha", "Zapsat váhu"], ["sila", "Zapsat sílu"], ["mobilita", "Zapsat mobilitu"],
      ["fit", "Workout jako FIT"], ["dashboard", "Odkaz na dashboard"], ["nastaveni", "Nastavení"], ["export", "Export dat"], ["pomoc", "Nápověda"],
    ].map(([command, description]) => ({ command, description })),
  });
  const info = await tgCall<any>(c.env, "getWebhookInfo", {});
  return c.json({ url: info.url === url ? "nastaveno" : info.url, pending: info.pending_update_count, lastError: info.last_error_message ?? null });
});

// ---- přihlášení do dashboardu odkazem z Telegramu ----
const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Trenér</title><body style="font-family:system-ui;padding:32px 20px;background:#f3f2ef;color:#1b1916;text-align:center;max-width:440px;margin:auto"><img src="/apple-touch-icon.png" width="72" height="72" style="border-radius:18px" alt="">${body}</body>`;
app.get("/auth", async (c) => {
  const t = c.req.query("t") ?? "";
  // odkaz pro náhled: náhledy odkazů (Messenger, WhatsApp, iMessage…) by ho jinak spotřebovaly → nejdřív tlačítko
  if (/^[A-Za-z0-9_-]{20,64}$/.test(t) && (await c.env.KV.get(`login:${t}`))?.startsWith("{")) {
    return c.html(page(`<h2>Náhled aplikace Trenér</h2><p>Přístup jen pro čtení, platí do půlnoci a odkaz jde otevřít jen jednou.</p><form method="post" action="/auth"><input type="hidden" name="t" value="${t}"><button style="font:inherit;font-weight:700;font-size:17px;padding:12px 28px;border:0;border-radius:12px;background:#e0600f;color:#fff">Otevřít náhled</button></form>`), 200, { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  }
  const { consumeLogin } = await import("./api/session");
  const cookie = await consumeLogin(c.env, t);
  if (!cookie) return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px;background:#121110;color:#f2efeb"><h2>Odkaz už neplatí</h2><p>Napiš botovi <b>/dashboard</b> a pošle ti nový (platí 15 minut, jen jednou).</p></body>`, 403);
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

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Telegram: jeden bot pro všechny. Chat se přiřadí uživateli (vlastník = TELEGRAM_CHAT_ID, ostatní = users.telegram_chat_id).
 * Neznámý chat smí jen „/start <kód>“ z Nastavení → propojí se s účtem.
 */
async function routeTelegram(base: Env, update: any): Promise<void> {
  const chatId = String(update.callback_query?.message?.chat?.id ?? update.message?.chat?.id ?? update.edited_message?.chat?.id ?? "");
  if (!chatId) return;
  const uid = await userIdForChat(base, chatId);
  if (uid == null) {
    const m = /^\/start\s+([A-Za-z0-9]{10})(?![A-Za-z0-9])/.exec(String(update.message?.text ?? "").trim());
    if (!m) return; // cizí chat ignorovat
    // nejvýš 5 špatných kódů za hodinu z jednoho chatu (hádání kódu)
    const failKey = `tgfail:${chatId}`;
    const fails = Number((await base.KV.get(failKey)) ?? 0);
    if (fails >= 5) return;
    const code = m[1]!.toUpperCase();
    const v = await base.KV.get(`tglink:${code}`);
    if (!v) {
      await base.KV.put(failKey, String(fails + 1), { expirationTtl: 3600 });
      return void (await tgCall(base, "sendMessage", { chat_id: chatId, text: "Kód neplatí. Vygeneruj nový v dashboardu → Nastavení → Telegram." }).catch(() => null));
    }
    await base.KV.delete(`tglink:${code}`);
    await base.DB.prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?").bind(chatId, Number(v)).run();
    forgetUser(Number(v));
    await tgCall(base, "sendMessage", { chat_id: chatId, text: "✅ Propojeno. Odteď ti sem budu posílat ranní zhodnocení, rozbory aktivit a plán. Napiš /menu." }).catch(() => null);
    return;
  }
  const env = await envFor(base, uid);
  if (!env) return;
  await applySecrets(env);
  await handleUpdate(env, update);
}

export default {
  fetch: app.fetch,
  // cron každou minutu: vlastník každých 5 min (jako dřív), další uživatelé ve zbylých minutách – jeden za spuštění
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
