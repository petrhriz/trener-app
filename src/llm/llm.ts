// LLM vrstva: chat a krátká shrnutí nad hotovými čísly. Rozhodnutí dělá kód.
// Každé číslo v odpovědi musí být v předaném kontextu, jinak se použije šablona.
import type { Env } from "../env";
import { logEvent } from "../lib/db";
import { getSettings } from "../lib/settings";
import { anyLlm, chat, type ChatMsg } from "./providers";

/** Čísla v textu (2 tvary: s tečkou i čárkou, „−“ jako mínus). */
export function numbersIn(text: string): number[] {
  return [...text.replace(/−/g, "-").matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
}

/** Kontrola: každé číslo z odpovědi je v kontextu (tolerance zaokrouhlení na 1 desetinné místo). */
export function numbersOk(answer: string, context: unknown): boolean {
  const ctxNums = numbersIn(JSON.stringify(context));
  const allowed = new Set<number>();
  for (const n of ctxNums) {
    allowed.add(n);
    allowed.add(Math.round(n));
    allowed.add(Math.round(n * 10) / 10);
    allowed.add(Math.abs(n));
    allowed.add(Math.abs(Math.round(n * 10) / 10));
  }
  // drobná čísla (pořadí, Z1–Z7, 1–7 dní) a pravidla 60/90 g/h jsou povolená vždy
  for (let i = 0; i <= 10; i++) allowed.add(i);
  return numbersIn(answer).every((n) => allowed.has(n) || allowed.has(Math.abs(n)));
}

export async function llmAvailable(env: Env): Promise<boolean> {
  if (!anyLlm(env)) return false;
  return (await getSettings(env.DB)).llm_enabled;
}

/**
 * Spotřeba Workers AI (free: 10 000 neuronů denně na celý účet – sdílejí ho všichni uživatelé).
 * Odhad z tokenů: Mistral Small 3.1 ≈ 0,032 neuronu na vstupní a 0,050 na výstupní token (ceník Workers AI);
 * když model počty tokenů nevrátí, 1 token ≈ 4 znaky.
 */
export const AI_DAILY_NEURONS = 10_000;
export async function trackAi(env: Env, inChars: number, r: { usage?: { prompt_tokens?: number; completion_tokens?: number }; response?: string } | null) {
  try {
    const inT = r?.usage?.prompt_tokens ?? Math.ceil(inChars / 4);
    const outT = r?.usage?.completion_tokens ?? Math.ceil((r?.response ?? "").length / 4);
    const n = inT * 0.032 + outT * 0.05;
    const base: Env = (env as any).__base ?? env;
    const key = `ai_neurons:${new Date().toISOString().slice(0, 10)}`;
    await base.DB.prepare("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS REAL) + CAST(excluded.value AS REAL) AS TEXT)").bind(key, String(Math.round(n * 10) / 10)).run();
  } catch { /* počítadlo není nutné */ }
}
export async function aiUsedToday(env: Env): Promise<number> {
  const base: Env = (env as any).__base ?? env;
  const r = await base.DB.prepare("SELECT value FROM sync_state WHERE key = ?").bind(`ai_neurons:${new Date().toISOString().slice(0, 10)}`).first<{ value: string }>().catch(() => null);
  return r ? Math.round(Number(r.value) || 0) : 0;
}

/** Poslední použitý model (pro Nastavení / odpověď chatu). */
export let lastModel: string | null = null;
export const getLastModel = () => lastModel;

/** Jedno volání modelu (řetěz Gemma → Nemotron → Workers AI, src/llm/providers.ts). null = nic neodpovědělo. */
export async function runChat(env: Env, messages: ChatMsg[], maxTokens = 350, temperature = 0.2): Promise<string | null> {
  const { out, errors } = await chat(env, messages, { maxTokens, temperature });
  if (errors.length) await logEvent(env.DB, "warn", `llm: ${errors.join(" | ").slice(0, 240)}`).catch(() => {});
  if (!out) return null;
  lastModel = out.model;
  if (out.model.startsWith("workers:")) await trackAi(env, messages.reduce((t, m) => t + m.content.length, 0), { usage: out.usage, response: out.text });
  return out.text || null;
}

export async function runLlm(env: Env, system: string, user: string, maxTokens = 350): Promise<string | null> {
  return runChat(env, [{ role: "system", content: system }, { role: "user", content: user }], maxTokens, 0.2);
}

export const CHAT_STYLE = `Jsi osobní trenér cyklistiky a zdraví (také běh a běžky) a odpovídáš v chatu. Piš česky, tykej, věcně a srozumitelně.
Variabilitu srdeční frekvence nazývej VST. Desetinná čárka, mezera před jednotkou.
Otázky na sportovce (trénink, plán, spánek, zotavení, zátěž, aktivity) odpovídej z dat v KONTEXTU – čísla ber jen odtud, nic nevymýšlej; co v datech není, řekni „to v datech nemám“.
Když je v KONTEXTU „stranka_kterou_vidi“, uživatel se ptá na tu stránku dashboardu – vysvětli čísla z ní a co z nich plyne.
Obecné otázky (technika, výživa, vybavení, vosk na běžky…) odpovídej z obecných znalostí, stručně.
Rozhodnutí o plánu dělá program – vysvětli ho, případně navrhni změnu, kterou si uživatel udělá v Trenérovi.
Nejsi lékař: při bolesti na hrudi, závrati nebo horečce doporuč klid a lékaře. Odpověď max. 8 vět nebo krátký seznam.`;

/**
 * Chat nad daty. Kontrola čísel: odpověď s číslem, které v kontextu ani v otázce není, se zkusí jednou znovu;
 * když ani pak nesedí, vrátí se s příznakem `checked: false` (UI ukáže upozornění).
 */
export async function answerChat(
  env: Env,
  messages: { role: "user" | "assistant"; content: string }[],
  context: Record<string, unknown>,
): Promise<{ answer: string; checked: boolean; model: string } | null> {
  if (!(await llmAvailable(env))) return null;
  const system = `${CHAT_STYLE}\n\nKONTEXT (JSON, data uživatele):\n${JSON.stringify(context)}`;
  const run1 = (extra = "") => runChat(env, [{ role: "system", content: system + extra }, ...messages], 700, 0.3);
  const allText = { context, q: messages.map((m) => m.content).join(" ") };
  let ans = await run1();
  if (!ans) return null;
  let checked = numbersOk(ans, allText);
  if (!checked) {
    const again = await run1("\n\nPOZOR: v minulé odpovědi bylo číslo, které v kontextu není. Používej jen čísla z kontextu.");
    if (again) {
      ans = again;
      checked = numbersOk(again, allText);
    }
  }
  return { answer: ans, checked, model: lastModel ?? "?" };
}

