import type { NActivity, NWellness, Sport } from "./types";

type J = Record<string, any>;

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v: unknown): number | null => {
  const x = n(v);
  return x != null && x > 0 ? x : null;
};

export function sportFromGarmin(typeKey: string | null | undefined, name?: string | null): Sport {
  const k = (typeKey ?? "").toLowerCase();
  const nm = (name ?? "").toLowerCase();
  if (/hockey|hokej/.test(k) || /hokej|hockey/.test(nm)) return "hockey";
  if (/indoor_cycling|virtual_ride|indoor_bik|trainer/.test(k)) return "indoor";
  if (/mountain|mtb|enduro_m|downhill/.test(k)) return "mtb";
  if (/cycling|biking|bike|gravel|ride/.test(k)) return "ride";
  if (/cross_country|skate_ski|nordic|backcountry_ski/.test(k) || /běžky|bezky/.test(nm)) return "xc_ski";
  if (/skating/.test(k)) return "skate";
  if (/padel|tennis|squash/.test(k)) return "padel";
  if (/run/.test(k)) return "run";
  if (/hik/.test(k)) return "hike";
  if (/walk/.test(k)) return "walk";
  if (/strength|weight|hiit/.test(k)) return "strength";
  if (/yoga|pilates|mobility|stretch|breath/.test(k)) return "mobility";
  return "other";
}

export function normActivityGarmin(a: J): NActivity {
  const start = String(a.startTimeLocal ?? "").replace("T", " ").slice(0, 19);
  const hz = [1, 2, 3, 4, 5].map((i) => n(a[`hrTimeInZone_${i}`]) ?? 0);
  const pz = [1, 2, 3, 4, 5, 6, 7].map((i) => n(a[`powerTimeInZone_${i}`]) ?? 0);
  const mmp: Record<string, number> = {};
  for (const s of [5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600]) {
    const v = pos(a[`maxAvgPower_${s}`]);
    if (v) mmp[s] = v;
  }
  const typeKey = a.activityType?.typeKey ?? null;
  const name = a.activityName ?? null;
  return {
    id: String(a.activityId),
    start_local: start,
    date: start.slice(0, 10),
    type_key: typeKey,
    sport: sportFromGarmin(typeKey, name),
    name,
    distance_m: n(a.distance),
    duration_s: n(a.duration),
    moving_s: n(a.movingDuration) ?? n(a.duration),
    elev_gain: n(a.elevationGain),
    avg_hr: pos(a.averageHR),
    max_hr: pos(a.maxHR),
    avg_power: pos(a.avgPower),
    max_power: pos(a.maxPower),
    np: pos(a.normPower),
    max20: pos(a.max20MinPower),
    tss_garmin: pos(a.trainingStressScore),
    if_garmin: pos(a.intensityFactor),
    garmin_load: n(a.activityTrainingLoad),
    aerobic_te: n(a.aerobicTrainingEffect),
    avg_cad: pos(a.averageBikingCadenceInRevPerMinute),
    min_temp: n(a.minTemperature),
    max_temp: n(a.maxTemperature),
    lap_count: n(a.lapCount),
    calories: n(a.calories),
    hr_z: hz.some((x) => x > 0) ? hz : null,
    pwr_z: pz.some((x) => x > 0) ? pz : null,
    mmp: Object.keys(mmp).length ? mmp : null,
  };
}

/** Garmin qualifierKey spánku -> slovo z pravidel (Q1–Q4) */
export function sleepQualifier(q: string | null | undefined): string | null {
  switch ((q ?? "").toUpperCase()) {
    case "EXCELLENT":
      return "Q1";
    case "GOOD":
      return "Q2";
    case "FAIR":
      return "Q3";
    case "POOR":
      return "Q4";
    default:
      return null;
  }
}

export function normDaily(d: J): NWellness | null {
  if (!d?.calendarDate) return null;
  const im = n(d.intensityMinutes?.moderate);
  const iv = n(d.intensityMinutes?.vigorous);
  return {
    date: d.calendarDate,
    rhr: pos(d.heartRate?.restingValue),
    steps: n(d.movement?.steps?.value),
    bb_max: n(d.bodyBattery?.maxValue),
    bb_min: n(d.bodyBattery?.minValue),
    stress_avg: pos(d.stress?.avgLevel),
    intensity_min: im != null || iv != null ? (im ?? 0) + (iv ?? 0) : null,
    respiration: pos(d.respiration?.avgValue),
  };
}

export function normSleep(s: J): NWellness | null {
  if (!s?.calendarDate) return null;
  const secs = pos(s.sleepTimeSeconds);
  const end = n(s.sleepEndTimestampLocal);
  return {
    date: s.calendarDate,
    wake_time: end ? new Date(end).toISOString().slice(0, 16) : null,
    sleep_s: secs,
    sleep_score: n(s.sleepScores?.overall?.value),
    sleep_q: sleepQualifier(s.sleepScores?.overall?.qualifierKey),
  };
}

export function normHrv(h: J): NWellness | null {
  if (!h?.calendarDate) return null;
  return {
    date: h.calendarDate,
    hrv: pos(h.lastNightAvg),
    hrv_weekly: pos(h.weeklyAvg),
    hrv_status: h.status ?? null,
  };
}

export function normWeight(w: J): NWellness | null {
  const g = n(w?.latestWeight?.weight);
  if (!w?.summaryDate || g == null) return null;
  return { date: w.summaryDate, weight_kg: Math.round(g / 10) / 100 };
}

/** Sloučí částečné záznamy stejného dne. */
export function mergeWellness(list: (NWellness | null)[]): NWellness[] {
  const m = new Map<string, NWellness>();
  for (const w of list) {
    if (!w) continue;
    const prev = m.get(w.date) ?? { date: w.date };
    for (const [k, v] of Object.entries(w)) if (v != null) (prev as any)[k] = v;
    m.set(w.date, prev);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
