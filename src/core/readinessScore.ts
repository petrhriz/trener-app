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

// Váhy podle literatury o sledování zotavení: VST je hlavní ukazatel (Kiviniemi 2007, Plews 2013 – trénink řízený VST),
// klidový tep (Buchheit 2014), délka spánku proti potřebě (Fullagar 2015), tep ve spánku jako doplněk.
const W: Record<CompKey, number> = { hrv: 0.4, rhr: 0.25, sleepDur: 0.2, sleepHr: 0.15, sleepScore: 0, resp: 0 };
const LABEL: Record<CompKey, string> = { hrv: "VST", rhr: "klidový tep", sleepHr: "tep ve spánku", sleepDur: "délka spánku", sleepScore: "skóre spánku", resp: "dech ve spánku" };
const clip = (z: number) => Math.max(-3, Math.min(2.5, z));
const SD_FLOOR = { hrv: 0.05, rhr: 1.5, sleepHr: 1.5 }; // VST v ln(ms)

interface Base { hrv: { m: number; sd: number } | null; rhr: { m: number; sd: number } | null; shr: { m: number; sd: number } | null; durMean: number | null }
function baseOf(hist: NightRow[]): Base {
  const nb = (vals: (number | null)[], floor: number) => { const n = norm(vals); return n.n >= 10 ? { m: n.mean, sd: Math.max(floor, n.sd) } : null; };
  const d = norm(hist.map((h) => h.sleep_s));
  return {
    hrv: nb(hist.map((h) => (h.hrv ? Math.log(h.hrv) : null)), SD_FLOOR.hrv),
    rhr: nb(hist.map((h) => h.rhr), SD_FLOOR.rhr),
    shr: nb(hist.map((h) => h.sleep_hr), SD_FLOOR.sleepHr),
    durMean: d.n ? d.mean : null,
  };
}
/** z-skóre složek jedné noci proti základně (kladné = lepší) */
function zOf(n: NightRow, b: Base): Partial<Record<CompKey, number>> {
  const z: Partial<Record<CompKey, number>> = {};
  if (n.hrv && b.hrv) z.hrv = clip((Math.log(n.hrv) - b.hrv.m) / b.hrv.sd);
  if (n.rhr != null && b.rhr) z.rhr = clip(-(n.rhr - b.rhr.m) / b.rhr.sd);
  if (n.sleep_hr != null && b.shr) z.sleepHr = clip(-(n.sleep_hr - b.shr.m) / b.shr.sd);
  const need = n.sleep_need_min ? n.sleep_need_min * 60 : b.durMean;
  if (n.sleep_s != null && need) z.sleepDur = clip(Math.min(1, (n.sleep_s / need - 1) / 0.08));
  return z;
}
const composite = (z: Partial<Record<CompKey, number>>) => {
  let t = 0, w = 0;
  for (const [k, v] of Object.entries(z)) if (v != null) { t += W[k as CompKey] * v; w += W[k as CompKey]; }
  return w ? t / w : null;
};

/**
 * Zotavení 0–100 % = PERCENTIL dnešní noci mezi tvými nocemi za 60 dní (27 % = dnešek je lepší než 27 % tvých nocí).
 * Noc se hodnotí složeným skóre z odchylek od tvé normy: VST (ln) 40 %, klidový tep 25 %, délka spánku proti potřebě Garminu 20 %,
 * tep ve spánku 15 %. Žádná vymyšlená stupnice – jen pořadí v tvých vlastních datech. Bez VST i klidového tepu nedávám.
 */
