// Výpočty jako v TrainingPeaks / WKO (čisté funkce nad daty z D1):
// 1) splnění plánu (compliance) – plánovaná vs. odjetá zátěž po trénincích a týdnech (zelená / žlutá / červená)
// 2) rozložení intenzity 80/20 – čas v zónách tepu: lehce (Z1–Z2) / šedá zóna (Z3) / tvrdě (Z4–Z5)
// 3) plán kondice k cíli – potřebný růst CTL za týden k datu cíle
// 4) Efficiency Factor – NP / tep na lehkých jízdách (roste = lepší aerobní základ)
// 5) monotónnost a strain (Foster) – jednotvárnost týdne a celková námaha
import { addDays, mondayOf } from "../lib/time";

export type Tone = "good" | "warn" | "bad";
const ENDURANCE = ["ride", "mtb", "indoor", "run", "xc_ski"];
const RIDE = ["ride", "mtb", "indoor"];

export interface ActLite {
  id: string; date: string; sport: string; name?: string | null; load?: number | null; moving_s?: number | null;
  np?: number | null; avg_power?: number | null; avg_hr?: number | null; if_garmin?: number | null; hr_z?: number[] | null;
}
export interface PlanLite { date: string; kind: string; name: string; duration_min?: number | null; target_load?: number | null; status: string }

// ---------- 1) splnění plánu ----------
export interface ComplianceItem { date: string; name: string; planned: number; done: number; pct: number | null; tone: Tone; missed: boolean }
/** TrainingPeaks: zelená 80–120 %, žlutá 50–79 / 121–150 %, červená pod 50 % / nad 150 % / vynecháno */
export const complianceTone = (pct: number | null): Tone => (pct == null ? "bad" : pct >= 80 && pct <= 120 ? "good" : pct >= 50 && pct <= 150 ? "warn" : "bad");

export function compliance(plans: PlanLite[], acts: ActLite[], T: string, days = 28) {
  const items: ComplianceItem[] = [];
  for (const p of plans) {
    if (p.kind === "rest" || p.status === "skipped" || p.date < addDays(T, -days) || p.date > T) continue;
    const done = acts.filter((a) => a.date === p.date && ENDURANCE.includes(a.sport)).reduce((t, a) => t + (a.load ?? 0), 0);
    if (p.date === T && !done) continue; // dnešek ještě může přijít
    const planned = p.target_load ?? 0;
    const pct = planned > 0 ? Math.round((done / planned) * 100) : done > 0 ? 100 : null;
    items.push({ date: p.date, name: p.name, planned: Math.round(planned), done: Math.round(done), pct: done ? pct : 0, tone: done ? complianceTone(pct) : "bad", missed: !done });
  }
  const n = items.length;
  const good = items.filter((i) => i.tone === "good").length;
  const doneN = items.filter((i) => !i.missed).length;
  const pl = items.reduce((t, i) => t + i.planned, 0);
  const dn = items.reduce((t, i) => t + Math.min(i.done, i.planned * 1.5), 0);
  return { items: items.reverse(), count: n, doneCount: doneN, goodCount: good, loadPct: pl > 0 ? Math.round((dn / pl) * 100) : null };
}

/** týdny z týdenních souhrnů (plánovaná / odjetá zátěž) */
export function weeklyCompliance(reviews: { week_from: string; data: any }[]) {
  return reviews
    .map((r) => ({ from: r.week_from, planned: Math.round(r.data?.plannedLoad ?? 0), done: Math.round(r.data?.doneLoad ?? 0), plannedCount: r.data?.plannedCount ?? 0, doneCount: r.data?.doneCount ?? 0 }))
    .filter((w) => w.planned > 0)
    .map((w) => { const pct = Math.round((w.done / w.planned) * 100); return { ...w, pct, tone: complianceTone(pct) }; })
    .sort((a, b) => a.from.localeCompare(b.from));
}

