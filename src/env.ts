export interface Env {
  KV: KVNamespace;
  DB: D1Database;
  AI?: Ai;
  ASSETS?: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  LLM_MODEL?: string;
  PUBLIC_URL?: string;

  // vars (wrangler.jsonc)
  TZ_NAME: string;
  LAT: string;
  LON: string;
  DATA_SOURCE: "garmin" | "intervals";

  // secrets (wrangler secret put / .dev.vars) – nikdy nelogovat
  GARMIN_API_KEY?: string;
  ADMIN_TOKEN?: string;
  /** podpis přihlašovací cookie; bez něj ADMIN_TOKEN (starší cookie podepsané ADMIN_TOKEN dál platí) */
  SESSION_SECRET?: string;
  /** šifrování klíčů v D1; bez něj ADMIN_TOKEN (starší hodnoty se při čtení přešifrují) */
  SECRETS_KEY?: string;
  INTERVALS_API_KEY?: string;
  INTERVALS_ATHLETE_ID?: string;
  /** veřejný klíč Mapy.com (jde do prohlížeče, omezit na doménu v portálu Mapy.com) */
  MAPY_API_KEY?: string;
  /** Google AI Studio (aistudio.google.com → Get API key) – modely Gemma zdarma */
  GEMINI_API_KEY?: string;
  /** NVIDIA build.nvidia.com → API key – modely Nemotron zdarma */
  NVIDIA_API_KEY?: string;
}

/** Bezpečný přehled secrets: jen nastaveno / chybí, nikdy hodnota. */
export function secretStatus(env: Env): Record<string, "nastavený" | "chybí"> {
  const keys = [
    "GARMIN_API_KEY",
    "ADMIN_TOKEN",
    "SESSION_SECRET",
    "SECRETS_KEY",
    "INTERVALS_API_KEY",
    "INTERVALS_ATHLETE_ID",
  ] as const;
  const out: Record<string, "nastavený" | "chybí"> = {};
  for (const k of keys) out[k] = env[k] ? "nastavený" : "chybí";
  return out;
}
