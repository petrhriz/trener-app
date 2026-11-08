// Telegram: příkazy, volný text (záměr nejdřív pravidly, LLM až jako záloha), tlačítka Z1… a „ano / ne“.
import type { Env } from "../env";
import { carbsFor } from "../core/nutrition";
import type { Change } from "../core/plan";
import { windowText } from "../core/weather";
import { z2Workout, renderIcu, totalSeconds, type Workout } from "../core/workout";
import { GOAL_LABEL, type Goal } from "../core/fitness";
import { all, first, getState, run, setState } from "../lib/db";
import { dayDm, dm, num } from "../lib/format";
import { getSettings, setSetting } from "../lib/settings";
import { addDays, dow, localNow } from "../lib/time";
import { ownRideName, ownRideNote, parseOwnRide } from "../core/ownRide";
import { answerQuestion, ruleAnswer } from "../llm/llm";
import { encodeWorkoutFit } from "../plan/fit";
import { addConstraint, applyChanges, getProposal, openProposal, parseConsent, saveProposal } from "../plan/proposals";
import { activityReport, findActivity, fitnessTable, ftpCheckOf, planFor, readiness, recoveryFor, weatherMap, weekly } from "../report/build";
import { loadCtx } from "../report/context";
import { recomputeLoads, recomputeMetrics } from "../sync/metrics";
import { escapeHtml as e, sendMessage, tgCall, type InlineButton } from "./api";
import {
  activityMessage, changeButtons, dayButtons, dayPickButtons, helpMessage, MENU_KEYBOARD, planMessage, readinessMessage, sportButtons, tomorrowMessage, weeklyMessage,
} from "./render";

export async function send(env: Env, html: string, buttons?: InlineButton[][]): Promise<void> {
  // Telegram limit 4096 znaků – dělení po řádcích
  const parts: string[] = [];
  let cur = "";
  for (const line of html.split("\n")) {
    if ((cur + "\n" + line).length > 3900) {
      parts.push(cur);
      cur = line;
    } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) parts.push(cur);
  for (let i = 0; i < parts.length; i++) await sendMessage(env, parts[i]!, i === parts.length - 1 && buttons?.length ? buttons : undefined);
}

export async function sendDocument(env: Env, filename: string, data: Uint8Array | string, caption: string, mime = "application/octet-stream") {
  const fd = new FormData();
  fd.append("chat_id", env.TELEGRAM_CHAT_ID!);
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  fd.append("document", new Blob([data], { type: mime }), filename);
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
  const j = (await res.json()) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(`Telegram sendDocument: ${j.description}`);
}

const DAY_WORDS: [RegExp, number][] = [
  [/\b(po|pond[eě]l[ií])/, 1],
  [/\b([uú]t|[uú]ter[yý])/, 2],
  [/\b(st|st[rř]ed[auy]|st[rř]edu)/, 3],
  [/\b([cč]t|[cč]tvrt[eo]k)/, 4],
  [/\b(p[aá]|p[aá]tek)/, 5],
  [/\b(so|sobot[auy])/, 6],
  [/\b(ne|ned[eě]l[ei])\b/, 7],
];

