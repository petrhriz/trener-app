import { describe, expect, it } from "vitest";
import { Decoder, Stream } from "@garmin/fitsdk";
import { dm, hms, num, signed, zonePct, zoneTime } from "../src/lib/format";
import { addDays, dow, localNow, mondayOf } from "../src/lib/time";
import { computeMetrics, formZone, project, weeklyLoadTarget } from "../src/core/fitness";
import { activityLoad, hrTssFromAvg, tssFromPower } from "../src/core/load";
import { type WRow, evaluateRecovery, norm, sleepRating } from "../src/core/recovery";
import { classify, qualityFromName } from "../src/core/quality";
import { carbsFor, packFor } from "../src/core/nutrition";
import { type Hour, dayWeather, isGreen } from "../src/core/weather";
import { intervalWorkout, renderIcu, validate, z2Workout } from "../src/core/workout";
import { TARGET_PCT, pctRange } from "../src/core/zones";
import { evaluatePast } from "../src/core/qualityDesign";
import { acwr, easyNotEasy, fuelPlan, lthrSanity, sleepRegularity } from "../src/core/extras";
import { computeDrift, expectedLapNames } from "../src/core/activity";
import { numbersOk } from "../src/llm/llm";
import { encodeWorkoutFit, fitCrc } from "../src/plan/fit";
import { normActivityGarmin, sleepQualifier, sportFromGarmin } from "../src/datasource/normalize";
import { upsertSql, lit } from "../src/lib/db";

// ---------- formát ----------
describe("formát čísel (kap. 10)", () => {
  it("desetinná čárka a minus „−“", () => {
    expect(num(1.07, 2)).toBe("1,07");
    expect(num(-2.4, 1)).toBe("−2,4");
    expect(num(-0.04, 1)).toBe("0,0");
    expect(num(null)).toBe("–");
    expect(signed(5.9, 1)).toBe("+5,9");
    expect(signed(-3, 0)).toBe("−3");
  });
  it("data a časy", () => {
    expect(dm("2026-10-23")).toBe("23.10.");
    expect(dm("2026-11-06")).toBe("6.11.");
    expect(hms(3725)).toBe("1:02:05");
    expect(hms(305)).toBe("5:05");
    expect(zoneTime(25)).toBe("25 s");
    expect(zonePct(0.5)).toBe("0,5 %");
    expect(zonePct(53.95)).toBe("54 %");
  });
});

// ---------- čas a letní čas ----------
describe("čas Europe/Prague a přechod letního času", () => {
  it("25. 10. 2026: 00:30 UTC = 02:30 SELČ, 01:30 UTC = 02:30 SEČ", () => {
    expect(localNow(new Date("2026-10-25T00:30:00Z")).hh).toBe(2);
    expect(localNow(new Date("2026-10-25T01:30:00Z")).hh).toBe(2);
    expect(localNow(new Date("2026-10-25T05:30:00Z")).iso).toBe("2026-10-25T06:30");
  });
  it("29. 3. 2026: 01:30 UTC = 03:30 SELČ", () => {
    expect(localNow(new Date("2026-03-29T01:30:00Z")).iso).toBe("2026-03-29T03:30");
  });
  it("pozdě večer UTC je už další den v Praze", () => {
    expect(localNow(new Date("2026-11-06T23:30:00Z")).date).toBe("2026-11-07");
  });
  it("aritmetika dnů přes DST", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(dow("2026-11-08")).toBe(7);
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
  });
});

