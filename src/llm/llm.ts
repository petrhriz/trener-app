// LLM vrstva: jen převod hotových čísel do češtiny a volné otázky. Rozhodnutí dělá kód.
// Každé číslo v odpovědi musí být v předaném kontextu, jinak se použije šablona.
import type { Env } from "../env";
import { carbsFor } from "../core/nutrition";
import { logEvent } from "../lib/db";
import { getSettings } from "../lib/settings";

const STYLE = `Jsi osobní trenér cyklistiky. Piš česky, krátce, celými větami, bez vaty a spekulací. Tykej.
Variabilitu srdeční frekvence (v kontextu „hrv“) nazývej česky VST, ne HRV.
Formát čísel: desetinná čárka (1,07), mezera před jednotkou (183 W, 77 ms), záporná čísla se znakem „−“.
Používej POUZE čísla z dodaného JSON kontextu. Žádné nové číslo nevymýšlej ani nepočítej. Co v kontextu není, napiš „nemám“.
Rozhodnutí (semafor, plán, zátěž) už udělal program – jen je vysvětli. Nejsi lékař: při příznacích nemoci, bolesti na hrudi nebo závrati doporuč odpočinek a lékaře.
Odpověz maximálně 4 větami.`;

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
  if (!env.AI) return false;
  return (await getSettings(env.DB)).llm_enabled;
}

export async function runLlm(env: Env, system: string, user: string, maxTokens = 350): Promise<string | null> {
  if (!env.AI) return null;
  const model = env.LLM_MODEL || "@cf/mistralai/mistral-small-3.1-24b-instruct";
  try {
    const r = (await env.AI.run(model as any, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    } as any)) as { response?: string };
    const t = (r?.response ?? "").trim();
    return t || null;
  } catch (e) {
    await logEvent(env.DB, "warn", `llm: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}

/** Odpověď na volnou otázku nad předpočítaným kontextem. Vrací null → volající použije šablonu. */
export async function answerQuestion(env: Env, question: string, context: Record<string, unknown>): Promise<string | null> {
  if (!(await llmAvailable(env))) return null;
  const ans = await runLlm(env, STYLE, `KONTEXT (JSON):\n${JSON.stringify(context)}\n\nOTÁZKA: ${question}`);
  if (!ans) return null;
  if (!numbersOk(ans, { ...context, question })) {
    await logEvent(env.DB, "info", "llm: odpověď obsahovala číslo mimo kontext, použita šablona");
    return null;
  }
  return ans;
}

const CHAT_STYLE = `Jsi osobní trenér cyklistiky a zdraví (také běh a běžky) a odpovídáš v chatu. Piš česky, tykej, věcně a srozumitelně.
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
  const model = env.LLM_MODEL || "@cf/mistralai/mistral-small-3.1-24b-instruct";
  const system = `${CHAT_STYLE}\n\nKONTEXT (JSON, data uživatele):\n${JSON.stringify(context)}`;
  const run1 = async (extra = "") => {
    try {
      const r = (await env.AI!.run(model as any, { messages: [{ role: "system", content: system + extra }, ...messages], max_tokens: 700, temperature: 0.3 } as any)) as { response?: string };
      return (r?.response ?? "").trim() || null;
    } catch (e) {
      await logEvent(env.DB, "warn", `chat: ${(e as Error).message.slice(0, 120)}`);
      return null;
    }
  };
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
  return { answer: ans, checked, model };
}

/** Přepis jedné věty závěru do přirozenější češtiny (volitelné, llm_polish). Čísla musí sedět. */
export async function polish(env: Env, sentence: string, context: unknown): Promise<string> {
  const s = await getSettings(env.DB);
  if (!s.llm_polish || !env.AI || !s.llm_enabled) return sentence;
  const out = await runLlm(env, STYLE, `Přepiš tuto větu přirozeněji, stejný význam, stejná čísla, max. 1 věta:\n${sentence}`, 120);
  return out && numbersOk(out, { sentence, context }) && out.length < 300 ? out : sentence;
}

/** Odpovědi bez LLM pro časté otázky (pravidla). */
export function ruleAnswer(q: string, ctx: { decisionWhy?: string; decision?: string }): string | null {
  const t = q.toLowerCase();
  const hm = /(\d+(?:[.,]\d+)?)\s*(h|hod|hodin)/.exec(t);
  const mm = /(\d+)\s*(min|minut)/.exec(t);
  if (/sacharid|gel|bidon|jíst|jist|výživ|vyziv/.test(t) && (hm || mm)) {
    const min = hm ? Number(hm[1]!.replace(",", ".")) * 60 : Number(mm![1]);
    const sharp = /interval|kvalit|vo2|práh|prah|závod|zavod/.test(t) ? "quality" : "z2";
    const c = carbsFor(min, sharp);
    const dur = hm ? `${hm[1]!.replace(".", ",")} h` : `${mm![1]} min`;
    return `Na ${dur} ${sharp === "quality" ? "ostřejší" : "klidné"} jízdy: ${c.text}. Bidon = 60 g, gel Nduranz 45 g.`;
  }
  if (/proč|proc/.test(t) && /(volno|dnes|lehč|lehc|trenaž|trenaz)/.test(t) && ctx.decisionWhy) return `${ctx.decision}: ${ctx.decisionWhy}`;
  return null;
}
