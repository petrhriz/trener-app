// Náhodné snímky: tisíce různých sportovců × den v roce × cíl × omezení × ranní stav × únava × počasí × návrat po
// pauze. Každý plán musí splnit pravidla z check.ts. COACH_FUZZ=N zvětší počet N×.
import { describe, expect, it } from "vitest";
import { runCoach } from "../../../src/core/coach/engine";
import { randomCase } from "./cases";
import { Tally, checkPlan } from "./check";
import { n } from "./gen";

describe("trenér – náhodné snímky (různí sportovci a situace)", () => {
  it(`${n(3000)} náhodných plánů splní všechna pravidla`, () => {
    const t = new Tally();
    const N = n(3000);
    for (let s = 1; s <= N; s++) {
      const { a, inp } = randomCase(s);
      let out;
      try { out = runCoach(inp); }
      catch (e) { t.add([{ code: "crash", msg: String((e as Error).stack ?? e).slice(0, 300) }], `seed ${s}`); continue; }
      t.add(checkPlan(inp, out), `seed ${s} (${a.primary}, ${a.goal}, ${inp.today}, zátěž ${a.weekLoad})`);
    }
    expect(t.ok, t.report()).toBe(true);
  }, 7_200_000);

  it("stejný vstup → stejný plán (deterministický)", () => {
    for (let s = 1; s <= n(150); s++) {
      const { inp } = randomCase(s);
      expect(JSON.stringify(runCoach(inp)), `seed ${s}`).toBe(JSON.stringify(runCoach(inp)));
    }
  }, 7_200_000);
});
