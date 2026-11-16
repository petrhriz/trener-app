// Profil sportovce: jedno místo s tím, co o tobě aplikace ví – osobní údaje, výkon, zóny wattů a tepu (kolo i běh),
// VO2max a nastavení trenéra. Jen skládá data, která už jinde jsou (nastavení, Garmin, výpočty).
import { blockWeeksFor } from "../core/coach/budget";
import { profileSummary, validateProfile } from "../core/coach/profile";
import { GOAL_LABEL } from "../core/fitness";
import { bestIn } from "../core/power";
import { type HrZones, hrZoneRange, powerZones, runHrZones } from "../core/zones";
import { addDays } from "../lib/time";
import { eftpOf } from "./build";
import type { loadCtx } from "./context";

type Ctx = Awaited<ReturnType<typeof loadCtx>>;
const POWER_NAMES = ["Z1 regenerace", "Z2 vytrvalost", "Z3 tempo", "Z4 práh", "Z5 VO2max", "Z6 anaerobní", "Z7 sprint"];
const HR_NAMES = ["Z1 regenerace", "Z2 vytrvalost", "Z3 tempo", "Z4 práh", "Z5 VO2max"];

const hrRows = (hz: HrZones | null) => (hz && hz.floors.length ? hz.floors.map((_f, i) => { const [lo, hi] = hrZoneRange(hz, i + 1); return { name: HR_NAMES[i] ?? `Z${i + 1}`, lo, hi }; }) : null);

export function athleteProfile(ctx: Ctx) {
  const T = ctx.T;
  const s = ctx.s;
  const coach = s.coach_profile ? validateProfile(s.coach_profile).profile : null;
  const birthYear = coach?.birthYear ?? null;
  const w = [...ctx.well].reverse().find((x) => x.weight_kg != null) ?? null;
  const weight = w?.weight_kg ?? null;
  // klidový tep: průměr posledních 7 dní s hodnotou
  const rhr = ctx.well.filter((x) => x.rhr != null && x.date > addDays(T, -7)).map((x) => x.rhr!);
  const rest = rhr.length ? Math.round(rhr.reduce((t, x) => t + x, 0) / rhr.length) : (s.hr_zones?.rest ?? null);
  const ef = eftpOf(ctx);
  const ftp = s.ftp ?? null;
  const power = ctx.acts.map((a) => ({ id: a.id, date: a.date, mmp: a.mmp, max20: a.max20, pwr_z: a.pwr_z }));
  const best = (secs: number) => { const b = bestIn(power, addDays(T, -90), T, secs); return b ? { w: Math.round(b.w), wkg: weight ? Math.round((b.w / weight) * 100) / 100 : null, date: b.date } : null; };
  // VO2max: nejnovější z FIT souboru aktivity (kolo / běh zvlášť), jinak z Garmin wellness
  const vo2 = (sport: "ride" | "run") => { const a = [...ctx.acts].reverse().find((x) => (x as any).vo2_fit != null && (sport === "run" ? x.sport === "run" : x.sport !== "run")); return a ? { v: Math.floor((a as any).vo2_fit), date: a.date } : null; };
  const vo2w = [...ctx.well].reverse().find((x) => x.vo2max != null) ?? null;
  const m = ctx.metrics.find((x) => x.date === T) ?? ctx.metrics[ctx.metrics.length - 1] ?? null;
  return {
    name: s.first_name,
    birthYear,
    age: birthYear ? Number(T.slice(0, 4)) - birthYear : null,
    blockWeeks: blockWeeksFor(birthYear, T),
    weight: weight != null ? { kg: weight, date: w!.date } : null,
    ftp,
    wkg: ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null,
    eftp: ef,
    hr: { max: s.hr_zones?.max ?? null, lthr: s.hr_zones?.lthr ?? null, rest, source: s.hr_zones?.source ?? null },
    powerZones: ftp ? powerZones(ftp, s.power_zones_pct).map((z, i) => ({ name: POWER_NAMES[i] ?? `Z${i + 1}`, lo: z.lo, hi: z.hi })) : null,
    hrBike: hrRows(s.hr_zones),
    hrRun: hrRows(s.hr_zones_run ?? runHrZones(s.hr_zones)),
    best: { s5: best(5), m1: best(60), m5: best(300), m20: best(1200) },
    vo2: { ride: vo2("ride"), run: vo2("run"), garmin: vo2w ? { v: vo2w.vo2max, date: vo2w.date } : null },
    fitness: m ? { ctl: Math.round(m.ctl * 10) / 10, atl: Math.round(m.atl * 10) / 10, form: Math.round((m.ctl - m.atl) * 10) / 10 } : null,
    goal: { key: s.goal, label: GOAL_LABEL[s.goal], date: s.goal_date, name: s.goal_name },
    coach: coach ? { primary: coach.primary, summary: profileSummary(coach, T) } : null,
  };
}
