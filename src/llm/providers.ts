// Poskytovatelé AI modelů (všichni přes OpenAI-kompatibilní chat/completions, kromě Workers AI):
// - google: Google AI Studio (Gemma), klíč GEMINI_API_KEY – free tier, pozor: na free tieru může Google data použít ke zlepšování
// - nvidia: build.nvidia.com (Nemotron), klíč NVIDIA_API_KEY – free kredity pro vývojáře
// - workers: Cloudflare Workers AI (Mistral Small) – záloha, když nic jiného není nebo selže
import type { Env } from "../env";
import { getSettings } from "../lib/settings";

export type Provider = "google" | "nvidia" | "workers";
export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface ChatOut {
  text: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const GOOGLE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1";
export const WORKERS_DEFAULT = "@cf/mistralai/mistral-small-3.1-24b-instruct";
/** výchozí modely, když se seznam od poskytovatele nepodaří načíst */
const FALLBACK: Record<"google" | "nvidia", string> = { google: "gemma-3-27b-it", nvidia: "nvidia/llama-3.3-nemotron-super-49b-v1.5" };

const base = (p: "google" | "nvidia") => (p === "google" ? GOOGLE_URL : NVIDIA_URL);
const keyOf = (env: Env, p: "google" | "nvidia") => (p === "google" ? env.GEMINI_API_KEY : env.NVIDIA_API_KEY);

/** Seznam modelů poskytovatele (cache v KV na den). */
export async function listModels(env: Env, p: "google" | "nvidia"): Promise<string[]> {
  const key = keyOf(env, p);
  if (!key) return [];
  const kvKey = `llm_models:${p}`;
  const cached = await env.KV.get<string[]>(kvKey, "json").catch(() => null);
  if (cached?.length) return cached;
  const res = await fetch(`${base(p)}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    await res.body?.cancel();
    return [];
  }
  const j = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  const ids = (j?.data ?? []).map((m) => String(m.id).replace(/^models\//, ""));
  const useful = p === "google" ? ids.filter((x) => /gemma/i.test(x)) : ids.filter((x) => /nemotron/i.test(x) && !/embed|rerank|reward|safety|guard|parse|vl\b|nano-vl|ocr/i.test(x));
  if (useful.length) await env.KV.put(kvKey, JSON.stringify(useful), { expirationTtl: 86400 }).catch(() => {});
  return useful;
}

/** Číslo verze a velikost z názvu („gemma-4-31b-it“ → [4, 31]) – na výběr nejnovějšího a největšího. */
function rank(id: string): [number, number] {
  const v = /gemma-?(\d+(?:\.\d+)?)/i.exec(id)?.[1] ?? /v(\d+(?:\.\d+)?)/i.exec(id)?.[1] ?? "0";
  const b = /(\d+(?:\.\d+)?)b\b/i.exec(id)?.[1] ?? "0";
  return [Number(v), Number(b)];
}

/** Nejlepší dostupný model poskytovatele: Gemma nejnovější verze a největší (instrukční), Nemotron „super“. */
export async function bestModel(env: Env, p: "google" | "nvidia"): Promise<string> {
  const ids = await listModels(env, p).catch(() => [] as string[]);
  if (!ids.length) return FALLBACK[p];
  if (p === "google") {
    const it = ids.filter((x) => /-it\b|instruct/i.test(x) || !/-e?\d+b-?pt/i.test(x));
    const pool = it.length ? it : ids;
    return [...pool].sort((a, b) => { const ra = rank(a), rb = rank(b); return rb[0] - ra[0] || rb[1] - ra[1]; })[0]!;
  }
  const pref = ids.find((x) => /nemotron.*super/i.test(x)) ?? ids.find((x) => /nemotron.*ultra/i.test(x)) ?? ids.find((x) => /nemotron/i.test(x));
  return pref ?? FALLBACK.nvidia;
}

/** Které modely zkusit (v pořadí). Nastavení „auto“ = Gemma → Nemotron → Workers AI podle zadaných klíčů. */
export async function modelChain(env: Env): Promise<{ p: Provider; model: string }[]> {
  const s = await getSettings(env.DB).catch(() => null);
  const pick = s?.llm_model ?? "auto";
  const chain: { p: Provider; model: string }[] = [];
  const m = /^(google|nvidia|workers):(.+)$/.exec(pick);
  if (m) chain.push({ p: m[1] as Provider, model: m[2]! });
  if (!m || m[1] !== "google") if (env.GEMINI_API_KEY) chain.push({ p: "google", model: await bestModel(env, "google") });
  if (!m || m[1] !== "nvidia") if (env.NVIDIA_API_KEY) chain.push({ p: "nvidia", model: await bestModel(env, "nvidia") });
  if (env.AI) chain.push({ p: "workers", model: env.LLM_MODEL || WORKERS_DEFAULT });
  // bez duplicit, jen ty, které mají klíč
  const seen = new Set<string>();
  return chain.filter((x) => {
    const k = `${x.p}:${x.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return x.p === "workers" ? !!env.AI : !!keyOf(env, x.p);
  });
}

async function callOpenAi(env: Env, p: "google" | "nvidia", model: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<ChatOut> {
  // Gemma v Google API neumí roli „system“ (Developer instruction is not enabled) → vloží se do první zprávy uživatele
  let msgs = messages;
  if (p === "google" && /gemma/i.test(model)) {
    const sys = messages.filter((x) => x.role === "system").map((x) => x.content).join("\n\n");
    const rest = messages.filter((x) => x.role !== "system");
    const i = rest.findIndex((x) => x.role === "user");
    msgs = rest.map((x, k) => (k === i && sys ? { ...x, content: `${sys}\n\n---\n\n${x.content}` } : x));
  }
  const body: Record<string, unknown> = { model, messages: msgs, max_tokens: maxTokens, temperature };
  // Nemotron: bez „přemýšlení“ nahlas (rychlejší, kratší odpověď)
  if (p === "nvidia" && /nemotron/i.test(model)) body.messages = [{ role: "system", content: "/no_think" }, ...msgs];
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const res = await fetch(`${base(p)}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${keyOf(env, p)}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`${p} ${res.status}: ${txt.slice(0, 140)}`);
    const j = JSON.parse(txt) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    // případné <think>…</think> pryč
    const text = String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return { text, model: `${p}:${model}`, usage: j.usage };
  } finally {
    clearTimeout(t);
  }
}

async function callWorkers(env: Env, model: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<ChatOut> {
  const r = (await env.AI!.run(model as any, { messages, max_tokens: maxTokens, temperature } as any)) as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: (r?.response ?? "").trim(), model: `workers:${model}`, usage: r?.usage };
}

/** Chat: zkusí modely z řetězu po sobě, vrátí první neprázdnou odpověď. Chyby vrací pro log. */
export async function chat(env: Env, messages: ChatMsg[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<{ out: ChatOut | null; errors: string[] }> {
  const errors: string[] = [];
  for (const { p, model } of await modelChain(env)) {
    try {
      const out = p === "workers" ? await callWorkers(env, model, messages, opts.maxTokens ?? 500, opts.temperature ?? 0.2) : await callOpenAi(env, p, model, messages, opts.maxTokens ?? 500, opts.temperature ?? 0.2);
      if (out.text) return { out, errors };
      errors.push(`${p}: prázdná odpověď`);
    } catch (e) {
      errors.push(((e as Error).message || String(e)).slice(0, 160));
    }
  }
  return { out: null, errors };
}

/** AI je k dispozici (nějaký klíč nebo Workers AI). */
export const anyLlm = (env: Env) => !!(env.AI || env.GEMINI_API_KEY || env.NVIDIA_API_KEY);
