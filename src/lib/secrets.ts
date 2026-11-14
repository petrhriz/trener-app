// API klíče zadané v dashboardu: šifrované v D1 (AES-GCM, klíč odvozený ze SECRETS_KEY, bez něj z ADMIN_TOKEN).
// Hodnoty zašifrované dřív ADMIN_TOKENem se při čtení přešifrují novým klíčem – pak jde ADMIN_TOKEN vyměnit.
// Přednost má hodnota z dashboardu, záloha jsou secrets Workeru (.dev.vars → wrangler secret).
import type { Env } from "../env";
import { logEvent, logged } from "./db";

export const EDITABLE_SECRETS = ["GARMIN_API_KEY", "INTERVALS_API_KEY", "INTERVALS_ATHLETE_ID", "MAPY_API_KEY", "GEMINI_API_KEY", "NVIDIA_API_KEY"] as const;
export type EditableSecret = (typeof EDITABLE_SECRETS)[number];

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const keySecrets = (env: Env): string[] => [...new Set([env.SECRETS_KEY, env.ADMIN_TOKEN].filter((x): x is string => !!x))];
async function aesKey(env: Env, secret = keySecrets(env)[0]): Promise<CryptoKey> {
  if (!secret) throw new Error("SECRETS_KEY ani ADMIN_TOKEN není nastavený – bez něj nejde šifrovat");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`trener-secrets:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}

/** Dešifruje; `legacy` = šlo jen starším klíčem (ADMIN_TOKEN) → hodnotu přešifrovat. */
export async function decryptSecret(env: Env, stored: string): Promise<string> {
  return (await decryptAny(env, stored)).value;
}
async function decryptAny(env: Env, stored: string): Promise<{ value: string; legacy: boolean }> {
  const [iv, ct] = stored.split(".");
  const secs = keySecrets(env);
  for (let i = 0; i < secs.length; i++) {
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await aesKey(env, secs[i]), unb64(ct!));
      return { value: new TextDecoder().decode(pt), legacy: i > 0 };
    } catch { /* zkusit další klíč */ }
  }
  throw new Error("klíč nejde dešifrovat");
}

// cache zvlášť pro každého uživatele (env uživatele čte jeho tabulku app_secrets)
const caches = new Map<number, { at: number; values: Partial<Record<EditableSecret, string>> }>();
const uidOf = (env: Env): number => (env as any).__uid ?? 1;
/** klíče, které si zadává každý sám (mapové klíče jsou společné – zadává je vlastník) */
export const USER_SECRETS: readonly EditableSecret[] = ["GARMIN_API_KEY", "INTERVALS_API_KEY", "INTERVALS_ATHLETE_ID"];
export const secretsFor = (env: Env): readonly EditableSecret[] => (uidOf(env) === 1 ? EDITABLE_SECRETS : USER_SECRETS);
const fileValues = new WeakMap<object, Partial<Record<EditableSecret, string>>>();

/** Klíče jednoho uživatele z jeho tabulky app_secrets (cache 5 min v isolate). */
async function valuesOf(env: Env, db: D1Database, uid: number): Promise<Partial<Record<EditableSecret, string>>> {
  let cache = caches.get(uid);
  if (!cache || Date.now() - cache.at > 5 * 60_000) {
    const values: Partial<Record<EditableSecret, string>> = {};
    try {
      const rows = await db.prepare("SELECT key, value FROM app_secrets").all<{ key: string; value: string }>();
      for (const r of rows.results ?? []) {
        if ((EDITABLE_SECRETS as readonly string[]).includes(r.key)) {
          try {
            const d = await decryptAny(env, r.value);
            values[r.key as EditableSecret] = d.value;
            if (d.legacy) await db.prepare("UPDATE app_secrets SET value = ? WHERE key = ?").bind(await encryptSecret(env, d.value), r.key).run().catch(logged(db, `klíč ${r.key} se nepřešifroval`, undefined));
          } catch {
            // žádný klíč nesedí (vyměněný ADMIN_TOKEN bez SECRETS_KEY) – zapsat do logu, ať to není tiché
            await logEvent(db, "error", `klíč ${r.key} nejde dešifrovat – zadej ho znovu v Nastavení`);
          }
        }
      }
    } catch { /* tabulka ještě není */ }
    cache = { at: Date.now(), values };
    caches.set(uid, cache);
  }
  return cache.values;
}

/**
 * Načte klíče z D1 a přepíše jimi env pro tento běh. Další uživatelé zadávají jen svoje klíče k datům (Garmin,
 * intervals.icu); společné klíče (AI – Gemini, NVIDIA – a mapy) berou od vlastníka.
 */
export async function applySecrets(env: Env): Promise<void> {
  if (!fileValues.has(env as object)) fileValues.set(env as object, Object.fromEntries(EDITABLE_SECRETS.map((k) => [k, (env as any)[k]])));
  const uid = uidOf(env);
  const own = await valuesOf(env, env.DB, uid);
  const base = (env as any).__base as Env | undefined;
  const owner = uid !== 1 && base ? await valuesOf(base, base.DB, 1) : own;
  // klíč z dashboardu má přednost; smazaný se vrátí na původní hodnotu (soubor / wrangler secret)
  const orig = fileValues.get(env as object) ?? {};
  for (const k of EDITABLE_SECRETS) (env as any)[k] = (USER_SECRETS.includes(k) ? own[k] : owner[k]) || orig[k];
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
