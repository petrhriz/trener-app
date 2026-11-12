// Trenér v3: uložení a vyhodnocení kvalit, posun stupně náročnosti.
import { describe, expect, it } from "vitest";
import { type KeyRecord, evaluateKeys, recordKeys } from "../../src/core/coach/keys";
import type { EngineAct } from "../../src/core/coach/common";

const plan = { reps: 4, work_s: 480, lo: 240, hi: 255 };
const key = (date: string, level = 2): Omit<KeyRecord, "state"> => ({ date, sport: "ride", cat: "thr", level, plan, minutes: 60, name: "4×8 min práh" });
const lap = (i: number, w: number, hr = 160) => ({ i, type: "WORK", label: null, start_s: i * 700, moving_s: 480, elapsed_s: 480, distance_m: null, avg_power: w, np: w, avg_hr: hr, max_hr: hr + 5, avg_cad: 90, elev_gain: null, avg_speed: null });
const act = (date: string, laps: any[] | null): EngineAct => ({ id: date, date, sport: "ride", load: 70, moving_s: 3600, quality: true, hr_z: null, pwr_z: null, laps, compliance: null });

describe("kvality: uložení", () => {
  it("uloží dnešní kvalitu, budoucí ne; nevyhodnocenou přepíše novější plán, vyhodnocenou nechá", () => {
    let r = recordKeys([], [key("2026-11-12"), key("2026-11-15")], "2026-11-12");
    expect(r.map((x) => x.date)).toEqual(["2026-11-12"]);
    r = recordKeys(r, [{ ...key("2026-11-12"), cat: "ss" }], "2026-11-12");
    expect(r[0]!.cat).toBe("ss");
    const done = [{ ...r[0]!, state: "done" as const }];
    expect(recordKeys(done, [{ ...key("2026-11-12"), cat: "vo2" }], "2026-11-12")[0]!.cat).toBe("ss");
  });
});

describe("kvality: vyhodnocení a stupeň", () => {
  const rec = recordKeys([], [key("2026-11-10")], "2026-11-10");
  // vyhodnocení až druhý den po kvalitě: zvládnutá kvalita bez hodnocení náročnosti (RPE) den čeká na hodnocení
  it("zvládnuto čistě → Zlepšit o stupeň výš; Udržet stupeň drží", () => {
    const acts = [act("2026-11-10", [1, 2, 3, 4].map((i) => lap(i, 248, 160 + i)))];
    const z = evaluateKeys(rec, acts, "2026-11-12", "zvyseni", {});
    expect(z.records[0]).toMatchObject({ state: "done", outcome: "posun", newLevel: 3 });
    expect(z.updates).toEqual([expect.objectContaining({ key: "ride:thr", level: 3 })]);
    expect(evaluateKeys(rec, acts, "2026-11-12", "udrzeni", {}).records[0]!.newLevel).toBe(2);
  });
  it("dokončeno 2 ze 4 → o stupeň níž", () => {
    const acts = [act("2026-11-10", [lap(1, 248), lap(2, 245)])];
    expect(evaluateKeys(rec, acts, "2026-11-11", "zvyseni", {}).records[0]).toMatchObject({ outcome: "ubrat", newLevel: 1 });
  });
  it("bez aktivity: čeká 3 dny, pak „neodjeto“ a stupeň beze změny", () => {
    expect(evaluateKeys(rec, [], "2026-11-12", "zvyseni", {}).records[0]!.state).toBe("pending");
    const m = evaluateKeys(rec, [], "2026-11-13", "zvyseni", {});
    expect(m.records[0]!.state).toBe("missed");
    expect(m.updates).toEqual([]);
  });
  // Oprava 6b: kvalita o stupeň níž (zima, lehčí týden) se dřív nevyhodnotila (stupeň ≠ stupeň kategorie)
  it("kvalita o stupeň níž: neúspěch stupeň kategorie sníží, úspěch ho nezvýší", () => {
    const low = recordKeys([], [{ ...key("2026-11-10", 1), base: 2 }], "2026-11-10");
    const levels = { "ride:thr": { level: 2, last: "2026-11-01" } };
    const ok = [act("2026-11-10", [1, 2, 3, 4].map((i) => lap(i, 248, 160 + i)))];
    const z = evaluateKeys(low, ok, "2026-11-12", "zvyseni", levels);
    expect(z.records[0]).toMatchObject({ state: "done", outcome: "posun", newLevel: 2 });
    const bad = [act("2026-11-10", [lap(1, 248), lap(2, 245)])];
    const f = evaluateKeys(low, bad, "2026-11-11", "zvyseni", levels);
    expect(f.records[0]).toMatchObject({ outcome: "ubrat", newLevel: 1 });
    expect(f.updates).toEqual([expect.objectContaining({ key: "ride:thr", level: 1 })]);
  });
  it("stupeň zůstává v 0 až TIERS − 1", async () => {
    const { nextLevel } = await import("../../src/core/coach/progress");
    const { TIERS } = await import("../../src/core/coach/library");
    expect(nextLevel(TIERS - 1, "posun", "zvyseni")).toBe(TIERS - 1);
    expect(nextLevel(0, "ubrat", "zvyseni")).toBe(0);
    expect(nextLevel(TIERS + 3, "zopakovat", "zvyseni")).toBe(TIERS - 1);
  });
  it("stupeň se mezitím změnil jinou kvalitou → nepřičítá se dvakrát", () => {
    const acts = [act("2026-11-10", [1, 2, 3, 4].map((i) => lap(i, 248)))];
    const z = evaluateKeys(rec, acts, "2026-11-12", "zvyseni", { "ride:thr": { level: 3, last: "2026-11-09" } });
    expect(z.records[0]!.newLevel).toBe(3);
  });
});

// Oprava 6c: výběr z knihovny dřív nedostal datum ani posledně použité tréninky → na stejném stupni pořád stejný
import { buildWorkout, tierOf, libById } from "../../src/core/coach/library";
import { runCoach } from "../../src/core/coach/engine";
import { scenario, simHistory, simInput } from "../../scripts/coach-sim-lib";
describe("střídání tréninků na stejném stupni", () => {
  const zones = { ftp: 260, hr: null };
  const b = (o: { seed?: string; avoidIds?: string[] }) => buildWorkout({ sport: "ride", family: "thr", level: 2, minutes: 90, indoor: false, zones, ...o });
  it("posledně použitý trénink se nevezme znovu, stupeň zůstává; stejné datum = stejná volba", () => {
    const first = b({ seed: "2027-04-06" });
    const again = b({ seed: "2027-04-06" });
    expect(again.wid).toBe(first.wid);
    const next = b({ seed: "2027-04-13", avoidIds: [first.wid!] });
    expect(next.wid).not.toBe(first.wid);
    expect(tierOf(libById(next.wid)!)).toBe(tierOf(libById(first.wid)!));
  });
  it("engine: kvalita s uloženým wid v historii dostane jiný trénink téže kategorie", () => {
    const sc = scenario("sezona-zlepsit");
    const inp = simInput(sc, simHistory(sc), "2027-04-12");
    const k0 = runCoach(inp).coach.keyDays[0]!;
    expect(k0.wid).toBeTruthy();
    const k1 = runCoach({ ...inp, recentWids: [{ date: "2027-04-05", sport: k0.sport, cat: k0.cat, wid: k0.wid! }] }).coach.keyDays.find((k) => k.date === k0.date && k.cat === k0.cat);
    expect(k1).toBeTruthy();
    expect(k1!.wid).not.toBe(k0.wid);
    expect(k0.base).toBeGreaterThanOrEqual(k0.level);
  });
});
