// Rozbor aktivity (Aktivita.md / Souhrn kap. 5). Deterministicky, každé číslo z dat nebo vzorce.
import { BIKE_SPORTS, type NLap, type Sport } from "../datasource/types";
import { dm, hms, num, zonePct, zoneTime } from "../lib/format";
import { powerLoad } from "./load";
import { QUALITY_NAME, type QualityType } from "./quality";
import type { Workout } from "./workout";
import { type HrZones, hrZoneRange, powerZones } from "./zones";

export interface ActRow {
  id: string;
  start_local: string;
  date: string;
  sport: Sport;
  name: string | null;
  distance_m: number | null;
  moving_s: number | null;
  elev_gain: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power: number | null;
  np: number | null;
  avg_cad: number | null;
  min_temp: number | null;
  max_temp: number | null;
  lap_count: number | null;
  hr_z: number[] | null;
  pwr_z: number[] | null;
  load: number | null;
  load_source: string | null;
  tss_garmin?: number | null;
  drift: number | null;
  laps: NLap[] | null;
  quality_type: string | null;
  is_quality: number | boolean;
}

export interface PlannedForAct {
  name: string;
  kind: string;
  quality_type: string | null;
  target_load: number | null;
  workout: Workout | null;
  /** app = z plánu aplikace, icu = workout zadaný v intervals.icu */
  source?: "app" | "icu";
  /** plnění workoutu podle intervals.icu (%) */
  compliance?: number | null;
}

export const SPORT_EMOJI: Record<string, string> = {
  ride: "🚴",
  mtb: "🚵",
  indoor: "🚴",
  run: "🏃",
  skate: "⛸️",
  xc_ski: "🎿",
  walk: "🚶",
  hike: "🚶",
  padel: "🎾",
  strength: "🏋️",
  mobility: "🧘",
  other: "🏅",
};

export interface LapRow {
  name: string;
  time: string;
  power: string;
  hr: string;
  sub: string;
  iv: boolean;
  /** začátek a délka úseku v s od startu aktivity (pro výřez průběhu po kliknutí) */
  start_s?: number | null;
  dur_s?: number | null;
}

export interface ZoneRow {
  z: string;
  secs: number;
  pct: number; // přesné % z času v pohybu
  time: string;
  pctText: string;
  color: string;
}

export interface ActivityAnalysis {
  id: string;
  date: string;
  title: string;
  emoji: string;
  start: string;
  unitType: string;
  envLabel: string;
  isBike: boolean;
  hasPower: boolean;
  indoor: boolean;
  basics: [string, string][];
  basicsNote: string;
  /** VI = NP / průměrný výkon a slovní hodnocení (zobrazuje se v Dalších údajích) */
  vi: { value: number; intensity: number | null; text: string } | null;
  /** hodnocení aerobního driftu (decoupling) – u intervalů, krátkých a kopcovitých jízd s výhradou */
  driftNote: string | null;
  laps: { show: boolean; rows: LapRow[]; note: string; c3: boolean };
  hrZones: ZoneRow[] | null;
  hrZonesNote: string | null;
  pwrZones: ZoneRow[] | null;
  pwrZonesNote: string | null;
  quality: { isQuality: boolean; type: string | null };
  goal: string;
  verdict: string;
  load: number | null;
  planLoad: number | null;
  compliance: number | null;
  summary: { durationS: number | null; km: number | null; mainPoint: string };
}

// barvy musí existovat v app.css (dřív odkazy na neexistující proměnné → Z4/Z5 se nevykreslily)
export const HR_COLORS = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z6)"];
export const PWR_COLORS = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z5)", "var(--z6)", "var(--z7)"];

export function zoneRows(secs: number[], moving: number, colors: string[]): ZoneRow[] {
  return secs.map((s, i) => {
    const pct = moving > 0 ? (s / moving) * 100 : 0;
    return {
      z: `Z${i + 1}`,
      secs: s,
      pct: Math.round(pct * 100) / 100,
      time: s > 0 ? zoneTime(s) : "–",
      pctText: s > 0 ? zonePct(pct) : "–",
      color: colors[i] ?? "var(--z1)",
    };
  });
}

