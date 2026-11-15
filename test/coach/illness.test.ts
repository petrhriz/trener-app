// Po nemoci: ILLNESS_EASY_DAYS dní bez kvality (plán i text dne), dny nemoci i z ukončeného stavu Nemocný.
import { describe, expect, it } from "vitest";
import { runCoach } from "../../src/core/coach/engine";
import { ILLNESS_EASY_DAYS, afterIllness, fatigueFactor } from "../../src/core/coach/target";
import { coaching } from "../../src/core/readinessScore";
import { statusConstraints } from "../../src/report/build";
import type { Settings } from "../../src/lib/settings";
import { addDays } from "../../src/lib/time";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";

const sick = (...dates: string[]) => dates.map((date) => ({ date, kind: "nemoc" as const, note: null }));

describe("dny po nemoci", () => {
  it("afterIllness: 2 dny po posledním dni nemoci, sám den nemoci ne", () => {
    const s = new Set(["2026-11-10", "2026-11-11"]);
    expect(ILLNESS_EASY_DAYS).toBe(2);
    expect(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((d) => afterIllness(s, d))).toEqual([false, true, true, false]);
  });

  const sc = scenario("zima-udrzet");
  const acts = simHistory(sc);
  const base = runCoach(simInput(sc, acts, sc.start));
  const key = base.coach.horizon[0]!.days.find((d) => d.role === "key" && d.date >= addDays(sc.start, 1))!.date;

  it("nový plán: v den po nemoci ani den poté kvalita není", () => {
    expect(key).toBeTruthy();
    const ill = sick(addDays(key, -1));
    const p = runCoach({ ...simInput(sc, acts, sc.start), constraints: ill });
    const set = new Set(ill.map((c) => c.date));
    for (const w of p.coach.horizon.slice(0, 2)) for (const d of w.days) if (afterIllness(set, d.date)) expect(d.role).not.toBe("key");
  });

  it("rozběhnutý týden: kvalita z pondělního plánu po nemoci → Z2 s důvodem", () => {
    const stored = base.coach.mondayPlan!;
    expect(stored.weekStart).toBe(sc.start);
    const p = runCoach({ ...simInput(sc, acts, key), constraints: sick(addDays(key, -2), addDays(key, -1)), mondayPlan: stored });
    const day = p.coach.horizon[0]!.days.find((d) => d.date === key)!;
    expect(day.role).not.toBe("key");
    expect(day.why.join(" ")).toContain("po nemoci");
  });

  it("tvoje výslovná volba kvality platí i po nemoci", () => {
    const p = runCoach({ ...simInput(sc, acts, sc.start), constraints: [...sick(addDays(key, -1)), { date: key, kind: "typ", note: "quality" }] });
    expect(p.coach.horizon[0]!.days.find((d) => d.date === key)!.role).toBe("key");
  });
});

describe("dny nemoci ze stavu Nemocný", () => {
  const s = (status: Settings["status"], log: Settings["status_log"] = []) => ({ T: "2026-11-15", s: { status, status_log: log } as unknown as Settings });

  it("ukončená nemoc ze status_log se počítá celá (do 10 dní zpět), ne jen 3 dny", () => {
    const c = statusConstraints(s({ kind: "active", from: null, until: null }, [{ kind: "sick", from: "2026-11-08", until: "2026-11-13" }]));
    expect(c.map((x) => x.date)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(c.every((x) => x.kind === "nemoc")).toBe(true);
    // 6 dní nemoci → únava „návrat po nemoci“ (dřív nedosažitelná, okno bylo jen 3 dny)
    expect(fatigueFactor({ form: 0, badMornings: 0, hrvLow: false, illnessDays: c.length })).toMatchObject({ factor: 0.7, keysMax: 0 });
  });

  it("návrat do Aktivní (until = včera) drží dny nemoci; dovolená a starší nemoc ne", () => {
    const c = statusConstraints(s({ kind: "sick", from: "2026-11-01", until: "2026-11-14" }, [{ kind: "vacation", from: "2026-11-02", until: "2026-11-04" }, { kind: "sick", from: "2026-10-01", until: "2026-10-03" }]));
    expect(c[0]!.date).toBe("2026-11-05");
    expect(c[c.length - 1]!.date).toBe("2026-11-14");
    expect(c.every((x) => x.kind === "nemoc")).toBe(true);
  });

  it("dovolená dál jen 3 dny zpět a do konce stavu", () => {
    const c = statusConstraints(s({ kind: "vacation", from: "2026-11-01", until: "2026-11-17" }));
    expect(c.map((x) => x.date)).toEqual(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
  });
});

describe("text dne odpovídá pravidlům plánu", () => {
  const base = {
    hour: 8, status: "active" as const, statusUntil: null, strain: { score: 0, load: 0, base: 53, basis: "plan" as const },
    sleepS: 25440, sleepNeedMin: 510, nextNeedMin: 510, wakeTypical: "07:30", bbNow: 80, stressAvg: 20, stressNorm: 25, steps: 500,
    plan: { name: "2×15 min sweet spot", kind: "quality", minutes: 90, done: false, carbs: { total: 90, perHour: 60 } }, remLow: false, deepLow: false,
  };
  it("🟡: o stupeň lehčí a o 25 % kratší, ne „Z2 o třetinu“", () => {
    const c = coaching({ ...base, semafor: { state: "yellow", reasons: ["VST pod normou"], missing: false } });
    expect(c.text).toContain("o stupeň lehčí");
    expect(c.text).toContain("25 % kratší");
    expect(c.text).not.toContain("třetinu");
    expect(c.needs.join(" ")).toContain("2×15 min sweet spot");
  });
  it("sacharidy z plánu dne, ne natvrdo 30–60 g/h", () => {
    const n = coaching({ ...base, semafor: { state: "green", reasons: [], missing: false } }).needs.join(" ");
    expect(n).toContain("90 g sacharidů (60 g/h)");
    expect(n).not.toContain("30–60");
    const short = coaching({ ...base, plan: { ...base.plan, minutes: 50, carbs: { total: 20, perHour: 0, note: "malé množství nebo jen výplach úst" } }, semafor: { state: "green", reasons: [], missing: false } }).needs.join(" ");
    expect(short).toContain("výplach úst");
    const none = coaching({ ...base, plan: { ...base.plan, carbs: null }, semafor: { state: "green", reasons: [], missing: false } }).needs.join(" ");
    expect(none).not.toContain("sacharid");
  });
  it("nemoc: text slibuje stejný počet lehkých dní jako plán", () => {
    const c = coaching({ ...base, status: "sick", statusUntil: null, semafor: null });
    expect(c.text).toContain(`${ILLNESS_EASY_DAYS} dny jen lehce`);
  });
});
