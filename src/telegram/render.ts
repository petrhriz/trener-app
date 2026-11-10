// Šablony zpráv pro Telegram (HTML). Fungují bez LLM; každé číslo pochází z reportu.
// Styl: krátké bloky s tučným nadpisem, jedna věc na řádek, symbol jen na začátku řádku.
import type { ActivityAnalysis } from "../core/activity";
import type { WeeklyReview } from "../core/extras";
import { type Change, type PlanDay, type PlanResult, formText } from "../core/plan";
import type { DayWeather } from "../core/weather";
import { windowText } from "../core/weather";
import { dayDm, dm, hmm, num, sleepH } from "../lib/format";
import type { Readiness } from "../report/build";
import { escapeHtml as e, type InlineButton } from "./api";

export function link(base: string | undefined, path: string, label: string): string {
  return base ? `<a href="${base.replace(/\/$/, "")}/#/${path}">${label}</a>` : "";
}

const ACTION: Record<string, string> = { nová: "➕", upravit: "✏️", přesunout: "↔️", smazat: "🗑️" };
const DAYS = ["", "Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const dshort = (d: string) => {
  const g = new Date(d + "T12:00:00Z").getUTCDay();
  return `${DAYS[g === 0 ? 7 : g]} ${+d.slice(8, 10)}.${+d.slice(5, 7)}.`;
};
const SPORT_ICO: Record<string, string> = { ride: "🚴", run: "🏃", xc_ski: "🎿", walk: "🚶" };

function dayIcon(d: PlanDay): string {
  if (!d.name) return d.kind === "hockey" ? "🏒" : d.kind === "xc_ski" ? "🎿" : d.kind === "blocked" ? "⛔" : "🛋️";
  return d.indoor ? "🏠" : SPORT_ICO[d.sport] ?? "🚴";
}

/** Krátké počasí: 8° · 30 % 🌧 · vítr 35 */
function wShort(w: DayWeather | null): string {
  if (!w) return "";
  const p: string[] = [`${num(w.tmax)}°`];
  if (w.rainProb >= 30) p.push(`déšť ${num(w.rainProb)} %`);
  if (w.gustMax > 40) p.push(`vítr ${num(w.gustMax)}`);
  if (w.frost) p.push("mráz ráno");
  return p.join(", ");
}

export function changesBlock(changes: Change[]): string {
  if (!changes.length) return "";
  return [
    `<b>Návrh změn v kalendáři (${changes.length})</b>`,
    ...changes.map((c) => `${ACTION[c.action] ?? "•"} <b>${c.code}</b> ${dshort(c.date)} ${e(c.name)}${c.why ? `\n      <i>${e(c.why)}</i>` : ""}`),
    "<i>Tlačítkem, nebo napiš „ano“ / „ano 1, 3“ / „ne 2“.</i>",
  ].join("\n");
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
    { text: "🔄 Jiný sport", callback_data: `s:pick:${date}` },
  ]];
}

/** Tlačítka pro změnu sportu / volna jednoho dne (jako na webu). */
export function sportButtons(date: string): InlineButton[][] {
  return [[
    { text: "🚴 Kolo", callback_data: `s:${date}:ride` },
    { text: "🏃 Běh", callback_data: `s:${date}:run` },
    { text: "🎿 Běžky", callback_data: `s:${date}:xc_ski` },
    { text: "🛋️ Volno", callback_data: `s:${date}:rest` },
  ]];
}

/** Výběr dne pro změnu (plán 7 dní). */
export function dayPickButtons(days: PlanDay[]): InlineButton[][] {
  const rows: InlineButton[][] = [];
  const btn = days.map((d) => ({ text: `${dayIcon(d)} ${dshort(d.date).split(" ")[0]} ${+d.date.slice(8, 10)}.`, callback_data: `s:pick:${d.date}` }));
  for (let i = 0; i < btn.length; i += 4) rows.push(btn.slice(i, i + 4));
  return rows;
}

function unitLines(d: PlanDay): string[] {
  const out: string[] = [];
  if (!d.name) return [`${dayIcon(d)} ${e(d.tag)}`];
  out.push(`${dayIcon(d)} <b>${e(d.name)}</b> · ${hmm((d.durationMin ?? 0) * 60)} h`);
  if (d.targetText) out.push(`🎯 ${e(d.targetText)}`);
  if (d.steps.length) out.push(...d.steps.map((s) => `   • ${e(s)}`));
  if (!d.indoor && d.weather && d.sport === "ride") out.push(`🌤️ ${e(wShort(d.weather))} · okno ${windowText(d.weather)}`);
  if (d.carbs) out.push(`🍬 ${e(d.carbs.text)}`);
  return out;
}

