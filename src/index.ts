import { Hono } from "hono";
import type { Env } from "./env";
import { secretStatus } from "./env";
import { runPhase0 } from "./admin/phase0";

const app = new Hono<{ Bindings: Env }>();

/** Porovnání v konstantním čase (admin token). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Administrátorská volání: jen s hlavičkou Authorization: Bearer <ADMIN_TOKEN>.
app.use("/admin/*", async (c, next) => {
  const want = c.env.ADMIN_TOKEN;
  const got = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!want || !got || !safeEqual(got, want)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/admin/secrets", (c) => c.json(secretStatus(c.env)));

app.get("/admin/phase0", async (c) => {
  const probes = c.req.query("probes") !== "0";
  const telegram = c.req.query("telegram") !== "0";
  return c.json(await runPhase0(c.env, { probes, telegram }));
});

app.get("/health", (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // Fáze 0: cron zatím nic nedělá. Plánovač přibude ve fázi 1.
  },
} satisfies ExportedHandler<Env>;
