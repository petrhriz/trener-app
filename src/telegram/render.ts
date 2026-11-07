// Šablony zpráv pro Telegram (HTML). Fungují bez LLM; každé číslo pochází z reportu.
import type { ActivityAnalysis } from "../core/activity";
import type { WeeklyReview } from "../core/extras";
import { type Change, type PlanDay, type PlanResult, changeLine, formText } from "../core/plan";
import { windowText } from "../core/weather";
import { dayDm, dm, hmm, num, sleepH } from "../lib/format";
import type { Readiness } from "../report/build";
import { escapeHtml as e, type InlineButton } from "./api";

export function link(base: string | undefined, path: string, label: string): string {
  return base ? `<a href="${base.replace(/\/$/, "")}/#/${path}">${label}</a>` : "";
}

export function changesBlock(changes: Change[]): string {
  if (!changes.length) return "";
  return ["✏️ <b>Změny v kalendáři:</b>", ...changes.map((c) => e(changeLine(c))), "Napiš „ano“ (vše), „ano Z1, Z3“ nebo „ne Z2“."].join("\n");
}

export function changeButtons(pid: number, changes: Change[]): InlineButton[][] {
  if (!changes.length) return [];
  return [[
    { text: "✅ Zapsat vše", callback_data: `p:all:${pid}` },
    { text: "Vybrat…", callback_data: `p:pick:${pid}` },
    { text: "✖ Nic", callback_data: `p:none:${pid}` },
  ]];
}

export function dayButtons(date: string): InlineButton[][] {
  return [[
    { text: "🚫 Dnes nepojedu", callback_data: `d:skip:${date}` },
    { text: "🪶 Lehčí", callback_data: `d:easy:${date}` },
  ]];
}

function rideLines(d: PlanDay): string[] {
  const out: string[] = [];
  if (!d.name) return [`🚴 ${d.tag}`];
  out.push(`🚴 ${e(d.name)} · ${hmm((d.durationMin ?? 0) * 60)}${d.indoor || d.name.startsWith("Trenažér") ? "" : " · venku"}`);
  if (d.targetText) out.push(`🎯 ${e(d.targetText)}`);
  if (d.steps.length) out.push(`📋 ${e(d.steps.join(" · "))}`);
  if (!d.indoor && d.weather) out.push(`🌤️ ${e(d.weather.text)} · okno ${windowText(d.weather)}`);
  else if (!d.indoor) out.push(`🌤️ ${e(d.weatherText)}`);
  if (d.carbs) out.push(`🍬 ${e(d.carbs.text)}`);
  out.push(`🔋 Zátěž ${num(d.load)}${d.loadNote ? ` (${e(d.loadNote)})` : ""}`);
  return out;
}

