// AI zhodnocení aktivity: 2–3 věty místo opisu čísel (čísla jsou v buňkách nad tím).
// Kontext = hotová čísla z analýzy (src/core/activity.ts). Číslo, které v kontextu není → odpověď se zahodí
// a zůstane text z kódu (goal). Výsledek se ukládá do KV natrvalo (aktivita se už nemění), takže AI běží 1× na aktivitu.
import type { Env } from "../env";
import type { ActivityAnalysis } from "../core/activity";
import { llmAvailable, numbersOk, runChat, lastModel } from "./llm";
import { stripHealth } from "../core/privacy";
import { getSettings } from "../lib/settings";

export const ACTIVITY_SYS = `Jsi osobní trenér vytrvalostních sportů (kolo, běh, běžky). Píšeš krátké zhodnocení jedné aktivity svému svěřenci.
Česky, tykej, 2–3 krátké věty, max. 60 slov. Žádné nadpisy, odrážky ani emoji.
NEOPISUJ čísla, která uživatel vidí v tabulce (čas, vzdálenost, tep, zátěž, procenta) – max. jedno číslo, jen když je klíčové.
Řekni: 1) co trénink přinesl (jaký podnět pro kondici), 2) jestli intenzita odpovídala záměru / plánu a proč, 3) jednu konkrétní radu na příště nebo na regeneraci.
Sport je v poli „sport“: run = běh (piš „běh“, ne „jízda“), xc_ski = běžky, ride / mtb / indoor = kolo (jízda).
Používej POUZE fakta z JSON kontextu, nic nevymýšlej. Jízda ve skupině (company) vysvětluje vyšší intenzitu – není to chyba.`;

export interface ActAi { text: string; model: string | null }

const kvKey = (id: string) => `actai:v1:${id}`;

export async function activityComment(env: Env, rep: ActivityAnalysis, extra: Record<string, unknown>, force = false): Promise<ActAi | null> {
  if (!force) {
    const hit = await env.KV.get<ActAi>(kvKey(rep.id), "json").catch(() => null);
    if (hit?.text) return hit;
  }
  if (!(await llmAvailable(env))) return null;
  const zones = (rows: { z: string; pct: number }[] | null) => (rows ? Object.fromEntries(rows.filter((r) => r.pct >= 1).map((r) => [r.z, Math.round(r.pct)])) : null);
  const ctx = {
    aktivita: rep.title,
    datum: rep.date,
    typ_jednotky: rep.unitType || null,
    prostredi: rep.envLabel || null,
    zakladni_udaje: Object.fromEntries(rep.basics.map(([k, v]) => [k.replace(/^\S+\s/, ""), v])),
    poznamka_kodu: rep.basicsNote || null,
    zamer_a_hodnoceni_kodu: rep.goal,
    verdikt_kodu: rep.verdict,
    tep_v_zonach_pct: zones(rep.hrZones as any),
    vykon_v_zonach_pct: zones(rep.pwrZones as any),
    kvalita: rep.quality.isQuality ? rep.quality.type : null,
    okruhy: rep.laps.show ? rep.laps.rows.slice(0, 12).map((l) => `${l.name}: ${l.time}${l.power ? `, ${l.power}` : ""}, tep ${l.hr}`) : null,
    ...extra,
  };
  // soukromí: bez dopadu na Body Battery a dalších zdravotních údajů (src/core/privacy.ts)
  const priv = !!(await getSettings(env.DB)).ai_private;
  const out = await runChat(env, [{ role: "system", content: ACTIVITY_SYS }, { role: "user", content: `KONTEXT (JSON):\n${JSON.stringify(priv ? stripHealth(ctx) : ctx)}\n\nNapiš zhodnocení.` }], 260, 0.3);
  if (!out) return null;
  const text = out.replace(/^\s*(zhodnocení|hodnocení)\s*:\s*/i, "").trim();
  if (!text || !numbersOk(text, ctx)) return null;
  const res: ActAi = { text, model: lastModel };
  await env.KV.put(kvKey(rep.id), JSON.stringify(res)).catch(() => {}); // natrvalo – nové jen přes „napsat znovu“
  return res;
}
