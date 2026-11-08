// Účty pro víc lidí: přihlášení jménem a heslem (pamatuje si 1 rok), pozvánka od vlastníka, propojení Telegramu.
import { Hono } from "hono";
import type { Env } from "../env";
import { DEFAULTS, setSettingSql } from "../lib/settings";
import { OWNER_ID, ensureTenantSchema, envFor, forgetUser, getUser } from "../lib/tenant";
import { sessionCookie } from "./session";

const ITER = 60_000; // PBKDF2-SHA256; na free plánu CPU šetříme, data nejsou citlivá jako banka
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pbkdf2(pass: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

export async function hashPassword(pass: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64u(salt)}$${b64u(await pbkdf2(pass, salt, ITER))}`;
}

export async function checkPassword(pass: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [kind, it, salt, hash] = stored.split("$");
  if (kind !== "pbkdf2" || !it || !salt || !hash) return false;
  const got = b64u(await pbkdf2(pass, unb64u(salt), Number(it)));
  if (got.length !== hash.length) return false;
  let r = 0;
  for (let i = 0; i < got.length; i++) r |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return r === 0;
}

const USER_RE = /^[a-z0-9._-]{3,30}$/;
const cleanUser = (u: unknown) => String(u ?? "").trim().toLowerCase();

// ---------- veřejné (bez přihlášení): /auth/login, /auth/join ----------
export const authApp = new Hono<{ Bindings: Env }>();

authApp.post("/login", async (c) => {
  const { username, password } = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string };
  const u = await c.env.DB.prepare("SELECT id, pass_hash, active FROM users WHERE username = ?").bind(cleanUser(username)).first<{ id: number; pass_hash: string | null; active: number }>().catch(() => null);
  // stejná odpověď pro neznámé jméno i špatné heslo; krátké čekání brzdí hádání
  if (!u || !u.active || !(await checkPassword(String(password ?? ""), u.pass_hash))) {
    await new Promise((r) => setTimeout(r, 600));
    return c.json({ error: "Špatné jméno nebo heslo." }, 401);
  }
  return c.json({ ok: true }, 200, { "Set-Cookie": await sessionCookie(c.env, u.id), "Cache-Control": "no-store" });
});

/** Registrace z pozvánky: {token, name, username, password} → nový uživatel s vlastními tabulkami, rovnou přihlášený. */
authApp.post("/join", async (c) => {
  const { token, name, username, password } = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return c.json({ error: "Pozvánka neplatí." }, 400);
  const inv = await c.env.KV.get(`invite:${token}`);
  if (!inv) return c.json({ error: "Pozvánka už neplatí – požádej o novou." }, 400);
  const un = cleanUser(username);
  if (!USER_RE.test(un)) return c.json({ error: "Přihlašovací jméno: 3–30 znaků, malá písmena, čísla, tečka, pomlčka." }, 400);
  if (String(password ?? "").length < 6) return c.json({ error: "Heslo aspoň 6 znaků." }, 400);
  const taken = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE username = ?").bind(un).first();
  if (taken) return c.json({ error: "Toto jméno už někdo má." }, 409);
  const nm = String(name || un).trim().slice(0, 40);
  const r = await c.env.DB.prepare("INSERT INTO users (name, username, pass_hash, role, active, schema_ver, created_at) VALUES (?, ?, ?, 'user', 1, 0, ?)").bind(nm, un, await hashPassword(String(password)), new Date().toISOString()).run();
  const id = Number(r.meta.last_row_id);
  await c.env.KV.delete(`invite:${token}`);
  await ensureTenantSchema(c.env, { id, schema_ver: 0 });
  forgetUser(id);
  // jméno v pozdravu; ostatní nastavení výchozí (bez cíle závodu vlastníka)
  const env = await envFor(c.env, id);
  if (env) await env.DB.batch([setSettingSql("first_name", nm.split(" ")[0]), setSettingSql("goal_name", null), setSettingSql("place_name", DEFAULTS.place_name)].map((s) => env.DB.prepare(s)));
  return c.json({ ok: true }, 200, { "Set-Cookie": await sessionCookie(c.env, id), "Cache-Control": "no-store" });
});

// ---------- pro přihlášené (pod /api): účet, uživatelé, Telegram ----------
export const accountsApi = new Hono<{ Bindings: Env; Variables: { uid: number } }>();
/** tabulka users je společná → dotazy na ni přes základní DB (env uživatele by přidal předponu jen k datovým tabulkám) */

accountsApi.get("/me", async (c) => {
  const uid = c.get("uid");
  const u = await getUser(baseOf(c.env), uid);
  return c.json({ uid, role: u?.role ?? (uid === OWNER_ID ? "owner" : "user"), name: u?.name ?? null, username: u?.username ?? null, hasPassword: !!(await passOf(baseOf(c.env), uid)), telegram: !!(u?.telegram_chat_id || (uid === OWNER_ID && c.env.TELEGRAM_CHAT_ID)), multiUser: true });
});

/** Nastavit / změnit své přihlašovací jméno a heslo. */
accountsApi.post("/me/password", async (c) => {
  const uid = c.get("uid");
  const base = baseOf(c.env);
  const { username, password, old } = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  const cur = await passOf(base, uid);
  if (cur && !(await checkPassword(String(old ?? ""), cur))) return c.json({ error: "Současné heslo nesedí." }, 400);
  const un = cleanUser(username);
  if (!USER_RE.test(un)) return c.json({ error: "Přihlašovací jméno: 3–30 znaků, malá písmena, čísla, tečka, pomlčka." }, 400);
  if (String(password ?? "").length < 6) return c.json({ error: "Heslo aspoň 6 znaků." }, 400);
  const taken = await base.DB.prepare("SELECT id FROM users WHERE username = ? AND id != ?").bind(un, uid).first();
  if (taken) return c.json({ error: "Toto jméno už někdo má." }, 409);
  await base.DB.prepare("UPDATE users SET username = ?, pass_hash = ? WHERE id = ?").bind(un, await hashPassword(String(password)), uid).run();
  forgetUser(uid);
  return c.json({ ok: true });
});

/** Kód pro propojení Telegramu: napiš botovi /start <kód>. */
accountsApi.post("/me/telegram", async (c) => {
  const uid = c.get("uid");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await baseOf(c.env).KV.put(`tglink:${code}`, String(uid), { expirationTtl: 30 * 60 });
  return c.json({ code, bot: c.env.TELEGRAM_BOT_TOKEN ? "ano" : null });
});

// --- jen vlastník ---
accountsApi.use("/users/*", async (c, next) => (c.get("uid") === OWNER_ID ? next() : c.json({ error: "jen pro vlastníka" }, 403)));
accountsApi.use("/users", async (c, next) => (c.get("uid") === OWNER_ID ? next() : c.json({ error: "jen pro vlastníka" }, 403)));

accountsApi.get("/users", async (c) => {
  const r = await baseOf(c.env).DB.prepare("SELECT id, name, username, role, active, telegram_chat_id IS NOT NULL AS tg, created_at FROM users ORDER BY id").all();
  return c.json(r.results ?? []);
});

/** Pozvánka: odkaz platí 7 dní a jednou. */
accountsApi.post("/users/invite", async (c) => {
  const n = (await baseOf(c.env).DB.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1").first<{ n: number }>())?.n ?? 1;
  if (n >= 10) return c.json({ error: "Limit 10 uživatelů (free plán Cloudflare)." }, 400);
  const t = b64u(crypto.getRandomValues(new Uint8Array(18)));
  await baseOf(c.env).KV.put(`invite:${t}`, "1", { expirationTtl: 7 * 86400 });
  return c.json({ url: `${c.env.PUBLIC_URL}/#/join/${t}` });
});

accountsApi.post("/users/:id/active", async (c) => {
  const id = Number(c.req.param("id"));
  if (id === OWNER_ID) return c.json({ error: "Vlastníka nejde vypnout." }, 400);
  const { active } = (await c.req.json()) as { active: boolean };
  await baseOf(c.env).DB.prepare("UPDATE users SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  forgetUser(id);
  return c.json({ ok: true });
});

// env uživatele nese základní env (pro společnou tabulku users a sdílené KV)
export const baseOf = (env: Env): Env => ((env as any).__base as Env) ?? env;
async function passOf(base: Env, uid: number): Promise<string | null> {
  const r = await base.DB.prepare("SELECT pass_hash FROM users WHERE id = ?").bind(uid).first<{ pass_hash: string | null }>().catch(() => null);
  return r?.pass_hash ?? null;
}
