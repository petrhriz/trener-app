// AI shrnutí na pozadí: po ranních datech nebo nové aktivitě je cron napíše dopředu, takže po otevření stránky už
// čekají v KV. Jedno AI volání za spuštění cronu (free plán: 10 ms CPU, 50 fetchů / D1 dotazů) – zbytek doběhne
// v dalších minutách. Stránka si shrnutí dál umí napsat sama, když ještě není hotové.
import type { Env } from "../env";
import { first } from "../lib/db";
import { addDays } from "../lib/time";
import { activityReport } from "./build";
import { type FullAct, loadCtx } from "./context";

type Ctx = Awaited<ReturnType<typeof loadCtx>>;

/** AI zhodnocení aktivity (stejné jako v detailu aktivity); null = AI nedostupná nebo odpověď neprošla kontrolou. */
export async function activityAiFor(env: Env, ctx: Ctx, a: FullAct, force = false) {
  const tag = await first<{ company: string | null }>(env.DB, "SELECT company FROM activity_tags WHERE activity_id = ?", a.id).catch(() => null);
  const rep = activityReport(ctx, a);
  const x = ((a as any).extra ?? {}) as Record<string, unknown>;
  const { activityComment } = await import("../llm/activityAi");
  const out = await activityComment(env, rep, {
    sport: a.sport,
    company: tag?.company ?? null,
    aerobni_efekt: (a as any).aerobic_te ?? null,
    anaerobni_efekt: x.ana_te ?? null,
    hlavni_prinos_garmin: x.te_label ?? null,
    dopad_body_battery: x.bb_diff ?? null,
    aerobni_drift_pct: a.drift ?? null,
    ftp: ctx.s.ftp,
    cil_treninku: ctx.s.goal,
  }, force);
  if (!out) await env.KV.put(`actai:fail:${a.id}`, "1", { expirationTtl: 6 * 3600 }).catch(() => {});
  return out;
}

/** Stránky s AI shrnutím, v pořadí, ve kterém se píšou dopředu. */
export const NOTE_PAGES = ["prehled", "trener", "zotaveni"] as const;

/**
 * Klíč shrnutí stránky: mění se jen s novými daty (aktivita, ranní spánek a VST), ne každé 3 hodiny – shrnutí
 * napsané na pozadí tak platí, dokud nepřijde něco nového. Přehled má navíc část dne (ráno / odpoledne / večer),
 * protože večer shrnuje den.
 */
export function noteKey(page: string, ctx: Pick<Ctx, "T" | "now" | "acts" | "well">): string {
  const part = page === "prehled" ? (ctx.now.hh < 12 ? "r" : ctx.now.hh < 18 ? "o" : "v") : "d";
  const last = ctx.acts[ctx.acts.length - 1]?.id ?? "-";
  const w = ctx.well.find((x) => x.date === ctx.T);
  return `ainote:v2:${page}:${ctx.T}:${part}:${ctx.acts.length}:${last}:${w?.sleep_s != null ? 1 : 0}${w?.hrv != null ? 1 : 0}`;
}

/** Nová aktivita je kompletní (okruhy, drift z intervals.icu) asi 30 min po první synchronizaci. */
const READY_MS = 30 * 60_000;

/** Jedna AI úloha na pozadí. Vrací, co udělala (pro log cronu), nebo null. */
export async function aiBackground(env: Env, at = new Date()): Promise<string | null> {
  const { llmAvailable } = await import("../llm/llm");
  if (!(await llmAvailable(env))) return null;
  const ctx = await loadCtx(env, at);
  // 1) zhodnocení nových aktivit (dnes a včera), až jsou data kompletní
  const recent = ctx.acts.filter((a) => a.date >= addDays(ctx.T, -1) && (a.moving_s ?? 0) >= 20 * 60 && (!a.seen_at || at.getTime() - Date.parse(a.seen_at) >= READY_MS)).reverse();
  for (const a of recent) {
    const has = await env.KV.get(`actai:v1:${a.id}`).catch(() => null);
    if (has) continue;
    if (await env.KV.get(`actai:fail:${a.id}`).catch(() => null)) continue;
    await activityAiFor(env, ctx, a);
    return `AI zhodnocení aktivity ${a.id}`;
  }
  // 2) shrnutí stránek – až jsou ranní data (spánek), nebo už je dopoledne (data nepřišla)
  const w = ctx.well.find((x) => x.date === ctx.T);
  if (w?.sleep_s == null && ctx.now.hh < 10) return null;
  const { pageNote } = await import("../api/misc");
  for (const page of NOTE_PAGES) {
    const key = noteKey(page, ctx);
    if (await env.KV.get(key).catch(() => null)) continue;
    if (await env.KV.get(`${key}:fail`).catch(() => null)) continue;
    const out = await pageNote(env, ctx, page, false);
    if (!out?.text) await env.KV.put(`${key}:fail`, "1", { expirationTtl: 3600 }).catch(() => {});
    return `AI shrnutí ${page}`;
  }
  return null;
}
