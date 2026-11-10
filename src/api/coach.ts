// Interaktivní Trenér: přesun tréninku, délka, vrácení úprav a AI trenér (text → konkrétní úpravy plánu).
// Úpravy se ukládají jako omezení (constraints) → plán se přepočítá → změny čekají v návrhu a do kalendáře /
// intervals.icu jdou až po potvrzení („Zapsat“).
import { Hono } from "hono";
import type { Env } from "../env";
import { formZone } from "../core/fitness";
import { qualityLimit } from "../core/quality";
import { type Violation, type WeekRules, checkWeek, violationsText } from "../core/weekCheck";
import { addDays } from "../lib/time";
import { ownRideNote, readOwnRide } from "../core/ownRide";
import { all, run } from "../lib/db";
import { dayDm } from "../lib/format";
import { getLastModel, runLlm } from "../llm/llm";
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

// ---------- AI návrh týdne (kostra podle watt-mind/coach) ----------
// 1) AI dostane rozpočet týdne (cíl zátěže z kondice), stav (CTL/ATL/TSB, připravenost), zamčené dny a pravidla
//    a vrátí týden jako JSON. 2) Návrh se převede na úpravy dnů a plán se s nimi přepočítá v paměti.
// 3) checkWeek() ho zkontroluje; při chybě AI dostane chyby zpět a zkusí to jednou znovu. 4) Co pořád nesedí,
//    kód opraví sám (kvalita navíc → Z2, moc dní za sebou → volno, zátěž mimo cíl → délky Z2).
// 5) Teprve pak se úpravy zapíšou – v kalendáři / intervals.icu až po potvrzení „Zapsat“.
// Jedno až dvě volání malého modelu (~1–2 tis. tokenů) → na free Workers AI desítky návrhů denně.
type Con = { date: string; kind: string; note: string | null };
interface AiDay { date: string; type: string; sport?: string; min?: number }

const WEEK_SYSTEM = `Jsi cyklistický trenér. Navrhni plán na zadané dny. Odpověz POUZE JSON objektem:
{"summary":"1–2 české věty, proč je týden takový (tykej)","days":[{"date":"YYYY-MM-DD","type":"rest|z2|long|quality|recovery","sport":"ride|run|xc_ski|walk","min":90}]}
Pravidla: uveď každý NEZAMČENÝ den právě jednou; zamčené dny vynech. Součet zátěže drž v cílovém pásmu
(orientačně Z2 ≈ 45–55 zátěže za hodinu, kvalita ≈ 70 za 75 min, dlouhá Z2 o víkendu). Kvalita jen tolikrát, kolik je povoleno,
nikdy dvě kvality po sobě (hokej je jen hobby, nevadí). Nepřekroč max. dní tréninku za sebou.
Při špatném počasí dej kvalitu na trenažér (sport ride) nebo jiný den. Pokyn uživatele má přednost.`;

function aiToCons(ai: AiDay[], days: Day[], locked: (d: Day) => boolean): Con[] {
  const out: Con[] = [];
  for (const d of days) {
    if (locked(d)) continue;
    const a = ai.find((x) => x.date === d.date);
    if (!a) continue;
    const t = String(a.type || "").toLowerCase();
    if (t === "rest") { out.push({ date: d.date, kind: "sport", note: "rest" }); continue; }
    if (!["z2", "long", "quality", "recovery"].includes(t)) continue;
    const sport = ["ride", "run", "xc_ski", "walk"].includes(String(a.sport)) ? String(a.sport) : "ride";
    let min = Math.round(Number(a.min) || (t === "quality" ? 75 : t === "long" ? 150 : t === "recovery" ? 40 : 75));
    min = t === "quality" ? Math.min(120, Math.max(45, min)) : t === "recovery" ? Math.min(60, Math.max(20, min)) : Math.min(300, Math.max(30, min));
    out.push({ date: d.date, kind: "sport", note: sport }, { date: d.date, kind: "typ", note: t === "quality" ? "quality" : "z2" }, { date: d.date, kind: "delka", note: String(min) });
  }
  return out;
}
/** existující omezení + návrh (u dnů z návrhu nahradí moje volby sportu / druhu / délky) */
function mergeCons(existing: Con[], add: Con[]): Con[] {
  const touched = new Set(add.map((c) => c.date));
  // návrh AI se ukládá s předponou „ai:“ → plán ho bere jako doporučení, ne jako tvoji volbu
  const tag = (c: Con): Con => ({ ...c, note: c.note && !String(c.note).startsWith("ai:") ? `ai:${c.note}` : c.note });
  return [...existing.filter((c) => !(touched.has(c.date) && ["sport", "typ", "delka"].includes(c.kind))), ...add.map(tag)];
}