/** Aerobní drift (Pw:HR, %) z průběhu: poměr výkon/tep v 1. vs. 2. polovině. Bez výkonu rychlost/tep. */
export function computeDrift(samples: [number, number | null, number | null, number | null][], usePower: boolean): number | null {
  const pts = samples.filter((s) => (s[2] ?? 0) > 40 && (usePower ? s[1] != null : (s[3] ?? 0) > 0.5));
  if (pts.length < 20) return null;
  const tEnd = pts[pts.length - 1]![0];
  const tStart = pts[0]![0];
  const mid = tStart + (tEnd - tStart) / 2;
  const half = (a: typeof pts) => {
    const out = a.reduce((s, p) => s + (usePower ? (p[1] ?? 0) : (p[3] ?? 0)), 0) / a.length;
    const hr = a.reduce((s, p) => s + (p[2] ?? 0), 0) / a.length;
    return out / hr;
  };
  const h1 = pts.filter((p) => p[0] <= mid);
  const h2 = pts.filter((p) => p[0] > mid);
  if (h1.length < 10 || h2.length < 10) return null;
  const r1 = half(h1);
  const r2 = half(h2);
  return Math.round(((r1 - r2) / r1) * 1000) / 10;
}

export function driftText(drift: number | null, steady: boolean, hilly: boolean, movingS = 9999, maxTemp: number | null = null): string {
  if (!steady) return "Aerobní drift u intervalové jízdy nehodnotím.";
  if (movingS < 40 * 60) return "Aerobní drift pod 40 min nehodnotím.";
  if (drift == null) return "Aerobní drift nemám.";
  const v = drift < 5 ? "dobrý" : drift <= 8 ? "běžný" : "pozor, vysoký";
  const caveats: string[] = [];
  if (hilly) caveats.push("na kopcovitém terénu ho ber jen orientačně");
  if (maxTemp != null && maxTemp >= 25) caveats.push(`v teple (${num(maxTemp)} °C) tep roste i bez únavy`);
  return `Aerobní drift ${num(drift, 1)} % je ${v}${caveats.length ? ", " + caveats.join(", ") : ""}.`;
}

/** Očekávané lapy podle kroků workoutu (každý krok = lap, opakování rozepsaná). */
export function expectedLapNames(w: Workout | null, isZ2: boolean): string[] | null {
  if (!w) return null;
  const names: string[] = [];
  let n = 0;
  for (const b of w.blocks) {
    const reps = b.reps ?? 1;
    if (b.kind === "warmup") names.push("Rozjetí");
    else if (b.kind === "main") names.push(isZ2 ? "Z2" : b.label);
    else if (b.kind === "cooldown") names.push(b.label === "Vyjeti" ? "Vyjetí" : "Z2 a vyjetí");
    else if (b.kind === "pause") names.push(`Pauza`);
    else
      for (let r = 0; r < reps; r++) {
        n++;
        names.push(`Interval ${n}`);
        if (b.steps.length > 1) names.push(`Pauza ${n}`);
      }
  }
  return names;
}

function bandForInterval(w: Workout | null): [number, number] | null {
  const b = w?.blocks.find((x) => x.kind === "work");
  const s = b?.steps[0];
  return s?.lo != null && s.hi != null ? [s.lo, s.hi] : null;
}

