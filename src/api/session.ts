// Přihlášení do dashboardu přes Telegram: /dashboard → jednorázový odkaz (15 min) → podepsaná session cookie (30 dní).
// Odkaz přijde jen do tvého chatu (bot odpovídá jen na tvoje chat_id). Náhledy odkazů jsou vypnuté, takže ho Telegram neotevře sám.
import type { Env } from "../env";

const COOKIE = "trener_sess";
const SESSION_DAYS = 30;

const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function key(env: Env): Promise<CryptoKey> {
  // klíč odvozený z ADMIN_TOKEN (secret) – žádný další klíč není potřeba
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`session:${env.ADMIN_TOKEN}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(env: Env, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(env), new TextEncoder().encode(payload));
  return `${payload}.${b64u(sig)}`;
}

/** Vytvoří jednorázový přihlašovací odkaz (token v KV, TTL 15 min). */
export async function createLoginLink(env: Env): Promise<string> {
  const t = b64u(crypto.getRandomValues(new Uint8Array(24)));
  await env.KV.put(`login:${t}`, "1", { expirationTtl: 15 * 60 });
  return `${env.PUBLIC_URL}/auth?t=${t}`;
}

/** Ověří jednorázový token a vrátí hlavičku Set-Cookie, nebo null. */
export async function consumeLogin(env: Env, t: string | undefined): Promise<string | null> {
  if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const ok = await env.KV.get(`login:${t}`);
  if (!ok) return null;
  await env.KV.delete(`login:${t}`);
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const val = await sign(env, `v1.${exp}`);
  return `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function logoutCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function verifySession(env: Env, cookieHeader: string | undefined): Promise<boolean> {
  if (!env.ADMIN_TOKEN || !cookieHeader) return false;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookieHeader);
  if (!m) return false;
  const [v, exp, sig] = m[1]!.split(".");
  if (v !== "v1" || !exp || !sig || Number(exp) < Date.now()) return false;
  const expected = await sign(env, `v1.${exp}`);
  const got = m[1]!;
  if (expected.length !== got.length) return false;
  let r = 0;
  for (let i = 0; i < got.length; i++) r |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return r === 0;
}
