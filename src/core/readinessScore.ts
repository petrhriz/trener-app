// Skóre Zotavení / Zátěž / Spánek v % a ranní / večerní zhodnocení „co tělo potřebuje“.
// Garmin skóre zotavení přes API nedává → počítá se z nočních hodnot proti TVÉ normě (60 dní). Čistá funkce.
import { hmm, num } from "../lib/format";
import { norm } from "./recovery";

export interface NightRow {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleep_hr: number | null;
  sleep_s: number | null;
  sleep_need_min: number | null;
  sleep_score: number | null;
  sleep_resp: number | null;
}

export type CompKey = "hrv" | "rhr" | "sleepHr" | "sleepDur" | "sleepScore" | "resp";

export interface Component {
  key: CompKey;
  label: string;
  value: string;
  normText: string;
  /** odchylka od normy (kladná = lepší), oříznutá −3 … +2,5 */
  z: number;
  weight: number;
}

export interface RecoveryScore {
  score: number | null;
  components: Component[];
  /** hlavní důvody, proč je skóre nízké / vysoké */
  drags: Component[];
  boosts: Component[];
  band: "low" | "mid" | "high" | null;
}

// Zotavení jako v Bevelu (odhad ze 70 dní Bevel × Garmin, 1. 9.–9. 11. 2026: průměrná odchylka 4,2 bodu;
// křížově – nastaveno na září, test na říjnu a naopak – 5,0 bodu proti 5,8 u základny VST 60 nocí):
//   Zotavení = 100 · Φ(0,174 + 0,403·z_VST − 0,39·z_tep + 1,02·(min(1,1; spánek/potřeba) − 1))
// z_VST = odchylka ln(VST) od průměru 30 předchozích nocí v SD (Bevel reaguje na pokles proti posledním týdnům),
// z_tep = odchylka průměrného tepu ve spánku od 60 nocí
// Zkoušená plynulá (exponenciální) norma ani jiné délky oken křížově nepomohly – zbytek ±5–6 bodů jsou vstupy,
// které Garmin přes API nedává (teplota zápěstí, SpO2, VST z jednotlivých úderů místo průměru za noc).
// (Bevel „Resting HR“ je průměr tepu za celou noc, ne Garminův klidový tep). Potřeba = cíl + spánkový dluh (sleepCalc).
// Zátěž ani klidový tep přímo nevstupují – trénink se projeví přes noční VST a tep (stejně jako v Bevelu).
const K = { a: 0.174, hrv: 0.403, sleepHr: 0.39, dur: 1.02 };
const HRV_BASE = 30; // nocí pro základnu VST (tep ve spánku: 60)
const LABEL: Record<CompKey, string> = { hrv: "VST", rhr: "klidový tep", sleepHr: "tep ve spánku", sleepDur: "délka spánku", sleepScore: "skóre spánku", resp: "dech ve spánku" };
const clip = (z: number) => Math.max(-4, Math.min(4, z));
const SD_FLOOR = { hrv: 0.03, sleepHr: 1 }; // VST v ln(ms)
const MIN_BASE = 20; // nocí v základně (Bevel se kalibruje až 60 dní)

/** distribuční funkce normálního rozdělení (Abramowitz–Stegun 7.1.26, chyba < 1e-7) */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + (x < 0 ? -e : e));
}

/**
 * Zotavení 0–100 % podle vzorce výše. Bez VST nedávám (hlavní ukazatel), tep ve spánku a délka spánku jsou doplňky.
 * Složky (components) ukazují odchylky od normy; drags/boosts = co skóre nejvíc stáhlo / zvedlo.
 */
