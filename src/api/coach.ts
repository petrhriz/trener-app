// Interaktivní Trenér: přesun tréninku, délka, vrácení úprav a AI trenér (text → konkrétní úpravy plánu).
// Úpravy se ukládají jako omezení (constraints) → plán se přepočítá → změny čekají v návrhu a do kalendáře /
// intervals.icu jdou až po potvrzení („Zapsat“).
import { Hono } from "hono";
import type { Env } from "../env";
import { formZone } from "../core/fitness";
import { ownRideNote, readOwnRide } from "../core/ownRide";
import { all, run } from "../lib/db";
import { dayDm } from "../lib/format";
import { runLlm } from "../llm/llm";
import { addConstraint, saveProposal } from "../plan/proposals";
import { planFor, recoveryFor } from "../report/build";
import { loadCtx } from "../report/context";

export const coachApi = new Hono<{ Bindings: Env; Variables: { uid: number } }>();
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const USER_KINDS = ["sport", "typ", "delka", "jizda"];

type Day = Awaited<ReturnType<typeof planFor>>["days"][number];
interface Session { sport: string; type: "z2" | "quality"; min: number | null; own: string | null }
const sessionOf = (d: Day | undefined): Session | null =>
  d && d.name && ["z2", "long", "quality", "recovery"].includes(d.kind as string)
    ? { sport: d.sport, type: d.kind === "quality" ? "quality" : "z2", min: d.durationMin, own: d.own ? ownRideNote(d.own) : null }
    : null;

async function clearDay(env: Env, date: string) {
  await run(env.DB, `DELETE FROM constraints WHERE date = ? AND kind IN ('typ', 'delka', 'jizda')`, date);
}
/** Dát trénink na den (null = volno). */
async function place(env: Env, date: string, s: Session | null) {
  await clearDay(env, date);
  if (!s) return addConstraint(env, date, "sport", "rest");
  if (s.own) return addConstraint(env, date, "jizda", s.own);
  await addConstraint(env, date, "sport", s.sport);
  await addConstraint(env, date, "typ", s.type);
  if (s.min) await addConstraint(env, date, "delka", String(s.min));
}

/** Přesun tréninku z dne na den; když je cílový den obsazený, dny se prohodí. */
export async function shiftDay(env: Env, days: Day[], from: string, to: string): Promise<string> {
  const A = days.find((d) => d.date === from), B = days.find((d) => d.date === to);
  if (!A || !B) throw new Error("Den není v plánu (jen příštích 7 dní).");
  const a = sessionOf(A), b = sessionOf(B);
  if (!a) throw new Error(`${dayDm(from)} není trénink.`);
  await place(env, to, a);
  await place(env, from, b);
  return b ? `${A.name} ⇄ ${B.name}: ${dayDm(from)} ↔ ${dayDm(to)}` : `${A.name}: ${dayDm(from)} → ${dayDm(to)}`;
}

async function proposalAfter(env: Env) {
  const p = await planFor(await loadCtx(env));
  return { id: await saveProposal(env, "trener", p.changes), changes: p.changes.length };
}

