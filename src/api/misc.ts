// Stav (nemoc / zranění / dovolená), přesun kvality, kalendář měsíce, chat s AI.
import { pageAllowedPrivate, stripHealth } from "../core/privacy";
import { Hono } from "hono";
import type { Env } from "../env";
import { noteKey } from "../report/aiBackground";
import { STATUS_LABEL, type StatusKind } from "../core/readinessScore";
import { AI_DAILY_NEURONS, aiUsedToday, answerChat } from "../llm/llm";
import { all } from "../lib/db";
import { getSettings, setSetting, statusOn } from "../lib/settings";
import { addDays } from "../lib/time";
import { dayDm } from "../lib/format";
import { ownRideName, ownRideNote, parseOwnRide } from "../core/ownRide";
import { addConstraint, applyChanges, saveProposal } from "../plan/proposals";
import { planFor, readiness } from "../report/build";
import { loadCtx } from "../report/context";

export const misc = new Hono<{ Bindings: Env; Variables: { uid: number } }>();
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Druh jednotky dne: „z2“ = místo kvality Z2, „quality“ = kvalita sem, „auto“ = podle plánu. */
misc.post("/plan/day", async (c) => {
  const { date, type } = (await c.req.json()) as { date: string; type: string };
  if (!isDate(date) || !["z2", "quality", "auto"].includes(type)) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, "typ", type);
  const p = await planFor(await loadCtx(c.env));
  return c.json({ id: await saveProposal(c.env, "dashboard", p.changes), changes: p.changes });
});

/** Stav (nemoc / zranění / dovolená). Dny stavu se v plánu zablokují; smazání tréninků se zapíše hned (bez potvrzování). */
misc.post("/status", async (c) => {
  const { kind, until } = (await c.req.json()) as { kind: string; until?: string | null };
  if (!["active", "sick", "injured", "vacation"].includes(kind) || (until != null && !isDate(until))) return c.json({ error: "bad input" }, 400);
  const ctx0 = await loadCtx(c.env);
  const prev = ctx0.s.status;
  const T = ctx0.T;
  // návrat do aktivního: konec stavu = včera (2 dny po nemoci lehce řeší plán)
  const val =
    kind === "active"
      ? prev && prev.kind !== "active" ? { ...prev, until: addDays(T, -1) } : { kind: "active" as const, from: null, until: null }
      : { kind: kind as "sick" | "injured" | "vacation", from: T, until: until ?? null };
  // ukončené období stavu si zapamatovat: trenér pak ví, že slabý týden byl nemoc / dovolená, ne změna návyku
  if (prev && prev.kind !== "active" && prev.from && (kind === "active" || kind !== prev.kind)) {
    const end = prev.until && prev.until < T ? prev.until : addDays(T, -1);
    if (end >= prev.from) await setSetting(c.env.DB, "status_log", [...(ctx0.s.status_log ?? []), { kind: prev.kind, from: prev.from, until: end }].slice(-30));
  }
  await setSetting(c.env.DB, "status", val);
  const p = await planFor(await loadCtx(c.env));
  let removed = 0;
  let rest = p.changes;
  if (kind !== "active") {
    const del = p.changes.filter((x) => x.action === "smazat");
    if (del.length) {
      await applyChanges(c.env, del);
      removed = del.length;
    }
    rest = p.changes.filter((x) => x.action !== "smazat");
  }
  const id = await saveProposal(c.env, "stav", rest);
  return c.json({ ok: true, status: val, removed, proposal: { id, count: rest.length } });
});

/** Kalendář měsíce: aktivity, spánek, kroky, Body Battery, plán. ?month=YYYY-MM */
misc.get("/calendar", async (c) => {
  const s = await getSettings(c.env.DB);
  const q = c.req.query("month") ?? "";
  const ctx = await loadCtx(c.env);
  const month = /^\d{4}-\d{2}$/.test(q) ? q : ctx.T.slice(0, 7);
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  const from = `${month}-01`;
  const to = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  const [acts, well, plan] = await Promise.all([
    all<any>(c.env.DB, "SELECT id, date, sport, name, distance_m, moving_s, load FROM activities WHERE date >= ? AND date <= ? ORDER BY start_local", from, to),
    all<any>(c.env.DB, "SELECT date, sleep_score, sleep_s, steps, bb_max, hrv, rhr FROM wellness WHERE date >= ? AND date <= ?", from, to),
    all<any>(c.env.DB, "SELECT date, name, kind, status, sport FROM planned_workouts WHERE date >= ? AND date <= ? AND status IN ('planned', 'done', 'missed')", from, to),
  ]);
  return c.json({
    month, from, to, today: ctx.T, stepsGoal: 5000,
    acts: acts.map((a) => ({ id: a.id, date: a.date, sport: a.sport, name: a.name, km: a.distance_m ? Math.round(a.distance_m / 100) / 10 : null, min: Math.round((a.moving_s ?? 0) / 60), load: a.load == null ? null : Math.round(a.load) })),
    well,
    plan,
    status: s.status,
  });
});