// ---------- kondice ----------
describe("kondice / únava / forma (6.4)", () => {
  it("vzorce a forma = CTL(D) − ATL(D) jako intervals.icu; kotvy z intervals.icu platí", () => {
    const loads = new Map([["2026-01-02", 100]]);
    const s = computeMetrics(loads, "2026-01-01", "2026-01-03", { ctl: 50, atl: 60 });
    const ctl1 = 50 + (0 - 50) * 0.0235;
    const atl1 = 60 + (0 - 60) * 0.1331;
    expect(s[0]!.ctl).toBeCloseTo(ctl1, 2);
    expect(s[1]!.ctl).toBeCloseTo(ctl1 + (100 - ctl1) * 0.0235, 2);
    expect(s[1]!.atl).toBeCloseTo(atl1 + (100 - atl1) * 0.1331, 2);
    expect(s[0]!.form).toBeCloseTo(ctl1 - atl1, 2);
    expect(s[1]!.form).toBeCloseTo(s[1]!.ctl - s[1]!.atl, 2);
    const a = computeMetrics(loads, "2026-01-01", "2026-01-03", { ctl: 50, atl: 60 }, new Map([["2026-01-02", { ctl: 44.9, atl: 25.5, ramp: -4.1 }]]));
    expect(a[1]!.ctl).toBe(44.9);
    expect(a[1]!.form).toBeCloseTo(19.4, 2);
    expect(a[1]!.ramp).toBe(-4.1);
    expect(a[2]!.ctl).toBeCloseTo(44.9 - 44.9 * 0.0235, 2);
  });
  it("ramp rate = CTL(D) − CTL(D−7)", () => {
    const s = computeMetrics(new Map(), "2026-01-01", "2026-01-10", { ctl: 50, atl: 50 });
    expect(s[6]!.ramp).toBeNull();
    expect(s[7]!.ramp).toBeCloseTo(s[7]!.ctl - s[0]!.ctl, 1);
  });
  it("zóny formy", () => {
    expect(formZone(21)).toBe("Přechod");
    expect(formZone(5)).toBe("Čerstvý");
    expect(formZone(4.9)).toBe("Šedá zóna");
    expect(formZone(-10)).toBe("Šedá zóna");
    expect(formZone(-10.1)).toBe("Optimální");
    expect(formZone(-30.5)).toBe("Vysoké riziko");
  });
  it("cíl týdenní zátěže podle režimu", () => {
    expect(weeklyLoadTarget(57.8, "udrzeni")).toEqual({ lo: 364, hi: 445, mid: 405 });
    const z = weeklyLoadTarget(50, "zvyseni");
    expect(z.lo).toBe(368);
    expect(z.hi).toBeGreaterThanOrEqual(z.lo);
    const p = weeklyLoadTarget(50, "pokles");
    expect(p.mid).toBe(298);
    expect(p.hi).toBeLessThan(350);
  });
  it("výhled", () => {
    const p = project({ ctl: 50, atl: 50 }, "2026-01-01", [0, 100]);
    expect(p[0]!.date).toBe("2026-01-02");
    expect(p[0]!.form).toBeCloseTo(p[0]!.ctl - p[0]!.atl, 1);
  });
});

