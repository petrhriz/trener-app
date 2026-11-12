// Simulace 8 týdnů (scripts/coach-sim-lib.ts): modelový sportovec odjede přesně plán, trenér plánuje znovu každý den.
// Tvrzení z „Hotovo, když“ (opravy 1 a 2) + pravidla, která musí platit vždy.
import { describe, expect, it } from "vitest";
import { scenario, simHistory, simulate } from "../../scripts/coach-sim-lib";
import { RECOVERY_SHARE } from "../../src/core/coach/budget";
import { addDays, mondayOf } from "../../src/lib/time";

/** zátěž týdne modelové historie `k` týdnů před startem */
const histLoad = (id: string, k: number) => { const sc = scenario(id); const f = addDays(sc.start, -7 * k); return simHistory(sc).filter((a) => a.date >= f && a.date < addDays(f, 7)).reduce((t, a) => t + (a.load ?? 0), 0); };
const rules = (s: ReturnType<typeof simulate>) => {
  expect(s.checks.maxStreak, "nejvýš 3 dny za sebou").toBeLessThanOrEqual(3);
  expect(s.checks.keyAfterHard, "kvalita po těžkém dni").toBe(0);
};
const avg = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;

describe("simulace 8 týdnů", () => {
  const z = simulate(scenario("sezona-zlepsit"));
  it("Zlepšit: lehčí týden až po 3 zátěžových, 55 % (±5 %) jejich průměru; zátěžové týdny mezi bloky rostou", () => {
    rules(z);
    const w = z.weeks;
    const rec = w.map((x, i) => (x.recovery ? i : -1)).filter((i) => i >= 0);
    expect(rec.length).toBeGreaterThanOrEqual(2);
    for (let j = 1; j < rec.length; j++) expect(rec[j]! - rec[j - 1]!, "mezi lehčími aspoň 3 zátěžové").toBeGreaterThanOrEqual(4);
    for (const i of rec) {
      // předchozí 3 zátěžové týdny (u lehčího týdne hned na začátku z modelové historie)
      const prev = [3, 2, 1].map((j) => (i - j >= 0 ? w[i - j]!.load : histLoad("sezona-zlepsit", j - i)));
      const share = w[i]!.load / avg(prev);
      expect(share, `týden ${w[i]!.weekStart}`).toBeGreaterThanOrEqual(RECOVERY_SHARE - 0.05);
      expect(share, `týden ${w[i]!.weekStart}`).toBeLessThanOrEqual(RECOVERY_SHARE + 0.05);
    }
    const blocks: number[][] = [];
    let cur: number[] = [];
    for (const x of w) { if (x.recovery) { if (cur.length) blocks.push(cur); cur = []; } else cur.push(x.load); }
    if (cur.length) blocks.push(cur);
    for (let j = 1; j < blocks.length; j++) expect(avg(blocks[j]!), "blok po lehčím týdnu je výš").toBeGreaterThan(avg(blocks[j - 1]!));
    expect(w[w.length - 1]!.ctlEnd).toBeGreaterThan(w[0]!.ctlStart + 8);
  });
  it("Závod: závodní týden o 41–60 % níž než poslední běžný týden (Bosquet), po závodě týden bez kvality", () => {
    const r = simulate(scenario("sezona-zavod"));
    rules(r);
    const w = r.weeks;
    const race = w.findIndex((x) => x.weekStart === mondayOf("2027-05-23"));
    const taper = w.findIndex((x) => x.phase === "Ladění");
    const normal = w[taper - 1]!.load;
    const drop = 1 - w[race]!.load / normal;
    expect(drop).toBeGreaterThanOrEqual(0.41);
    expect(drop).toBeLessThanOrEqual(0.6);
    expect(w[taper - 1]!.recovery, "lehčí týden ne těsně před laděním").toBe(false);
    const post = w[race + 1]!;
    expect(post.phase).toBe("Po závodě");
    expect(post.keys).toBe(0);
    expect(r.days.find((d) => d.date === "2027-05-24")!.kind).not.toBe("quality");
  });
  it("Návrat: malá zátěž → lehčí týden až nad spodní hranicí, kondice roste, nejvýš jedna kvalita pod 5 h", () => {
    const n = simulate(scenario("malo-zlepsit"));
    rules(n);
    const w = n.weeks;
    expect(w[w.length - 1]!.ctlEnd).toBeGreaterThan(w[0]!.ctlStart + 5);
    for (const x of w) if (x.hours < 5) expect(x.keys).toBeLessThanOrEqual(1);
    const first = w.findIndex((x) => x.recovery);
    if (first >= 0) expect(first).toBeGreaterThanOrEqual(3);
  });
});

import { OUTLOOK_WEEKS, runCoach } from "../../src/core/coach/engine";
import { simInput } from "../../scripts/coach-sim-lib";
describe("výhled kondice na 12 týdnů", () => {
  it("4 týdny podle plánu, dalších 8 odhad; po denních zátěžích bez mezer, lehčí týdny i v odhadu", () => {
    const sc = scenario("sezona-zlepsit");
    const o = runCoach(simInput(sc, simHistory(sc), "2027-04-08")).coach.outlook;
    expect(o.weeks).toHaveLength(OUTLOOK_WEEKS);
    expect(o.weeks.map((w) => w.exact)).toEqual([...Array(4).fill(true), ...Array(8).fill(false)]);
    const days = o.days.map((d) => d.date);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBe(addDays(days[i - 1]!, 1));
    expect(days[days.length - 1]).toBe(addDays(o.weeks[11]!.weekStart, 6));
    const rec = o.weeks.map((w, i) => (w.recoveryWeek ? i : -1)).filter((i) => i >= 0);
    expect(rec.length).toBeGreaterThanOrEqual(2);
    expect(o.weeks[11]!.ctlEnd).toBeGreaterThan(o.weeks[3]!.ctlEnd);
  });
});