/** Chat s AI nad tvými daty (Workers AI). messages = [{role: "user" | "assistant", content}] */
/** Vlastní jízda z dashboardu: {date, min, km?, with?}; min = 0 → zrušit. */
misc.post("/plan/own", async (c) => {
  const { date, min, km, with: w } = (await c.req.json()) as { date: string; min: number; km?: number | null; with?: string | null };
  if (!isDate(date) || !(min >= 0 && min <= 720)) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, "jizda", min > 0 ? ownRideNote({ min: Math.round(min), km: km ? Math.round(km) : null, with: w?.trim() || null }) : null);
  const p = await planFor(await loadCtx(c.env));
  return c.json({ id: await saveProposal(c.env, "dashboard", p.changes), changes: p.changes });
});

misc.post("/chat", async (c) => {
  const { messages, page } = (await c.req.json()) as { messages: { role: string; content: string }[]; page?: { title?: string; text?: string; hash?: string } | null };
  if (!Array.isArray(messages) || !messages.length) return c.json({ error: "bad input" }, 400);
  const msgs = messages.slice(-10).map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user", content: String(m.content ?? "").slice(0, 2000) }));
  let ctx = await loadCtx(c.env);
  // „zítra jedu 4 h s Honzou“ → rovnou zapsat do plánu (bez LLM), odpověď = co se změnilo
  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const own = parseOwnRide(lastUser, ctx.T);
  if (own) {
    await addConstraint(c.env, own.date, "jizda", ownRideNote(own));
    ctx = await loadCtx(c.env);
    const p = await planFor(ctx);
    const pid = await saveProposal(c.env, "chat", p.changes);
    const wk = p.days.filter((d) => d.load > 0).map((d) => `- ${dayDm(d.date)}: ${d.name ?? d.tag} (${d.durationMin ?? 0} min, zátěž ${d.load})`).join("\n");
    return c.json({ answer: `Zapsáno: **${dayDm(own.date)} – ${ownRideName(own)}**. Zátěž jízdy počítám do týdne a zbytek plánu jsem přepočítal:

${wk}

Změny (${p.changes.length}) čekají na potvrzení v Trenérovi → Návrh změn.${own.with ? " U jízdy s někým se nedivím, když Z2 přetáhneš – v rozboru aktivity to označ „Jel jsem s někým“." : ""}`, checked: true, action: { kind: "jizda", date: own.date, proposal: pid } });
  }
  // soukromí: bez zdravotních údajů a bez obsahu stránek, které je ukazují (Zotavení, Přehled…)
  const priv = !!ctx.s.ai_private;
  const showPage = !!page?.text && (!priv || pageAllowedPrivate(String(page.hash ?? "")));
  const context = {
    ...(priv ? stripHealth(await aiContext(c.env, ctx)) : await aiContext(c.env, ctx)),
    // co uživatel právě vidí na stránce dashboardu (panel 🤖) – odpovídej hlavně k tomu
    ...(showPage ? { stranka_kterou_vidi: { nazev: String(page!.title ?? "").slice(0, 80), obsah: String(page!.text).slice(0, 3500) } } : {}),
  };
  const out = await answerChat(c.env, msgs, context);
  if (!out) return c.json({ error: "AI teď neodpovídá (Workers AI nedostupné, nebo vypnuté v Nastavení)." }, 503);
  return c.json({ ...out, ai: { used: await aiUsedToday(c.env), limit: AI_DAILY_NEURONS } });
});

/** Kolik denního limitu Workers AI už padlo (odhad, celý účet). */
misc.get("/ai-usage", async (c) => c.json({ used: await aiUsedToday(c.env), limit: AI_DAILY_NEURONS }));

/**
 * Data pro AI (chat, shrnutí na stránkách): dnešek, plán, posledních 30 dní zdraví, aktivity 45 dní,
 * součty po měsících (14 měsíců) a po letech – ať AI umí i „porovnej srpen se zářím“.
 */
