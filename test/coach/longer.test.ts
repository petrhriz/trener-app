// Prodloužení tréninku (tvoje délka) v rozběhnutém týdnu: přidaná zátěž se odečte ze zbylých dnů týdne.
import { describe, expect, it } from "vitest";
import { type CoachInput, runCoach } from "../../src/core/coach/engine";
import { addDays } from "../../src/lib/time";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const sc = scenario("zima-udrzet");
const MON = sc.start;

function at(day: number) {
  const hist = simHistory(sc);
  const mp = runCoach(simInput(sc, hist, MON)).coach.mondayPlan!;
  const T = addDays(MON, day);
  const acts: CoachInput["acts"] = [...hist];
  for (const d of mp.week.days) if (d.date < T && d.load > 0) acts.push({ id: d.date, date: d.date, sport: "ride", load: d.load, moving_s: d.minutes * 60, quality: d.role === "key", hr_z: null, pwr_z: null, laps: null, compliance: null });
  return { mp, acts, T };
}

describe("prodloužený trénink", () => {
  for (let day = 0; day < 6; day++) it(`den ${day}: delší Z2 dnes → ostatní dny týdne kratší, týden nepřeroste`, () => {
    const { mp, acts, T } = at(day);
    const base = runCoach({ ...simInput(sc, acts, T), mondayPlan: day ? mp : null }).coach.horizon[0]!;
    // první Z2 / dlouhý den od dneška, který má volno po sobě (ať je co krátit)
    const z = base.days.find((d) => d.role === "endurance");
    if (!z) return;
    for (const min of [z.minutes + 60, 180]) {
      const cons = [{ date: z.date, kind: "delka" as const, note: String(min) }];
      const got = runCoach({ ...simInput(sc, acts, T, { constraints: cons }), mondayPlan: day ? mp : null }).coach.horizon[0]!;
      const zd = got.days.find((d) => d.date === z.date)!;
      expect(zd.minutes).toBe(min);
      const others = (h: typeof got) => h.days.filter((d) => d.date !== z.date).reduce((t, d) => t + d.load, 0);
      const extra = zd.load - z.load;
      // ostatní dny dohromady o přidanou zátěž lehčí (ve stropech nejkratších délek), nikdy těžší
      expect(others(got), `${T} ${z.date} ${min} min`).toBeLessThanOrEqual(others(base));
      // týden nepřeroste cíl (když byl plán pod cílem kvůli délkám, tvoje minuty smí dorovnat), ve stropech nejkratších délek
      expect(got.load, `${T} ${z.date} ${min} min: ostatní ${others(base)} → ${others(got)}, navíc ${extra}, cíl ${got.target}`).toBeLessThanOrEqual(Math.max(base.load, got.target) * 1.1 + 15);
    }
  });
});