export function analyzeActivity(a: ActRow, plan: PlannedForAct | null, ftp: number | null, hz: HrZones | null): ActivityAnalysis {
  const isBike = BIKE_SPORTS.includes(a.sport);
  const hasPower = isBike && !!a.np;
  const indoor = a.sport === "indoor";
  const moving = a.moving_s ?? 0;
  const km = a.distance_m != null ? a.distance_m / 1000 : null;
  const speed = km != null && moving > 0 ? km / (moving / 3600) : null;
  const isZ2Plan = plan?.kind === "z2" || plan?.kind === "long";
  const qType = (plan?.quality_type as QualityType | null) ?? (a.quality_type as QualityType | null);
  const isQuality = !!a.is_quality;
  const vi = hasPower && a.avg_power ? a.np! / a.avg_power : null;
  const intensity = hasPower && ftp ? (a.np! / ftp) * 100 : null;
  const hilly = km != null && km > 0 && (a.elev_gain ?? 0) / km > 10;
  // ustálená jízda: naplánovaná Z2 se počítá jako ustálená, i když ji třídění označilo jako kvalitu; rozhoduje VI
  const steady = (isZ2Plan || !isQuality) && (vi == null || vi <= 1.15);
  const planLoad = plan?.target_load ?? null;
  const compliance = plan?.compliance ?? (planLoad && a.load ? Math.min(150, Math.round((a.load / planLoad) * 100)) : null);

  const envLabel = indoor ? "trenažér" : a.sport === "mtb" ? "MTB" : isBike ? (hasPower ? "silnice s wattmetrem" : "silnice bez wattmetru") : "";
  const unitType = plan?.name ?? (isQuality && qType && qType in QUALITY_NAME ? QUALITY_NAME[qType as QualityType] : isBike ? "bez plánu" : "");

  // ---- 📏 Základ ----
  const basics: [string, string][] = [];
  basics.push(["⏱️ Čas v pohybu", hms(moving)]);
  if (!indoor && km != null && km > 0.05) basics.push(["📍 Vzdálenost", `${num(km, 1)} km`]);
  if (!indoor && a.elev_gain != null && (isBike || a.elev_gain >= 20)) basics.push(["⛰️ Převýšení", `${num(a.elev_gain)} m`]);
  if (!indoor && speed != null && isBike) basics.push(["🚀 Průměrná rychlost", `${num(speed, 1)} km/h`]);
  // běh, chůze, turistika, běžky: tempo min/km místo rychlosti
  if (!indoor && speed != null && speed > 0.5 && FOOT_SPORTS.includes(a.sport)) basics.push(["⏱️ Průměrné tempo", `${paceOf(speed / 3.6)} /km`]);
  const teL = ((a as any).extra?.te_label as string | undefined) ?? null;
  if (teL && TE_NAME[teL]) basics.push(["🎯 Hlavní přínos", TE_NAME[teL]!]);
  // jednotka zátěže: TSS jen u kola s wattmetrem, jinak HRSS z tepu (i běh s výkonem z hodinek)
  const loadUnit = a.load == null ? "" : isBike && a.load_source !== "hr_indoor" && (a.np || a.load_source === "np_ftp") ? " TSS" : " HRSS";
  basics.push(["🔋 Zátěž", `${num(a.load)}${loadUnit}${planLoad ? ` (plán ${num(planLoad)})` : ""}`]);
  if (compliance != null) basics.push(["✅ Splnění plánu", `${compliance} %${plan?.compliance != null ? " (intervals.icu)" : ""}`]);
  if (a.avg_hr) basics.push(["❤️ Tep", `${num(a.avg_hr)} bpm${a.max_hr ? ` (max ${num(a.max_hr)} bpm)` : ""}`]);
  // VI a aerobní drift nejsou nahoře: VI je v Dalších údajích, drift (= decoupling) v kartě 1. vs. 2. polovina
  if (hasPower) basics.push(["⚡ Výkon", `${num(a.avg_power)} W (NP ${num(a.np)} W)`]);
  const viInfo = hasPower && vi != null ? { value: Math.round(vi * 100) / 100, intensity: intensity != null ? Math.round(intensity) : null, text: vi <= 1.1 ? "rovnoměrná" : vi <= 1.25 ? "kopce / intervaly" : "nárazová" } : null;
  const driftNote = isBike ? driftText(a.drift, steady, hilly, moving, a.max_temp) : null;
  let basicsNote = "";
  if (isBike && !hasPower) basicsNote = "Bez wattmetru: hodnotím tep a zóny tepu, zátěž je odhad z tepu.";
  if (a.load_source === "hr_indoor") {
    const pw = powerLoad({ ...a, tss_garmin: a.tss_garmin ?? null }, ftp);
    basicsNote += `${basicsNote ? " " : ""}Zátěž je z tepu${pw ? ` (z výkonu by byla ${num(pw.load)} TSS)` : ""}: na trenažéru chybí proudění vzduchu a pauzy ve šlapání, takže tě stejný výkon stojí víc. Počítá se vyšší z obou hodnot.`;
  }

  // ---- 🔥 Okruhy ----
  const laps = buildLaps(a, plan, isZ2Plan, hasPower, indoor);

  // ---- zóny ----
  const showHr = a.hr_z && a.sport !== "walk" && a.sport !== "hike";
  const hrZones = showHr ? zoneRows(a.hr_z!, moving, HR_COLORS) : null;
  const hrZonesNote = showHr && hz ? `Zóny tepu: ${[1, 2, 3, 4, 5].map((z) => `Z${z} ${hrZoneRange(hz, z).join("–")}`).join(", ")} bpm (Garmin${hz.lthr ? `, LTHR ${hz.lthr}` : ""}).` : null;
  const pwrZones = hasPower && a.pwr_z ? zoneRows(a.pwr_z, moving, PWR_COLORS) : null;
  let pwrZonesNote: string | null = null;
  if (pwrZones && ftp) {
    const pz = powerZones(ftp);
    pwrZonesNote = `Zóny výkonu: Z2 ${pz[1]!.lo}–${pz[1]!.hi}, Z3 ${pz[2]!.lo}–${pz[2]!.hi}, Z4 ${pz[3]!.lo}–${pz[3]!.hi} W (FTP ${ftp} W). Podíl z času v pohybu ${hms(moving)}. Čas v zónách počítá Garmin podle svých zón.`;
  }

  // ---- 🎯 Splnění cíle ----
  const goal = goalText(a, plan, { isBike, hasPower, isQuality, qType, intensity, steady, hilly, compliance, planLoad, laps, isZ2Plan });
  const mainPoint = mainPointText(a, { hasPower, intensity, isQuality, steady, laps });
  const verdict = verdictText(a, plan, { isBike, isQuality, compliance, hasPower, steady });

  return {
    id: a.id,
    date: a.date,
    title: a.name ?? "Aktivita",
    emoji: SPORT_EMOJI[a.sport] ?? "🏅",
    start: a.start_local.slice(11, 16),
    unitType,
    envLabel,
    isBike,
    hasPower,
    indoor,
    basics,
    basicsNote: basicsNote.trim(),
    vi: viInfo,
    driftNote,
    laps,
    hrZones,
    hrZonesNote,
    pwrZones,
    pwrZonesNote,
    quality: { isQuality, type: qType },
    goal,
    verdict,
    load: a.load,
    planLoad,
    compliance,
    summary: { durationS: moving, km, mainPoint },
  };
}

