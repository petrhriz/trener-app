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
    avg_cad: pos(a.averageBikingCadenceInRevPerMinute) ?? pos(a.averageRunningCadenceInStepsPerMinute),
    min_temp: n(a.minTemperature),
    max_temp: n(a.maxTemperature),
    lap_count: n(a.lapCount),
    calories: n(a.calories),
    hr_z: hz.some((x) => x > 0) ? hz : null,
    pwr_z: pz.some((x) => x > 0) ? pz : null,
    mmp: Object.keys(mmp).length ? mmp : null,
    extra: extraGarmin(a),
  };
}

function extraGarmin(a: J) {
  const kmh = (v: unknown) => (pos(v) != null ? Math.round(pos(v)! * 36) / 10 : null);
  const run = pos(a.averageRunningCadenceInStepsPerMinute) != null;
  const e = {
    max_speed: kmh(a.maxSpeed),
    avg_speed: kmh(a.averageSpeed),
    max_cad: run ? pos(a.maxRunningCadenceInStepsPerMinute) : pos(a.maxBikingCadenceInRevPerMinute),
    strokes: pos(a.strokes) ?? pos(a.steps),
    avg_resp: pos(a.avgRespirationRate),
    min_resp: pos(a.minRespirationRate),
    max_resp: pos(a.maxRespirationRate),
    min_elev: n(a.minElevation),
    max_elev: n(a.maxElevation),
    elev_loss: n(a.elevationLoss),
    ana_te: n(a.anaerobicTrainingEffect),
    te_label: typeof a.trainingEffectLabel === "string" && a.trainingEffectLabel !== "UNKNOWN" ? a.trainingEffectLabel : null,
    run_cad: run ? pos(a.averageRunningCadenceInStepsPerMinute) : null,
    stride_m: run && pos(a.avgStrideLength) != null ? Math.round(pos(a.avgStrideLength)!) / 100 : null,
    gct_ms: run && pos(a.avgGroundContactTime) != null ? Math.round(pos(a.avgGroundContactTime)!) : null,
    vosc_cm: run && pos(a.avgVerticalOscillation) != null ? Math.round(pos(a.avgVerticalOscillation)! * 10) / 10 : null,
    vratio: run && pos(a.avgVerticalRatio) != null ? Math.round(pos(a.avgVerticalRatio)! * 10) / 10 : null,
    bb_diff: n(a.differenceBodyBattery),
    te_msg: typeof a.aerobicTrainingEffectMessage === "string" ? a.aerobicTrainingEffectMessage : null,
  };
  return Object.values(e).some((v) => v != null) ? e : null;
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
  const st = d.stress ?? {};
  const dist =
    n(st.restProportion) != null
      ? JSON.stringify({ rest: n(st.restProportion), low: n(st.lowStressProportion), med: n(st.mediumStressProportion), high: n(st.highStressProportion), act: n(st.activityProportion) })
      : null;
  return {
    date: d.calendarDate,
    rhr: pos(d.heartRate?.restingValue),
    steps: n(d.movement?.steps?.value),
    // Body Battery z Garminu jen pro srovnání – bb_* plní vlastní výpočet energie (src/core/energy.ts)
    // do kdy má Garmin Connect data z hodinek (≈ poslední synchronizace hodinek) – jen pro záznam synchronizace, do D1 se nezapisuje
    data_until: (() => { const t = Date.parse(String(d.wellnessChronology?.endTimestampGmt ?? "").replace(/\.0$/, "") + "Z"); return Number.isFinite(t) ? t : null; })(),
    bb_max_g: n(d.bodyBattery?.maxValue),
    bb_min_g: n(d.bodyBattery?.minValue),
    bb_charged_g: n(d.bodyBattery?.chargedValue),
    bb_drained_g: n(d.bodyBattery?.drainedValue),
    bb_latest_g: n(d.bodyBattery?.latestValue),
    stress_avg: pos(d.stress?.avgLevel),
    stress_max: pos(st.maxLevel),
    stress_dist: dist,
    intensity_min: im != null || iv != null ? (im ?? 0) + (iv ?? 0) : null,
    respiration: pos(d.respiration?.avgValue),
    floors_up: n(d.movement?.floorsAscended?.value),
    floors_down: n(d.movement?.floorsDescended?.value),
  };
}

export function normSleep(s: J): NWellness | null {
  if (!s?.calendarDate) return null;
  const secs = pos(s.sleepTimeSeconds);
  const end = n(s.sleepEndTimestampLocal);
  const start = n(s.sleepStartTimestampLocal);
  const sc = s.sleepScores ?? {};
  const sub: Record<string, string> = {};
  for (const k of ["totalDuration", "stress", "awakeCount", "remPercentage", "restlessness", "lightPercentage", "deepPercentage"]) {
    const q = sc[k]?.qualifierKey;
    if (typeof q === "string") sub[k] = q;
  }
  return {
    date: s.calendarDate,
    wake_time: end ? new Date(end).toISOString().slice(0, 16) : null,
    sleep_start: start ? new Date(start).toISOString().slice(0, 16) : null,
    sleep_s: secs,
    sleep_score_g: n(sc.overall?.value),
    sleep_q: sleepQualifier(sc.overall?.qualifierKey),
    deep_s: n(s.deepSleepSeconds),
    light_s: n(s.lightSleepSeconds),
    rem_s: n(s.remSleepSeconds),
    awake_s: n(s.awakeSleepSeconds),
    awake_count: n(s.awakeCount),
    sleep_stress: n(s.avgSleepStress),
    sleep_hr: pos(s.avgHeartRate),
    sleep_resp: pos(s.averageRespirationValue),
    sleep_need_g_min: pos(s.sleepNeed?.actual),
    next_sleep_need_g_min: pos(s.nextSleepNeed?.actual),
    sleep_resp_lo: pos(s.lowestRespirationValue),
    sleep_resp_hi: pos(s.highestRespirationValue),
    sleep_feedback: typeof s.sleepScoreFeedback === "string" ? s.sleepScoreFeedback : null,
    sleep_sub: Object.keys(sub).length ? JSON.stringify(sub) : null,
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
