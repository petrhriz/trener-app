// Pravidla, která musí platit pro KAŽDÝ plán trenéra bez ohledu na sportovce, cíl a situaci. Vrací seznam porušení
// (kód + popis), aby šlo u milionů variant spočítat, co a jak často selhává, a ukázat první příklad.
import { type CoachInput, type CoachPlan } from "../../../src/core/coach/engine";
import { MAX_DAY_MIN, MAX_OWN_MIN, fixedFromConstraints, runCapOf } from "../../../src/core/coach/common";
import { runReadiness } from "../../../src/core/coach/run";
import { BIKE_SPORTS } from "../../../src/datasource/types";
import { addDays, dow, mondayOf } from "../../../src/lib/time";

export interface Violation { code: string; msg: string }

const BAD_TEXT = /NaN|undefined|Infinity|\[object|null\b/;

export function checkPlan(inp: CoachInput, out: CoachPlan): Violation[] {
  const v: Violation[] = [];
  const add = (code: string, msg: string) => v.push({ code, msg });
  const T = inp.today;
  const c = out.coach;
  const H = c.horizon;
  const fixed = fixedFromConstraints(inp.constraints);
  const days = H.flatMap((w) => w.days);
  const trainedAct = (d: string) => inp.acts.some((a) => a.date === d && (a.moving_s ?? 0) >= 20 * 60);
  const todayDone = trainedAct(T);
  const from = todayDone ? addDays(T, 1) : T;

  // --- tvar horizontu ---
  if (H.length !== 4) add("horizon_len", `horizont ${H.length} týdnů místo 4`);
  H.forEach((w, k) => {
    if (dow(w.weekStart) !== 1) add("week_start", `týden ${w.weekStart} nezačíná pondělím`);
    if (w.weekStart !== addDays(mondayOf(from), 7 * k)) add("week_seq", `týden ${k}: ${w.weekStart}`);
    if (!w.days.length || w.days[w.days.length - 1]!.date !== addDays(w.weekStart, 6)) add("week_end", `týden ${w.weekStart} nekončí nedělí`);
  });
  if (days[0]?.date !== from) add("from", `plán začíná ${days[0]?.date}, má ${from}`);
  for (let i = 1; i < days.length; i++) if (days[i]!.date !== addDays(days[i - 1]!.date, 1)) add("gap", `díra v plánu u ${days[i]!.date}`);

  // --- čísla ---
  for (const d of days) {
    if (!Number.isFinite(d.load) || d.load < 0) add("num_load", `${d.date}: zátěž ${d.load}`);
    if (!Number.isFinite(d.minutes) || d.minutes < 0) add("num_min", `${d.date}: minuty ${d.minutes}`);
    const f = fixed.get(d.date);
    const max = f?.own ? MAX_OWN_MIN : MAX_DAY_MIN[d.sport];
    if (d.minutes > max + (f?.minutes ? 15 : 0)) add("too_long", `${d.date}: ${d.minutes} min ${d.sport} (${d.role})`);
    if (d.role === "rest" || d.blocked) {
      if (d.load !== 0 || (d.role === "rest" && d.minutes !== 0)) add("rest_load", `${d.date}: volno/blok má zátěž ${d.load} / ${d.minutes} min`);
    } else {
      if (d.minutes <= 0 || d.load <= 0) add("train_empty", `${d.date}: trénink ${d.role} bez délky/zátěže (${d.minutes} min, ${d.load})`);
    }
  }
  for (const w of H) {
    for (const x of [w.load, w.done, w.need, w.target, w.ctlStart, w.ctlEnd, w.ctlGoal]) if (!Number.isFinite(x)) add("num_week", `${w.weekStart}: nekonečné číslo v týdnu`);
    if (w.target < 0 || w.need < 0) add("num_week", `${w.weekStart}: záporný cíl ${w.target}/${w.need}`);
  }
  for (const w of c.outlook.weeks) if (!Number.isFinite(w.load) || !Number.isFinite(w.ctlEnd)) add("num_outlook", `výhled ${w.weekStart}`);
  for (const x of [c.ctlNow, c.ctlTarget, c.load, c.hours, out.weeklyTarget.mid]) if (!Number.isFinite(x)) add("num_coach", `souhrn: ${x}`);

  // --- texty pro člověka ---
  const texts = [...out.warnings, ...c.notes, ...H.flatMap((w) => w.notes), ...days.flatMap((d) => [...d.why, ...d.steps, d.name ?? "", d.targetText ?? ""]), ...out.days.map((d) => d.note)];
  for (const t of texts) if (BAD_TEXT.test(t)) { add("text", `text „${t.slice(0, 120)}“`); break; }

  // --- tvoje volby a blokované dny ---
  const raceDate = inp.raceDate;
  for (const d of days) {
    const f = fixed.get(d.date);
    const training = d.role !== "rest";
    if ((f?.blocked || d.date === raceDate || (d.date === T && inp.recovery === "red")) && training) add("blocked_trained", `${d.date}: blokovaný den má trénink ${d.role}`);
    if (f?.rest && training) add("rest_ignored", `${d.date}: tvoje volno, ale v plánu ${d.role}`);
    if (!f || f.blocked || f.rest || d.date === raceDate || (d.date === T && inp.recovery === "red")) continue;
    if ((f.sport || f.minutes || f.own || f.edit || f.type) && !training) add("must_ignored", `${d.date}: tvoje volba (${JSON.stringify(f)}) ignorovaná – volno`);
    if (!training) continue;
    if (f.sport && d.sport !== f.sport) add("sport_ignored", `${d.date}: chtěl ${f.sport}, plán ${d.sport}`);
    if (f.type === "quality" && d.role !== "key") add("quality_ignored", `${d.date}: chtěl kvalitu, plán ${d.role}`);
    if (f.type === "z2" && d.role === "key") add("z2_ignored", `${d.date}: chtěl Z2, plán kvalita`);
    if (f.own && d.minutes !== f.own.min) add("own_minutes", `${d.date}: vlastní jízda ${f.own.min} min, plán ${d.minutes}`);
    if (f.minutes && !f.own && (d.role === "key" ? d.minutes > Math.max(Math.min(f.minutes, MAX_DAY_MIN[d.sport]) + 5, 45) || d.minutes < Math.min(f.minutes, MAX_DAY_MIN[d.sport]) - 5 : Math.abs(d.minutes - Math.min(f.minutes, MAX_DAY_MIN[d.sport])) > 5)) add("user_minutes", `${d.date}: chtěl ${f.minutes} min, plán ${d.minutes} (${d.role}, ${d.sport})`);
  }

  // --- pravidla rozložení (bez tvých vynucených dnů) ---
  const userDay = (d: string) => { const f = fixed.get(d); return !!(f && (f.sport || f.minutes || f.own || f.edit || f.type)); };
  const planOf = new Map(days.map((d) => [d.date, d]));
  const trainedOn = (d: string) => (planOf.has(d) ? planOf.get(d)!.role !== "rest" : d === raceDate || trainedAct(d));
  const isPrimary = (s: string) => (inp.profile.primary === "run" ? s === "run" : BIKE_SPORTS.includes(s as never));
  const typical = (() => { const r = inp.acts.filter((a) => a.date > addDays(T, -28) && isPrimary(a.sport) && (a.moving_s ?? 0) >= 20 * 60).map((a) => (a.moving_s ?? 0) / 60).sort((a, b) => a - b); return r.length ? r[Math.floor(r.length / 2)]! : 60; })();
  const hardOn = (d: string) => {
    const p = planOf.get(d);
    if (p) return p.role === "key" || p.role === "long";
    if (d === raceDate) return true;
    const acts = inp.acts.filter((a) => a.date === d);
    const mins = acts.reduce((t, a) => t + (a.moving_s ?? 0) / 60, 0);
    return acts.some((a) => a.quality) || mins >= Math.max(110, typical * 1.5);
  };
  let run = 0, user = false;
  for (let d = addDays(from, -3); d <= days[days.length - 1]!.date; d = addDays(d, 1)) {
    if (!trainedOn(d)) { run = 0; user = false; continue; }
    run++;
    if (planOf.has(d) && userDay(d)) user = true;
    if (run > 3 && planOf.has(d) && !user) { add("streak", `${d}: ${run} dny tréninku za sebou`); break; }
  }
  for (const d of days) {
    if (d.role !== "key" || fixed.get(d.date)?.type === "quality") continue;
    const y = addDays(d.date, -1);
    if (hardOn(y)) add("key_after_hard", `${d.date}: kvalita po těžkém dni ${y} (${planOf.get(y)?.role ?? "skutečnost"})`);
  }
  for (const w of H) {
    const keys = w.days.filter((d) => d.role === "key" && fixed.get(d.date)?.type !== "quality").length;
    const longs = w.days.filter((d) => d.role === "long" && !userDay(d.date)).length;
    if (keys > 2) add("keys_week", `${w.weekStart}: ${keys} kvalit`);
    if (longs > 1) add("long_week", `${w.weekStart}: ${longs} dlouhé`);
    if (w.phaseLabel === "Po závodě" && keys > 0) add("post_key", `${w.weekStart}: kvalita v týdnu po závodě`);
  }
  // týden se závodem: po závodě do týdne žádná kvalita
  if (raceDate) for (const d of days) if (d.role === "key" && d.date > raceDate && d.date <= addDays(raceDate, 7) && fixed.get(d.date)?.type !== "quality") add("key_after_race", `${d.date}: kvalita do týdne po závodě ${raceDate}`);
  // nemoc 4+ dny → tento týden bez kvality; únava pod −30 nejvýš 1
  const w0keys = H[0]!.days.filter((d) => d.role === "key" && fixed.get(d.date)?.type !== "quality").length;
  if (inp.fatigue.illnessDays >= 4 && w0keys > 0) add("ill_key", `nemoc ${inp.fatigue.illnessDays} dny, a přesto ${w0keys} kvalita`);
  // návrat po pauze: strop intenzity
  if (inp.reentry) for (const k of c.keyDays) {
    if (fixed.get(k.date)?.type === "quality") continue;
    const ceil = inp.reentry.ceilingOn(k.date);
    if (ceil === "base") add("reentry_base", `${k.date}: kvalita ${k.cat} v prvním týdnu po pauze`);
    if (ceil === "tempo" && k.cat !== "tempo" && k.cat !== "ss" && !fixed.get(k.date)?.edit) add("reentry_tempo", `${k.date}: ${k.cat} při stropu tempo/SS`);
  }
  // běh: žádné VO2, délka ve stropu běhu podle běžecké historie
  const rr = runReadiness(inp.acts, T, inp.profile.primary === "run");
  const runCap = runCapOf(rr.longest);
  for (const k of c.keyDays) if (k.sport === "run" && (k.cat === "vo2" || k.cat === "vo2s")) add("run_vo2", `${k.date}: běh ${k.cat}`);
  for (const d of days) if (d.sport === "run" && d.role !== "rest" && d.minutes > runCap + 15 && !fixed.get(d.date)?.minutes && !fixed.get(d.date)?.own) add("run_cap", `${d.date}: běh ${d.minutes} min nad strop ${runCap}`);
  // sport bez intervalů nedostane kvalitu (kromě tvé výslovné volby)
  for (const d of days) {
    if (d.role !== "key" || fixed.get(d.date)?.type === "quality") continue;
    const s = d.sport;
    const ok = s === inp.profile.primary || (!!inp.profile.sports[s]?.quality && (s !== "run" || rr.experienced));
    if (!ok) add("sport_no_quality", `${d.date}: kvalita na sportu ${s}, který intervaly nemá`);
  }

  // --- zátěž týdne: plán nepřesáhne cíl (kromě tvých pevných dnů a minimálních délek) ---
  for (const w of H) {
    const userLoad = w.days.filter((d) => userDay(d.date)).reduce((t, d) => t + d.load, 0);
    const free = w.load - userLoad;
    // týden odjetý nad plán: kvalita z plánu zůstává (má přednost před objemem), ubírá se Z2
    const onlyKeys = w.days.every((d) => d.role === "rest" || d.role === "key" || userDay(d.date));
    if (free > Math.max(w.target * 1.15, w.target + 45) && !onlyKeys) add("over_target", `${w.weekStart}: plán ${w.load} (z toho tvoje dny ${userLoad}) nad cíl ${w.target}`);
    // týden, který má co trénovat, nesmí být celý prázdný jen kvůli jednomu dni
    const open = w.days.filter((d) => !d.blocked && !fixed.get(d.date)?.rest).length;
    if (w.target >= 100 && w.load === 0 && open >= 4) add("empty_week", `${w.weekStart}: cíl ${w.target}, ale v plánu nic (volných dní ${open})`);
  }
  for (const d of days) if (new Set(d.why).size !== d.why.length) { add("dup_why", `${d.date}: opakovaný důvod (${d.why.join(" | ").slice(0, 100)})`); break; }

  // --- forma a závěrečná kontrola trenéra ---
  for (const it of c.validation.items) if (it.level === "error") add(`val_${it.code}`, it.text);
  for (const it of c.validation.items) if (it.level === "error" && !out.warnings.includes(it.text)) add("val_hidden", `chyba kontroly se neukázala: ${it.text}`);
  return v;
}

/** Souhrn porušení: počty podle kódu + první příklad (se seedem) – do zprávy testu. */
export class Tally {
  counts = new Map<string, { n: number; first: string }>();
  cases = 0;
  add(vs: Violation[], ctx: string) {
    this.cases++;
    for (const x of vs) {
      const e = this.counts.get(x.code);
      if (e) e.n++;
      else this.counts.set(x.code, { n: 1, first: `${ctx} :: ${x.msg}` });
    }
  }
  report(): string {
    return [...this.counts.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `${k}: ${e.n}× z ${this.cases} (např. ${e.first})`).join("\n");
  }
  get ok() { return this.counts.size === 0; }
}