export function recoveryScore(night: NightRow | null, history: NightRow[]): RecoveryScore {
  const empty: RecoveryScore = { score: null, components: [], drags: [], boosts: [], band: null };
  if (!night || night.hrv == null || night.hrv <= 0) return empty;
  const hist = history.filter((h) => h.date < night.date).slice(-60);
  const nb = (vals: (number | null)[], floor: number) => { const n = norm(vals); return n.n >= MIN_BASE ? { m: n.mean, sd: Math.max(floor, n.sd) } : null; };
  const bH = nb(hist.slice(-HRV_BASE).map((h) => (h.hrv ? Math.log(h.hrv) : null)), SD_FLOOR.hrv);
  if (!bH) return empty;
  const bR = nb(hist.map((h) => h.sleep_hr), SD_FLOOR.sleepHr);
  const zH = clip((Math.log(night.hrv) - bH.m) / bH.sd);
  const zR = night.sleep_hr != null && bR ? clip((night.sleep_hr - bR.m) / bR.sd) : null;
  const ratio = night.sleep_s != null && night.sleep_need_min ? Math.min(1.1, night.sleep_s / (night.sleep_need_min * 60)) : null;
  const x = K.a + K.hrv * zH - K.sleepHr * (zR ?? 0) + K.dur * (ratio != null ? ratio - 1 : 0);
  const score = Math.round(100 * normCdf(x));
  const ex = Math.exp;
  // z kladné = lepší; weight · z = příspěvek do x (délka spánku: z v jednotkách 8 % potřeby)
  const comps: Component[] = [
    { key: "hrv", label: LABEL.hrv, value: `${num(night.hrv)} ms`, normText: `${num(ex(bH.m - bH.sd))}–${num(ex(bH.m + bH.sd))} ms`, z: zH, weight: K.hrv },
  ];
  if (zR != null && bR) comps.push({ key: "sleepHr", label: LABEL.sleepHr, value: `${num(night.sleep_hr)} bpm`, normText: `${num(bR.m - bR.sd)}–${num(bR.m + bR.sd)} bpm`, z: -zR, weight: K.sleepHr });
  if (ratio != null) comps.push({ key: "sleepDur", label: LABEL.sleepDur, value: `${hmm(night.sleep_s)} h`, normText: `potřeba ${hmm(night.sleep_need_min! * 60)} h`, z: clip((ratio - 1) / 0.08), weight: K.dur * 0.08 });
  const sorted = [...comps].sort((p, q) => p.z * p.weight - q.z * q.weight);
  return {
    score,
    components: comps,
    drags: sorted.filter((c) => c.z <= -0.7).slice(0, 3),
    boosts: [...sorted].reverse().filter((c) => c.z >= 0.7).slice(0, 2),
    band: score < 34 ? "low" : score < 67 ? "mid" : "high",
  };
}

/**
 * Zátěž dne v % = TSS dne / TSS dnešního plánu (bez plánu: tvoje průměrná denní zátěž = CTL). 100 % = splněný plán.
 * TSS je stejné číslo jako v Garminu a intervals.icu.
 */
export function strainScore(load: number, planned: number | null, ctl: number | null): { score: number; load: number; base: number; basis: "plan" | "ctl" } {
  const basis = planned && planned > 0 ? "plan" : "ctl";
  const base = Math.round(basis === "plan" ? planned! : Math.max(20, ctl ?? 20));
  const l = Math.round(Math.max(0, load));
  return { score: Math.round((l / base) * 100), load: l, base, basis };
}

export type StatusKind = "active" | "sick" | "injured" | "vacation";
export const STATUS_LABEL: Record<StatusKind, string> = { active: "Aktivní", sick: "Nemocný", injured: "Zraněný", vacation: "Dovolená" };

export interface CoachingInput {
  hour: number;
  /** zpětný den (Přehled k minulému datu) */
  past?: boolean;
  status: StatusKind;
  statusUntil: string | null;
  /** ranní semafor */
  semafor: { state: "green" | "yellow" | "red"; reasons: string[]; missing: boolean } | null;
  strain: { score: number; load: number; base: number; basis: "plan" | "ctl" };
  sleepS: number | null;
  sleepNeedMin: number | null;
  /** potřeba spánku na dnešní noc (cíl + spánkový dluh, src/core/sleepCalc.ts) */
  nextNeedMin: number | null;
  /** typické probuzení „HH:MM“ (medián 14 dní) */
  wakeTypical: string | null;
  bbNow: number | null;
  stressAvg: number | null;
  stressNorm: number | null;
  steps: number | null;
  plan: { name: string | null; kind: string | null; minutes: number | null; done: boolean };
  remLow: boolean;
  deepLow: boolean;
}