export async function aiContext(env: Env, ctx: Awaited<ReturnType<typeof loadCtx>>) {
  const r = await readiness(ctx);
  const tw = ctx.well.find((w) => w.date === ctx.T) ?? null;
  const st = statusOn(ctx.s, ctx.T);
  const tags = new Map((await all<{ activity_id: string; company: string }>(env.DB, "SELECT activity_id, company FROM activity_tags").catch(() => [])).map((t) => [t.activity_id, t.company]));
  return {
    dnes: ctx.T,
    cas: `${ctx.now.hh}:${String(ctx.now.mm).padStart(2, "0")}`,
    stav: STATUS_LABEL[st.kind as StatusKind],
    cil: ctx.s.goal,
    ftp_w: ctx.s.ftp,
    zony_tepu_od: ctx.s.hr_zones?.floors ?? null,
    semafor: r.recovery.stateLabel,
    vst_ms: r.recovery.hrv.today,
    klidovy_tep: r.recovery.rhr.today,
    spanek: tw ? { delka_h: tw.sleep_s ? Math.round((tw.sleep_s / 3600) * 10) / 10 : null, skore: tw.sleep_score, hluboky_min: tw.deep_s ? Math.round(tw.deep_s / 60) : null, rem_min: tw.rem_s ? Math.round(tw.rem_s / 60) : null, potreba_dnes_min: tw.next_sleep_need_min } : null,
    body_battery: { rano: tw?.bb_max ?? null, ted: tw?.bb_latest ?? null },
    // stres: průměr dne z Garminu (0–100) + tvoje norma 30 dní a slovní hodnocení – AI nesmí sama soudit „vysoký“
    stres_dne: (() => {
      const v = tw?.stress_avg ?? null;
      const xs = ctx.well.filter((w) => w.date < ctx.T && w.date >= addDays(ctx.T, -30) && w.stress_avg != null).map((w) => w.stress_avg!);
      const m = xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null;
      const sd = xs.length > 2 && m != null ? Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / xs.length) : null;
      const word = v == null ? null : v < 26 ? "klid" : v < 51 ? "nízký" : v < 76 ? "střední" : "vysoký";
      const vsNorm = v == null || m == null || sd == null ? null : Math.abs(v - m) <= Math.max(sd, 3) ? "v normě" : v > m ? "nad normou" : "pod normou";
      return { prumer_dne: v, stupnice_garmin: "0–25 klid, 26–50 nízký, 51–75 střední, 76–100 vysoký", hodnoceni: word, norma_30_dni: m != null ? Math.round(m) : null, proti_norme: vsNorm };
    })(),
    kroky: tw?.steps ?? null,
    kondice: { ctl: r.fitness.ctl, atl: r.fitness.atl, forma: r.fitness.form, zatez_7_dni: r.fitness.load7 },
    dnesni_rozhodnuti: `${r.today.decision}: ${r.today.decisionWhy}`,
    dnesni_trenink: r.today.done.length ? `odjeto: ${r.today.done.map((x) => x.name).join(", ")}` : r.today.day?.name ? `${r.today.day.name}, ${r.today.day.durationMin} min, ${r.today.day.targetText ?? ""}` : "volno",
    plan_7_dni: r.plan.days.map((d) => ({ datum: d.date, trenink: d.name ?? d.tag, druh: d.kind, sport: d.sport, minut: d.durationMin, zatez: d.load, cil: d.targetText, kroky: d.steps })),
    tydenni_cil_zateze: r.plan.weeklyTarget,
    posledni_aktivity: ctx.acts.slice(-8).reverse().map((a) => ({ datum: a.date, sport: a.sport, nazev: a.name, s_kym: tags.get(a.id) ?? null, km: a.distance_m ? Math.round(a.distance_m / 100) / 10 : null, minut: Math.round((a.moving_s ?? 0) / 60), zatez: a.load, np_w: a.np, tep: a.avg_hr })),
    pocasi_dnes: r.plan.days.find((d) => d.date === ctx.T)?.weatherText ?? null,
    zdravi_30_dni: ctx.well.filter((w) => w.date >= addDays(ctx.T, -30)).map((w) => ({ d: w.date.slice(5), vst: w.hrv ?? null, tep: w.rhr ?? null, spanek_h: w.sleep_s ? Math.round((w.sleep_s / 3600) * 10) / 10 : null, skore: w.sleep_score ?? null, stres: w.stress_avg ?? null, kroky: w.steps ?? null })),
    aktivity_45_dni: ctx.acts.filter((a) => a.date >= addDays(ctx.T, -45)).reverse().map((a) => ({ d: a.date, sport: a.sport, nazev: a.name, km: a.distance_m ? Math.round(a.distance_m / 100) / 10 : null, min: Math.round((a.moving_s ?? 0) / 60), zatez: a.load != null ? Math.round(a.load) : null, tep: a.avg_hr ?? null, np: a.np ?? null })),
    souhrn_po_mesicich: await monthSums(env, ctx.T),
    souhrn_po_letech: await yearSums(env),
  };
}
const GROUP_SQL = "CASE WHEN sport IN ('ride','mtb','indoor') THEN 'kolo' WHEN sport = 'run' THEN 'beh' WHEN sport = 'xc_ski' THEN 'bezky' WHEN sport IN ('walk','hike') THEN 'chuze' ELSE 'ostatni' END";
async function monthSums(env: Env, T: string) {
  const rows = await all<{ m: string; g: string; n: number; s: number; d: number; e: number; l: number }>(env.DB, `SELECT substr(date, 1, 7) AS m, ${GROUP_SQL} AS g, COUNT(*) AS n, SUM(COALESCE(moving_s, 0)) AS s, SUM(COALESCE(distance_m, 0)) AS d, SUM(COALESCE(elev_gain, 0)) AS e, SUM(COALESCE(load, 0)) AS l FROM activities WHERE date >= ? GROUP BY m, g ORDER BY m`, addDays(T, -430)).catch(() => []);
  const out: Record<string, Record<string, { pocet: number; hodin: number; km: number; prevyseni_m: number; zatez: number }>> = {};
  for (const r of rows) (out[r.m] ??= {})[r.g] = { pocet: r.n, hodin: Math.round((r.s / 3600) * 10) / 10, km: Math.round(r.d / 1000), prevyseni_m: Math.round(r.e), zatez: Math.round(r.l) };
  return out;
}
async function yearSums(env: Env) {
  const rows = await all<{ y: string; g: string; n: number; s: number; d: number }>(env.DB, `SELECT substr(date, 1, 4) AS y, ${GROUP_SQL} AS g, COUNT(*) AS n, SUM(COALESCE(moving_s, 0)) AS s, SUM(COALESCE(distance_m, 0)) AS d FROM activities GROUP BY y, g ORDER BY y`).catch(() => []);
  const out: Record<string, Record<string, { pocet: number; hodin: number; km: number }>> = {};
  for (const r of rows) (out[r.y] ??= {})[r.g] = { pocet: r.n, hodin: Math.round(r.s / 3600), km: Math.round(r.d / 1000) };
  return out;
}

