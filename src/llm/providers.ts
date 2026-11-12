// Poskytovatelé AI modelů (všichni přes OpenAI-kompatibilní chat/completions, kromě Workers AI):
// - google: Google AI Studio (Gemma), klíč GEMINI_API_KEY – free tier, pozor: na free tieru může Google data použít ke zlepšování
// - nvidia: build.nvidia.com (Nemotron), klíč NVIDIA_API_KEY (nvapi-…); klíč OpenRouter (sk-or-…) ve stejném poli → openrouter.ai, jen modely :free
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

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const keyOf = (env: Env, p: "google" | "nvidia") => (p === "google" ? env.GEMINI_API_KEY : env.NVIDIA_API_KEY)?.trim();
/** Do pole NVIDIA jde vložit i klíč OpenRouter (sk-or-…) – Nemotron se pak volá přes openrouter.ai. */
const isOpenRouter = (env: Env) => /^sk-or-/.test(env.NVIDIA_API_KEY?.trim() ?? "");
const base = (env: Env, p: "google" | "nvidia") => (p === "google" ? GOOGLE_URL : isOpenRouter(env) ? OPENROUTER_URL : NVIDIA_URL);

/** Seznam modelů poskytovatele (cache v KV na den). */
export async function listModels(env: Env, p: "google" | "nvidia"): Promise<string[]> {
  const key = keyOf(env, p);
  if (!key) return [];
  const kvKey = `llm_models:v4:${p}${p === "nvidia" && isOpenRouter(env) ? "-or" : ""}`;
  const cached = await env.KV.get<string[]>(kvKey, "json").catch(() => null);
  if (cached?.length) return cached;
  const res = await fetch(`${base(env, p)}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    await res.body?.cancel();
    return [];
  }
  const j = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  const ids = (j?.data ?? []).map((m) => String(m.id).replace(/^models\//, ""));
  // Google: Gemma a Gemini Flash (oba na free tieru); bez obrázků, řeči, embeddingů a náhledů
  const useful = p === "google" ? ids.filter((x) => (/gemma/i.test(x) || /^gemini-[\d.]+-flash(-lite)?$/i.test(x)) && !/image|tts|audio|live|embed|preview|exp/i.test(x)) : ids.filter((x) => /nemotron/i.test(x) && !/embed|rerank|reward|safety|guard|parse|vl\b|nano-vl|ocr/i.test(x));
  // OpenRouter: všechny Nemotrony, bezplatné (…:free) první; placené fungují jen s kreditem na klíči
  const list = p === "nvidia" && isOpenRouter(env) ? [...useful].sort((a, b) => Number(/:free$/.test(b)) - Number(/:free$/.test(a))) : useful;
  if (list.length) await env.KV.put(kvKey, JSON.stringify(list), { expirationTtl: 86400 }).catch(() => {});
  return list;
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
    // Gemini Flash (nejnovější, ne lite) odpovídá do pár sekund; Gemma 4 31B přes API trvá přes 20 s → jen záloha
    const flash = ids.filter((x) => /^gemini-[\d.]+-flash$/i.test(x)).sort((a, b) => Number(/[\d.]+/.exec(b)?.[0]) - Number(/[\d.]+/.exec(a)?.[0]));
    if (flash.length) return flash[0]!;
    const it = ids.filter((x) => /-it\b|instruct/i.test(x) || !/-e?\d+b-?pt/i.test(x));
    const pool = it.length ? it : ids;
    return [...pool].sort((a, b) => { const ra = rank(a), rb = rank(b); return rb[0] - ra[0] || rb[1] - ra[1]; })[0]!;
  }
  // OpenRouter: přednost bezplatné verze (…:free)
  const free = ids.filter((x) => /:free$/.test(x));
  const pool = free.length ? free : ids;
  // nejsilnější: Ultra (550B) → Super (120B) → ostatní
  const pref = pool.find((x) => /nemotron.*ultra/i.test(x)) ?? pool.find((x) => /nemotron.*super/i.test(x)) ?? pool.find((x) => /nemotron/i.test(x));
  return pref ?? FALLBACK.nvidia;
}

/** Které modely zkusit (v pořadí). „auto“ = Gemini Flash ×4 → Nemotron → Gemma → Workers AI podle zadaných klíčů. */
export async function modelChain(env: Env): Promise<{ p: Provider; model: string }[]> {
  const s = await getSettings(env.DB).catch(() => null);
  const pick = s?.llm_model ?? "auto";
  const chain: { p: Provider; model: string }[] = [];
  const m = /^(google|nvidia|workers):(.+)$/.exec(pick);
  if (m) chain.push({ p: m[1] as Provider, model: m[2]! });
  // vybraný model první, za ním vždy celý záložní řetěz (duplicity se odfiltrují)
  if (env.GEMINI_API_KEY) {
    chain.push({ p: "google", model: await bestModel(env, "google") });
    // „auto“: 4 nejnovější Gemini Flash (3.8 → 3.7 → 3.6 → 3.5; nejnovější bývá přetížený) → nejsilnější Nemotron → Gemma 31B → Workers AI
    const flash = (await listModels(env, "google").catch(() => [] as string[])).filter((x) => /^gemini-[\d.]+-flash$/i.test(x)).sort((a, b) => Number(/[\d.]+/.exec(b)?.[0]) - Number(/[\d.]+/.exec(a)?.[0]));
    for (const f of flash.slice(1, 4)) chain.push({ p: "google", model: f });
  }
  if (env.NVIDIA_API_KEY) chain.push({ p: "nvidia", model: await bestModel(env, "nvidia") });
  if (env.GEMINI_API_KEY) {
    const gemma = (await listModels(env, "google").catch(() => [] as string[])).filter((x) => /gemma/i.test(x) && /-it\b/i.test(x)).sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1])[0];
    if (gemma) chain.push({ p: "google", model: gemma });
  }
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

async function callOpenAi(env: Env, p: "google" | "nvidia", model: string, messages: ChatMsg[], maxTokens: number, temperature: number, timeoutMs = 25_000): Promise<ChatOut> {
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
  // OpenRouter: „přemýšlení“ se počítá do max_tokens a obsah pak bývá prázdný → nízké úsilí, skryté, s rezervou tokenů
  if (p === "nvidia" && isOpenRouter(env)) { body.reasoning = { effort: "low", exclude: true }; body.max_tokens = maxTokens + 1500; }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base(env, p)}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${(keyOf(env, p) ?? "").trim()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`${p} ${res.status}: ${txt.slice(0, 140)}`);
    const j = JSON.parse(txt) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    // případné <think>…</think> pryč
    const text = String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) throw new Error(`${p}: prázdná odpověď (${(j as any).choices?.[0]?.finish_reason ?? "?"}) ${txt.slice(0, 200)}`);
    return { text, model: `${p}:${model}`, usage: j.usage };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`${p}: bez odpovědi do ${Math.round(timeoutMs / 1000)} s`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Google AI Studio nativním API (generateContent). OpenAI-kompatibilní vrstva u Gemmy vracela 500 / 403,
 * nativní volání je spolehlivější. Gemma neumí systemInstruction → systém jde do první zprávy uživatele.
 */
async function callGoogle(env: Env, model: string, messages: ChatMsg[], maxTokens: number, temperature: number, timeoutMs: number): Promise<ChatOut> {
  const sys = messages.filter((x) => x.role === "system").map((x) => x.content).join("\n\n");
  const rest = messages.filter((x) => x.role !== "system");
  const gemma = /gemma/i.test(model);
  const i0 = rest.findIndex((x) => x.role === "user");
  const contents = rest.map((x, k) => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: gemma && k === i0 && sys ? `${sys}\n\n---\n\n${x.content}` : x.content }] }));
  // Gemini 3 „přemýšlí“ a myšlení se počítá do limitu výstupu → nízká úroveň myšlení a rezerva tokenů
  const gemini3 = /^gemini-[3-9]/i.test(model);
  const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: gemini3 || /gemma-[4-9]/i.test(model) ? maxTokens + 1500 : maxTokens, temperature, ...(gemini3 ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } };
  if (!gemma && sys) body.systemInstruction = { parts: [{ text: sys }] };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`google ${res.status}: ${(/"message":\s*"([^"]+)"/.exec(txt)?.[1] ?? txt).slice(0, 140)}`);
    const j = JSON.parse(txt) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) {
      const c0 = (j as any).candidates?.[0];
      throw new Error(`google: prázdná odpověď (${c0?.finishReason ?? "?"}, části ${c0?.content?.parts?.length ?? 0}, myšlení ${(j as any).usageMetadata?.thoughtsTokenCount ?? 0} tokenů) ${txt.slice(0, 160)}`);
    }
    return { text, model: `google:${model}`, usage: { prompt_tokens: j.usageMetadata?.promptTokenCount, completion_tokens: j.usageMetadata?.candidatesTokenCount } };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`google: bez odpovědi do ${Math.round(timeoutMs / 1000)} s`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function callWorkers(env: Env, model: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<ChatOut> {
  const r = (await env.AI!.run(model as any, { messages, max_tokens: maxTokens, temperature } as any)) as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: (r?.response ?? "").trim(), model: `workers:${model}`, usage: r?.usage };
}

async function callOne(env: Env, p: Provider, model: string, messages: ChatMsg[], maxTokens: number, temperature: number, timeoutMs = 25_000): Promise<ChatOut> {
  if (p === "workers") return callWorkers(env, model, messages, maxTokens, temperature);
  if (p === "google") return callGoogle(env, model, messages, maxTokens, temperature, timeoutMs);
  // bezplatný Nemotron přes OpenRouter je s delším kontextem pomalejší (20–40 s)
  return callOpenAi(env, p, model, messages, maxTokens, temperature, isOpenRouter(env) && timeoutMs === 25_000 ? 45_000 : timeoutMs);
}

/** Test každého modelu z řetězu zvlášť (Nastavení → AI model → Vyzkoušet): kdo odpověděl, za jak dlouho, nebo proč ne. */
export async function testModels(env: Env, only?: string): Promise<{ model: string; ok: boolean; ms: number; answer?: string; error?: string; hint?: string }[]> {
  const msgs: ChatMsg[] = [{ role: "system", content: "Jsi trenér cyklistiky. Odpovídej česky, jednou krátkou větou." }, { role: "user", content: "Co je Z2 trénink?" }];
  let chain = await modelChain(env);
  if (only) { const m = /^(google|nvidia|workers):(.+)$/.exec(only); if (m) chain = [{ p: m[1] as Provider, model: m[2]! }]; }
  return Promise.all(chain.map(async ({ p, model }) => {
    const t0 = Date.now();
    const key = p === "workers" ? null : keyOf(env, p) ?? "";
    // NVIDIA klíč začíná „nvapi-“; chyba „Invalid JWT“ = vložený jiný řetězec (např. s mezerou, uvozovkami nebo jiný typ klíče)
    const hint = p === "nvidia" && key && !/^(nvapi-|sk-or-)[\w-]{20,}$/.test(key.trim()) ? "klíč nemá tvar nvapi-… (build.nvidia.com) ani sk-or-… (openrouter.ai) – zkopíruj ho znovu" : p === "google" ? "zkontroluj klíč Google z aistudio.google.com (Get API key)" : undefined;
    try {
      const out = await callOne(env, p, model, msgs, 120, 0.2, 20_000);
      return { model: `${p}:${model}`, ok: !!out.text, ms: Date.now() - t0, answer: out.text.slice(0, 200) };
    } catch (e) {
      return { model: `${p}:${model}`, ok: false, ms: Date.now() - t0, error: ((e as Error).message || String(e)).slice(0, 200), hint: /401|403|JWT|API key|permission/i.test(String((e as Error).message)) ? hint : undefined };
    }
  }));
}

/** Chat: zkusí modely z řetězu po sobě, vrátí první neprázdnou odpověď. Chyby vrací pro log. */
export async function chat(env: Env, messages: ChatMsg[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<{ out: ChatOut | null; errors: string[] }> {
  const errors: string[] = [];
  const chain = await modelChain(env);
  // přetížený model (503 / 429) se 10 min přeskakuje – jinak by každý dotaz čekal sekundy na odmítnutí
  const busy = await Promise.all(chain.map((x) => env.KV.get(`llm_busy:${x.p}:${x.model}`).catch(() => null)));
  const live = chain.filter((_, i) => !busy[i]);
  for (const { p, model } of live.length ? live : chain) {
    try {
      const out = await callOne(env, p, model, messages, opts.maxTokens ?? 500, opts.temperature ?? 0.2);
      if (out.text) return { out, errors };
      errors.push(`${p}: prázdná odpověď`);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      errors.push(msg.slice(0, 160));
      if (/ 503| 429|bez odpovědi/.test(msg) && p !== "workers") await env.KV.put(`llm_busy:${p}:${model}`, "1", { expirationTtl: 600 }).catch(() => {});
    }
  }
  return { out: null, errors };
}

/** AI je k dispozici (nějaký klíč nebo Workers AI). */
export const anyLlm = (env: Env) => !!(env.AI || env.GEMINI_API_KEY || env.NVIDIA_API_KEY);