/** sporty, kde se ukazuje tempo (min/km) místo rychlosti */
export const FOOT_SPORTS: string[] = ["run", "walk", "hike", "xc_ski"];
/** hlavní přínos podle tréninkového efektu Garminu */
/** názvy jako v Garmin Connect česky (LACTATE_THRESHOLD = „Limitní“), v závorce skupina zátěže */
export const TE_NAME: Record<string, string> = { RECOVERY: "Regenerace (nízko aerobní)", AEROBIC_BASE: "Základ (nízko aerobní)", TEMPO: "Tempo (vysoce aerobní)", LACTATE_THRESHOLD: "Limitní (vysoce aerobní)", VO2MAX: "VO2 Max (vysoce aerobní)", ANAEROBIC_CAPACITY: "Anaerobní (anaerobní)", SPEED: "Sprint (anaerobní)" };
/** tempo min/km z rychlosti v m/s */
const paceOf = (ms: number) => { const t = Math.round(1000 / ms); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

function buildLaps(a: ActRow, plan: PlannedForAct | null, isZ2: boolean, hasPower: boolean, indoor: boolean) {
  const res = { show: false, rows: [] as LapRow[], note: "", c3: !hasPower };
  if (!BIKE_SPORTS.includes(a.sport) && a.sport !== "run") return res;
  const raw = (a.laps ?? []).filter((l) => !(l.type === "RECOVERY" && l.elapsed_s < 10));
  const garminN = a.lap_count ?? null;
  if (!raw.length) {
    res.note = garminN && garminN > 1 ? `Okruhy z Garminu (${garminN}) se nenačetly.` : "Okruhy nemám.";
    return res;
  }
  if (raw.length === 1 && (garminN ?? 0) > 1) {
    res.note = `Okruhy z Garminu (${garminN}) se nenačetly, Intervals.icu nemá zapnuté Use laps for intervals.${isZ2 ? " U Z2 jízdy to hodnocení neovlivní." : ""}`;
    return res;
  }
  // extra okruh na konci
  let extra: NLap | null = null;
  let laps = raw;
  if (laps.length > 2 && laps[laps.length - 1]!.moving_s < 120) {
    extra = laps[laps.length - 1]!;
    laps = laps.slice(0, -1);
  }
  const expected = expectedLapNames(plan?.workout ?? null, isZ2);
  const named = expected && expected.length === laps.length ? expected : laps.map((_, i) => `Okruh ${i + 1}`);
  const band = bandForInterval(plan?.workout ?? null);
  const notes: string[] = [];
  const count = laps.length + (extra ? 1 : 0);
  if (garminN == null || garminN === count) notes.push(`Okruhy z Garminu (${count}).`);
  else notes.push(`Intervals.icu hlásí ${garminN} okruhů, konektor vrací ${count} úseků (intervaly detekované z wattů). Zapni v Intervals.icu Use laps for intervals.`);

  const mk = (l: NLap, name: string, isExtra = false): LapRow => {
    const isInterval = name.startsWith("Interval");
    const iv = isInterval || name === "Z2";
    const sub: string[] = [];
    if (!indoor && l.distance_m) sub.push(`${num(l.distance_m / 1000, 1)} km`);
    const run = a.sport === "run";
    if (!indoor && l.avg_speed) sub.push(run ? `${paceOf(l.avg_speed)} /km` : `${num(l.avg_speed * 3.6, 1)} km/h`);
    // běh: Garmin/intervals.icu dávají kadenci na jednu nohu → kroky za minutu = 2×
    if (l.avg_cad) sub.push(run ? `${num(l.avg_cad * 2)} kr/min` : `${num(l.avg_cad)} ot/min`);
    if (!indoor && l.elev_gain != null) sub.push(`${num(l.elev_gain)} m`);
    if (isInterval && hasPower) {
      if (l.np) sub.push(`NP ${num(l.np)} W`);
      if (band && l.avg_power != null) {
        const p = l.avg_power;
        sub.push(p < band[0] ? `o ${Math.round(band[0] - p)} W pod pásmem` : p > band[1] ? `o ${Math.round(p - band[1])} W nad pásmem` : `v pásmu ${band[0]}–${band[1]} W`);
      }
    }
    return {
      name,
      time: hms(l.moving_s || l.elapsed_s),
      power: hasPower ? `${num(l.avg_power)} W` : "",
      hr: `${num(l.avg_hr)}/${num(l.max_hr)}`,
      sub: sub.join(" · "),
      iv,
      start_s: typeof l.start_s === "number" ? l.start_s : null,
      dur_s: l.elapsed_s || l.moving_s || null,
    };
  };
  res.rows = laps.map((l, i) => mk(l, named[i]!));
  if (extra) {
    // krátký poslední úsek = normální další okruh (žádné „Extra okruh“)
    res.rows.push(mk(extra, `Okruh ${res.rows.length + 1}`, true));
  }
  // stabilita intervalů
  const ints = laps.filter((_, i) => named[i]!.startsWith("Interval"));
  if (ints.length >= 2 && hasPower) {
    const w = ints.map((l) => Math.round(l.avg_power ?? 0));
    const h = ints.map((l) => Math.round(l.avg_hr ?? 0));
    const trend = w[w.length - 1]! >= w[0]! * 1.02 ? "roste" : w[w.length - 1]! <= w[0]! * 0.97 ? "klesá" : "drží";
    notes.push(`Intervaly ${w.join(", ")} W, výkon ${trend}; tep ${h[0]} → ${h[h.length - 1]} bpm (${h[h.length - 1]! - h[0]! >= 0 ? "+" : "−"}${Math.abs(h[h.length - 1]! - h[0]!)}).`);
  }
  res.show = true;
  res.note = notes.join(" ");
  return res;
}

interface GoalCtx {
  isBike: boolean;
  hasPower: boolean;
  isQuality: boolean;
  qType: QualityType | null;
  intensity: number | null;
  steady: boolean;
  hilly: boolean;
  compliance: number | null;
  planLoad: number | null;
  laps: { rows: LapRow[] };
  isZ2Plan: boolean;
}

function zoneShare(z: number[] | null, moving: number, from: number, to: number): number | null {
  if (!z || moving <= 0) return null;
  let s = 0;
  for (let i = from; i <= to; i++) s += z[i] ?? 0;
  return Math.round((s / moving) * 100);
}

function goalText(a: ActRow, plan: PlannedForAct | null, c: GoalCtx): string {
  const mv = a.moving_s ?? 0;
  const s: string[] = [];
  if (!c.isBike) {
    if (plan) {
      const z2hr = zoneShare(a.hr_z, mv, 1, 1);
      s.push(`Plán: ${plan.name}. ${a.name ?? "Aktivita"} ${hms(mv)}${z2hr != null ? `, ${z2hr} % času v Z2 tepu` : ""}, zátěž ${num(a.load)}${c.planLoad ? ` (plán ${num(c.planLoad)})` : ""}.`);
      if (c.compliance != null) s.push(`Splnění ${c.compliance} %.`);
      return s.join(" ");
    }
    if (a.sport === "xc_ski") {
      s.push(`Běžky ${hms(mv)}, zátěž ${num(a.load)} (z tepu, orientační).`);
      s.push(c.isQuality ? "Nad 2 h nebo zátěž nad 120: počítá se jako kvalitní jednotka týdne." : "Do limitu kvality se nepočítá.");
    } else s.push(`${a.name ?? "Aktivita"} ${hms(mv)}, zátěž ${num(a.load)} (z tepu, orientační). Do kvality se nepočítá.`);
    return s.join(" ");
  }
  const z2pwr = c.hasPower ? zoneShare(a.pwr_z, mv, 1, 1) : null;
  const z2hr = zoneShare(a.hr_z, mv, 1, 1);
  if (plan && c.isZ2Plan) {
    s.push(`Záměr ${plan.name}: ${z2pwr != null ? `${z2pwr} % času v Z2 výkonu` : z2hr != null ? `${z2hr} % času v Z2 tepu` : "zóny nemám"}${c.intensity != null ? `, intenzita ${num(c.intensity)} %` : ""}.`);
    const ok = (z2pwr ?? z2hr ?? 0) >= 50 && (c.intensity == null || c.intensity <= 78);
    s.push(ok ? "Záměr Z2 je splněný." : "Jízda byla nad záměrem Z2, část času mimo Z2.");
  } else if (plan && c.isQuality) {
    const ints = c.laps.rows.filter((r) => r.name.startsWith("Interval"));
    const inBand = ints.filter((r) => r.sub.includes("v pásmu")).length;
    s.push(`Záměr ${plan.name}: ${ints.length ? `${inBand} z ${ints.length} intervalů v pásmu` : "intervaly z lapů nemám"}.`);
    if (ints.length) s.push(inBand === ints.length ? "Záměr je splněný." : inBand >= ints.length - 1 ? "Záměr je splněný s rezervou na hraně pásma." : "Záměr splněný jen částečně.");
  } else if (plan) {
    s.push(`Plán: ${plan.name}.`);
  } else {
    s.push(
      c.isQuality
        ? `Bez plánovaného workoutu, podle zón kvalitní jízda (${c.qType ? QUALITY_NAME[c.qType] : "intenzita"}).`
        : `Bez plánovaného workoutu${z2pwr != null ? `, ${z2pwr} % času v Z2 výkonu` : z2hr != null ? `, ${z2hr} % času v Z2 tepu` : ""}.`,
    );
  }
  if (c.planLoad && a.load) {
    const d = a.load - c.planLoad;
    if (Math.abs(d) >= 10) s.push(`Zátěž ${num(a.load)} proti plánu ${num(c.planLoad)} (${d > 0 ? "+" : "−"}${num(Math.abs(d))})${d > 0 && c.hilly ? ", přebytek hlavně z kopců" : d > 0 && (a.moving_s ?? 0) > 0 ? ", delší nebo intenzivnější jízda" : ", kratší nebo lehčí jízda"}.`);
  }
  return s.slice(0, 4).join(" ");
}

function mainPointText(a: ActRow, c: { hasPower: boolean; intensity: number | null; isQuality: boolean; steady: boolean; laps: { rows: LapRow[] } }): string {
  if (c.isQuality && c.laps.rows.some((r) => r.name.startsWith("Interval"))) {
    const ints = c.laps.rows.filter((r) => r.name.startsWith("Interval"));
    return `${ints.filter((r) => r.sub.includes("v pásmu")).length} z ${ints.length} intervalů v pásmu`;
  }
  if (c.hasPower && c.steady && a.drift != null) return `drift ${num(a.drift, 1)} %`;
  if (c.hasPower && c.intensity != null) return `NP ${num(a.np)} W, intenzita ${num(c.intensity)} %`;
  return `tep ${num(a.avg_hr)} bpm`;
}

function verdictText(a: ActRow, plan: PlannedForAct | null, c: { isBike: boolean; isQuality: boolean; compliance: number | null; hasPower: boolean; steady: boolean }): string {
  const what = a.name ?? "Aktivita";
  if (!c.isBike && plan) return `${plan.name} odjeto${c.compliance != null ? `, splnění ${c.compliance} %` : ""}.`;
  if (!c.isBike) return `${what}: ${c.isQuality ? "kvalitní jednotka týdne" : "doplňková aktivita"}, zátěž ${num(a.load)}.`;
  if (plan) return `${plan.name} odjeto${c.compliance != null ? `, splnění ${c.compliance} %` : ""}.`;
  return `${c.isQuality ? "Kvalitní jízda" : "Jízda"} bez plánu, zátěž ${num(a.load)}.`;
}

export { dm };
