// Náhodný případ pro snímkové testy: sportovec, den, omezení, ranní stav, únava, počasí, stupně kvalit.
import { reentryOf } from "../../../src/core/coach/reentry";
import type { Fatigue } from "../../../src/core/coach/target";
import { addDays } from "../../../src/lib/time";
import { type Act, badWeather, goodWeather, historyOf, inputOf, randomAthlete, randomConstraints, rng } from "./gen";

const CATS = ["nm", "ana", "vo2s", "vo2", "ou", "thr", "ss", "tempo"] as const;

export function randomCase(seed: number) {
  const r = rng(seed * 7919 + 13);
  const a = randomAthlete(seed);
  const T = addDays("2026-01-05", r.int(0, 730));
  const acts: Act[] = historyOf(a, T);
  // dnes už odjeto
  if (r.chance(0.15)) acts.push({ id: `${T}-t`, date: T, sport: a.primary, load: r.int(20, 150), moving_s: r.int(25, 150) * 60, quality: r.chance(0.3), hr_z: null, pwr_z: null, laps: null, compliance: null });
  const constraints = r.chance(0.5) ? randomConstraints(r, T, r.int(1, 6)) : [];
  const fatigue: Fatigue = {
    form: r.chance(0.8) ? r.real(-45, 25) : null,
    badMornings: r.int(0, 5),
    hrvLow: r.chance(0.2),
    illnessDays: r.chance(0.15) ? r.int(1, 8) : 0,
    hardEasy: r.int(0, 3),
    adherence: r.chance(0.2) ? { factor: 0.85, note: "minulý týden vynechané tréninky" } : null,
    strain: r.chance(0.1) ? "vysoký strain" : null,
  };
  const weather = new Map();
  const wOk = r.chance(0.6);
  if (wOk) for (let i = 0; i < 35; i++) { const d = addDays(T, i); weather.set(d, r.chance(0.25) ? badWeather(d) : goodWeather(d)); }
  const progress: Record<string, { level: number; last: string | null }> = {};
  if (r.chance(0.6)) for (const s of ["ride", "run"]) for (const c of CATS) if (r.chance(0.5)) progress[`${s}:${c}`] = { level: r.int(0, 5), last: null };
  const inp = inputOf(a, acts, T, {
    constraints, fatigue, weather, weatherOk: wOk, progress,
    recovery: r.pick(["green", "green", "green", "yellow", "red"] as const),
    reentry: reentryOf(acts, T, a.profile.level ?? "intermediate"),
    offDays: r.chance(0.1) ? [addDays(T, -r.int(1, 20)), addDays(T, -r.int(1, 20))] : [],
  });
  return { a, inp };
}