export interface Coaching {
  period: "rano" | "den" | "vecer";
  title: string;
  text: string;
  needs: string[];
}

const minToClock = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
};

/** Ráno / přes den / večer: co z dat plyne a co tělo potřebuje. Jen pravidla, žádné „dnes dobrý“ bez důvodu. */
export function coaching(i: CoachingInput): Coaching {
  const period: Coaching["period"] = i.hour < 12 ? "rano" : i.hour < 18 ? "den" : "vecer";
  const needs: string[] = [];
  // spánek dnes v noci: potřeba (cíl + dluh) → kdy jít spát
  const need = i.nextNeedMin ?? i.sleepNeedMin;
  let bedtime: string | null = null;
  if (need && i.wakeTypical) {
    const [h, m] = i.wakeTypical.split(":").map(Number) as [number, number];
    bedtime = minToClock(h * 60 + m - need - 15);
  }
  const sleepLine = need ? `Spánek ${hmm(need * 60)} h${bedtime ? ` – do postele kolem ${bedtime}` : ""}.` : null;

  if (i.status !== "active") {
    const until = i.statusUntil ? ` (do ${+i.statusUntil.slice(8, 10)}. ${+i.statusUntil.slice(5, 7)}.)` : "";
    if (i.status === "sick") {
      return { period, title: `Nemoc${until}: trénink stojí`, text: "Tělo teď potřebuje energii na uzdravení – zátěž ani plán se nehodnotí. Po návratu 2 dny jen lehce, nic nedohánět.", needs: ["Odpočinek, pití, teplé jídlo.", sleepLine ?? "Spánek co nejdelší.", "Při horečce ani lehký pohyb."].filter(Boolean) as string[] };
    }
    if (i.status === "injured") {
      return { period, title: `Zranění${until}: plán stojí`, text: "Trénink je pozastavený, zátěž se nehodnotí. Pohyb jen takový, který zranění nebolí.", needs: ["Zraněnou část nezatěžovat přes bolest.", sleepLine ?? "Spánek pomáhá hojení.", "Bílkoviny v každém jídle."].filter(Boolean) as string[] };
    }
    return { period, title: `Dovolená${until}`, text: "Plán i zátěž stojí. Pohyb pro radost, bez hodinek v hlavě.", needs: [sleepLine, "Chůze a výlety se počítají do pohybu."].filter(Boolean) as string[] };
  }

  // ranní semafor (VST, klidový tep, spánek proti tvé normě) – stejný jako v Telegramu a v Trenérovi
  const sem = i.semafor;
  const band: "low" | "mid" | "high" | null = !sem ? null : sem.state === "red" ? "low" : sem.state === "yellow" ? "mid" : "high";
  const reasons = sem && sem.reasons.length ? sem.reasons.join(", ") : null;
  let title: string;
  let text: string;
  if (!sem && i.past) {
    title = "Data z hodinek nemám";
    text = "Pro tento den chybí VST, klidový tep i spánek – zotavení nejde spočítat.";
  } else if (!sem || sem.missing) {
    title = "Ranní data zatím nemám";
    text = "Počkej na synchronizaci hodinek (VST, klidový tep a spánek z noci).";
  } else if (band === "low") {
    title = "Neodpočatý – dnes volno";
    text = `${reasons ? cap(reasons) + ". " : ""}Volno, nebo jen Z1 do 45 min / procházka. Hlavně spánek.`;
  } else if (band === "mid") {
    title = "Částečně odpočatý";
    text = `${reasons ? cap(reasons) + ". " : ""}Lehčí den: kvalitu změň na Z2, Z2 zkrať o třetinu.`;
  } else {
    title = "Odpočatý";
    text = "VST, klidový tep ani spánek nepřekročily hranice semaforu. Den na plánovaný trénink.";
  }

  // co tělo potřebuje – konkrétně podle dat a plánu
  const p = i.plan;
  if (band === "low") {
    needs.push(p.name && !p.done ? `Trénink „${p.name}“ vyměň za Z1–Z2 do 45 min nebo volno.` : "Pohyb jen lehce: procházka nebo Z1 do 45 min.");
  } else if (p.name && !p.done) {
    needs.push(band === "mid" && p.kind === "quality" ? `Místo intervalů („${p.name}“) dej Z2 – zotavení na kvalitu nestačí.` : `Dnes v plánu: ${p.name}${p.minutes ? ` (${hmm(p.minutes * 60)} h)` : ""}.`);
    if ((p.minutes ?? 0) > 75) needs.push("Na jízdu sacharidy 30–60 g/h a pití po doušcích.");
  } else if (p.done) {
    needs.push("Trénink hotový: do 1 h jídlo se sacharidy a bílkovinami, pití.");
  }
  if (period !== "rano" && i.strain.basis === "plan" && i.strain.load > i.strain.base * 1.2) needs.push(`Zátěž dne ${i.strain.load} TSS je nad plánem ${i.strain.base} – zbytek dne klid.`);
  if (sleepLine) needs.push(sleepLine);
  if (i.remLow) needs.push("Málo REM: poslední jídlo 3 h před spaním, bez alkoholu a obrazovek pozdě večer.");
  else if (i.deepLow) needs.push("Málo hlubokého spánku: chladnější ložnice, pravidelný čas usínání.");
  if (i.stressAvg != null && i.stressNorm != null && i.stressAvg > i.stressNorm + 8) needs.push(`Stres dne ${num(i.stressAvg)} je nad tvým průměrem ${num(i.stressNorm)} – 10 min dechového cvičení nebo procházka.`);
  if (period === "vecer" && i.bbNow != null && i.bbNow < 15) needs.push(`Energie ${i.bbNow} – večer už nic náročného.`); // stupnice jako v Bevelu: večer běžně 20–35
  if (period !== "rano" && i.steps != null && i.steps < 4000 && !p.done) needs.push(`Kroky ${num(i.steps ?? 0)} – krátká procházka pomůže regeneraci.`);
  if (period === "vecer") {
    if (!i.past) title = `Večer · ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
    const loadTxt = i.strain.load <= 0 ? (i.past ? "Bez tréninku" : "Dnes bez tréninku") : i.strain.basis === "plan" ? `Zátěž dne ${i.strain.load} (${i.strain.score} % plánu ${i.strain.base})` : `Zátěž dne ${i.strain.load} (${i.strain.score} % tvého běžného dne – průměr 6 týdnů je ${i.strain.base})`;
    text = `${loadTxt}${i.bbNow != null ? `, energie ${i.bbNow} %` : ""}. ${bedtime ? `Na zítřek potřebuješ ${hmm((need ?? 0) * 60)} h spánku.` : ""}`.trim();
  }
  // zpětný den: jen shrnutí, rady „co dělat“ k minulému dni nedávají smysl
  if (i.past) {
    const loadP = i.strain.load <= 0 ? "Bez tréninku" : `Zátěž dne ${i.strain.load} (${i.strain.score} % ${i.strain.basis === "plan" ? `plánu ${i.strain.base}` : `běžného dne – průměr 6 týdnů ${i.strain.base}`})`;
    return { period, title, text: sem ? `${loadP}${i.bbNow != null ? `, energie na konci dne ${i.bbNow} %` : ""}.` : text, needs: [] };
  }
  return { period, title, text, needs: needs.slice(0, 5) };
}

/** Medián času probuzení „HH:MM“. */
export function typicalWake(times: (string | null)[]): string | null {
  const m = times.filter((t): t is string => !!t && /\d\d:\d\d/.test(t.slice(11, 16) || t)).map((t) => {
    const x = t.length > 5 ? t.slice(11, 16) : t;
    return +x.slice(0, 2) * 60 + +x.slice(3, 5);
  }).sort((a, b) => a - b);
  if (m.length < 3) return null;
  return minToClock(m[Math.floor(m.length / 2)]!);
}

const cap = (x: string) => (x ? x[0]!.toUpperCase() + x.slice(1) : x);
