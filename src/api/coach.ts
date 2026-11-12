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
import { profileFromHistory, profileSummary, validateProfile } from "../core/coach/profile";
import { MAX_OWN_MIN, constraintNoteOk } from "../core/coach/common";
import { readStepEdit } from "../core/coach/library";
import { type ValidationItem, type WeekValidation, newViolations } from "../core/coach/validate";
import { getSettings, setSetting } from "../lib/settings";

export const coachApi = new Hono<{ Bindings: Env; Variables: { uid: number } }>();
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const USER_KINDS = ["sport", "typ", "delka", "jizda", "kroky"];

type Day = Awaited<ReturnType<typeof planFor>>["days"][number];
interface Session { sport: string; type: "z2" | "quality"; min: number | null; own: string | null }
const sessionOf = (d: Day | undefined): Session | null =>
  d && d.name && ["z2", "long", "quality", "recovery"].includes(d.kind as string)
    ? { sport: d.sport, type: d.kind === "quality" ? "quality" : "z2", min: d.durationMin, own: d.own ? ownRideNote(d.own) : null }
    : null;

async function clearDay(env: Env, date: string) {
  await run(env.DB, `DELETE FROM constraints WHERE date = ? AND kind IN ('typ', 'delka', 'jizda', 'kroky')`, date);
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

/** Den orientačního týdne (trenér zná druh, sport a délku, ne kroky). */
type HorizonDay = { date: string; role: string; sport: string; minutes: number; name: string | null; blocked: boolean };
const ROLE_NAME: Record<string, string> = { key: "Kvalita", long: "Dlouhá", endurance: "Z2", easy: "Lehce" };
/** Trénink dne: nejdřív z podrobného plánu (8 dní), jinak z výhledu trenéra (4 týdny). undefined = den mimo plán. */
function slotAt(days: Day[], horizon: HorizonDay[], date: string): { name: string; s: Session | null } | undefined {
  const d = days.find((x) => x.date === date);
  if (d) return { name: d.name ?? "volno", s: sessionOf(d) };
  const h = horizon.find((x) => x.date === date);
  if (!h || h.blocked) return undefined;
  if (h.role === "rest") return { name: "volno", s: null };
  return { name: h.name ?? ROLE_NAME[h.role] ?? "trénink", s: { sport: h.sport, type: h.role === "key" ? "quality" : "z2", min: h.minutes, own: null } };
}

/** Přesun tréninku z dne na den (do 4 týdnů dopředu); když je cílový den obsazený, dny se prohodí. */
export async function shiftDay(env: Env, days: Day[], from: string, to: string, horizon: HorizonDay[] = []): Promise<string> {
  const A = slotAt(days, horizon, from), B = slotAt(days, horizon, to);
  if (!A || !B) throw new Error("Den není v plánu trenéra (jen 4 týdny dopředu).");
  if (!A.s) throw new Error(`${dayDm(from)} není trénink.`);
  await place(env, to, A.s);
  await place(env, from, B.s);
  return B.s ? `${A.name} ⇄ ${B.name}: ${dayDm(from)} ↔ ${dayDm(to)}` : `${A.name}: ${dayDm(from)} → ${dayDm(to)}`;
}

/** Budoucí dny výhledu trenéra (od dneška). */
const horizonOf = (p: unknown, T: string): HorizonDay[] =>
  ((p as { coach?: { horizon?: { days: HorizonDay[] }[] } }).coach?.horizon ?? []).flatMap((w) => w.days).filter((x) => x.date >= T);

/** Výsledek závěrečné kontroly týdne (Trenér v2); co z toho AI nesmí nově způsobit, řeší `newViolations`. */
function guardItems(p: unknown): ValidationItem[] {
  return (p as { coach?: { validation?: WeekValidation } }).coach?.validation?.items ?? [];
}

async function proposalAfter(env: Env) {
  const p = await planFor(await loadCtx(env));
  return { id: await saveProposal(env, "trener", p.changes), changes: p.changes.length };
}

coachApi.post("/plan/shift", async (c) => {
  const { from, to } = (await c.req.json()) as { from: string; to: string };
  if (!isDate(from) || !isDate(to) || from === to) return c.json({ error: "bad input" }, 400);
  try {
    const ctx = await loadCtx(c.env);
    const p = await planFor(ctx);
    const msg = await shiftDay(c.env, p.days, from, to, horizonOf(p, ctx.T));
    return c.json({ ok: true, msg, ...(await proposalAfter(c.env)) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/** Délka tréninku dne v minutách (0 = podle plánu). */
coachApi.post("/plan/len", async (c) => {
  const { date, min } = (await c.req.json()) as { date: string; min: number };
  if (!isDate(date) || typeof min !== "number" || !constraintNoteOk("delka", String(Math.round(min)))) return c.json({ error: "bad input" }, 400);
  await addConstraint(c.env, date, "delka", min ? String(Math.round(min)) : null);
  return c.json({ ok: true, ...(await proposalAfter(c.env)) });
});

/**
 * Editor tréninku: úprava hlavní série kvality (počet opakování, délka úseku v s, intenzita ±10 %). Den se zároveň
 * zafixuje jako kvalita, aby ho řešič neodsunul. Limity a pojistku růstu hlídá applyStepEdit; prázdná úprava = zpět.
 */
coachApi.post("/plan/steps", async (c) => {
  const b = (await c.req.json()) as { date: string; reps?: number; work_s?: number; pct?: number; reset?: boolean };
  if (!isDate(b.date)) return c.json({ error: "bad input" }, 400);
  if (b.reset) {
    await run(c.env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'kroky'", b.date);
    return c.json({ ok: true, ...(await proposalAfter(c.env)) });
  }
  const note = JSON.stringify({ reps: b.reps, work_s: b.work_s, pct: b.pct ?? 0 });
  if (!constraintNoteOk("kroky", note) || !readStepEdit(note)) return c.json({ error: "Mimo rozsah: opakování 1–12, úsek 30 s – 30 min, intenzita ±10 %." }, 400);
  await addConstraint(c.env, b.date, "kroky", note);
  await addConstraint(c.env, b.date, "typ", "quality");
  return c.json({ ok: true, ...(await proposalAfter(c.env)) });
});

/** Vrátit všechny moje úpravy plánu od dneška (sport, druh, délka, vlastní jízda, kroky). */
coachApi.post("/plan/reset", async (c) => {
  const ctx = await loadCtx(c.env);
  await run(c.env.DB, `DELETE FROM constraints WHERE date >= ? AND kind IN (${USER_KINDS.map(() => "?").join(", ")})`, ctx.T, ...USER_KINDS);
  // Trenér v2: uložený týden zahodit → postaví se znovu od nuly
  return c.json({ ok: true, ...(await proposalAfter(c.env)) });
});

/** Systémový prompt AI trenéra (hlídá ho test promptů v test/ai.test.ts). */
export const COACH_ASK_SYS = `Jsi cyklistický trenér. Uživatel upravuje plán na 7 dní. Odpověz POUZE JSON objektem:
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
  const system = COACH_ASK_SYS;
  const user = `STAV: kondice CTL ${m?.ctl?.toFixed?.(1) ?? "?"}, únava ATL ${m?.atl?.toFixed?.(1) ?? "?"}, forma TSB ${m?.form?.toFixed?.(1) ?? "?"} (${m?.form != null ? formZone(m.form) : "?"})${ctx.s.ai_private ? "" : `, připravenost ráno: ${rec.stateLabel}`}. Cíl týdne zátěž ${p.weeklyTarget.lo}–${p.weeklyTarget.hi}.
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
  // AI nesmí obejít pravidla trenéra: co bylo před akcemi, se uloží; když akce přinesou nové porušení
  // kdekoli v týdnu (kvalita po těžkém dni, řada dní, propad formy, délka nad strop…), dny se vrátí
  const guard = true;
  const before = guardItems(p);
  const planDates = p.days.map((d) => d.date).sort();
  const snap = guard && planDates.length ? await all<{ date: string; kind: string; note: string | null; created_at: string | null }>(c.env.DB, `SELECT date, kind, note, created_at FROM constraints WHERE date >= ? AND date <= ? AND kind IN ('sport', 'typ', 'delka', 'jizda', 'kroky')`, planDates[0], planDates[planDates.length - 1]) : [];
  const touched = new Set<string>();
  for (const a of (parsed.actions ?? []).slice(0, 6)) {
    for (const d of [a?.date, a?.from, a?.to]) if (inPlan(d)) touched.add(d as string);
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
      } else if (a?.a === "len" && inPlan(a.date) && Number(a.min) >= 20 && constraintNoteOk("delka", String(Math.round(Number(a.min))))) { await addConstraint(c.env, a.date, "delka", String(Math.round(a.min))); applied.push(`${dayDm(a.date)} ${Math.round(a.min)} min`); }
      else if (a?.a === "sport" && inPlan(a.date) && ["ride", "run", "xc_ski", "walk"].includes(a.sport)) { await addConstraint(c.env, a.date, "sport", a.sport); applied.push(`${dayDm(a.date)} ${a.sport}`); }
      else if (a?.a === "own" && inPlan(a.date) && Number(a.min) >= 20 && Number(a.min) <= MAX_OWN_MIN) { await addConstraint(c.env, a.date, "jizda", ownRideNote({ min: Math.round(a.min), km: null, with: a.with || null })); applied.push(`${dayDm(a.date)} vlastní jízda ${Math.round(a.min)} min`); }
    } catch (e) {
      applied.push(`✗ ${(e as Error).message}`);
    }
  }
  let reply = String(parsed.reply ?? "").slice(0, 600);
  if (guard && touched.size && applied.some((x) => !x.startsWith("✗"))) {
    const np = await planFor(await loadCtx(c.env));
    const bad = newViolations(before, guardItems(np));
    if (bad.length) {
      for (const d of touched) {
        await run(c.env.DB, `DELETE FROM constraints WHERE date = ? AND kind IN ('sport', 'typ', 'delka', 'jizda', 'kroky')`, d);
        for (const r of snap.filter((x) => x.date === d)) await run(c.env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, ?, ?, ?)", r.date, r.kind, r.note, r.created_at ?? new Date().toISOString());
      }
      applied.length = 0;
      for (const v of bad) applied.push(`✗ vráceno: ${v.text}`);
      reply = `Tohle by porušilo pravidla trenéra (${bad.map((v) => v.text.replace(/\.$/, "")).join("; ")}), takže plán nechávám, jak byl. Když to tak opravdu chceš, uprav den sám tlačítky.`;
    }
  }
  const after = await proposalAfter(c.env);
  return c.json({ reply: reply || (applied.length ? "Upraveno." : "Nic neměním."), applied, ...after });
});

/** pro UI: které dny mají moje úpravy (badge „tvoje úprava“) */
coachApi.get("/plan/mine", async (c) => {
  const ctx = await loadCtx(c.env);
  const rows = await all<{ date: string; kind: string; note: string | null }>(c.env.DB, `SELECT date, kind, note FROM constraints WHERE date >= ? AND kind IN ('sport', 'typ', 'delka', 'jizda', 'kroky')`, ctx.T);
  return c.json(rows.map((r) => ({ ...r, own: r.kind === "jizda" ? readOwnRide(r.note) : null })));
});

// ---------- profil sportovce (hlavní sport, další sporty) ----------

/** Profil pro Nastavení (hlavní sport, další sporty). Když ještě není uložený, vrací se odhad z historie. */
coachApi.get("/coach/profile", async (c) => {
  const ctx = await loadCtx(c.env);
  const profile = ctx.s.coach_profile ? validateProfile(ctx.s.coach_profile).profile : profileFromHistory(ctx.acts, ctx.T);
  return c.json({ saved: !!ctx.s.coach_profile, profile, summary: profileSummary(profile) });
});

/** Uložení profilu. Plán se postaví znovu, změny čekají na „Zapsat“. */
coachApi.post("/coach/profile", async (c) => {
  const body = (await c.req.json()) as { profile?: unknown };
  const s = await getSettings(c.env.DB);
  let profile = s.coach_profile;
  if (body.profile !== undefined) {
    const r = validateProfile(body.profile, s.coach_profile ? validateProfile(s.coach_profile).profile : undefined);
    if (r.errors.length) return c.json({ error: `Neuloženo: ${r.errors.join("; ")}.`, errors: r.errors }, 400);
    profile = r.profile;
    await setSetting(c.env.DB, "coach_profile", profile);
  }
  const after = await proposalAfter(c.env);
  return c.json({ ok: true, profile, summary: profile ? profileSummary(profile) : [], proposal: after });
});
