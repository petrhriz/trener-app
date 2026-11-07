// Ověření Cloudflare Access JWT (hlavička Cf-Access-Jwt-Assertion). Bez Access se /api nepustí (kromě ADMIN_TOKEN).
import type { Env } from "../env";

let certCache: { at: number; keys: JsonWebKey[] } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

async function certs(team: string): Promise<JsonWebKey[]> {
  if (certCache && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  const j = (await r.json()) as { keys: JsonWebKey[] };
  certCache = { at: Date.now(), keys: j.keys };
  return j.keys;
}

export async function verifyAccess(env: Env, token: string | undefined): Promise<{ ok: boolean; email?: string; reason?: string }> {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return { ok: false, reason: "access_not_configured" };
  if (!token) return { ok: false, reason: "no_token" };
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return { ok: false, reason: "bad_token" };
  const header = JSON.parse(new TextDecoder().decode(b64url(h))) as { kid: string; alg: string };
  const payload = JSON.parse(new TextDecoder().decode(b64url(p))) as { aud: string | string[]; exp: number; iss: string; email?: string };
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return { ok: false, reason: "aud" };
  if (payload.exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  if (payload.iss !== `https://${team}`) return { ok: false, reason: "iss" };
  const jwk = (await certs(team)).find((k: any) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: "kid" };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  return ok ? { ok: true, email: payload.email } : { ok: false, reason: "signature" };
}