// ---------- 2) rozložení intenzity 80/20 ----------
export interface IntensityWeek { from: string; easy: number; grey: number; hard: number; total: number; easyPct: number; greyPct: number; hardPct: number }
export function intensityWeeks(acts: ActLite[], T: string, weeks = 8): IntensityWeek[] {
  const out: IntensityWeek[] = [];
  const mon = mondayOf(T);
  for (let w = weeks - 1; w >= 0; w--) {
    const from = addDays(mon, -7 * w), to = addDays(from, 6);
    let easy = 0, grey = 0, hard = 0;
    for (const a of acts) {
      if (a.date < from || a.date > to || !ENDURANCE.includes(a.sport) || !Array.isArray(a.hr_z)) continue;
      const z = a.hr_z.map((v) => Number(v) || 0);
      easy += (z[0] ?? 0) + (z[1] ?? 0); grey += z[2] ?? 0; hard += (z[3] ?? 0) + (z[4] ?? 0);
    }
    const total = easy + grey + hard;
    const pc = (v: number) => (total ? Math.round((v / total) * 100) : 0);
    out.push({ from, easy: Math.round(easy / 60), grey: Math.round(grey / 60), hard: Math.round(hard / 60), total: Math.round(total / 60), easyPct: pc(easy), greyPct: pc(grey), hardPct: pc(hard) });
  }
  return out;
}
/** posledních 14 dní: verdikt podle Seilera (≥ 75 % lehce, šedá zóna do 15 %) */
export function intensityVerdict(acts: ActLite[], T: string) {
  let easy = 0, grey = 0, hard = 0;
  for (const a of acts) {
    if (a.date <= addDays(T, -14) || a.date > T || !ENDURANCE.includes(a.sport) || !Array.isArray(a.hr_z)) continue;
    const z = a.hr_z.map((v) => Number(v) || 0);
    easy += (z[0] ?? 0) + (z[1] ?? 0); grey += z[2] ?? 0; hard += (z[3] ?? 0) + (z[4] ?? 0);
  }
  const total = easy + grey + hard;
  if (total < 3600) return null;
  const e = Math.round((easy / total) * 100), g = Math.round((grey / total) * 100), h = Math.round((hard / total) * 100);
  const tone: Tone = e >= 75 && g <= 15 ? "good" : e >= 65 && g <= 25 ? "warn" : "bad";
  const text = tone === "good" ? `Rozložení sedí (${e} % lehce, ${g} % šedá zóna, ${h} % tvrdě).` : g > 15 ? `Moc šedé zóny: ${g} % času v Z3 (ideál do 15 %). Lehké jízdy jezdi opravdu lehce, tvrdé naplno.` : `Málo lehkého objemu: ${e} % času v Z1–Z2 (ideál kolem 80 %).`;
  return { easyPct: e, greyPct: g, hardPct: h, tone, text };
}

// ---------- 3) plán kondice k cíli ----------
/** bezpečný růst CTL: do 5 bodů/týden v pohodě, 5–7 náročné, nad 7 riziko přetížení */
export function ctlPlan(ctl: number | null, goalCtl: number | null, goalDate: string | null, T: string) {
  if (ctl == null || !goalDate || goalDate <= T) return null;
  const days = Math.round((Date.parse(goalDate) - Date.parse(T)) / 86400_000);
  const weeks = days / 7;
  // vyladění: posledních 10 dní před cílem CTL mírně klesá (forma roste) → vrchol kondice 10 dní před cílem
  const buildWeeks = Math.max(0.5, (days - 10) / 7);
  const suggested = Math.round(ctl + Math.min(buildWeeks * 4, 40)); // návrh: +4 body týdně, max. +40
  const target = goalCtl ?? suggested;
  const ramp = (target - ctl) / buildWeeks;
  const tone: Tone = ramp <= 5 ? "good" : ramp <= 7 ? "warn" : "bad";
  const reachable = Math.round(ctl + 7 * buildWeeks);
  const points: { date: string; ctl: number }[] = [];
  for (let d = 0; d <= days; d += 7) {
    const w = d / 7;
    const v = w <= buildWeeks ? ctl + ramp * w : target - (target * 0.05 * (w - buildWeeks)) / Math.max(0.1, weeks - buildWeeks);
    points.push({ date: addDays(T, d), ctl: Math.round(v * 10) / 10 });
  }
  points.push({ date: goalDate, ctl: Math.round(target * 0.95 * 10) / 10 });
  const text = ramp <= 0 ? `Kondici na cíl už máš – stačí ji držet a před cílem vyladit.`
    : tone === "good" ? `Na CTL ${target} k ${goalDate.slice(8, 10)}.${goalDate.slice(5, 7)}. stačí růst ${ramp.toFixed(1)} bodu týdně – v pohodě.`
    : tone === "warn" ? `Potřebuješ růst ${ramp.toFixed(1)} bodu týdně – náročné, hlídej únavu.`
    : `Potřebný růst ${ramp.toFixed(1)} bodu týdně je moc (bezpečně max. 7). Reálně stihneš CTL kolem ${reachable}.`;
  return { ctl: Math.round(ctl * 10) / 10, target, suggested: goalCtl == null, goalDate, days, ramp: Math.round(ramp * 10) / 10, weeklyLoad: Math.round((ctl + ramp) * 7), tone, text, points };
}

