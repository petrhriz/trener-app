// 6. kolo: stav (nemoc / zranění / dovolená), přesun kvality, kalendář měsíce, chat s AI.
import { Hono } from "hono";
import type { Env } from "../env";
import { STATUS_LABEL, type StatusKind } from "../core/readinessScore";
import { answerChat } from "../llm/llm";
import { all } from "../lib/db";
import { getSettings, setSetting, statusOn } from "../lib/settings";
import { addDays } from "../lib/time";
import { dayDm } from "../lib/format";
import { ownRideName, ownRideNote, parseOwnRide } from "../core/ownRide";
import { addConstraint, applyChanges, removeConstraint, saveProposal } from "../plan/proposals";
import { planFor, readiness } from "../report/build";
import { loadCtx } from "../report/context";

export const round6 = new Hono<{ Bindings: Env; Variables: { uid: number } }>();
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Druh jednotky dne: „z2“ = místo kvality Z2, „quality“ = kvalita sem, „auto“ = podle plánu. */
round6.post("/plan/day", async (c) => {
  const { date, type } = (await c.req.json()) as { date: string; type: string };
  if (!isDate(date) || !["z2", "quality", "auto"].includes(type)) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, "typ", type);
  const p = await planFor(await loadCtx(c.env));
  return c.json({ id: await saveProposal(c.env, "dashboard", p.changes), changes: p.changes });
});

/** Přesun kvality: cílový den = kvalita, původní = Z2 (nebo volno, když cílový den byl volný – trénink se jen posune). */
round6.post("/plan/move", async (c) => {
  const { from, to } = (await c.req.json()) as { from: string; to: string };
  if (!isDate(from) || !isDate(to) || from === to) return c.json({ error: "bad input" }, 400);
  const before = await planFor(await loadCtx(c.env));
  const target = before.days.find((d) => d.date === to);
  const targetFree = !target?.name;
  for (const k of ["nepojedu", "nemuzu"]) await removeConstraint(c.env, to, k);
  if (targetFree) await addConstraint(c.env, to, "sport", before.days.find((d) => d.date === from)?.sport ?? "ride");
  await addConstraint(c.env, to, "typ", "quality");
  if (targetFree) {
    await addConstraint(c.env, from, "typ", "auto");
    await addConstraint(c.env, from, "sport", "rest");
  } else await addConstraint(c.env, from, "typ", "z2");
  const p = await planFor(await loadCtx(c.env));
  return c.json({ id: await saveProposal(c.env, "dashboard", p.changes), changes: p.changes });
});

/** Stav jako v Bevelu. Dny stavu se v plánu zablokují; smazání tréninků se zapíše hned (bez potvrzování). */
round6.post("/status", async (c) => {
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
round6.get("/calendar", async (c) => {
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
round6.post("/plan/own", async (c) => {
  const { date, min, km, with: w } = (await c.req.json()) as { date: string; min: number; km?: number | null; with?: string | null };
  if (!isDate(date) || !(min >= 0 && min <= 720)) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, "jizda", min > 0 ? ownRideNote({ min: Math.round(min), km: km ? Math.round(km) : null, with: w?.trim() || null }) : null);
  const p = await planFor(await loadCtx(c.env));
  return c.json({ id: await saveProposal(c.env, "dashboard", p.changes), changes: p.changes });
});

round6.post("/chat", async (c) => {
  const { messages, page } = (await c.req.json()) as { messages: { role: string; content: string }[]; page?: { title?: string; text?: string } | null };
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
  const r = await readiness(ctx);
  const tw = ctx.well.find((w) => w.date === ctx.T) ?? null;
  const st = statusOn(ctx.s, ctx.T);
  const tags = new Map((await all<{ activity_id: string; company: string }>(c.env.DB, "SELECT activity_id, company FROM activity_tags").catch(() => [])).map((t) => [t.activity_id, t.company]));
  const context = {
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
    stres_dne: tw?.stress_avg ?? null,
    kroky: tw?.steps ?? null,
    kondice: { ctl: r.fitness.ctl, atl: r.fitness.atl, forma: r.fitness.form, zatez_7_dni: r.fitness.load7 },
    dnesni_rozhodnuti: `${r.today.decision}: ${r.today.decisionWhy}`,
    dnesni_trenink: r.today.done.length ? `odjeto: ${r.today.done.map((x) => x.name).join(", ")}` : r.today.day?.name ? `${r.today.day.name}, ${r.today.day.durationMin} min, ${r.today.day.targetText ?? ""}` : "volno",
    plan_7_dni: r.plan.days.map((d) => ({ datum: d.date, trenink: d.name ?? d.tag, druh: d.kind, sport: d.sport, minut: d.durationMin, zatez: d.load, cil: d.targetText, kroky: d.steps })),
    tydenni_cil_zateze: r.plan.weeklyTarget,
    posledni_aktivity: ctx.acts.slice(-8).reverse().map((a) => ({ datum: a.date, sport: a.sport, nazev: a.name, s_kym: tags.get(a.id) ?? null, km: a.distance_m ? Math.round(a.distance_m / 100) / 10 : null, minut: Math.round((a.moving_s ?? 0) / 60), zatez: a.load, np_w: a.np, tep: a.avg_hr })),
    pocasi_dnes: r.plan.days.find((d) => d.date === ctx.T)?.weatherText ?? null,
    // co uživatel právě vidí na stránce dashboardu (panel 🤖) – odpovídej hlavně k tomu
    ...(page?.text ? { stranka_kterou_vidi: { nazev: String(page.title ?? "").slice(0, 80), obsah: String(page.text).slice(0, 3500) } } : {}),
  };
  const out = await answerChat(c.env, msgs, context);
  if (!out) return c.json({ error: "AI teď neodpovídá (Workers AI nedostupné, nebo vypnuté v Nastavení)." }, 503);
  return c.json(out);
});
