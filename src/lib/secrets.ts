// API klíče zadané v dashboardu: šifrované v D1 (AES-GCM, klíč odvozený z ADMIN_TOKEN).
// Přednost má hodnota z dashboardu, záloha jsou secrets Workeru (.dev.vars → wrangler secret).
import type { Env } from "../env";

export const EDITABLE_SECRETS = ["GARMIN_API_KEY", "INTERVALS_API_KEY", "INTERVALS_ATHLETE_ID", "MAPY_API_KEY", "GEMINI_API_KEY", "NVIDIA_API_KEY"] as const;
export type EditableSecret = (typeof EDITABLE_SECRETS)[number];

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(env: Env): Promise<CryptoKey> {
  if (!env.ADMIN_TOKEN) throw new Error("ADMIN_TOKEN chybí – bez něj nejde šifrovat");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`trener-secrets:${env.ADMIN_TOKEN}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(env: Env, stored: string): Promise<string> {
  const [iv, ct] = stored.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await aesKey(env), unb64(ct!));
  return new TextDecoder().decode(pt);
}

// cache zvlášť pro každého uživatele (env uživatele čte jeho tabulku app_secrets)
const caches = new Map<number, { at: number; values: Partial<Record<EditableSecret, string>> }>();
const uidOf = (env: Env): number => (env as any).__uid ?? 1;
/** klíče, které si zadává každý sám (mapové klíče jsou společné – zadává je vlastník) */
export const USER_SECRETS: readonly EditableSecret[] = ["GARMIN_API_KEY", "INTERVALS_API_KEY", "INTERVALS_ATHLETE_ID"];
export const secretsFor = (env: Env): readonly EditableSecret[] => (uidOf(env) === 1 ? EDITABLE_SECRETS : USER_SECRETS);
const fileValues = new WeakMap<object, Partial<Record<EditableSecret, string>>>();

/** Načte klíče z D1 a přepíše jimi env pro tento běh (cache 5 min v isolate). */
export async function applySecrets(env: Env): Promise<void> {
  if (!fileValues.has(env as object)) fileValues.set(env as object, Object.fromEntries(EDITABLE_SECRETS.map((k) => [k, (env as any)[k]])));
  let cache = caches.get(uidOf(env));
  if (!cache || Date.now() - cache.at > 5 * 60_000) {
    const values: Partial<Record<EditableSecret, string>> = {};
    try {
      const rows = await env.DB.prepare("SELECT key, value FROM app_secrets").all<{ key: string; value: string }>();
      for (const r of rows.results ?? []) {
        if ((EDITABLE_SECRETS as readonly string[]).includes(r.key)) {
          try { values[r.key as EditableSecret] = await decryptSecret(env, r.value); } catch { /* jiný ADMIN_TOKEN → ignorovat */ }
        }
      }
    } catch { /* tabulka ještě není */ }
    cache = { at: Date.now(), values };
    caches.set(uidOf(env), cache);
  }
  // klíč z dashboardu má přednost; smazaný se vrátí na původní hodnotu (soubor / wrangler secret)
  const orig = fileValues.get(env as object) ?? {};
  for (const k of EDITABLE_SECRETS) (env as any)[k] = cache.values[k] || orig[k];
}

export function invalidateSecrets() {
  caches.clear();
}

/** Stav klíčů pro dashboard (bez hodnot – jen zdroj a poslední 4 znaky). */
export function secretInfo(env: Env) {
  const cache = caches.get(uidOf(env));
  return secretsFor(env).map((k) => {
    const dash = cache?.values[k];
    const file = fileValues.get(env as object)?.[k] ?? null;
    const v = dash || file;
    return { key: k, source: dash ? "dashboard" : file ? "soubor" : null, hint: v ? `…${v.slice(-4)}` : null };
  });
}