// ---------- 4) Efficiency Factor ----------
/** EF = NP / průměrný tep na lehkých jízdách (IF < 0,8, aspoň 40 min, venku i trenažér) */
/** `ftp` = FTP platné v den jízdy (číslo = stejné pro všechny dny). */
export function efficiency(acts: ActLite[], ftp: number | null | ((date: string) => number | null)) {
  const ftpOf = (d: string) => (typeof ftp === "function" ? ftp(d) : ftp);
  const pts = acts
    .filter((a) => RIDE.includes(a.sport) && (a.moving_s ?? 0) >= 2400 && (a.np ?? a.avg_power) && (a.avg_hr ?? 0) > 80)
    .filter((a) => { const f = ftpOf(a.date); const iff = a.if_garmin ?? (f && a.np ? a.np / f : null); return iff == null || iff < 0.8; })
    .map((a) => ({ date: a.date, id: a.id, name: a.name ?? null, ef: Math.round((((a.np ?? a.avg_power)!) / a.avg_hr!) * 100) / 100 }));
  if (pts.length < 2) return { points: pts, trend: null as number | null, text: "Na trend Efficiency Factor zatím málo lehkých jízd s wattmetrem." };
  const half = Math.floor(pts.length / 2);
  const avg = (xs: typeof pts) => xs.reduce((t, p) => t + p.ef, 0) / xs.length;
  const a0 = avg(pts.slice(0, half)), a1 = avg(pts.slice(half));
  const trend = Math.round(((a1 - a0) / a0) * 1000) / 10;
  const text = trend >= 2 ? `EF roste o ${trend} % – na stejný tep jedeš víc wattů, aerobní základ se zlepšuje.` : trend <= -2 ? `EF klesá o ${Math.abs(trend)} % – únava, horko nebo málo lehkého objemu.` : `EF je stabilní (${trend >= 0 ? "+" : ""}${trend} %).`;
  return { points: pts, trend, text };
}

// ---------- 5) monotónnost a strain ----------
/** Foster: monotónnost = průměr / směrodatná odchylka denní zátěže za 7 dní; strain = týdenní zátěž × monotónnost */
export function monotonyWeeks(dailyLoad: { date: string; load: number }[], T: string, weeks = 8) {
  const byDate = new Map(dailyLoad.map((d) => [d.date, d.load]));
  const out: { from: string; load: number; monotony: number; strain: number }[] = [];
  const mon = mondayOf(T);
  for (let w = weeks - 1; w >= 0; w--) {
    const from = addDays(mon, -7 * w);
    const xs = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(from, i)) ?? 0);
    const sum = xs.reduce((t, v) => t + v, 0), mean = sum / 7;
    const sd = Math.sqrt(xs.reduce((t, v) => t + (v - mean) ** 2, 0) / 7);
    const monotony = sd > 0 ? mean / sd : sum > 0 ? 3 : 0;
    out.push({ from, load: Math.round(sum), monotony: Math.round(Math.min(3, monotony) * 100) / 100, strain: Math.round(sum * Math.min(3, monotony)) });
  }
  const done = out.filter((w) => w.from < mon && w.load > 0);
  const last = out[out.length - 1]!;
  const prev = out[out.length - 2];
  const ref = done.length ? done.reduce((t, w) => t + w.strain, 0) / done.length : 0;
  const cur = last.load > 0 ? last : prev ?? last;
  const tone: Tone = cur.monotony > 2 || (ref && cur.strain > ref * 1.5) ? "bad" : cur.monotony > 1.5 ? "warn" : "good";
  const text = cur.monotony > 2 ? `Monotónnost ${cur.monotony.toLocaleString("cs-CZ")} – týden je moc jednotvárný (nad 2 roste riziko přetížení). Střídej lehké a těžké dny, dej volno.`
    : ref && cur.strain > ref * 1.5 ? `Strain ${cur.strain} je o ${Math.round((cur.strain / ref - 1) * 100)} % nad tvým průměrem – zvaž lehčí dny.`
    : cur.monotony > 1.5 ? `Monotónnost ${cur.monotony.toLocaleString("cs-CZ")} – ještě v pořádku, ale střídej těžší a lehčí dny.`
    : `Monotónnost ${cur.monotony.toLocaleString("cs-CZ")} – dny se dobře střídají.`;
  return { weeks: out, strainAvg: Math.round(ref), tone, text, current: cur };
}
