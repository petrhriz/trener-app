// Rozbor spánku a ranních hodnot (bod 10): fáze, probuzení, stres a tep ve spánku proti normě. Deterministicky.
import { hmm, num } from "../lib/format";
import { avg, norm } from "./recovery";

export interface SleepNight {
  date: string;
  sleep_s: number | null;
  sleep_score: number | null;
  deep_s: number | null;
  light_s: number | null;
  rem_s: number | null;
  awake_s: number | null;
  awake_count: number | null;
  sleep_stress: number | null;
  sleep_hr: number | null;
  sleep_resp: number | null;
  sleep_need_min: number | null;
  sleep_feedback: string | null;
  sleep_sub: string | null;
  sleep_start: string | null;
  wake_time: string | null;
  sleep_resp_lo?: number | null;
  sleep_resp_hi?: number | null;
  next_sleep_need_min?: number | null;
  hrv?: number | null;
}

export type Tone = "good" | "ok" | "bad" | "none";

export interface SleepStage {
  key: "deep" | "rem" | "light" | "awake";
  label: string;
  secs: number;
  pct: number;
  /** optimální rozsah v % (Garmin) */
  opt: [number, number] | null;
  tone: Tone;
  text: string;
}

export interface SleepReport {
  date: string;
  durationS: number | null;
  needMin: number | null;
  score: number | null;
  scoreTone: Tone;
  verdict: string;
  start: string | null;
  end: string | null;
  stages: SleepStage[];
  points: { tone: Tone; text: string }[];
  hr: number | null;
  hrNorm: number | null;
  stress: number | null;
  resp: number | null;
  respLo: number | null;
  respHi: number | null;
  hrv: number | null;
  /** potřeba spánku na následující (dnešní) noc podle Garminu */
  nextNeedMin: number | null;
  awakeCount: number | null;
}

/** Optimální podíly fází podle Garminu (dospělý). */
const OPT: Record<SleepStage["key"], [number, number] | null> = { deep: [16, 33], rem: [21, 31], light: [30, 64], awake: null };
const LABEL: Record<SleepStage["key"], string> = { deep: "Hluboký", rem: "REM", light: "Lehký", awake: "Bdění" };

const FEEDBACK: [RegExp, string][] = [
  [/NOT_ENOUGH_REM|LOW_REM/, "málo REM fáze"],
  [/NOT_ENOUGH_DEEP|LOW_DEEP/, "málo hlubokého spánku"],
  [/SHORT|NOT_ENOUGH_SLEEP/, "krátký spánek"],
  [/RESTLESS|AWAKE/, "neklidný spánek s probuzením"],
  [/STRESS/, "zvýšený stres ve spánku"],
  [/HIGHLY_RECOVERING|RESTORATIVE|GOOD_DEEP/, "regenerační spánek"],
];

export function feedbackText(f: string | null): string | null {
  if (!f) return null;
  const hits = FEEDBACK.filter(([re]) => re.test(f)).map(([, t]) => t);
  return hits.length ? hits.join(", ") : null;
}

const time = (iso: string | null) => (iso ? iso.slice(11, 16) : null);