// ---------- zátěž ----------
describe("zátěž aktivity", () => {
  it("TSS z NP a FTP", () => expect(tssFromPower(3600, 298, 298)).toBeCloseTo(100, 5));
  it("Garmin TSS má přednost u jízdy s wattmetrem", () => {
    expect(activityLoad({ sport: "ride", moving_s: 3600, np: 200, tss_garmin: 55, hr_z: null, avg_hr: 140 }, { ftp: 298, hr: null })).toEqual({ load: 55, source: "garmin_tss" });
  });
  it("bez wattmetru hrTSS z průměrného tepu", () => {
    const hr = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 54 };
    const r = activityLoad({ sport: "mtb", moving_s: 3600, np: null, tss_garmin: null, hr_z: [100, 2000, 1500, 0, 0], avg_hr: 155 }, { ftp: 298, hr });
    expect(r.source).toBe("hr_avg");
    expect(r.load).toBeCloseTo(hrTssFromAvg(3600, 155, 196, 54), 0);
  });
  it("trenažér: Z2 – tep dá víc než výkon → hrTSS", () => {
    const hr = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 54 };
    const r = activityLoad({ sport: "indoor", moving_s: 3625, np: 179, tss_garmin: 36.2, hr_z: null, avg_hr: 155 }, { ftp: 298, hr });
    expect(r.source).toBe("hr_indoor");
    expect(r.load).toBeGreaterThan(45);
  });
  it("trenažér: intervaly – výkon dá víc než tep → TSS; venku vždy TSS", () => {
    const hr = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 54 };
    expect(activityLoad({ sport: "indoor", moving_s: 3600, np: 250, tss_garmin: 70, hr_z: null, avg_hr: 150 }, { ftp: 298, hr })).toEqual({ load: 70, source: "garmin_tss" });
    expect(activityLoad({ sport: "ride", moving_s: 3625, np: 179, tss_garmin: 36.2, hr_z: null, avg_hr: 155 }, { ftp: 298, hr })).toEqual({ load: 36.2, source: "garmin_tss" });
    expect(activityLoad({ sport: "indoor", moving_s: 3600, np: null, tss_garmin: null, hr_z: null, avg_hr: 155 }, { ftp: 298, hr }).source).toBe("hr_avg");
  });
  it("bez LTHR záloha zóny tepu, bez tepu 0", () => {
    expect(activityLoad({ sport: "walk", moving_s: 3600, np: null, tss_garmin: null, hr_z: [3600, 0, 0, 0, 0], avg_hr: 90 }, { ftp: null, hr: null }).source).toBe("hr_zones");
    expect(activityLoad({ sport: "other", moving_s: 600, np: null, tss_garmin: null, hr_z: null, avg_hr: null }, { ftp: null, hr: null })).toEqual({ load: 0, source: "none" });
  });
});

// ---------- zotavení ----------
function rows(n: number, today: Partial<WRow> | null, base: Partial<WRow> = {}, end = "2026-11-07"): WRow[] {
  const out: WRow[] = [];
  for (let i = n; i >= 1; i--) {
    const d = addDays(end, -i);
    // HRV průměr 75, SD ~4,3 · klidový tep průměr 52, SD ~1,6 (hranice 🟡 55,3, 🔴 56,9)
    out.push({ date: d, hrv: 75 + ((i % 5) - 2) * 3, rhr: 52 + ((i % 3) - 1) * 2, sleep_s: 7.5 * 3600, sleep_score: 82, sleep_q: "Q2", ...base });
  }
  if (today) out.push({ date: end, hrv: null, rhr: null, sleep_s: null, sleep_score: null, sleep_q: null, ...today });
  return out;
}