/** „dnes“, „zítra“, „ve středu“, „21.11.“ → datum (vždy dnes nebo později). */
export function parseDay(text: string, T: string): string | null {
  const t = text.toLowerCase();
  if (/\bdnes\b/.test(t)) return T;
  if (/z[ií]tra|zitra/.test(t)) return addDays(T, 1);
  if (/poz[ií]t[rř][ií]/.test(t)) return addDays(T, 2);
  const m = /(\d{1,2})\.\s*(\d{1,2})\.?/.exec(t);
  if (m) {
    let d = `${T.slice(0, 4)}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    if (d < T) d = `${+T.slice(0, 4) + 1}${d.slice(4)}`;
    return d;
  }
  for (const [re, wd] of DAY_WORDS) {
    if (re.test(t.replace(/^\/\w+\s*/, ""))) {
      const diff = (wd - dow(T) + 7) % 7;
      return addDays(T, diff);
    }
  }
  return null;
}

function base(env: Env): string | undefined {
  return env.PUBLIC_URL || undefined;
}

// ---------- příkazy ----------

async function cmdRano(env: Env) {
  const ctx = await loadCtx(env);
  const r = await readiness(ctx);
  const pid = await saveProposal(env, "rano", r.changes);
  const btn = [...changeButtons(pid, r.changes)];
  if (r.today.day?.name && !r.today.done.length) btn.push(...dayButtons(ctx.T));
  await send(env, readinessMessage(r, base(env)), btn);
}

async function cmdPlan(env: Env, title = "Plán") {
  const ctx = await loadCtx(env);
  const p = await planFor(ctx);
  const pid = await saveProposal(env, "plan", p.changes);
  await send(env, planMessage(p, title, base(env)), [...changeButtons(pid, p.changes), [{ text: "🔄 Změnit den (sport / volno)", callback_data: "s:days" }]]);
}

async function cmdMenu(env: Env) {
  await tgCall(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: helpMessage(), parse_mode: "HTML", reply_markup: MENU_KEYBOARD });
}

async function cmdZitra(env: Env) {
  const ctx = await loadCtx(env);
  const p = await planFor(ctx);
  const pid = await saveProposal(env, "zitra", p.changes);
  const btn = changeButtons(pid, p.changes);
  const d = p.days.find((x) => x.date === addDays(ctx.T, 1));
  if (d?.workout) btn.push([{ text: "📥 FIT do Edge 530", callback_data: `f:${d.date}` }]);
  await send(env, tomorrowMessage(p, base(env)), btn);
}

async function cmdAktivita(env: Env, arg: string) {
  const ctx = await loadCtx(env);
  const acts = findActivity(ctx, arg || undefined);
  if (!acts.length) {
    await send(env, arg ? `Aktivitu „${e(arg)}“ za posledních 90 dní nenacházím.` : "Žádnou aktivitu za posledních 90 dní nemám.");
    return;
  }
  const todayPlanned = ctx.calendar.find((c) => c.date === ctx.T && c.status === "planned" && c.kind !== "rest");
  if (!arg && todayPlanned && acts[0]!.date !== ctx.T && ctx.now.hh >= 18) await send(env, "Dnešní aktivita se asi ještě nesynchronizovala, ukazuji poslední synchronizovanou.");
  for (const a of acts) await send(env, activityMessage(activityReport(ctx, a), base(env)));
}

async function cmdTyden(env: Env) {
  const ctx = await loadCtx(env);
  const mon = addDays(ctx.T, 1 - dow(ctx.T));
  const from = dow(ctx.T) === 7 ? mon : addDays(mon, -7);
  const w = await weekly(ctx, from);
  const p = await planFor(ctx);
  const pid = await saveProposal(env, "tyden", p.changes);
  const ctlS = ctx.metrics.find((m) => m.date === addDays(from, -1))?.ctl ?? null;
  const ctlE = ctx.metrics.find((m) => m.date === addDays(from, 6))?.ctl ?? null;
  await send(env, weeklyMessage(w, p, ctlS, ctlE, base(env)), changeButtons(pid, p.changes));
  // podezření na špatné FTP → doporučit test (jen v týdenním souhrnu, ať to neotravuje denně)
  const fc = ftpCheckOf(ctx, await getState<string>(env.DB, "ftp_set_at"));
  if (fc.suggest) await send(env, `⚡ <b>${e(fc.title)}</b>\n${fc.reasons.map((r) => "• " + e(r)).join("\n")}\nTest: 20 min naplno po rozjetí (FTP = 95 % průměru) nebo ramp test na trenažéru. Nové FTP zadej v intervals.icu nebo /ftp 280.`);
}

async function cmdStav(env: Env) {
  await cmdRano(env);
  await cmdAktivita(env, "");
  await cmdPlan(env);
}

async function cmdPocasi(env: Env) {
  const ctx = await loadCtx(env);
  if (!ctx.weatherOk) return send(env, "Počasí neznám (předpověď se nenačetla).");
  const m = weatherMap(ctx, ctx.T, 3);
  const L = ["<b>🌤️ Počasí Teplice · 3 dny</b>"];
  for (const [d, w] of m) L.push(w ? `${dayDm(d)}: ${e(w.text)} · nejlepší 3 h ${windowText(w)}` : `${dayDm(d)}: bez předpovědi`);
  const rt = ctx.s.ride_temps ?? { cold: 3, hot: 30, ideal: 18 };
  L.push(`<i>Zelená hodina = srážky ≤ 30 %, nárazy ≤ 40 km/h, pocitově ${rt.cold}–${rt.hot} °C (Nastavení). Okno nejblíž ${rt.ideal} °C a bez velkého rozdílu teplot. Open-Meteo.</i>`);
  await send(env, L.join("\n"));
}

async function constraintCmd(env: Env, kind: string, text: string) {
  const ctx = await loadCtx(env);
  const date = kind === "nemoc" || kind === "nepojedu" ? (parseDay(text, ctx.T) ?? ctx.T) : parseDay(text, ctx.T);
  if (!date) return send(env, "Který den? Napiš třeba „nemůžu ve středu“ nebo „/hokej pá“.");
  await addConstraint(env, date, kind, text.slice(0, 200));
  const label: Record<string, string> = { nemuzu: "Nemůžu", hokej: "Hokej", bezky: "Běžky", nemoc: "Nemoc", nepojedu: "Nepojedu" };
  await send(env, `📝 Zapsáno hned: ${label[kind] ?? kind} ${dayDm(date)}.${kind === "nemoc" ? " Žádná zátěž, odpočinek. Při bolesti na hrudi, závrati nebo vysoké horečce k lékaři." : ""} Přepočítávám plán…`);
  await cmdPlan(env, "Upravený plán");
}

// ---------- jiný sport místo kola ----------

const SPORT_WORDS: [RegExp, string][] = [
  [/b[eě][zž]k|lyž|lyz/, "xc_ski"],
  [/b[eě]h|b[eě]hat|b[eě][zž]et|poklus|run/, "run"],
  [/ch[uů]z|proch[aá]z|walk|p[eě][sš]ky|turist/, "walk"],
  [/\bkol[oae]?\b/, "ride"],
];

/** „dnes ne kolo, běh“, „zítra běžky místo kola“, „příští týden jen běh“ → {sport, dny}. null = není to změna sportu. */
export function parseSportChange(text: string, T: string): { sport: string; dates: string[] } | null {
  const t = text.toLowerCase();
  const isCmd = /^\/sport\b/.test(t);
  const strong = /(m[ií]sto|ne kolo|nahra[dď]|alternativ|\bjen\b|pouze|zp[eě]t na)/.test(t);
  const weak = /\b(budu|d[aá]m|p[uů]jdu)\b/.test(t);
  if (!isCmd && !strong && !weak) return null;
  // sport, který chci: první zmíněný kromě „kola“ v záporu / „místo kola“
  const cleaned = t.replace(/(m[ií]sto|ne)\s+kol[ao]?/g, " ");
  const hit = SPORT_WORDS.find(([re]) => re.test(cleaned));
  if (!hit || (!isCmd && !strong && hit[1] === "ride")) return null;
  const mon = addDays(T, 1 - dow(T));
  let dates: string[];
  if (/p[rř][ií][sš]t[ií]\s+t[yý]d/.test(t)) dates = Array.from({ length: 7 }, (_, i) => addDays(mon, 7 + i));
  else if (/(tento|tenhle|tenhle|tento|cel[yý])\s+t[yý]d/.test(t)) dates = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((d) => d >= T);
  else dates = [parseDay(t.replace(/^\/sport\s*/, ""), T) ?? T];
  return { sport: hit[1], dates };
}

async function sportChange(env: Env, sport: string, dates: string[]) {
  for (const d of dates) await addConstraint(env, d, "sport", sport);
  const label: Record<string, string> = { ride: "🚴 kolo", run: "🏃 běh", xc_ski: "🎿 běžky", walk: "🚶 chůze", rest: "🛋️ volno" };
  const when = dates.length > 1 ? `${dayDm(dates[0]!)}–${dayDm(dates[dates.length - 1]!)}` : dayDm(dates[0]!);
  await send(env, `📝 ${when}: ${label[sport] ?? sport}. Přepočítávám plán…`);
  await cmdPlan(env, "Upravený plán");
}

async function cmdFit(env: Env, arg: string) {
  const ctx = await loadCtx(env);
  const date = parseDay(arg || "zítra", ctx.T) ?? addDays(ctx.T, 1);
  let w: Workout | null = null;
  let name = "";
  const cal = ctx.calendar.find((c) => c.date === date && c.status === "planned" && c.steps_json);
  if (cal) {
    w = JSON.parse(cal.steps_json!);
    name = cal.name;
  } else {
    const p = await planFor(ctx);
    const d = p.days.find((x) => x.date === date);
    if (d?.workout) {
      w = d.workout;
      name = d.name ?? "Workout";
    }
  }
  if (!w) return send(env, `Na ${dayDm(date)} žádný workout nemám.`);
  const fit = encodeWorkoutFit(name, w);
  await sendDocument(
    env,
    `${date}-workout.fit`,
    fit,
    `📥 ${e(name)} (${dayDm(date)})\nNahrání do Edge 530: připoj Edge kabelem k PC, zkopíruj soubor do složky <b>Garmin/NewFiles</b>, odpoj. Workout najdeš v Trénink → Tréninky.`,
  );
}

async function cmdNastaveni(env: Env) {
  const s = await getSettings(env.DB);
  const L = [
    "<b>⚙️ Nastavení</b>",
    `Cíl: ${GOAL_LABEL[s.goal as Goal] ?? s.goal}${s.goal_name ? ` (${e(s.goal_name)})` : ""} – změna /cil zlepseni | udrzeni | pokles`,
    `FTP: ${s.ftp ?? "–"} W (/ftp 272) · jízdy týdně: ${s.rides_per_week} (/jizd 3)`,
    `Zóny tepu: ${s.hr_zones ? `${s.hr_zones.floors.join(", ")} · max ${s.hr_zones.max} · LTHR ${s.hr_zones.lthr ?? "–"} (${s.hr_zones.source})` : "–"}`,
    `Zprávy: ráno ${s.morning_from}–${s.morning_to}, večer ${s.evening_time}, týden ${["", "Po", "Út", "St", "Čt", "Pá", "So", "Ne"][s.weekly_dow]} ${s.weekly_time}`,
    `LLM: ${s.llm_enabled ? "zapnuto" : "vypnuto"} (/llm on|off) · intervals.icu sync: ${s.icu_sync ? "zapnuto" : "vypnuto"} (/icu on|off)`,
    `Garmin klíč od: ${s.garmin_key_created ?? "–"} (/garminklic 2026-11-07)`,
    "Vše ostatní v dashboardu → Nastavení.",
  ];
  await send(env, L.join("\n"));
}

async function cmdExport(env: Env) {
  const tables = ["activities", "wellness", "daily_metrics", "planned_workouts", "constraints", "proposals", "settings", "training_log", "weekly_reviews"];
  for (const t of tables) {
    const rows = await all(env.DB, `SELECT * FROM ${t}`);
    await sendDocument(env, `trener-${t}.json`, JSON.stringify(rows), `Export: ${t} (${rows.length} řádků)`, "application/json");
  }
  await send(env, "Export hotový. Smazání všech dat: na PC spusť <code>npm run wipe</code>.");
}

/** Lehčí verze dnešní jednotky – tlačítko je výslovný souhlas, zapisuje se hned. */
async function makeEasier(env: Env, date: string) {
  const s = await getSettings(env.DB);
  const cal = await first<any>(env.DB, "SELECT * FROM planned_workouts WHERE date = ? AND status = 'planned' AND kind != 'rest' ORDER BY id DESC LIMIT 1", date);
  if (!cal) return send(env, `Na ${dayDm(date)} nemám v plánu jednotku, kterou by šlo odlehčit.`);
  const min = cal.kind === "quality" ? cal.duration_min : Math.max(45, Math.round(((cal.duration_min ?? 60) * 2) / 3 / 5) * 5);
  const w = z2Workout({ ftp: s.ftp ?? 250 }, min);
  const name = cal.indoor ? "Trenažér – Z2" : "Z2 vytrvalost";
  const ch: Change = {
    code: "#1",
    date,
    action: "upravit",
    name,
    why: "lehčí podle tebe",
    targetId: cal.id,
    payload: {
      date, kind: "z2", quality_type: null, name, indoor: cal.indoor, duration_min: Math.round(totalSeconds(w) / 60),
      steps_json: JSON.stringify(w), steps_text: renderIcu(w), target_load: Math.round((min / 60) * 0.65 * 0.65 * 100), reason: "Odlehčeno na tvou žádost.",
    },
  };
  const r = await applyChanges(env, [ch]);
  await send(env, `🪶 Odlehčeno: ${dayDm(date)} ${e(name)} ${min} min.\n${e(r.verify)}`);
}

async function applyPicked(env: Env, pid: number, codes: string[]) {
  const p = await getProposal(env, pid);
  if (!p || p.status !== "open") return send(env, "Tento návrh už neplatí – platí jen poslední seznam změn. Napiš /plan pro nový.");
  if (!codes.length) {
    await run(env.DB, "UPDATE proposals SET status = 'rejected' WHERE id = ?", pid);
    return send(env, "Nic neměním.");
  }
  const items = p.items.filter((c) => codes.includes(c.code));
  await send(env, `Zapisuji ${items.map((c) => c.code).join(", ")}: ${e(items.map((c) => `${dayDm(c.date)} ${c.name}`).join("; "))}.`);
  const r = await applyChanges(env, items);
  const rest = p.items.filter((c) => !codes.includes(c.code));
  if (rest.length) await run(env.DB, "UPDATE proposals SET items = ? WHERE id = ?", JSON.stringify(rest), pid);
  else await run(env.DB, "UPDATE proposals SET status = 'applied' WHERE id = ?", pid);
  await send(env, `${e(r.lines.join("\n"))}\n${e(r.verify)}`);
}

// ---------- volné otázky ----------

async function freeQuestion(env: Env, text: string) {
  const ctx = await loadCtx(env);
  const rec = recoveryFor(ctx);
  const fit = fitnessTable(ctx);
  const p = await planFor(ctx, rec);
  const today = p.days.find((d) => d.isToday);
  const decision = rec.state === "red" ? "Volno" : today?.name ? `Dnes ${today.name}` : "Volno podle plánu";
  const why = rec.state === "red" ? `${rec.emoji} ${rec.stateLabel}: ${[...rec.flags.counted, ...rec.reasons].join(", ")}` : today?.note || (today?.name ? "Zotavení v normě, jednotka podle plánu." : "Dnes nemáš v plánu jízdu.");
  const rule = ruleAnswer(text, { decision, decisionWhy: why });
  if (rule) return send(env, e(rule));
  const last = ctx.acts[ctx.acts.length - 1];
  const context = {
    dnes: ctx.T,
    cil: GOAL_LABEL[ctx.s.goal as Goal],
    zotaveni: {
      stav: rec.stateLabel,
      hrv_ms: rec.hrv.today, hrv_hodnoceni: rec.hrv.rating, hrv_norma: rec.hrv.rangeText,
      klidovy_tep: rec.rhr.today, klidovy_tep_hodnoceni: rec.rhr.rating,
      spanek_h: rec.sleep.today != null ? Math.round((rec.sleep.today / 3600) * 10) / 10 : null, spanek_skore: rec.sleep.score,
      duvody: [...rec.flags.counted, ...rec.reasons],
    },
    kondice: { ctl: fit.ctl, atl: fit.atl, forma: fit.form != null ? Math.round(fit.form * 10) / 10 : null, zatez_7_dni: fit.load7, ramp: fit.ramp },
    rozhodnuti_dnes: decision,
    proc: why,
    plan: p.days.map((d) => ({ den: dayDm(d.date), jednotka: d.name ?? d.tag, minut: d.durationMin, zatez: d.load, pocasi: d.weather?.text ?? null })),
    posledni_aktivita: last ? { den: dayDm(last.date), nazev: last.name, minut: Math.round((last.moving_s ?? 0) / 60), zatez: last.load } : null,
    ftp_w: ctx.s.ftp,
    sacharidy_pravidla: "do 60 min jen voda; 1–2 h 30–60 g/h; 2–3 h 60–90 g/h; bidon 60 g, gel 45 g",
    sacharidy_priklady: { "1:30 Z2": carbsFor(90, "z2").text, "2:00 kvalita": carbsFor(120, "quality").text, "3:00 Z2": carbsFor(180, "z2").text },
  };
  const ans = await answerQuestion(env, text, context);
  if (ans) return send(env, e(ans));
  await send(env, `Na tohle ti teď bez LLM neodpovím. Zkus /rano, /plan, /zitra, /aktivita, /tyden nebo /pomoc.\n<i>Dnes: ${e(decision)} – ${e(why)}</i>`);
}

// ---------- vstup ----------

export async function handleUpdate(env: Env, update: any): Promise<void> {
  const cb = update.callback_query;
  const msg = update.message ?? update.edited_message;
  const chatId = String(cb?.message?.chat?.id ?? msg?.chat?.id ?? "");
  if (!env.TELEGRAM_CHAT_ID || chatId !== String(env.TELEGRAM_CHAT_ID)) return; // cizí chat ignorovat

  if (cb) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id }).catch(() => null);
    const data = String(cb.data ?? "");
    const [kind, a, b, c] = data.split(":");
    if (cb.message?.message_id && (kind === "p" || kind === "d" || (kind === "s" && a !== "days" && a !== "pick")))
      await tgCall(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    if (kind === "s") {
      if (a === "days") {
        const p = await planFor(await loadCtx(env));
        return send(env, "Který den chceš změnit?", dayPickButtons(p.days));
      }
      if (a === "pick") return send(env, `Co bude <b>${dayDm(b!)}</b>?`, sportButtons(b!));
      if (/^\d{4}-\d{2}-\d{2}$/.test(a ?? "") && ["ride", "run", "xc_ski", "rest"].includes(b ?? "")) return sportChange(env, b!, [a!]);
      return;
    }
    if (kind === "p") {
      const pid = Number(b);
      const p = await getProposal(env, pid);
      if (a === "all") return applyPicked(env, pid, p?.items.map((x) => x.code) ?? []);
      if (a === "none") return applyPicked(env, pid, []);
      if (a === "one") return applyPicked(env, pid, [c!]);
      if (a === "pick" && p) {
        const rows: InlineButton[][] = [];
        for (let i = 0; i < p.items.length; i += 4) rows.push(p.items.slice(i, i + 4).map((x) => ({ text: `✅ ${x.code}`, callback_data: `p:one:${pid}:${x.code}` })));
        return send(env, "Vyber změnu (nebo napiš „ano 1, 3“ / „ne 2“):", rows);
      }
    }
    if (kind === "d" && a === "skip") return constraintCmd(env, "nepojedu", `dnes ${b}`);
    if (kind === "d" && a === "easy") return makeEasier(env, b!);
    if (kind === "f") return cmdFit(env, `${+a!.slice(8, 10)}.${+a!.slice(5, 7)}.`);
    return;
  }

  const text: string = (msg?.text ?? "").trim();
  if (!text) return;
  const lower = text.toLowerCase();

  // 0) vlastní jízda („zítra jedu 4 h s Honzou“) a jiný sport („ne kolo, běh“ nesmí spadnout do „ne“ = odmítnutí návrhu)
  if (!text.startsWith("/") || /^\/jizda\b/.test(lower)) {
    const own = parseOwnRide(text.replace(/^\/jizda\s*/, ""), localNow(new Date(), env.TZ_NAME).date);
    if (own) {
      await addConstraint(env, own.date, "jizda", ownRideNote(own));
      await send(env, `📝 ${dayDm(own.date)}: ${e(ownRideName(own))}. Započítám zátěž a ostatní dny týdne přepočítám…`);
      return cmdPlan(env, "Plán s tvojí jízdou");
    }
    if (/^\/jizda\b/.test(lower)) return send(env, "Napiš třeba „/jizda zítra 4 h“, „v sobotu jedu 120 km s Honzou“ nebo „pozítří jedu projížďku 3:30 h ve skupině“.");
    const sc = parseSportChange(text, localNow(new Date(), env.TZ_NAME).date);
    if (sc) return sportChange(env, sc.sport, sc.dates);
  }

  // 1) souhlas s posledním návrhem
  const open = await openProposal(env);
  if (open) {
    const codes = parseConsent(text, open.items.map((x) => x.code));
    if (codes) return applyPicked(env, open.id, codes);
  } else if (/^(ano|zapiš|zapis|ok)\b/.test(lower)) {
    return send(env, "Teď nemám žádný otevřený seznam změn, nic nezapisuji. Napiš /plan a pošlu nový návrh.");
  }

  // 2) příkazy
  const m = /^\/(\w+)(?:@\w+)?\s*(.*)$/s.exec(text);
  const cmd = m?.[1]?.toLowerCase();
  const arg = (m?.[2] ?? "").trim();
  const word = !m && lower.length <= 12 ? lower.replace(/[?!.]/g, "") : null;
  const is = (c: string, ...w: string[]) => cmd === c || (word != null && w.includes(word));

  if (is("start") || is("menu", "menu") || is("pomoc", "pomoc", "help") || is("help")) return cmdMenu(env);
  if (is("rano", "ráno", "rano", "připravenost", "pripravenost", "dnes")) return cmdRano(env);
  if (is("stav", "stav", "report")) return cmdStav(env);
  if (is("plan", "plán", "plan")) return cmdPlan(env);
  if (is("zitra", "zítra", "zitra")) return cmdZitra(env);
  if (is("aktivita", "aktivita", "jízda", "jizda")) return cmdAktivita(env, arg);
  if (is("tyden", "týden", "tyden")) return cmdTyden(env);
  if (is("pocasi", "počasí", "pocasi")) return cmdPocasi(env);
  if (is("nastaveni", "nastavení")) return cmdNastaveni(env);
  if (cmd === "dashboard" || is("dashboard", "dashboard", "přihlásit", "prihlasit")) {
    const { createLoginLink } = await import("../api/session");
    const url = await createLoginLink(env, (env as any).__uid ?? 1);
    return send(env, `📈 <a href="${url}">Otevřít dashboard</a>\nOdkaz platí 15 minut a jen jednou, přihlášení pak vydrží rok. Nikomu ho neposílej.`);
  }
  if (cmd === "export") return cmdExport(env);
  if (cmd === "sport") {
    const sc = parseSportChange(text, localNow(new Date(), env.TZ_NAME).date);
    if (sc) return sportChange(env, sc.sport, sc.dates);
    if (cmd === "sport") return send(env, "Napiš třeba „/sport běh zítra“, „dnes běžky místo kola“ nebo „příští týden jen běh“. Zpět: „/sport kolo zítra“.");
  }
  if (cmd === "fit") return cmdFit(env, arg);
  if (cmd === "nemuzu" || /^nem[uů][zž]u\b/.test(lower)) return constraintCmd(env, "nemuzu", text);
  if (cmd === "hokej" || /^hokej\b/.test(lower)) return constraintCmd(env, "hokej", text);
  if (cmd === "bezky" || /^b[eě][zž]ky\b/.test(lower)) return constraintCmd(env, "bezky", text);
  if (cmd === "nemoc" || /(jsem nemocn|nachlazen|ch[rř]ipk|hore[cč]k)/.test(lower)) return constraintCmd(env, "nemoc", text);
  if (cmd === "nepojedu" || /(dnes nepojedu|nepojedu|nechce se mi|nem[aá]m chu[tť])/.test(lower)) return constraintCmd(env, "nepojedu", `dnes ${text}`);
  if (cmd === "ftp") {
    const v = Number(arg.replace(",", "."));
    if (!(v > 80 && v < 600)) return send(env, "Napiš FTP ve wattech, např. /ftp 272.");
    await setSetting(env.DB, "ftp", Math.round(v));
    await setState(env.DB, "ftp_manual", true);
    await setState(env.DB, "ftp_set_at", localNow(new Date(), env.TZ_NAME).date);
    const s = await getSettings(env.DB);
    const n = await recomputeLoads(env.DB, s);
    await recomputeMetrics(env.DB, (await loadCtx(env)).T);
    return send(env, `FTP nastaveno na ${Math.round(v)} W. Zóny a watty v plánu se přepočítají, přepočteno ${n} aktivit bez Garmin TSS.`);
  }
  if (cmd === "vaha") {
    const v = Number(arg.replace(",", "."));
    if (!(v > 30 && v < 200)) return send(env, "Napiš váhu v kg, např. /vaha 75,5.");
    const T = (await loadCtx(env)).T;
    await run(env.DB, "INSERT INTO wellness (date, weight_kg) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET weight_kg = excluded.weight_kg", T, v);
    return send(env, `Váha ${num(v, 1)} kg zapsána k ${dm(T)}.`);
  }
  if (cmd === "cil") {
    const map: Record<string, Goal> = { zlepseni: "zvyseni", zlepšení: "zvyseni", zvyseni: "zvyseni", udrzeni: "udrzeni", udržení: "udrzeni", pokles: "pokles", zima: "pokles" };
    const g = map[arg.toLowerCase().split(/\s+/)[0] ?? ""];
    if (!g) return send(env, `Cíl teď: ${GOAL_LABEL[(await getSettings(env.DB)).goal as Goal]}. Změna: /cil zlepseni | udrzeni | pokles`);
    await setSetting(env.DB, "goal", g);
    await send(env, `Cíl nastaven: ${GOAL_LABEL[g]}. Přepočítávám naplánované tréninky…`);
    return cmdPlan(env, "Plán po změně cíle");
  }
  if (cmd === "jizd") {
    const v = Number(arg);
    if (!(v >= 2 && v <= 5)) return send(env, "Počet jízd týdně 2–5, např. /jizd 3.");
    await setSetting(env.DB, "rides_per_week", v);
    return send(env, `Jízdy týdně: ${v}.`);
  }
  if (cmd === "llm" || cmd === "icu") {
    const on = /on|zap|ano|1/.test(arg.toLowerCase());
    await setSetting(env.DB, cmd === "llm" ? "llm_enabled" : "icu_sync", on);
    return send(env, `${cmd === "llm" ? "LLM" : "intervals.icu sync"}: ${on ? "zapnuto" : "vypnuto"}.`);
  }
  if (cmd === "garminklic") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) return send(env, "Napiš datum vytvoření klíče, např. /garminklic 2026-11-07.");
    await setSetting(env.DB, "garmin_key_created", arg);
    return send(env, `Garmin klíč vytvořen ${arg}; upozorním 30 dní před koncem platnosti.`);
  }
  if (cmd === "sila" || cmd === "mobilita") {
    const T = (await loadCtx(env)).T;
    await run(env.DB, "INSERT INTO training_log (date, kind, note, created_at) VALUES (?, ?, ?, ?)", T, cmd, arg || null, new Date().toISOString());
    const n = await first<{ n: number }>(env.DB, "SELECT COUNT(*) AS n FROM training_log WHERE kind = ? AND date >= ?", cmd, addDays(T, 1 - dow(T)));
    return send(env, `${cmd === "sila" ? "🏋️ Síla" : "🧘 Mobilita"} zapsána (${dm(T)}). Tento týden ${n?.n ?? 1}×.`);
  }
  if (cmd) return send(env, `Neznámý příkaz /${e(cmd)}. ${helpMessage()}`);

  // 3) volný text
  return freeQuestion(env, text);
}

export { cmdRano, cmdZitra, cmdTyden, cmdPlan };