export function readinessMessage(r: Readiness, base?: string): string {
  const rec = r.recovery;
  const L: string[] = [];
  L.push(`${rec.emoji} <b>${e(rec.stateLabel)}</b>`);
  L.push(`Dnes: <b>${e(r.today.decision === "Odtrénováno" ? "odtrénováno" : r.today.day?.name ?? r.today.decision)}</b>`);
  L.push(`<i>${e(r.today.decisionWhy)}</i>`);
  if (r.missingData.length) L.push(`⚠️ Nemám ${r.missingData.join(", ")} – Garmin se asi ještě nesynchronizoval.`);
  const d = r.today.day;
  if (d && d.name && r.today.decision !== "Odtrénováno" && r.today.decision !== "Volno") L.push("", ...unitLines(d));

  L.push("", "<b>Zotavení</b>");
  L.push(rec.hrv.today != null ? `VST ${num(rec.hrv.today)} ms · ${e(rec.hrv.rating ?? "–")} (norma ${e(rec.hrv.rangeText)})` : rec.hrv.status === "insufficient" ? `VST: málo dat (${rec.hrv.norm.n})` : "VST: nemám");
  L.push(rec.rhr.today != null ? `Klidový tep ${num(rec.rhr.today)} · ${e(rec.rhr.rating ?? "–")}` : "Klidový tep: nemám");
  L.push(rec.sleep.today != null || rec.sleep.score != null ? `Spánek ${sleepH(rec.sleep.today)}${rec.sleep.score != null ? ` · skóre ${num(rec.sleep.score)}` : ""}` : "Spánek: nemám");
  if (rec.dayAfter) L.push(`<i>Po ${e(rec.dayAfter)} je horší VST a vyšší tep očekávaný.</i>`);

  const f = r.fitness;
  L.push("", `<b>Kondice</b>`, `Forma ${formText(f.form)} · CTL ${num(f.ctl, 1)} · 7 dní ${f.load7}`);
  L.push("", `<b>Zítra</b>`, e(r.tomorrow));
  for (const w of r.warnings) L.push(`⚠️ ${e(w)}`);
  const cb = changesBlock(r.changes);
  if (cb) L.push("", cb);
  const lk = link(base, "prehled", "Otevřít dashboard");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function activityMessage(a: ActivityAnalysis, base?: string): string {
  const km = a.summary.km != null && a.summary.km > 0.5 && !a.indoor ? `${num(a.summary.km, 1)} km · ` : "";
  const L = [
    `${a.emoji} <b>${e(a.title)}</b>`,
    `${dshort(a.date)} · ${km}${hmm(a.summary.durationS)} h · zátěž ${num(a.load)}${a.planLoad ? ` (plán ${num(a.planLoad)})` : ""}`,
    "",
    `🎯 ${e(a.goal)}`,
  ];
  if (a.compliance != null) L.push(`✅ Splnění plánu ${a.compliance} %`);
  if (a.summary.mainPoint) L.push(`📌 ${e(a.summary.mainPoint)}`);
  if (a.laps.show && a.laps.rows.length <= 12) {
    L.push("", "<b>Okruhy</b>");
    for (const r of a.laps.rows) L.push(`${e(r.name)}: ${r.time}${r.power ? ` · ${r.power}` : ""} · ${r.hr}`);
  }
  if (a.laps.note) L.push(`<i>${e(a.laps.note)}</i>`);
  const lk = link(base, `aktivita/${a.id}`, "Rozbor v dashboardu");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function planMessage(p: PlanResult, title: string, base?: string): string {
  const L: string[] = [`🗓️ <b>${e(title)} ${dm(p.from)}–${dm(p.to)}</b>`, ""];
  for (const d of p.days) {
    const head = `${d.isToday ? "▶️ " : ""}<b>${dshort(d.date)}</b>`;
    if (!d.name) {
      L.push(`${head}  ${dayIcon(d)} ${e(d.tag)}`);
      continue;
    }
    const w = !d.indoor && d.weather && d.sport === "ride" ? ` · ${e(wShort(d.weather))}` : "";
    L.push(`${head}  ${dayIcon(d)} ${e(d.name)} · ${hmm((d.durationMin ?? 0) * 60)}${w}${d.orientational ? " <i>(orient.)</i>" : ""}`);
  }
  L.push("", `Zátěž: 7 dní zpět ${p.loadPast7} · dopředu ${p.loadNext7}`);
  const q = p.qualityWeeks[p.qualityWeeks.length - 1];
  if (q) L.push(`Kvalita tento týden: ${p.qualityWeeks[0]!.count} z ${p.qualityWeeks[0]!.limit}`);
  for (const w of p.warnings) L.push(`⚠️ ${e(w)}`);
  const cb = changesBlock(p.changes);
  L.push("", cb || "✔️ Kalendář odpovídá plánu.");
  const lk = link(base, "trener", "Plán v dashboardu");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function tomorrowMessage(p: PlanResult, base?: string): string {
  const d = p.days.find((x) => !x.isToday);
  if (!d) return "Zítra: –";
  const L: string[] = [`➡️ <b>Zítra ${dshort(d.date)}</b>`, ""];
  L.push(...unitLines(d));
  if (!d.name && d.weather) L.push(`🌤️ ${e(wShort(d.weather))}`);
  if (d.note) L.push("", `<i>${e(d.note)}</i>`);
  L.push("", `Forma zítra ráno ${formText(d.form)}`);
  const cb = changesBlock(p.changes);
  if (cb) L.push("", cb);
  const lk = link(base, "trener", "Plán v dashboardu");
  if (lk) L.push("", lk);
  return L.join("\n");
}

export function weeklyMessage(w: WeeklyReview, p: PlanResult, ctlStart: number | null, ctlEnd: number | null, base?: string): string {
  const L: string[] = [`📅 <b>Týden ${dm(w.from)}–${dm(w.to)}</b>`, ""];
  L.push("<b>Plán → skutečnost</b>");
  L.push(`Jednotky ${w.plannedCount} → ${w.doneCount}`);
  L.push(`Čas ${hmm(w.plannedMin * 60)} → ${hmm(w.doneMin * 60)} h`);
  L.push(`Zátěž ${w.plannedLoad} → ${w.doneLoad}`);
  L.push(`Kvalita ${w.qualityPlanned} → ${w.qualityDone}${w.qualityList.length ? ` (${e(w.qualityList.join(", "))})` : ""}`);
  if (ctlStart != null && ctlEnd != null) L.push(`Kondice ${num(ctlStart, 1)} → ${num(ctlEnd, 1)}`);
  const notes: string[] = [];
  if (w.missed.length) notes.push(`Vynecháno: ${e(w.missed.join(", "))} (nedoháníme)`);
  if (w.easyNotEasy.length) notes.push(`Z2 nebyla lehká: ${e(w.easyNotEasy.join(", "))}`);
  if (w.z2DriftAvg != null) notes.push(`Drift Z2 jízd ${num(w.z2DriftAvg, 1)} %`);
  if (notes.length || w.wins.length || w.flags.length) {
    L.push("", "<b>Hodnocení</b>");
    for (const x of w.wins) L.push(`✅ ${e(x)}`);
    for (const x of w.flags) L.push(`⚠️ ${e(x)}`);
    for (const x of notes) L.push(`• ${x}`);
  }
  if (w.adjustments.length || w.trend) {
    L.push("", "<b>Příště</b>");
    for (const x of w.adjustments) L.push(`🎯 ${e(x)}`);
    if (w.trend) L.push(`📈 ${e(w.trend)}`);
  }
  L.push("", planMessage(p, "Plán na další týden", base));
  return L.join("\n");
}

export function helpMessage(): string {
  return [
    "<b>Trenér – co umím</b>",
    "",
    "<b>Tlačítka dole</b>: Dnes · Plán · Zítra · Aktivita · Týden · Dashboard",
    "",
    "<b>Změna plánu</b>",
    "„zítra běh místo kola“ · „dnes běžky“ · „příští týden jen běh“",
    "„nemůžu ve středu“ · „hokej pá“ · „jsem nemocný“ · „dnes nepojedu“",
    "nebo v plánu tlačítko 🔄 Změnit den",
    "",
    "<b>Zápis</b>",
    "/vaha 75,5 · /sila · /mobilita · /ftp 298 · /cil udrzeni",
    "",
    "<b>Další</b>",
    "/pocasi · /fit zítra (workout do Edge) · /nastaveni · /export",
    "",
    "Na cokoli jiného se zeptej normální větou.",
  ].join("\n");
}

/** Spodní menu (reply klávesnice) – zůstává pod polem pro psaní. */
export const MENU_KEYBOARD = {
  keyboard: [
    [{ text: "Dnes" }, { text: "Plán" }, { text: "Zítra" }],
    [{ text: "Aktivita" }, { text: "Týden" }, { text: "Dashboard" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};
