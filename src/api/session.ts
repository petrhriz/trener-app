// Přihlášení do dashboardu přes Telegram: /dashboard → jednorázový odkaz (15 min) → podepsaná session cookie (30 dní).
// Odkaz přijde jen do chatu uživatele (bot odpovídá jen známým chat_id). Náhledy odkazů jsou vypnuté, takže ho Telegram neotevře sám.
// Session nese id uživatele (v2.<uid>.<exp>) – příprava na víc uživatelů; starší cookie v1 = vlastník (id 1).
import type { Env } from "../env";

const COOKIE = "trener_sess";
const SESSION_DAYS = 365; // přihlášení si pamatuje rok (malý okruh lidí)
export const OWNER_ID = 1;

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

/** Id uživatele podle Telegram chat_id (vlastník = TELEGRAM_CHAT_ID ze secrets). null = neznámý chat. */
export async function userIdForChat(env: Env, chatId: string | number): Promise<number | null> {
  if (env.TELEGRAM_CHAT_ID && String(chatId) === String(env.TELEGRAM_CHAT_ID)) return OWNER_ID;
  try {
    const r = await env.DB.prepare("SELECT id FROM users WHERE telegram_chat_id = ? AND active = 1").bind(String(chatId)).first<{ id: number }>();
    return r?.id ?? null;
  } catch {
    return null; // tabulka users ještě není (migrace 0005)
  }
}

/** Vytvoří jednorázový přihlašovací odkaz pro uživatele (token v KV, TTL 15 min). */
export async function createLoginLink(env: Env, userId: number = OWNER_ID): Promise<string> {
  const t = b64u(crypto.getRandomValues(new Uint8Array(24)));
  await env.KV.put(`login:${t}`, String(userId), { expirationTtl: 15 * 60 });
  return `${env.PUBLIC_URL}/auth?t=${t}`;
}

/**
 * Odkaz pro náhled (komu ho pošleš): jen jednou, přístup jen pro čtení a jen do času `until` (např. dnešní půlnoc).
 * Odkaz sám propadne ve stejný čas.
 */
export async function createViewLink(env: Env, userId: number, until: number): Promise<string> {
  const t = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const ttl = Math.max(60, Math.floor((until - Date.now()) / 1000));
  await env.KV.put(`login:${t}`, JSON.stringify({ uid: userId, ro: 1, exp: until }), { expirationTtl: ttl });
  return `${env.PUBLIC_URL}/auth?t=${t}`;
}

/** Ověří jednorázový token a vrátí hlavičku Set-Cookie, nebo null. */
export async function consumeLogin(env: Env, t: string | undefined): Promise<string | null> {
  if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const v = await env.KV.get(`login:${t}`);
  if (!v) return null;
  await env.KV.delete(`login:${t}`);
  if (v.startsWith("{")) {
    const o = JSON.parse(v) as { uid: number; ro?: number; exp?: number };
    if (o.exp && o.exp < Date.now()) return null;
    return sessionCookie(env, o.uid, o.ro ? { ro: true, exp: o.exp } : {});
  }
  const uid = /^\d+$/.test(v) && v !== "1" ? Number(v) : OWNER_ID; // staré odkazy měly hodnotu „1“ = vlastník
  return sessionCookie(env, uid);
}

/** Podepsaná session cookie pro uživatele (platí SESSION_DAYS). */
export async function sessionCookie(env: Env, uid: number, opt: { ro?: boolean; exp?: number } = {}): Promise<string> {
  const exp = opt.exp ?? Date.now() + SESSION_DAYS * 86400_000;
  // v3 = session jen pro čtení (náhled), v2 = běžná
  const val = await sign(env, opt.ro ? `v3.${uid}.${exp}.ro` : `v2.${uid}.${exp}`);
  return `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(1, Math.floor((exp - Date.now()) / 1000))}`;
}

export function logoutCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Ověří session cookie a vrátí id uživatele, nebo null. */
export async function sessionUser(env: Env, cookieHeader: string | undefined): Promise<number | null> {
  return (await sessionInfo(env, cookieHeader))?.uid ?? null;
}

/** Session: id uživatele a jestli je jen pro čtení (odkaz pro náhled). */
export async function sessionInfo(env: Env, cookieHeader: string | undefined): Promise<{ uid: number; ro: boolean } | null> {
  if (!env.ADMIN_TOKEN || !cookieHeader) return null;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookieHeader);
  if (!m) return null;
  const got = m[1]!;
  const parts = got.split(".");
  let payload: string, uid: number, exp: string, ro = false;
  if (parts[0] === "v1" && parts.length === 3) {
    payload = `v1.${parts[1]}`; uid = OWNER_ID; exp = parts[1]!;
  } else if (parts[0] === "v2" && parts.length === 4 && /^\d+$/.test(parts[1]!)) {
    payload = `v2.${parts[1]}.${parts[2]}`; uid = Number(parts[1]); exp = parts[2]!;
  } else if (parts[0] === "v3" && parts.length === 5 && /^\d+$/.test(parts[1]!) && parts[3] === "ro") {
    payload = `v3.${parts[1]}.${parts[2]}.ro`; uid = Number(parts[1]); exp = parts[2]!; ro = true;
  } else return null;
  if (!exp || Number(exp) < Date.now()) return null;
  const expected = await sign(env, payload);
  if (expected.length !== got.length) return null;
  let r = 0;
  for (let i = 0; i < got.length; i++) r |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return r === 0 ? { uid, ro } : null;
}

/** Zpětná kompatibilita: platná session ano/ne. */
export async function verifySession(env: Env, cookieHeader: string | undefined): Promise<boolean> {
  return (await sessionUser(env, cookieHeader)) != null;
}