describe("zotavení – osobní normy (kap. 4)", () => {
  it("norma = průměr a výběrová SD", () => {
    const n = norm([1, 2, 3, 4]);
    expect(n.mean).toBe(2.5);
    expect(n.sd).toBeCloseTo(1.291, 3);
  });
  it("vše v normě → 🟢 a slovní hodnocení", () => {
    const r = evaluateRecovery({ date: "2026-11-07", rows: rows(60, { hrv: 75, rhr: 52, sleep_s: 7.6 * 3600, sleep_score: 85, sleep_q: "Q2" }), dayAfter: null, illness: false });
    expect(r.state).toBe("green");
    expect(r.hrv.rating).toBe("Vyvážené");
    expect(r.rhr.rating).toBe("Normální");
    expect(r.sleep.rating).toBe("Dobrý");
  });
  it("chybí dnešní HRV → „nemám“, včerejší se nepoužije", () => {
    const r = evaluateRecovery({ date: "2026-11-07", rows: rows(60, { rhr: 52, sleep_s: 7 * 3600, sleep_score: 80 }), dayAfter: null, illness: false });
    expect(r.hrv.status).toBe("missing");
    expect(r.hrv.today).toBeNull();
  });
  it("méně než 21 hodnot → nehodnotím", () => {
    const r = evaluateRecovery({ date: "2026-11-07", rows: rows(15, { hrv: 50, rhr: 70, sleep_s: 7 * 3600 }), dayAfter: null, illness: false });
    expect(r.hrv.status).toBe("insufficient");
    expect(r.rhr.status).toBe("insufficient");
    expect(r.state).toBe("green");
  });
  it("dva 🟡 → 🟡; den po dlouhé zátěži jeden 🟡 nepočítá", () => {
    const today = { hrv: 69, rhr: 56, sleep_s: 7 * 3600, sleep_score: 80 };
    const r1 = evaluateRecovery({ date: "2026-11-07", rows: rows(60, today), dayAfter: null, illness: false });
    expect(r1.hrv.flag).toBe("yellow");
    expect(r1.hrv.rating).toBe("Nevyvážené");
    expect(r1.rhr.flag).toBe("yellow");
    expect(r1.rhr.rating).toBe("Zvýšený");
    expect(r1.state).toBe("yellow");
    const r2 = evaluateRecovery({ date: "2026-11-07", rows: rows(60, today), dayAfter: "jízdě se zátěží 135", illness: false });
    expect(r2.hrv.expected).toBe(true);
    expect(r2.flags.yellow).toBe(1);
    expect(r2.state).toBe("green");
  });
  it("spánek pod 5:00 h → 🔴", () => {
    const r = evaluateRecovery({ date: "2026-11-07", rows: rows(60, { hrv: 75, rhr: 52, sleep_s: 4.5 * 3600, sleep_score: 70 }), dayAfter: null, illness: false });
    expect(r.sleep.flag).toBe("red");
    expect(r.state).toBe("red");
  });
  it("klidový tep zvýšený 3 dny po sobě → 🔴", () => {
    const rs = rows(60, { hrv: 75, rhr: 56, sleep_s: 7.5 * 3600, sleep_score: 82 });
    rs[rs.length - 2]!.rhr = 56;
    rs[rs.length - 3]!.rhr = 56;
    const r = evaluateRecovery({ date: "2026-11-07", rows: rs, dayAfter: null, illness: false });
    expect(r.rhr.streak3).toBe(true);
    expect(r.state).toBe("red");
  });
  it("nemoc → 🔴", () => {
    expect(evaluateRecovery({ date: "2026-11-07", rows: rows(60, { hrv: 75, rhr: 52, sleep_s: 8 * 3600 }), dayAfter: null, illness: true }).state).toBe("red");
  });
  it("hodnocení spánku podle skóre a Q", () => {
    expect(sleepRating(90, null)).toBe("Výborný");
    expect(sleepRating(59, null)).toBe("Špatný");
    expect(sleepRating(null, "Q3")).toBe("Průměrný");
    expect(sleepRating(null, null)).toBeNull();
  });
});

// ---------- kvalita ----------
describe("kvalita a limity (5, 6.1)", () => {
  const z = (z4: number, z5: number) => [600, 1800, 600, z4, z5, 0, 0];
  it("15 min Z4+ nebo 8 min Z5+ = kvalita; TSS nerozhoduje", () => {
    expect(classify({ sport: "ride", name: "x", moving_s: 3600, load: 200, pwr_z: z(800, 0), np: 200 }).isQuality).toBe(false);
    expect(classify({ sport: "ride", name: "x", moving_s: 3600, load: 50, pwr_z: z(900, 0), np: 200 }).isQuality).toBe(true);
    expect(classify({ sport: "ride", name: "x", moving_s: 3600, load: 50, pwr_z: z(0, 480), np: 200 }).type).toBe("vo2");
  });
  it("běžky nad 2 h; brusle se do kvality nepočítají", () => {
    expect(classify({ sport: "xc_ski", name: "Běžky", moving_s: 7300, load: 90, pwr_z: null, np: null }).counts).toBe(true);
    expect(classify({ sport: "skate", name: "x", moving_s: 3600, load: 100, pwr_z: null, np: null }).counts).toBe(false);
  });
  it("kvalita z názvu", () => {
    expect(qualityFromName("Trenažér – 3×10 min práh")).toBe("prah");
    expect(qualityFromName("5×4 min VO2 330–350 W")).toBe("vo2");
    expect(qualityFromName("Z2 vytrvalost")).toBeNull();
  });
});