coachApi.post("/coach/ai-week", async (c) => {
  const { text, dry } = ((await c.req.json().catch(() => ({}))) ?? {}) as { text?: string; dry?: boolean };
  const ctx = await loadCtx(c.env);
  const base = await planFor(ctx);
  const days = base.days;
  const locked = (d: Day) => d.kind === "blocked" || d.kind === "hockey" || d.kind === "xc_ski" || !!d.own;
  const goalUp = ctx.s.goal === "zvyseni" || ctx.s.goal === "zavod";
  const rules: WeekRules = {
    target: base.weeklyTarget,
    qualityLimit: qualityLimit(days[0]!.date),
    maxRun: 3,
    hardBefore: ctx.acts.some((a) => a.date === addDays(days[0]!.date, -1) && a.is_quality),
  };
  const careful = /(nemoc|nemocn|nachlaz|chřip|chrip|unaven|opatrn|lehce|lehčí|lehci|odpočin|odpocin|bolí|boli)/i.test(String(text ?? ""));
  if (careful) {
    rules.target = { lo: Math.round(rules.target.lo * 0.8), hi: Math.round(rules.target.hi * 0.8) };
    rules.qualityLimit = 0;
  }
  const rec = recoveryFor(ctx);
  const m = ctx.metrics.find((x) => x.date === ctx.T) ?? ctx.metrics[ctx.metrics.length - 1];
  const dayInfo = days.map((d) => ({ datum: d.date, den: dayDm(d.date), zamceno: locked(d) ? (d.own ? `vlastní jízda ${d.durationMin} min` : d.tag) : false, pocasi: d.weather ? `${Math.round(d.weather.tmax)} °C${d.weather.bad ? ", špatné (déšť / vítr / mráz)" : ""}` : "?", den_tydne: ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"][(new Date(d.date + "T12:00:00Z").getUTCDay() + 6) % 7] }));
  const dayMap = dayInfo.map((x) => `${x.den_tydne} = ${x.datum}`).join(", ");
  const user = `STAV: kondice CTL ${m?.ctl?.toFixed?.(1) ?? "?"}, únava ATL ${m?.atl?.toFixed?.(1) ?? "?"}, forma TSB ${m?.form?.toFixed?.(1) ?? "?"} (${m?.form != null ? formZone(m.form) : "?"}), ráno: ${rec.stateLabel}.
CÍL: ${ctx.s.goal}.${careful ? " OPATRNÝ TÝDEN: žádná kvalita, jen lehké Z2 a volno." : ""} Zátěž týdne ${rules.target.lo}–${rules.target.hi}. Kvalit max ${rules.qualityLimit}. Max. dní za sebou ${rules.maxRun}. Tréninků týdně ${ctx.s.rides_per_week}.${rules.hardBefore ? " Včera byl tvrdý den." : ""}
DNY (nezamčené naplánuj znovu od nuly): ${JSON.stringify(dayInfo)}
KALENDÁŘ: ${dayMap}
POKYN UŽIVATELE: ${String(text ?? "").slice(0, 400) || "žádný"}`;
  let feedback = "";
  let summary = "";
  let cons: Con[] = [];
  let planned = base;
  let viol: Violation[] = [];
  let attempts = 0;
  let tries = 0;
  let lastAi: unknown = null;
  for (; attempts < 2; attempts++) {
    tries++;
    const raw = await runLlm(c.env, WEEK_SYSTEM, user + (feedback ? `\n\nTVŮJ MINULÝ NÁVRH MĚL CHYBY, oprav je:\n${feedback}` : ""), 700);
    if (!raw) break;
    let parsed: { summary?: string; days?: AiDay[] } = {};
    try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { feedback = "- Odpověď nebyla platný JSON."; continue; }
    summary = String(parsed.summary ?? "").slice(0, 400);
    lastAi = parsed.days;
    cons = aiToCons(Array.isArray(parsed.days) ? parsed.days : [], days, locked);
    if (!cons.length) { feedback = "- Chybí dny plánu."; continue; }
    planned = await planFor({ ...ctx, constraints: mergeCons(ctx.constraints as Con[], cons) } as any);
    viol = checkWeek(planned.days, rules);
    if (!viol.length) break;
    feedback = violationsText(viol);
  }
  if (!cons.length) return c.json({ ok: false, reply: "AI teď návrh nevytvořila (denní limit nebo výpadek). Plán zůstává, uprav ho tlačítky.", changes: 0 });
  // deterministická oprava toho, co AI ani napodruhé netrefila
  const fixed: string[] = [];
  if (viol.length) {
    const setCon = (date: string, kind: string, note: string) => { cons = cons.filter((x) => !(x.date === date && x.kind === kind)); cons.push({ date, kind, note }); };
    const pd = () => planned.days;
    let qSeen = 0;
    pd().forEach((d, i) => {
      if (d.kind !== "quality") return;
      const prevHard = i === 0 ? rules.hardBefore : pd()[i - 1]!.kind === "quality";
      if (++qSeen > rules.qualityLimit || prevHard) { setCon(d.date, "typ", "z2"); fixed.push(`${dayDm(d.date)} kvalita → Z2`); }
    });
    for (const v of viol.filter((x) => x.code === "streak" && x.date)) {
      const i = pd().findIndex((x) => x.date === v.date);
      const run = pd().slice(Math.max(0, i - rules.maxRun), i + 1).filter((x) => !locked(x));
      const d = run.filter((x) => x.kind !== "quality").sort((a, b) => a.load - b.load)[0] ?? run[0];
      if (d) { cons = cons.filter((x) => x.date !== d.date); cons.push({ date: d.date, kind: "sport", note: "rest" }); fixed.push(`${dayDm(d.date)} volno (moc dní za sebou)`); }
    }
    planned = await planFor({ ...ctx, constraints: mergeCons(ctx.constraints as Con[], cons) } as any);
    const load = planned.days.reduce((t, d) => t + d.load, 0);
    const want = load > rules.target.hi * 1.1 ? rules.target.hi : load < rules.target.lo * 0.9 ? rules.target.lo : 0;
    if (want) {
      const z2 = planned.days.filter((d) => (d.kind === "z2" || d.kind === "long") && !locked(d));
      const z2Load = z2.reduce((t, d) => t + d.load, 0);
      const f = z2Load > 0 ? Math.max(0.5, Math.min(1.6, (z2Load + want - load) / z2Load)) : 1;
      for (const d of z2) { const mins = Math.max(45, Math.min(d.kind === "long" ? 240 : 150, Math.round(((d.durationMin || 60) * f) / 15) * 15)); setCon(d.date, "delka", String(mins)); }
      if (z2.length) fixed.push(`délky Z2 upravené na cíl zátěže (${load > want ? "kratší" : "delší"})`);
      planned = await planFor({ ...ctx, constraints: mergeCons(ctx.constraints as Con[], cons) } as any);
    }
    viol = checkWeek(planned.days, rules);
  }
  if (dry) return c.json({ ok: true, dry: true, ai: lastAi, cons, reply: summary, attempts: tries, fixed, remaining: viol.map((v) => v.msg), load: Math.round(planned.days.reduce((t, d) => t + d.load, 0)), target: rules.target, days: planned.days.map((d) => `${d.date.slice(5)} ${d.kind} ${d.sport} ${d.durationMin ?? ""} L${d.load}`) });
  // zapsat úpravy (dny z návrhu: nejdřív smazat moje volby, pak nové)
  for (const date of [...new Set(cons.map((x) => x.date))]) {
    await run(c.env.DB, `DELETE FROM constraints WHERE date = ? AND kind IN ('sport', 'typ', 'delka')`, date);
    for (const x of cons.filter((y) => y.date === date)) await run(c.env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, ?, ?, ?)", date, x.kind, x.note == null ? null : String(x.note).startsWith("ai:") ? x.note : `ai:${x.note}`, new Date().toISOString());
  }
  const after = await proposalAfter(c.env);
  const load = planned.days.reduce((t, d) => t + d.load, 0);
  return c.json({ ok: true, reply: summary || "Týden navržen.", load: Math.round(load), target: rules.target, attempts: tries, model: getLastModel(), fixed, remaining: viol.map((v) => v.msg), ...after });
});
