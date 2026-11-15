// Běh a kolo bez wattmetru jako kvalita podle času v zónách tepu; strop běhu z runCapOf.
import { describe, expect, it } from "vitest";
import { HR_Q_MIN, classify, hrQuality, plannedIntensity } from "../../src/core/quality";
import { CATS, TIERS, buildWorkout } from "../../src/core/coach/library";
import type { Workout } from "../../src/core/workout";
import { runCoach } from "../../src/core/coach/engine";
import { runCapOf } from "../../src/core/coach/common";
import { capsFor } from "../../src/core/coach/sport";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";
import { addDays } from "../../src/lib/time";

const min = (m: number) => m * 60;
const act = (sport: "run" | "ride", hr_z: number[] | null, pwr_z: number[] | null = null, np: number | null = null) => ({ sport, name: null, moving_s: 3600, load: 70, pwr_z, np, hr_z });

describe("kvalita podle tepu", () => {
  it("běh: 12 min v Z4 = práh, s 6 min v Z5 = VO2; 8 min v Z4 není kvalita", () => {
    expect(classify(act("run", [min(10), min(30), min(8), min(12), 0])).type).toBe("prah");
    expect(classify(act("run", [min(10), min(30), min(8), min(6), min(6)])).type).toBe("vo2");
    expect(classify(act("run", [min(10), min(35), min(7), min(8), 0])).isQuality).toBe(false);
    expect(hrQuality(null)).toBeNull();
    expect(HR_Q_MIN).toBe(10);
  });
  it("kolo bez wattmetru podle tepu; s wattmetrem rozhodují watty", () => {
    expect(classify(act("ride", [min(10), min(25), min(10), min(15), 0])).isQuality).toBe(true);
    const easyPower = [min(20), min(35), min(5), 0, 0, 0, 0];
    expect(classify(act("ride", [min(10), min(25), min(10), min(15), 0], easyPower, 180)).isQuality).toBe(false);
  });
  it("plánovaná kvalita se počítá jen s doloženou intenzitou (Z3 a výš)", () => {
    // Z2 jízda v den plánovaného prahu: nic nad Z3 → není kvalita (dřív ji plán udělal „prahem“)
    const z2 = [min(10), min(78), min(2), 0, 0, 0, 0];
    expect(classify(act("ride", null, z2, 180), "prah")).toMatchObject({ isQuality: false, type: null });
    // správně odjeté tempo leží v Z3 → kvalita s typem z plánu
    const tempo = [min(10), min(25), min(25), 0, 0, 0, 0];
    expect(classify(act("ride", null, tempo, 220), "tempo")).toMatchObject({ isQuality: true, type: "tempo" });
    // práh odjetý podle plánu
    expect(classify(act("ride", null, [min(15), min(20), min(5), min(20), 0, 0, 0], 240), "prah")).toMatchObject({ isQuality: true, type: "prah" });
    // bez wattmetru podle tepu: Z2 tep → ne, 12 min v Z3+ → ano
    expect(classify(act("ride", [min(10), min(48), min(2), 0, 0]), "sweetspot").isQuality).toBe(false);
    expect(classify(act("ride", [min(10), min(38), min(12), 0, 0]), "sweetspot")).toMatchObject({ isQuality: true, type: "sweetspot" });
    // bez zón není z čeho soudit → platí plán
    expect(classify(act("ride", null), "vo2")).toMatchObject({ isQuality: true, type: "vo2" });
  });
  it("každý trénink z knihovny odjetý podle plánu zůstane kvalitou, Z2 jízda v jeho den ne", () => {
    const ftp = 250;
    // čas v zónách výkonu (Coggan Z1–Z7) tak, jak by ho naměřily hodinky při jízdě přesně podle kroků
    const ridden = (w: Workout) => {
      const z = [0, 0, 0, 0, 0, 0, 0];
      for (const b of w.blocks) for (const s of b.steps) {
        const pct = (((s.lo ?? 0) + (s.hi ?? 0)) / 2 / ftp) * 100;
        z[[55, 75, 90, 105, 120, 150].filter((p) => pct > p).length]! += s.dur_s * (b.reps ?? 1);
      }
      return z;
    };
    const z2 = [min(10), min(78), min(2), 0, 0, 0, 0];
    for (const cat of CATS) for (let lv = 0; lv < TIERS; lv++) for (const m of [45, 60, 90]) {
      const b = buildWorkout({ sport: "ride", family: cat, level: lv, wid: null, minutes: m, indoor: true, zones: { ftp, hr: null }, calib: 1, seed: "2026-11-17" });
      const plan = { type: "prah" as const, workout: b.workout, ftp };
      expect(plannedIntensity(b.workout, ftp), `${b.wid}`).not.toBeNull();
      expect(classify(act("ride", null, ridden(b.workout), 220), plan).isQuality, `${b.wid} odjeto`).toBe(true);
      expect(classify(act("ride", null, z2, 180), plan).isQuality, `${b.wid} jen Z2`).toBe(false);
    }
  });
  it("sweet spot odjetý o 3 % pod cílem je pořád kvalita; vadný rozpis nic neshodí", () => {
    const ftp = 250;
    // 2× 15 min sweet spot 88–94 % FTP (220–235 W), odjeto kolem 85–90 % → hodinky ukážou Z3
    const ss = { blocks: [{ label: "Rozjetí", kind: "warmup", steps: [{ dur_s: 900, lo: 115, hi: 175 }] }, { label: "SS", kind: "work", reps: 2, steps: [{ dur_s: 900, lo: 220, hi: 235 }, { dur_s: 300, lo: 100, hi: 135 }] }] } as Workout;
    expect(plannedIntensity(ss, ftp)).toEqual({ power: true, zone: 3, secs: 1800 });
    expect(classify(act("ride", null, [min(20), min(15), min(30), 0, 0, 0, 0], 210), { type: "sweetspot", workout: ss, ftp }).isQuality).toBe(true);
    // rozpis ve W bez FTP → bez rozpisu (15 min v Z3+)
    expect(plannedIntensity(ss, null)).toBeNull();
    // vadné tvary z databáze: nehází, vrací null nebo přeskočí krok
    for (const bad of [{ blocks: "x" }, { blocks: [{ kind: "work" }] }, { blocks: [{ kind: "work", steps: [{ dur_s: "a", lo: 300, hi: 320 }] }] }, null])
      expect(() => plannedIntensity(bad as unknown as Workout, ftp)).not.toThrow();
    expect(plannedIntensity({ blocks: [{ kind: "work", steps: "x" }] } as unknown as Workout, ftp)).toBeNull();
    // rozpis podle tepu (bez wattmetru): zóna z kroku
    const hr = { blocks: [{ label: "Práh", kind: "work", reps: 3, steps: [{ dur_s: 600, z: 4 }, { dur_s: 180, z: 1 }] }] } as Workout;
    expect(plannedIntensity(hr, null)).toEqual({ power: false, zone: 4, secs: 1800 });
    expect(classify(act("ride", [min(10), min(30), min(10), min(16), 0]), { type: "prah", workout: hr, ftp: null }).isQuality).toBe(true);
    expect(classify(act("ride", [min(10), min(40), min(10), min(5), 0]), { type: "prah", workout: hr, ftp: null }).isQuality).toBe(false);
  });
  it("den po běžecké kvalitě (podle tepu) trenér kvalitu nedá", () => {
    const sc = scenario("zima-udrzet");
    // kvalitu by trenér jinak dal v úterý → v pondělí přidám běžeckou kvalitu
    const base = runCoach(simInput(sc, simHistory(sc), sc.start)).coach.horizon[0]!;
    const keyDay = base.days.find((d) => d.role === "key")!.date;
    const before = addDays(keyDay, -1);
    const acts = [...simHistory(sc), { id: "r", date: before, sport: "run" as const, load: 60, moving_s: 3000, quality: true, hr_z: [0, min(25), min(8), min(15), 0], pwr_z: null, laps: null, compliance: null }];
    const c = runCoach(simInput(sc, acts, keyDay)).coach;
    expect(c.horizon[0]!.days.find((d) => d.date === keyDay)!.role).not.toBe("key");
  });
});

describe("strop délky běhu = runCapOf (aspoň 60, nejvýš 180 min)", () => {
  const cap = (runLongest: number) => capsFor({ sport: "run", role: "long", winter: false, longest: 0, typical: 0, runLongest }).max;
  it("dřív 30–90 min, teď tvoje rozhodnutí", () => {
    expect(cap(0)).toBe(60);
    expect(cap(30)).toBe(60);
    expect(cap(100)).toBe(150);
    expect(cap(200)).toBe(180);
    for (const x of [0, 30, 100, 200]) expect(cap(x)).toBe(runCapOf(x));
  });
});