// ---------- workout 7.3 ----------
describe("stavba workoutu a lapy (7.3)", () => {
  it("Z2 pro FTP 298: Z2 končí lapem (konec si jezdec určí sám)", () => {
    expect(renderIcu(z2Workout({ ftp: 298 }, 90))).toBe("Rozjeti\n- 5m 120-170w\n\nZ2\n- 1h20m 170-215w press lap\n\nVyjeti\n- 5m 120-160w press lap");
  });
  it("cílová pásma z FTP 298", () => {
    expect(pctRange(298, TARGET_PCT.warmupPre)).toEqual([135, 210]);
    expect(pctRange(298, TARGET_PCT.recovery)).toEqual([120, 160]);
  });
  it("práh 3×10: rozjetí do lapu, v opakování bez lapu, Z2 a dojezd do lapu", () => {
    const w = intervalWorkout({ ftp: 298 }, { warmupMin: 30, sets: [{ label: "Prah", reps: 3, work_s: 600, rest_s: 300, lo: 280, hi: 295 }], pauseBetweenS: 300, cooldownMin: 30 });
    expect(renderIcu(w)).toBe("Rozjeti\n- 30m 135-210w press lap\n\nPrah 3x\n- 10m 280-295w\n- 5m 120-160w\n\nZ2 a dojezd\n- 30m 170-215w press lap");
    expect(validate(w)).toEqual([]);
  });
  it("dva bloky s pauzou do lapu", () => {
    const w = intervalWorkout({ ftp: 298 }, { warmupMin: 20, sets: [{ label: "Sweet spot 1", reps: 1, work_s: 1200, rest_s: 0, lo: 260, hi: 275 }, { label: "Sweet spot 2", reps: 1, work_s: 1200, rest_s: 0, lo: 260, hi: 275 }], pauseBetweenS: 300, cooldownMin: 20 });
    expect(renderIcu(w)).toContain("Pauza\n- 5m 120-160w press lap\n\nSweet spot 2\n- 20m 260-275w");
    expect(validate(w)).toEqual([]);
  });
  it("validátor najde lap v opakování a chybějící lap na konci", () => {
    const bad = { blocks: [{ label: "X", kind: "work" as const, reps: 3, steps: [{ dur_s: 300, lo: 100, hi: 120, lap: true }] }] };
    const e = validate(bad);
    expect(e.some((x) => x.includes("uvnitř opakování"))).toBe(true);
    expect(e.some((x) => x.includes("poslední krok"))).toBe(true);
  });
  it("očekávané lapy podle workoutu", () => {
    const w = intervalWorkout({ ftp: 298 }, { warmupMin: 25, sets: [{ label: "VO2", reps: 2, work_s: 240, rest_s: 180, lo: 320, hi: 340 }], pauseBetweenS: 300, cooldownMin: 20 });
    expect(expectedLapNames(w, false)).toEqual(["Rozjetí", "Interval 1", "Pauza 1", "Interval 2", "Pauza 2", "Z2 a vyjetí"]);
  });
});

// ---------- kvalita z dat (6.6) ----------
describe("kvalita z dat (6.6)", () => {
  it("hodnocení poslední jednotky: čistě → posun, 2 pod pásmem → ubrat", () => {
    const lap = (w: number, hr: number) => ({ i: 0, type: "WORK", label: null, start_s: 0, moving_s: 600, elapsed_s: 600, distance_m: null, avg_power: w, np: w, avg_hr: hr, max_hr: hr, avg_cad: null, elev_gain: null, avg_speed: null, decoupling: null });
    const plan = { reps: 3, work_s: 600, lo: 280, hi: 295 };
    expect(evaluatePast({ date: "2026-10-21", type: "prah", plan, laps: [lap(285, 160), lap(287, 162), lap(288, 164)] }).outcome).toBe("posun");
    expect(evaluatePast({ date: "2026-10-21", type: "prah", plan, laps: [lap(285, 160), lap(275, 166), lap(270, 170)] }).outcome).toBe("ubrat");
    expect(evaluatePast({ date: "2026-10-21", type: "prah", plan, laps: [lap(285, 160), lap(286, 166), lap(276, 168)] }).outcome).toBe("zopakovat");
    expect(evaluatePast(null).outcome).toBe("nove");
  });
});