export function sleepReport(night: SleepNight | null, history: SleepNight[]): SleepReport | null {
  if (!night || (night.sleep_s == null && night.sleep_score == null)) return null;
  const total = night.sleep_s ?? 0;
  const inBed = total + (night.awake_s ?? 0);
  const stages: SleepStage[] = (["deep", "rem", "light", "awake"] as const).map((k) => {
    const secs = (night as any)[`${k}_s`] as number | null;
    const pct = secs != null && inBed > 0 ? Math.round((secs / (k === "awake" ? inBed : total || 1)) * 100) : 0;
    const opt = OPT[k];
    let tone: Tone = "none";
    let text = "";
    if (secs != null && opt) {
      tone = pct < opt[0] ? (pct < opt[0] * 0.7 ? "bad" : "ok") : pct > opt[1] ? "ok" : "good";
      text = pct < opt[0] ? `pod optimem ${opt[0]}–${opt[1]} %` : pct > opt[1] ? `nad optimem ${opt[0]}–${opt[1]} %` : `v optimu ${opt[0]}–${opt[1]} %`;
    } else if (k === "awake" && secs != null) {
      tone = secs > 45 * 60 ? "bad" : secs > 20 * 60 ? "ok" : "good";
      text = `${night.awake_count ?? "–"}× probuzení`;
    }
    return { key: k, label: LABEL[k], secs: secs ?? 0, pct, opt, tone, text };
  });

  const hist = history.filter((h) => h.date < night.date);
  const hrN = norm(hist.map((h) => h.sleep_hr));
  const durN = norm(hist.map((h) => h.sleep_s));
  const stressAvg = avg(hist.slice(-30).map((h) => h.sleep_stress));
  const points: SleepReport["points"] = [];

  // délka vs. potřeba
  const need = night.sleep_need_min;
  if (night.sleep_s != null) {
    if (need) {
      const diff = Math.round(night.sleep_s / 60 - need);
      points.push({ tone: diff >= -15 ? "good" : diff >= -60 ? "ok" : "bad", text: `Délka ${hmm(night.sleep_s)} h, Garmin pro tuto noc doporučil ${hmm(need * 60)} h (${diff >= 0 ? "+" : "−"}${Math.abs(diff)} min).` });
    } else if (durN.n) {
      points.push({ tone: night.sleep_s >= durN.mean - 1800 ? "good" : "ok", text: `Délka ${hmm(night.sleep_s)} h, tvůj průměr ${hmm(durN.mean)} h.` });
    }
  }
  const deep = stages[0]!;
  const rem = stages[1]!;
  if (deep.secs) points.push({ tone: deep.tone, text: `Hluboký spánek ${hmm(deep.secs)} h (${deep.pct} %) – ${deep.tone === "good" ? "dost na fyzickou regeneraci" : "méně, svaly a hormony regenerují hlavně v něm"}.` });
  if (rem.secs) points.push({ tone: rem.tone, text: `REM ${hmm(rem.secs)} h (${rem.pct} %) – ${rem.tone === "good" ? "v pořádku" : "méně REM bývá po pozdním jídle, alkoholu nebo stresu; odráží se v soustředění"}.` });
  if (night.awake_count != null) points.push({ tone: night.awake_count <= 1 ? "good" : night.awake_count <= 3 ? "ok" : "bad", text: `Probuzení ${night.awake_count}×, vzhůru ${hmm(night.awake_s ?? 0)} h.` });
  if (night.sleep_hr != null && hrN.n >= 7) {
    const d = night.sleep_hr - hrN.mean;
    points.push({ tone: d <= 2 ? "good" : d <= 5 ? "ok" : "bad", text: `Tep ve spánku ${num(night.sleep_hr)} bpm (průměr ${num(hrN.mean)})${d > 3 ? " – vyšší, tělo ještě zpracovává zátěž nebo stres" : ""}.` });
  }
  if (night.sleep_stress != null) points.push({ tone: night.sleep_stress <= 15 ? "good" : night.sleep_stress <= 25 ? "ok" : "bad", text: `Stres ve spánku ${num(night.sleep_stress)}${stressAvg != null ? ` (průměr 30 dní ${num(stressAvg)})` : ""}.` });

  const score = night.sleep_score;
  const scoreTone: Tone = score == null ? "none" : score >= 80 ? "good" : score >= 60 ? "ok" : "bad";
  const fb = feedbackText(night.sleep_feedback);
  const bad = points.filter((p) => p.tone === "bad").length;
  const okc = points.filter((p) => p.tone === "ok").length;
  const verdict =
    (score != null ? `Skóre ${score} – ${score >= 90 ? "výborný" : score >= 80 ? "dobrý" : score >= 60 ? "uspokojivý" : "špatný"} spánek` : "Spánek") +
    (fb ? `, ${fb}` : bad ? ", část ukazatelů pod normou" : okc ? ", drobné rezervy" : ", vše v normě") +
    ".";
  return {
    date: night.date,
    durationS: night.sleep_s,
    needMin: need,
    score,
    scoreTone,
    verdict,
    start: time(night.sleep_start),
    end: time(night.wake_time),
    stages,
    points,
    hr: night.sleep_hr,
    hrNorm: hrN.n ? Math.round(hrN.mean) : null,
    stress: night.sleep_stress,
    resp: night.sleep_resp,
    respLo: night.sleep_resp_lo ?? null,
    respHi: night.sleep_resp_hi ?? null,
    hrv: night.hrv ?? null,
    nextNeedMin: night.next_sleep_need_min ?? null,
    awakeCount: night.awake_count,
  };
}