export function readinessMessage(r: Readiness, base?: string): string {
  const rec = r.recovery;
  const L: string[] = [];
  const dec = r.today.decision === "Odjeto" ? `dnes odjeto` : r.today.day?.name ? `${r.today.decision.toLowerCase()}: ${r.today.day.name}` : r.today.decision.toLowerCase();
  L.push(`<b>${rec.emoji} ${rec.stateLabel}, ${e(dec)}.</b>`);
  if (r.missingData.length) L.push(`⚠️ Nemám ${r.missingData.join(", ")} (Garmin se asi ještě nesynchronizoval).`);
  const hrv = rec.hrv.today != null ? `HRV ${num(rec.hrv.today)} ms (${rec.hrv.rating ?? "nehodnotím"}, norma ${rec.hrv.rangeText})` : rec.hrv.status === "insufficient" ? `HRV nehodnotím, jen ${rec.hrv.norm.n} hodnot` : "HRV nemám";
  const rhr = rec.rhr.today != null ? `klidový tep ${num(rec.rhr.today)} bpm (${rec.rhr.rating ?? "nehodnotím"})` : "klidový tep nemám";
  const sl = rec.sleep.today != null || rec.sleep.score != null ? `spánek ${sleepH(rec.sleep.today)}${rec.sleep.score != null ? ` (skóre ${num(rec.sleep.score)} ${rec.sleep.rating})` : rec.sleep.rating ? ` (${rec.sleep.rating})` : ""}` : "spánek nemám";
  L.push(`😴 ${hrv} · ${rhr} · ${sl}`);
  if (rec.dayAfter) L.push(`😴 Po ${e(rec.dayAfter)} je nižší HRV a vyšší tep očekávaný, jeden 🟡 nepočítám.`);
  const f = r.fitness;
  L.push(`📊 Forma ${formText(f.form)} · kondice ${num(f.ctl, 1)} · zátěž 7 dní ${f.load7}`);
  L.push(`🚦 <b>${e(r.today.decision)}</b> – ${e(r.today.decisionWhy)}`);
  const d = r.today.day;
  if (d && r.today.decision !== "Odjeto" && r.today.decision !== "Volno") L.push(...rideLines(d));
  L.push(`➡️ Zítra: ${e(r.tomorrow)}`);
  for (const w of r.warnings) L.push(`⚠️ ${e(w)}`);
  const cb = changesBlock(r.changes);
  if (cb) L.push("", cb);
  const lk = link(base, "trener", "Připravenost v dashboardu");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function activityMessage(a: ActivityAnalysis, base?: string): string {
  const km = a.summary.km != null && a.summary.km > 0.5 && !a.indoor ? `, ${num(a.summary.km, 1)} km` : "";
  const plan = a.planLoad ? ` (plan ${num(a.planLoad)})`.replace("plan", "plán") : "";
  const comp = a.compliance != null ? `, splnění ${a.compliance} %` : "";
  const L = [
    `<b>${a.emoji} ${e(a.verdict)}</b>`,
    `${dayDm(a.date)} ${e(a.title)}: ${hmm(a.summary.durationS)} h${km}, zátěž ${num(a.load)}${plan}${comp}, ${e(a.summary.mainPoint)}.`,
    `🎯 ${e(a.goal)}`,
  ];
  if (a.laps.show && a.laps.rows.length <= 12) {
    L.push("🔥 " + a.laps.rows.map((r) => `${e(r.name)} ${r.time}${r.power ? ` ${r.power}` : ""} ${r.hr}`).join(" · "));
  }
  if (a.laps.note) L.push(`<i>${e(a.laps.note)}</i>`);
  const lk = link(base, `aktivita/${a.id}`, "Rozbor v dashboardu");
  if (lk) L.push(lk);
  return L.join("\n");
}

export function planMessage(p: PlanResult, title: string, base?: string): string {
  const L: string[] = [`<b>🗓️ ${e(title)} ${dm(p.from)}–${dm(p.to)}</b>`];
  for (const d of p.days) {
    const t = d.name ? `${e(d.name)} · ${hmm((d.durationMin ?? 0) * 60)}${d.indoor ? "" : " · venku"}` : e(d.tag);
    const extra = d.name && !d.indoor && d.weather ? ` · ${e(d.weather.text)}` : "";
    L.push(`${d.isToday ? "▶️ " : ""}${dayDm(d.date)}: ${t}${extra} · 🔋 ${num(d.load)}${d.orientational ? " · orientační" : ""}`);
  }
  L.push(`🔋 Posledních 7 dní ${p.loadPast7} · příštích 7 dní ${p.loadNext7} (odhad)`);
  for (const q of p.qualityWeeks) L.push(`Kvalita ${dm(q.from)}–${dm(q.to)}: ${q.count} z ${q.limit}`);
  for (const w of p.warnings) L.push(`⚠️ ${e(w)}`);
  const cb = changesBlock(p.changes);
  L.push("", cb || "Kalendář odpovídá plánu, nic neměním.");
  const lk = link(base, "trener", "Plán v dashboardu");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function tomorrowMessage(p: PlanResult, base?: string): string {
  const d = p.days.find((x) => !x.isToday);
  const L: string[] = [];
  if (!d) return "Zítra: –";
  L.push(`<b>➡️ Zítra ${dayDm(d.date)}: ${e(d.name ?? d.tag)}</b>`);
  if (d.name) L.push(...rideLines(d));
  else if (d.weather) L.push(`🌤️ ${e(d.weather.text)}`);
  if (d.note) L.push(`<i>${e(d.note)}</i>`);
  L.push(`📊 Forma zítra ráno ${formText(d.form)}`);
  const cb = changesBlock(p.changes);
  if (cb) L.push("", cb);
  const lk = link(base, "trener", "Plán v dashboardu");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function weeklyMessage(w: WeeklyReview, p: PlanResult, ctlStart: number | null, ctlEnd: number | null, base?: string): string {
  const L: string[] = [`<b>📅 Týden ${dm(w.from)}–${dm(w.to)}</b>`];
  L.push(`Plán vs. skutečnost: jízdy ${w.plannedCount} / ${w.doneCount} · čas ${hmm(w.plannedMin * 60)} / ${hmm(w.doneMin * 60)} h · zátěž ${w.plannedLoad} / ${w.doneLoad}`);
  L.push(`Kvalita ${w.qualityPlanned} / ${w.qualityDone}${w.qualityList.length ? ` (${e(w.qualityList.join(", "))})` : ""}`);
  if (ctlStart != null && ctlEnd != null) L.push(`📊 Kondice ${num(ctlStart, 1)} → ${num(ctlEnd, 1)}`);
  if (w.missed.length) L.push(`Vynecháno: ${e(w.missed.join(", "))} (nedoháníme).`);
  if (w.easyNotEasy.length) L.push(`Z2 nebyla lehká: ${e(w.easyNotEasy.join(", "))}`);
  if (w.z2DriftAvg != null) L.push(`Drift Z2 jízd průměr ${num(w.z2DriftAvg, 1)} %`);
  for (const x of w.wins) L.push(`✅ ${e(x)}`);
  for (const x of w.flags) L.push(`⚠️ ${e(x)}`);
  for (const x of w.adjustments) L.push(`🎯 ${e(x)}`);
  if (w.trend) L.push(`📈 ${e(w.trend)}`);
  L.push("", planMessage(p, "Plán na další týden", base));
  return L.join("\n");
}

export function helpMessage(): string {
  return [
    "<b>Trenér – příkazy</b>",
    "/rano – připravenost (zotavení, forma, dnešek)",
    "/stav – celý denní report",
    "/plan – plán na 7 dní a návrh změn",
    "/zitra – zítřejší jednotka",
    "/aktivita [21.10. | včera | běžky] – rozbor aktivity",
    "/tyden – týdenní review",
    "/pocasi – počasí a okna na jízdu",
    "/nemuzu &lt;den&gt; · /hokej &lt;den&gt; · /bezky &lt;den&gt; · /nemoc · /nepojedu",
    "/cil zlepseni | udrzeni | pokles – režim plánu",
    "/ftp 272 · /vaha 75,5 · /jizd 3 (jízdy týdně)",
    "/sila [poznámka] · /mobilita [poznámka]",
    "/fit [zítra|datum] – workout jako FIT soubor do Edge 530",
    "/dashboard · /nastaveni · /export · /pomoc",
    "",
    "Na návrh změn odpověz „ano“, „ano Z1, Z3“ nebo „ne Z2“. Volnou otázku napiš normálně.",
  ].join("\n");
}