// ---------- počasí ----------
describe("počasí (kap. 8) a okno na jízdu", () => {
  const mk = (date: string, f: (h: number) => Partial<Hour>): Hour[] => Array.from({ length: 24 }, (_, h) => ({ time: `${date}T${String(h).padStart(2, "0")}:00`, temp: 10, feels: 8, precip_prob: 10, precip: 0, gust: 20, wind: 10, code: 1, ...f(h) }));
  it("zelená hodina", () => {
    expect(isGreen({ precip_prob: 30, gust: 40, feels: 3 })).toBe(true);
    expect(isGreen({ precip_prob: 31, gust: 20, feels: 10 })).toBe(false);
  });
  it("déšť, nárazy, mráz", () => {
    const w = dayWeather(mk("2026-11-10", (h) => ({ precip_prob: h > 12 ? 70 : 10, precip: h > 12 ? 0.3 : 0, gust: h === 15 ? 45 : 20, temp: h < 6 ? -2 : 8 })), "2026-11-10")!;
    expect(w.rain).toBe(true);
    expect(w.gusty).toBe(true);
    expect(w.frost).toBe(true);
    expect(w.window).toEqual({ from: 7, to: 10 });
  });
  it("tma: okno skončí nejpozději 30 min po západu a začne nejdřív 30 min před východem", () => {
    const w = dayWeather(mk("2026-11-14", () => ({})), "2026-11-14", undefined, { rise: "07:10", set: "16:20" })!;
    expect(w.hours.find((x) => x.h === 15)!.green).toBe(true); // 15–16 h, před západem
    expect(w.hours.find((x) => x.h === 16)!.kind).toBe("dark"); // 16–17 h končí po 16:50
    expect(w.hours.find((x) => x.h === 7)!.green).toBe(true); // 7:00 ≥ 6:40
    expect(w.hours.filter((x) => x.h >= 16).every((x) => !x.green)).toBe(true);
    expect(w.window!.to).toBeLessThanOrEqual(16);
    // bez údajů o slunci se nic nemění
    expect(dayWeather(mk("2026-11-14", () => ({})), "2026-11-14")!.hours.every((x) => x.green)).toBe(true);
  });
  it("bez předpovědi = null", () => expect(dayWeather([], "2026-11-10")).toBeNull());
});

// ---------- výživa ----------
describe("výživa na jízdu (kap. 9)", () => {
  it("příklady z pravidel", () => {
    expect(carbsFor(60, "z2").text).toBe("jen voda");
    expect(carbsFor(90, "z2").text).toBe("60 g (40 g/h): bidon");
    expect(carbsFor(105, "quality").text).toBe("105 g (60 g/h): bidon + gel");
    expect(carbsFor(150, "quality").perHour).toBe(90);
    expect(carbsFor(150, "z2", true).perHour).toBe(60);
  });
  it("balení", () => {
    expect(packFor(120)).toBe("2 bidony");
    expect(packFor(165)).toBe("2 bidony + gel");
  });
  it("tekutiny a sodík jako odhad", () => {
    const f = fuelPlan(240, 15, 75, "quality");
    expect(f.fluidPerHour).toBeGreaterThan(0.3);
    expect(f.estimates.join(" ")).toContain("odhad");
  });
});

// ---------- doplňky ----------
describe("doplňky z referencí", () => {
  it("ACWR", () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 28; i++) m.set(addDays("2026-11-07", -i), i < 7 ? 100 : 50);
    const a = acwr(m, "2026-11-07");
    expect(a.ratio).toBeCloseTo(100 / 62.5, 2);
    expect(a.level).toBe("high");
  });
  it("pravidelnost spánku", () => {
    expect(sleepRegularity(Array(7).fill("2026-11-01T06:30")).sdMin).toBe(0);
    expect(sleepRegularity(["2026-11-01T06:30"]).sdMin).toBeNull();
  });
  it("LTHR vs. max tep", () => {
    expect(lthrSanity(196, 204, 200)).toContain("98 %");
    expect(lthrSanity(176, 200, 200)).toBeNull();
  });
  it("Z2, která nebyla lehká", () => {
    expect(easyNotEasy({ date: "x", sport: "ride", name: "", load: 60, moving_s: 3600, is_quality: 0, np: 200, drift: null, hr_z: null, pwr_z: [600, 2000, 800, 200, 0, 0, 0] })).toBe(true);
  });
  it("aerobní drift", () => {
    const s: [number, number, number, number][] = Array.from({ length: 100 }, (_, i) => [i * 60, 200, i < 50 ? 140 : 147, 8]);
    expect(computeDrift(s, true)).toBeCloseTo(4.8, 1);
  });
});