export function recoveryScore(night: NightRow | null, history: NightRow[]): RecoveryScore {
  const empty: RecoveryScore = { score: null, components: [], drags: [], boosts: [], band: null };
  if (!night || (night.hrv == null && night.rhr == null)) return empty;
  const hist = history.filter((h) => h.date < night.date).slice(-60);
  const b = baseOf(hist);
  const z = zOf(night, b);
  if (z.hrv == null && z.rhr == null) return empty;
  const ex = Math.exp;
  const comps: Component[] = [];
  if (z.hrv != null && b.hrv) comps.push({ key: "hrv", label: LABEL.hrv, value: `${num(night.hrv)} ms`, normText: `${num(ex(b.hrv.m - b.hrv.sd))}–${num(ex(b.hrv.m + b.hrv.sd))} ms`, z: z.hrv, weight: W.hrv });
  if (z.rhr != null && b.rhr) comps.push({ key: "rhr", label: LABEL.rhr, value: `${num(night.rhr)} bpm`, normText: `${num(b.rhr.m - b.rhr.sd)}–${num(b.rhr.m + b.rhr.sd)} bpm`, z: z.rhr, weight: W.rhr });
  if (z.sleepDur != null) comps.push({ key: "sleepDur", label: LABEL.sleepDur, value: `${hmm(night.sleep_s)} h`, normText: `${hmm(night.sleep_need_min ? night.sleep_need_min * 60 : b.durMean)} h`, z: z.sleepDur, weight: W.sleepDur });
  if (z.sleepHr != null && b.shr) comps.push({ key: "sleepHr", label: LABEL.sleepHr, value: `${num(night.sleep_hr)} bpm`, normText: `${num(b.shr.m - b.shr.sd)}–${num(b.shr.m + b.shr.sd)} bpm`, z: z.sleepHr, weight: W.sleepHr });
  const today = composite(z)!;
  // pořadí mezi nocemi za 60 dní (stejná základna)
  const others = hist.map((h) => composite(zOf(h, b))).filter((x): x is number => x != null);
  if (others.length < 20) return { ...empty, components: comps };
  const below = others.filter((x) => x < today).length + others.filter((x) => x === today).length / 2;
  const score = Math.round((below / others.length) * 100);
  const sorted = [...comps].sort((x, y) => x.z * x.weight - y.z * y.weight);
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
  status: StatusKind;
  statusUntil: string | null;
  /** ranní semafor */
  semafor: { state: "green" | "yellow" | "red"; reasons: string[]; missing: boolean } | null;
  strain: { score: number; load: number; base: number; basis: "plan" | "ctl" };
  sleepS: number | null;
  sleepNeedMin: number | null;
  /** potřeba spánku na dnešní noc (Garmin) */
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
  // spánek dnes v noci: potřeba Garminu → kdy jít spát
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
  if (!sem || sem.missing) {
    title = "Ranní data zatím nemám";
    text = "Počkej na synchronizaci hodinek (VST, klidový tep a spánek z noci).";
  } else if (band === "low") {
    title = "Nedoregenerovaný – dnes volno";
    text = `${reasons ? cap(reasons) + ". " : ""}Volno, nebo jen Z1 do 45 min / procházka. Hlavně spánek.`;
  } else if (band === "mid") {
    title = "Částečně zregenerovaný";
    text = `${reasons ? cap(reasons) + ". " : ""}Lehčí den: kvalitu změň na Z2, Z2 zkrať o třetinu.`;
  } else {
    title = "Zregenerovaný";
    text = "VST, klidový tep i spánek jsou v tvé normě. Den na plánovaný trénink.";
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
  if (period === "vecer" && i.bbNow != null && i.bbNow < 25) needs.push(`Body Battery ${i.bbNow} – večer už nic náročného.`);
  if (period !== "rano" && (i.steps ?? 0) < 4000 && !p.done) needs.push(`Kroky ${num(i.steps ?? 0)} – krátká procházka pomůže regeneraci.`);
  if (period === "vecer") {
    title = `Večer · ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
    text = `Zátěž dne ${i.strain.load} TSS (${i.strain.score} % ${i.strain.basis === "plan" ? "plánu" : "průměrného dne"})${i.bbNow != null ? `, Body Battery teď ${i.bbNow}` : ""}. ${bedtime ? `Na zítřek potřebuješ ${hmm((need ?? 0) * 60)} h spánku.` : ""}`.trim();
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