/**
 * Krátké AI shrnutí pro stránku (Přehled, Trenér, Zotavení): 2–3 věty nad stejnými daty jako chat.
 * Cache v KV podle dat (nová aktivita, ranní spánek a VST; Přehled i podle části dne); ?force=1 = napsat znovu.
 */
const NOTE_ASK: Record<string, string> = {
  prehled: "Napiš krátké shrnutí dne pro hlavní přehled: jak na tom tělo je (zotavení, spánek, energie, stres) a co z toho plyne pro zbytek dne. Večer shrň den a co udělat pro dobrý spánek.",
  trener: "Napiš krátký komentář trenéra k tréninku: jak jde tento týden proti plánu a cíli zátěže, co je dnes / zítra důležité a na co si dát pozor.",
  zotaveni: "Napiš krátké shrnutí zotavení: jak se vyvíjí VST, klidový tep a spánek za posledních 30 dní proti normě, a co to znamená pro trénink.",
};
misc.get("/ai-note", async (c) => {
  const page = c.req.query("page") ?? "";
  if (!NOTE_ASK[page]) return c.json({ error: "bad page" }, 400);
  const ctx = await loadCtx(c.env);
  return c.json((await pageNote(c.env, ctx, page, c.req.query("force") === "1")) ?? { text: null });
});

/** AI shrnutí stránky (cache v KV podle dat – noteKey v src/report/aiBackground.ts); píše ho i cron na pozadí. */
export async function pageNote(env: Env, ctx: Awaited<ReturnType<typeof loadCtx>>, page: string, force: boolean): Promise<{ text: string; model: string | null } | null> {
  if (!NOTE_ASK[page]) return null;
  const key = noteKey(page, ctx);
  if (!force) {
    const hit = await env.KV.get<{ text: string; model: string | null }>(key, "json").catch(() => null);
    if (hit?.text) return hit;
  }
  const llm = await import("../llm/llm");
  const { llmAvailable, numbersOk, runChat } = llm;
  if (!(await llmAvailable(env))) return null;
  const context = await aiContext(env, ctx);
  const sys = `Jsi osobní trenér vytrvalostních sportů a zdraví. Česky, tykej, 2–3 krátké věty, max. 55 slov, bez nadpisů, odrážek a emoji.
Neopisuj čísla, která uživatel vidí na stránce – max. jedno nebo dvě klíčová. Řekni, co z dat plyne a co udělat. Používej POUZE fakta z JSON kontextu. Aktuální čas je v poli „cas“.`;
  const out = await runChat(env, [{ role: "system", content: sys }, { role: "user", content: `KONTEXT (JSON):\n${JSON.stringify(context)}\n\n${NOTE_ASK[page]}` }], 260, 0.3);
  if (!out || !numbersOk(out, context)) return null;
  const res = { text: out.trim(), model: llm.getLastModel() };
  await env.KV.put(key, JSON.stringify(res), { expirationTtl: 24 * 3600 }).catch(() => {});
  return res;
}