// ---------- LLM kontrola čísel ----------
describe("LLM nesmí měnit čísla", () => {
  it("čísla z kontextu projdou, nové číslo ne", () => {
    const ctx = { hrv: 62, forma: 19.1, plan: [{ minut: 75 }] };
    expect(numbersOk("HRV 62 ms je pod normou, forma +19,1.", ctx)).toBe(true);
    expect(numbersOk("Dej si 3×12 minut na 305 W.", ctx)).toBe(false);
  });
});

// ---------- FIT ----------
describe("FIT workout", () => {
  it("platný soubor čitelný Garmin SDK", () => {
    const w = intervalWorkout({ ftp: 298 }, { warmupMin: 30, sets: [{ label: "Prah", reps: 3, work_s: 600, rest_s: 300, lo: 280, hi: 295 }], pauseBetweenS: 300, cooldownMin: 30 });
    const bytes = encodeWorkoutFit("3×10 min práh", w, new Date("2026-11-07T10:00:00Z"));
    expect(fitCrc(bytes, 0, bytes.length - 2)).toBe(bytes[bytes.length - 2]! | (bytes[bytes.length - 1]! << 8));
    const dec = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    expect(dec.isFIT()).toBe(true);
    expect(dec.checkIntegrity()).toBe(true);
    const { messages, errors } = dec.read();
    expect(errors).toEqual([]);
    const steps = messages.workoutStepMesgs as any[];
    expect(steps.length).toBe(5); // rozjetí, práh, pauza, opakování, Z2 a dojezd
    expect(steps[0].durationType).toBe("open");
    expect(steps[1].customTargetPowerLow ?? steps[1].customTargetValueLow).toBeDefined();
    expect(steps[3].durationType).toBe("repeatUntilStepsCmplt");
    expect((messages.workoutMesgs as any[])[0].wktName).toBe("3x10 min prah");
  });
});

// ---------- normalizace Garmin ----------
describe("normalizace Garmin dat", () => {
  it("sporty", () => {
    expect(sportFromGarmin("road_biking")).toBe("ride");
    expect(sportFromGarmin("mountain_biking")).toBe("mtb");
    expect(sportFromGarmin("indoor_cycling")).toBe("indoor");
    expect(sportFromGarmin("ice_hockey", "Hokej s kamarády")).toBe("other");
    expect(sportFromGarmin("skate_skiing_ws")).toBe("xc_ski");
  });
  it("aktivita a mezery v datech", () => {
    const a = normActivityGarmin({ activityId: 1, startTimeLocal: "2026-11-06 14:11:38", activityType: { typeKey: "road_biking" }, distance: 41150, movingDuration: 5300, normPower: 0, hrTimeInZone_1: 10, maxAvgPower_300: 320 });
    expect(a.date).toBe("2026-11-06");
    expect(a.np).toBeNull();
    expect(a.mmp).toEqual({ 300: 320 });
    expect(a.pwr_z).toBeNull();
    expect(sleepQualifier("GOOD")).toBe("Q2");
  });
  it("SQL literály", () => {
    expect(lit("O'Neil")).toBe("'O''Neil'");
    expect(lit(NaN)).toBe("NULL");
    expect(upsertSql("t", ["a", "b"], [[1, "x"]], ["a"], "merge")[0]).toContain("COALESCE(excluded.b, t.b)");
  });
});
