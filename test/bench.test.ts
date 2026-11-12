// Lokální měření CPU výpočtů.
//  - BENCH_CTX=cesta k JSON z /admin/ctx: plán a připravenost nad skutečným kontextem,
//  - BENCH=1: runCoach nad simulovanou historií (scripts/coach-sim-lib.ts) – pondělí a čtvrtek (rozběhnutý týden).
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "vitest";
import { planFor, readiness } from "../src/report/build";
import { runCoach } from "../src/core/coach/engine";
import { scenario, simHistory, simInput } from "../scripts/coach-sim-lib";

const p = process.env.BENCH_CTX;
describe.skipIf(!p || !existsSync(p!))("bench", () => {
  it("plán a připravenost", async () => {
    const ctx = { ...JSON.parse(readFileSync(p!, "utf8")), env: { DB: null } };
    const t = (label: string, n: number, fn: () => Promise<unknown>) => async () => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) await fn();
      console.log(`${label}: ${((performance.now() - t0) / n).toFixed(2)} ms`);
    };
    await t("planFor první", 1, () => planFor(ctx))();
    await t("planFor teplý", 20, () => planFor(ctx))();
    await t("readiness teplý", 20, () => readiness(ctx))();
    const t0 = performance.now();
    JSON.parse(readFileSync(p!, "utf8"));
    console.log(`JSON.parse ctx: ${(performance.now() - t0).toFixed(2)} ms`);
  });
});

describe.skipIf(!process.env.BENCH)("bench runCoach", () => {
  it("simulovaná historie", () => {
    const sc = scenario("sezona-zlepsit");
    const acts = simHistory(sc);
    for (const [label, T] of [["pondělí", "2027-04-05"], ["čtvrtek", "2027-04-08"]] as const) {
      const inp = simInput(sc, acts, T);
      for (let i = 0; i < 5; i++) runCoach(inp);
      const n = 40, t0 = performance.now();
      for (let i = 0; i < n; i++) runCoach(inp);
      console.log(`runCoach ${label}: ${((performance.now() - t0) / n).toFixed(2)} ms`);
    }
  });
});
