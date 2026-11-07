// Lokální měření CPU výpočtů nad skutečným kontextem (BENCH_CTX=cesta k JSON z /admin/ctx). Bez proměnné se přeskočí.
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "vitest";
import { planFor, readiness } from "../src/report/build";

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
