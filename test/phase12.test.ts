// 8. kolo: víc uživatelů – SQL se přesměruje na tabulky uživatele, nic nesmí zůstat na tabulkách vlastníka.
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { TENANT_TABLES, rewriteSql, splitSql, userForTick } from "../src/lib/tenant";

const P = "u7_";
/** Najde odkaz na tabulku bez předpony (za klíčovým slovem nebo jako tabulka.sloupec). */
function leaks(sql: string): string[] {
  const out: string[] = [];
  for (const t of TENANT_TABLES) {
    const kw = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|TABLE|EXISTS|ON)\\s+${t}\\b`, "i");
    const q = new RegExp(`(?<![\\w.'"$])${t}\\.[a-z_]`);
    if (kw.test(sql) || q.test(sql)) out.push(t);
  }
  return out;
}

describe("přepis SQL na tabulky uživatele", () => {
  it("běžné dotazy", () => {
    expect(rewriteSql("SELECT * FROM activities WHERE date >= ?", P)).toBe("SELECT * FROM u7_activities WHERE date >= ?");
    expect(rewriteSql("INSERT INTO settings (key, value) VALUES ('a', '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value", P)).toBe("INSERT INTO u7_settings (key, value) VALUES ('a', '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    const upd = rewriteSql("UPDATE planned_workouts SET status = CASE WHEN EXISTS (SELECT 1 FROM activities a WHERE a.date = planned_workouts.date) THEN 'done' END", P);
    expect(upd).toContain("UPDATE u7_planned_workouts");
    expect(upd).toContain("FROM u7_activities a");
    expect(upd).toContain("= u7_planned_workouts.date");
    expect(rewriteSql("SELECT company FROM activity_tags t WHERE t.activity_id = activities.id", P)).toBe("SELECT company FROM u7_activity_tags t WHERE t.activity_id = u7_activities.id");
    expect(rewriteSql("CREATE INDEX IF NOT EXISTS ix_con_date ON constraints(date)", P)).toBe("CREATE INDEX IF NOT EXISTS u7_ix_con_date ON u7_constraints(date)");
    // společná tabulka users se nemění, JSON cesty taky ne
    expect(rewriteSql("SELECT id FROM users WHERE username = ?", P)).toBe("SELECT id FROM users WHERE username = ?");
    expect(rewriteSql("SELECT json_extract(icu_event, '$.name') FROM activities", P)).toBe("SELECT json_extract(icu_event, '$.name') FROM u7_activities");
  });

  it("žádný SQL řetězec ve zdrojácích po přepisu nesahá na tabulky vlastníka", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
    walk(path.join(__dirname, "../src"));
    const bad: string[] = [];
    for (const f of files) {
      if (f.endsWith("tenant.ts")) continue;
      const src = fs.readFileSync(f, "utf8");
      // řetězce a šablony, které vypadají jako SQL
      for (const m of src.matchAll(/(["`])((?:SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE)\b[^]*?)\1/g)) {
        const l = leaks(rewriteSql(m[2]!, P));
        if (l.length) bad.push(`${path.basename(f)}: ${l.join(",")} ← ${m[2]!.slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("migrace pro uživatele: všechny tabulky s předponou, users vynechané", () => {
    const dir = path.join(__dirname, "../migrations");
    for (const f of fs.readdirSync(dir)) {
      for (const st of splitSql(fs.readFileSync(path.join(dir, f), "utf8"))) {
        expect(/\busers\b/.test(st)).toBe(false);
        expect(leaks(rewriteSql(st, P))).toEqual([]);
      }
    }
  });
});

describe("cron: kdo je na řadě", () => {
  it("vlastník každých 5 min, ostatní v mezičase, každý max. jednou za 5 min při ≤ 4 dalších", () => {
    expect(userForTick([1], 100)).toBe(1);
    expect(userForTick([1], 101)).toBeNull();
    const ids = [1, 2, 3];
    const seq = Array.from({ length: 10 }, (_, i) => userForTick(ids, 100 + i));
    expect(seq).toEqual([1, 2, 3, null, null, 1, 2, 3, null, null]);
    const many = [1, 2, 3, 4, 5, 6, 7];
    const got = new Set(Array.from({ length: 40 }, (_, i) => userForTick(many, i)));
    for (const u of many) expect(got.has(u)).toBe(true);
  });
});

import { parseConsent } from "../src/plan/proposals";
describe("souhlas s návrhem: nové kódy #1 a staré Z1", () => {
  it("čísla i staré zápisy", () => {
    const codes = ["#1", "#2", "#3"];
    expect(parseConsent("ano 1, 3", codes)).toEqual(["#1", "#3"]);
    expect(parseConsent("ano #2", codes)).toEqual(["#2"]);
    expect(parseConsent("ano Z1", codes)).toEqual(["#1"]);
    expect(parseConsent("ne 2", codes)).toEqual(["#1", "#3"]);
    expect(parseConsent("ano", codes)).toEqual(codes);
  });
});

import { generatePlan } from "../src/core/plan";
describe("únava stáhne objem", () => {
  const base = { today: "2026-11-08", ftp: 298, hr: null, goal: "zvyseni" as const, ridesPerWeek: 3, startToday: null, acts: [], actsPower: [], past: () => null, calendar: [], constraints: [], weather: new Map(), weatherOk: false, recovery: "green" as const, p5: 340, weekLoads: [300, 320, 310, 330] };
  it("forma −32 → cíl týdne o 25 % nižší a upozornění", () => {
    const fresh = generatePlan({ ...base, startYesterday: { ctl: 50, atl: 45 } });
    const tired = generatePlan({ ...base, startYesterday: { ctl: 50, atl: 82 } });
    expect(tired.weeklyTarget.mid).toBeLessThan(fresh.weeklyTarget.mid * 0.8);
    expect(tired.warnings.some((w) => w.startsWith("Únava"))).toBe(true);
  });
});

describe("kvalita i když týden zaplní tvoje volby sportu", () => {
  it("kvalita se dá na kolový den", () => {
    const cons = [{ date: "2026-11-09", kind: "sport" as const, note: "ride" }, { date: "2026-11-10", kind: "sport" as const, note: "run" }, { date: "2026-11-11", kind: "sport" as const, note: "ride" }, { date: "2026-11-13", kind: "sport" as const, note: "run" }];
    const p = generatePlan({ today: "2026-11-08", ftp: 298, hr: null, goal: "udrzeni", ridesPerWeek: 3, startYesterday: { ctl: 44, atl: 22 }, startToday: null, acts: [], actsPower: [], past: () => null, calendar: [], constraints: cons, weather: new Map(), weatherOk: false, recovery: "green", p5: 340, weekLoads: [300, 300, 300, 300] });
    const q = p.days.filter((d) => d.kind === "quality");
    expect(q.length).toBe(1);
    expect(q[0]!.sport).toBe("ride");
  });
});

import { checkWeek } from "../src/core/weekCheck";
describe("kontrola týdne od AI", () => {
  const day = (date: string, kind: string, load: number, min = 60) => ({ date, kind, load, durationMin: min } as any);
  const rules = { target: { lo: 250, hi: 280 }, qualityLimit: 1, maxRun: 2 };
  it("v pořádku", () => {
    expect(checkWeek([day("2026-11-09", "z2", 70), day("2026-11-10", "quality", 80), day("2026-11-11", "rest", 0), day("2026-11-12", "z2", 60), day("2026-11-13", "rest", 0), day("2026-11-14", "long", 70, 150), day("2026-11-15", "rest", 0)], rules)).toEqual([]);
  });
  it("najde chyby: dvě kvality po sobě, moc dní za sebou, zátěž mimo cíl", () => {
    const v = checkWeek([day("2026-11-09", "quality", 70), day("2026-11-10", "quality", 70), day("2026-11-11", "z2", 30), day("2026-11-12", "z2", 30)], rules).map((x) => x.code);
    expect(v).toContain("hard_hard");
    expect(v).toContain("quality_many");
    expect(v).toContain("streak");
    expect(v).toContain("load_low");
  });
});
