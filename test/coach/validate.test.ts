// Závěrečná kontrola týdne (validateWeek) a hlídání úprav od AI (newViolations).
import { describe, expect, it } from "vitest";
import { addDays } from "../../src/lib/time";
import type { PastDay } from "../../src/core/coach/common";
import { type ValDay, newViolations, validateWeek } from "../../src/core/coach/validate";

describe("závěrečná kontrola týdne", () => {
  const D = (date: string, role: ValDay["role"], x: Partial<ValDay> = {}): ValDay => ({ date, role, sport: "ride", minutes: role === "rest" ? 0 : role === "long" ? 180 : 75, tiz: role === "key" ? 15 : 0, blocked: false, own: false, userQuality: false, userMinutes: false, downgraded: null, ...x });
  const V = (days: ValDay[], x: Record<string, unknown> = {}) => validateWeek({ weekStart: "2026-11-16", from: "2026-11-16", days, past: new Map(), keys: 1, long: true, caps: { easy: 120, long: 240, key: 75 }, runCap: 60, tsbFloor: -20, forms: [], ...x });
  const week = (roles: ValDay["role"][], x: Partial<ValDay>[] = []) => roles.map((r, i) => D(addDays("2026-11-16", i), r, x[i] ?? {}));
  it("v pořádku: kvalita po volnu, dlouhý o víkendu; dlouhý hned po kvalitě je dovolený", () => {
    expect(V(week(["rest", "key", "endurance", "rest", "endurance", "long", "rest"])).ok).toBe(true);
    expect(V(week(["rest", "endurance", "rest", "rest", "key", "long", "rest"])).ok).toBe(true);
  });
  it("kvalita den po dlouhém / po kvalitě = chyba v obou směrech sousedních dnů; tvoje volba = výjimka", () => {
    const a = V(week(["rest", "long", "key", "rest", "rest", "rest", "rest"]));
    expect(a.ok).toBe(false);
    expect(a.items.find((i) => i.code === "key_after_hard")!.level).toBe("error");
    expect(V(week(["rest", "key", "key", "rest", "rest", "long", "rest"])).ok).toBe(false);
    const u = V(week(["rest", "long", "key", "rest", "rest", "rest", "rest"], [{}, {}, { userQuality: true }]));
    expect(u.ok).toBe(true);
    expect(u.items.find((i) => i.code === "key_after_hard")!.level).toBe("exception");
    // přes hranu týdne: dlouhá neděle minulého týdne → pondělní kvalita je chyba
    const past = new Map<string, PastDay>([["2026-11-15", { trained: true, hard: true, key: false, minutes: 200, sport: "ride", long: true }]]);
    expect(V(week(["key", "rest", "rest", "rest", "rest", "long", "rest"]), { past }).ok).toBe(false);
  });
  it("víc než 3 dny za sebou, forma pod hranicí a délka nad strop jsou chyby", () => {
    expect(V(week(["key", "endurance", "endurance", "endurance", "rest", "long", "rest"])).items.map((i) => i.code)).toContain("streak");
    const t = V(week(["rest", "key", "rest", "rest", "endurance", "long", "rest"]), { forms: [{ date: "2026-11-21", form: -24 }] });
    expect(t.ok).toBe(false);
    expect(t.items.map((i) => i.code)).toContain("tsb_floor");
    const c = V(week(["rest", "key", "rest", "endurance", "rest", "long", "rest"], [{}, {}, {}, { minutes: 300 }]));
    expect(c.items.find((i) => i.code === "cap")!.level).toBe("error");
    const cu = V(week(["rest", "key", "rest", "endurance", "rest", "long", "rest"], [{}, {}, {}, { minutes: 300, userMinutes: true }]));
    expect(cu.items.find((i) => i.code === "cap")!.level).toBe("exception");
  });
  it("chybějící dlouhý: upozornění; když ho vědomě vzalo počasí, výjimka s důvodem", () => {
    expect(V(week(["rest", "key", "rest", "endurance", "rest", "endurance", "rest"])).items.find((i) => i.code === "long_missing")!.level).toBe("warn");
    const w = V(week(["rest", "key", "rest", "endurance", "rest", "endurance", "rest"], [{}, {}, {}, {}, {}, { downgraded: "počasí" }]));
    expect(w.items.find((i) => i.code === "long_missing")!.level).toBe("exception");
  });


  // kolo 9: AI trenér (/coach/ask) – úprava se vrátí při novém porušení kdekoli v týdnu, ne jen na upravených dnech
  it("AI úprava: nové porušení na neupraveném dni se pozná (řada dní, kvalita po nově těžkém dni)", () => {
    const before = V(week(["rest", "key", "rest", "endurance", "rest", "long", "rest"])).items;
    // AI přesune volno ze středy na čtvrtek → út–pá 4 dny za sebou; chyba „streak“ padne na pátek, který AI nezměnila
    const streak = V(week(["rest", "key", "endurance", "endurance", "endurance", "long", "rest"])).items;
    expect(newViolations(before, streak).map((i) => i.code)).toContain("streak");
    // AI dá dlouhý na čtvrtek → pátek (kvalita, AI se jí nedotkla) je den po těžkém dni
    const b2 = V(week(["rest", "endurance", "rest", "endurance", "key", "long", "rest"])).items;
    const kah = V(week(["rest", "endurance", "rest", "long", "key", "rest", "rest"])).items;
    expect(newViolations(b2, kah).find((i) => i.code === "key_after_hard")?.date).toBe("2026-11-20");
  });
  it("AI úprava: propad formy pod hranici se počítá jako nový, posun už existujícího ne", () => {
    const w = week(["rest", "key", "rest", "endurance", "rest", "long", "rest"]);
    const ok = V(w).items;
    const low = V(w, { forms: [{ date: "2026-11-21", form: -24 }] }).items;
    expect(newViolations(ok, low).map((i) => i.code)).toEqual(["tsb_floor"]);
    const moved = V(w, { forms: [{ date: "2026-11-22", form: -23 }] }).items;
    expect(newViolations(low, moved)).toEqual([]);
  });
  it("AI úprava: existující porušení, upozornění a odstraněná chyba úpravu nezablokují", () => {
    const bad = V(week(["rest", "long", "key", "rest", "rest", "rest", "rest"])).items;
    expect(newViolations(bad, bad)).toEqual([]);
    expect(newViolations(bad, V(week(["rest", "long", "rest", "key", "rest", "rest", "rest"])).items)).toEqual([]);
    // chybějící dlouhý je jen upozornění → nevrací se
    const noLong = V(week(["rest", "key", "rest", "endurance", "rest", "endurance", "rest"])).items;
    expect(noLong.some((i) => i.code === "long_missing")).toBe(true);
    expect(newViolations(V(week(["rest", "key", "rest", "endurance", "rest", "long", "rest"])).items, noLong)).toEqual([]);
  });
});