coachApi.post("/plan/shift", async (c) => {
  const { from, to } = (await c.req.json()) as { from: string; to: string };
  if (!isDate(from) || !isDate(to) || from === to) return c.json({ error: "bad input" }, 400);
  try {
    const p = await planFor(await loadCtx(c.env));
    const msg = await shiftDay(c.env, p.days, from, to);
    return c.json({ ok: true, msg, ...(await proposalAfter(c.env)) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/** Délka tréninku dne v minutách (0 = podle plánu). */
coachApi.post("/plan/len", async (c) => {
  const { date, min } = (await c.req.json()) as { date: string; min: number };
  if (!isDate(date) || !(min === 0 || (min >= 20 && min <= 600))) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, "delka", min ? String(Math.round(min)) : null);
  return c.json({ ok: true, ...(await proposalAfter(c.env)) });
});

/** Vrátit všechny moje úpravy plánu od dneška (sport, druh, délka, vlastní jízda). */
coachApi.post("/plan/reset", async (c) => {
  const ctx = await loadCtx(c.env);
  await run(c.env.DB, `DELETE FROM constraints WHERE date >= ? AND kind IN (${USER_KINDS.map(() => "?").join(", ")})`, ctx.T, ...USER_KINDS);
  return c.json({ ok: true, ...(await proposalAfter(c.env)) });
});

/**
 * AI trenér: z textu („ve středu nestihnu, přesuň kvalitu na čtvrtek“, „jsem unavený“, „tento týden mám jen 4 h“)
 * udělá úpravy plánu. Model vrátí JSON s akcemi, kód je zkontroluje (jen dny v plánu, povolené akce) a provede.
 * Čísla zátěže a pravidla (kvalita max 1–2×, ne dvě po sobě, únava) hlídá dál plánovač.
 */
coachApi.post("/coach/ask", async (c) => {
  const { text, dry } = (await c.req.json()) as { text: string; dry?: boolean };
  const q = String(text ?? "").trim().slice(0, 600);
  if (!q) return c.json({ error: "prázdná zpráva" }, 400);
  const ctx = await loadCtx(c.env);
  const p = await planFor(ctx);
  const rec = recoveryFor(ctx);
  const m = ctx.metrics.find((x) => x.date === ctx.T) ?? ctx.metrics[ctx.metrics.length - 1];
  const days = p.days.map((d) => ({ datum: d.date, den: dayDm(d.date), trenink: d.name ?? (d.kind === "blocked" ? "nelze" : "volno"), druh: d.kind, sport: d.sport, minut: d.durationMin, zatez: d.load }));
  const system = `Jsi cyklistický trenér. Uživatel upravuje plán na 7 dní. Odpověz POUZE JSON objektem:
{"reply":"krátká česká odpověď, tykej, 1–3 věty","actions":[...]}
Povolené akce (data jen z plánu níže):
{"a":"move","from":"YYYY-MM-DD","to":"YYYY-MM-DD"}  přesun tréninku – obsazený den se prohodí SÁM, opačný přesun nepiš
{"a":"rest","date":"YYYY-MM-DD"}  volno
{"a":"z2","date":"YYYY-MM-DD"}  místo kvality / volna lehká Z2
{"a":"quality","date":"YYYY-MM-DD"}  kvalita (intervaly) na tento den
{"a":"len","date":"YYYY-MM-DD","min":90}  délka tréninku v minutách
{"a":"sport","date":"YYYY-MM-DD","sport":"ride|run|xc_ski|walk"}
{"a":"own","date":"YYYY-MM-DD","min":240,"with":"jméno nebo null"}  vlastní jízda
Pravidla: kvalita ne dva dny po sobě; při formě pod −20 nebo špatné připravenosti spíš uber; když uživatel nemá čas, zkrať nebo přesuň, kvalitu zachovej, pokud to jde. Když není co měnit, actions = [].`;
  const user = `STAV: kondice CTL ${m?.ctl?.toFixed?.(1) ?? "?"}, únava ATL ${m?.atl?.toFixed?.(1) ?? "?"}, forma TSB ${m?.form?.toFixed?.(1) ?? "?"} (${m?.form != null ? formZone(m.form) : "?"}), připravenost ráno: ${rec.stateLabel}. Cíl týdne zátěž ${p.weeklyTarget.lo}–${p.weeklyTarget.hi}.
PLÁN: ${JSON.stringify(days)}
DNES: ${ctx.T}
ZPRÁVA: ${q}`;
  const raw = await runLlm(c.env, system, user, 500);
  if (!raw) return c.json({ reply: "AI trenér teď neodpovídá (denní limit nebo výpadek). Úpravy udělej tlačítky u dnů.", applied: [], changes: 0 });
  let parsed: { reply?: string; actions?: any[] } = {};
  try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { parsed = { reply: raw.slice(0, 400), actions: [] }; }
  const inPlan = (d: unknown) => isDate(d) && p.days.some((x) => x.date === d);
  // zkušební režim: jen ukázat, co by AI udělala, nic nezapsat
  if (dry) return c.json({ reply: parsed.reply ?? "", actions: parsed.actions ?? [], raw: raw.slice(0, 800) });
  const applied: string[] = [];
  const moved = new Set<string>();
  for (const a of (parsed.actions ?? []).slice(0, 6)) {
    try {
      if (a?.a === "move" && inPlan(a.from) && inPlan(a.to) && a.from !== a.to) {
        // přesun dny sám prohazuje → opačný přesun (AI ho občas přidá „pro jistotu“) by změnu vrátil
        if (moved.has(`${a.to}>${a.from}`) || moved.has(`${a.from}>${a.to}`)) continue;
        moved.add(`${a.from}>${a.to}`);
        const cur = await planFor(await loadCtx(c.env));
        applied.push(await shiftDay(c.env, cur.days, a.from, a.to));
      } else if (a?.a === "rest" && inPlan(a.date)) { await place(c.env, a.date, null); applied.push(`${dayDm(a.date)} volno`); }
      else if ((a?.a === "z2" || a?.a === "quality") && inPlan(a.date)) {
        const d = p.days.find((x) => x.date === a.date)!;
        if (!d.name) await addConstraint(c.env, a.date, "sport", d.sport || "ride");
        await addConstraint(c.env, a.date, "typ", a.a);
        applied.push(`${dayDm(a.date)} ${a.a === "z2" ? "Z2" : "kvalita"}`);
      } else if (a?.a === "len" && inPlan(a.date) && Number(a.min) >= 20 && Number(a.min) <= 600) { await addConstraint(c.env, a.date, "delka", String(Math.round(a.min))); applied.push(`${dayDm(a.date)} ${Math.round(a.min)} min`); }
      else if (a?.a === "sport" && inPlan(a.date) && ["ride", "run", "xc_ski", "walk"].includes(a.sport)) { await addConstraint(c.env, a.date, "sport", a.sport); applied.push(`${dayDm(a.date)} ${a.sport}`); }
      else if (a?.a === "own" && inPlan(a.date) && Number(a.min) >= 20) { await addConstraint(c.env, a.date, "jizda", ownRideNote({ min: Math.round(a.min), km: null, with: a.with || null })); applied.push(`${dayDm(a.date)} vlastní jízda ${Math.round(a.min)} min`); }
    } catch (e) {
      applied.push(`✗ ${(e as Error).message}`);
    }
  }
  const after = await proposalAfter(c.env);
  return c.json({ reply: String(parsed.reply ?? "").slice(0, 600) || (applied.length ? "Upraveno." : "Nic neměním."), applied, ...after });
});

/** pro UI: které dny mají moje úpravy (badge „tvoje úprava“) */
coachApi.get("/plan/mine", async (c) => {
  const ctx = await loadCtx(c.env);
  const rows = await all<{ date: string; kind: string; note: string | null }>(c.env.DB, `SELECT date, kind, note FROM constraints WHERE date >= ? AND kind IN ('sport', 'typ', 'delka', 'jizda')`, ctx.T);
  return c.json(rows.map((r) => ({ ...r, own: r.kind === "jizda" ? readOwnRide(r.note) : null })));
});
