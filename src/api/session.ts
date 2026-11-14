// Přihlášení do dashboardu: jméno a heslo (src/api/accounts.ts), nebo jednorázový odkaz (15 min) z `npm run admin -- login-link`
// (první přihlášení, zapomenuté heslo) → podepsaná session cookie.
// Session nese id uživatele (v2.<uid>.<exp>) – příprava na víc uživatelů; starší cookie v1 = vlastník (id 1).
import type { Env } from "../env";
import { getUser } from "../lib/tenant";

const COOKIE = "trener_sess";
const SESSION_DAYS = 365; // přihlášení si pamatuje rok (malý okruh lidí)
export const OWNER_ID = 1;

const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Klíče pro podpis: první podepisuje, další jen ověřují (starší cookie z doby, kdy podepisoval ADMIN_TOKEN). */
const secretsOf = (env: Env): string[] => [...new Set([env.SESSION_SECRET, env.ADMIN_TOKEN].filter((x): x is string => !!x))];
async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signWith(secret: string, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(payload));
  return `${payload}.${b64u(sig)}`;
}
async function sign(env: Env, payload: string): Promise<string> {
  const sec = secretsOf(env)[0];
  if (!sec) throw new Error("SESSION_SECRET ani ADMIN_TOKEN není nastavený");
  return signWith(sec, payload);
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
  // v3 = session jen pro čtení (náhled), v4 = běžná s verzí přihlášení (v2 = starší bez verze)
  const ver = opt.ro ? 0 : await sessVer(env, uid);
  const val = await sign(env, opt.ro ? `v3.${uid}.${exp}.ro` : `v4.${uid}.${exp}.${ver}`);
  return `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(1, Math.floor((exp - Date.now()) / 1000))}`;
}

export function logoutCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Verze přihlášení uživatele (users.sess_ver); null = uživatel se nenačetl → přihlášení neplatí. */
async function sessVer(env: Env, uid: number): Promise<number> {
  const base = ((env as any).__base as Env) ?? env;
  const u = await getUser(base, uid);
  if (!u) throw new Error("uživatel se nenačetl");
  return u.sess_ver ?? 0;
}

/** Ověří session cookie a vrátí id uživatele, nebo null. */
export async function sessionUser(env: Env, cookieHeader: string | undefined): Promise<number | null> {
  return (await sessionInfo(env, cookieHeader))?.uid ?? null;
}

/** Session: id uživatele a jestli je jen pro čtení (odkaz pro náhled). */
export async function sessionInfo(env: Env, cookieHeader: string | undefined): Promise<{ uid: number; ro: boolean } | null> {
  if (!secretsOf(env).length || !cookieHeader) return null;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookieHeader);
  if (!m) return null;
  const got = m[1]!;
  const parts = got.split(".");
  let payload: string, uid: number, exp: string, ro = false, ver = 0;
  if (parts[0] === "v1" && parts.length === 3) {
    payload = `v1.${parts[1]}`; uid = OWNER_ID; exp = parts[1]!;
  } else if (parts[0] === "v2" && parts.length === 4 && /^\d+$/.test(parts[1]!)) {
    payload = `v2.${parts[1]}.${parts[2]}`; uid = Number(parts[1]); exp = parts[2]!;
  } else if (parts[0] === "v4" && parts.length === 5 && /^\d+$/.test(parts[1]!) && /^\d+$/.test(parts[3]!)) {
    payload = `v4.${parts[1]}.${parts[2]}.${parts[3]}`; uid = Number(parts[1]); exp = parts[2]!; ver = Number(parts[3]);
  } else if (parts[0] === "v3" && parts.length === 5 && /^\d+$/.test(parts[1]!) && parts[3] === "ro") {
    payload = `v3.${parts[1]}.${parts[2]}.ro`; uid = Number(parts[1]); exp = parts[2]!; ro = true;
  } else return null;
  if (!exp || Number(exp) < Date.now()) return null;
  let okSig = false;
  for (const sec of secretsOf(env)) {
    const expected = await signWith(sec, payload);
    if (expected.length !== got.length) continue;
    let r = 0;
    for (let i = 0; i < got.length; i++) r |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    if (r === 0) { okSig = true; break; }
  }
  if (!okSig) return null;
  // po změně hesla / „Odhlásit všude“ starší přihlášení neplatí (náhled končí sám do půlnoci)
  if (!ro && (await sessVer(env, uid).catch(() => -1)) !== ver) return null;
  return { uid, ro };
}
