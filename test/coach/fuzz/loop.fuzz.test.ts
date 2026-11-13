// Simulace po dnech přes několik týdnů: různí sportovci × různé chování (plní, vynechává, přidává, přetahuje,
// nedotahuje, nezvládá / zvládá intervaly, nemoc, přesuny, týden pauzy, vlastní volby během týdne, únava, chaos).
// Trenér plánuje každý den znovu. COACH_FUZZ=N zvětší počet sportovců N×.
import { describe, expect, it } from "vitest";
import { fixedFromConstraints } from "../../../src/core/coach/common";
import { addDays, mondayOf } from "../../../src/lib/time";
import { Tally } from "./check";
import { n, randomAthlete, rng } from "./gen";
import { BEHAVIOURS, type Behaviour, type LoopResult, simulateLoop } from "./loop";

const WEEKS = 6;
const run = (b: Behaviour, i: number, goal?: "pokles" | "udrzeni" | "zvyseni" | "zavod"): LoopResult => {
  const seed = 100_000 + BEHAVIOURS.indexOf(b) * 10_000 + i;
  const r = rng(seed);
  const a = randomAthlete(seed, goal ? { goal } : {});
  // historie musí být, ať je co plnit (nový uživatel bez historie má vlastní testy ve snímcích)
  if (!a.weekLoad) a.weekLoad = 150;
  const start = mondayOf(addDays("2026-01-05", r.int(0, 700)));
  return simulateLoop(a, b, start, WEEKS, seed);
};
const tag = (x: LoopResult) => `seed ${x.a.seed} (${x.behaviour}, ${x.a.primary}, ${x.a.goal}, zátěž ${x.a.weekLoad}, ${x.days[0]!.date})`;

/** Pravidla rozběhnutého týdne: žádný budoucí den nesmí mít víc než v pondělním plánu (nic se nedohání). */
function noCatchUp(x: LoopResult, t: Tally) {
  for (const d of x.days) {
    const mp = d.plan.coach.mondayPlan;
    if (!mp || mp.weekStart !== mondayOf(d.date) || d.date === mp.weekStart) continue;
    const fixed = fixedFromConstraints(d.cons);
    const w0 = d.plan.coach.horizon[0]!;
    const v: { code: string; msg: string }[] = [];
    for (const day of w0.days) {
      const m = mp.week.days.find((z) => z.date === day.date);
      // tvoje volby (sport, délka, vlastní jízda…) mají vlastní pravidla
      if (!m || day.role === "rest" || fixed.get(day.date)) continue;
      if (day.load > m.load * 1.1 + 5 && m.role !== "rest") v.push({ code: "catch_up", msg: `${d.date}: den ${day.date} ${day.load} > pondělní plán ${m.load}` });
      if (m.role === "rest") v.push({ code: "catch_up_new", msg: `${d.date}: nový trénink ${day.date} (${day.role}) v den volna z pondělí` });
    }
    t.add(v, tag(x));
  }
}

describe("trenér – simulace chování sportovce po dnech", () => {
  const results = new Map<Behaviour, LoopResult[]>();
  const all = () => [...results.values()].flat();
  for (const b of BEHAVIOURS) results.set(b, Array.from({ length: n(4) }, (_, i) => run(b, i)));

  it("každý den každého chování splní všechna pravidla plánu", () => {
    const t = new Tally();
    for (const x of all()) for (const d of x.days) t.add(x.violations.filter((v) => v.date === d.date).map((v) => v.v), `${tag(x)} den ${d.date}`);
    expect(t.ok, t.report()).toBe(true);
  });

  it("vynechané, přesunuté i přidané tréninky se nedohánějí: zbytek týdne nikdy nad pondělní plán", () => {
    const t = new Tally();
    for (const x of all()) noCatchUp(x, t);
    expect(t.ok, t.report()).toBe(true);
  });

  it("plán se bez důvodu nemění: sportovec plní přesně, ráno zelené, bez voleb → zbylé dny týdne stejné jako včera", () => {
    for (const x of results.get("perfect")!) {
      for (let i = 1; i < x.days.length; i++) {
        const y = x.days[i - 1]!, d = x.days[i]!;
        // horší rána se počítají za 5 dní (únava) – stabilita se čeká, jen když bylo celé okno zelené
        if (mondayOf(y.date) !== mondayOf(d.date) || x.days.slice(Math.max(0, i - 6), i + 1).some((q) => q.recovery !== "green")) continue;
        const prev = new Map(y.plan.coach.horizon[0]!.days.map((z) => [z.date, z]));
        for (const z of d.plan.coach.horizon[0]!.days) {
          if (z.date <= d.date) continue;
          const p = prev.get(z.date);
          if (!p) continue;
          expect(z.role, `${tag(x)} ${d.date}: ${z.date} role`).toBe(p.role);
          // běh: strop podle nejdelšího běhu za 28 dní se posouvá – délka se smí vrátit k pondělní, nikdy nad ni
          const mon = d.plan.coach.mondayPlan?.week.days.find((q) => q.date === z.date);
          if (z.sport === "run" && mon && z.minutes <= mon.minutes) continue;
          expect(Math.abs(z.minutes - p.minutes), `${tag(x)} ${d.date}: ${z.date} ${p.minutes} → ${z.minutes} min`).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it("minulý týden hodně vynechaný → tento týden nikdy víc než bez úlevy", () => {
    let seen = 0;
    for (const x of all()) for (const a of x.adherence) { seen++; expect(a.with, `${tag(x)} ${a.date}`).toBeLessThanOrEqual(a.without); }
    expect(seen, "úleva za vynechání se v simulacích opravdu objevila").toBeGreaterThan(0);
  });

  it("nezvládnuté intervaly: stupeň náročnosti nikdy neroste; zvládnuté: neklesá (Zlepšit roste, Udržet/Zima drží)", () => {
    let down = 0;
    for (const x of results.get("failer")!) for (const l of x.levels) {
      if (l.from < 0) continue;
      expect(l.to, `${tag(x)} ${l.date} ${l.key}: ${l.outcome}`).toBeLessThanOrEqual(l.from);
      if (l.to < l.from) down++;
    }
    for (const x of results.get("succeeder")!) for (const l of x.levels) {
      if (l.from < 0) continue;
      expect(l.to, `${tag(x)} ${l.date} ${l.key}: ${l.outcome}`).toBeGreaterThanOrEqual(l.from);
      if (x.a.goal === "udrzeni" || x.a.goal === "pokles") expect(l.to, `${tag(x)} ${l.date} ${l.key}`).toBe(l.from);
    }
    expect(down, "nezvládnuté intervaly opravdu snížily stupeň").toBeGreaterThan(0);
  });
});

describe("trenér – směr kondice podle cíle (sportovec plní přesně)", () => {
  // stejný sportovec, stejný start, jen jiný cíl → kondice na konci: Zima ≤ Udržet ≤ Zlepšit
  const LONG = 12;
  const trio = Array.from({ length: n(6) }, (_, i) => {
    const seed = 300_000 + i;
    const start = mondayOf(addDays("2026-01-05", rng(seed).int(0, 700)));
    const of = (goal: "pokles" | "udrzeni" | "zvyseni") => { const a = randomAthlete(seed, { goal }); if (!a.weekLoad) a.weekLoad = 150; return simulateLoop(a, "perfect", start, LONG, seed); };
    return { pokles: of("pokles"), udrzeni: of("udrzeni"), zvyseni: of("zvyseni") };
  });
  const ctl = (x: LoopResult) => ({ s: x.weeks[0]!.ctlStart, e: x.weeks[x.weeks.length - 1]!.ctlEnd });
  /** Známé omezení: trenér sám hlásí, že se zátěž do délek tréninků nevejde (zátěžový týden pod 93 % cíle) v aspoň
   *  třetině týdnů, nebo strop přidávání (+30 % proti posledním týdnům) nepustí cíl (návrat po pauze s kondicí
   *  z dřívějška) – typicky vysoká kondice s málo tréninky týdně, nebo zimní krátké délky u Udržet. */
  const capped = (x: LoopResult) => x.days.filter((d) => d.date === mondayOf(d.date)).filter((d) => { const h = d.plan.coach.horizon[0]!; return !h.recoveryWeek && (h.load < h.target * 0.93 || h.target < h.need * 0.93); }).length >= x.weeks.length / 3;

  it("pořadí cílů: Zima ≤ Udržet ≤ Zlepšit (na konci 12 týdnů)", () => {
    for (const t3 of trio) {
      const p = ctl(t3.pokles).e, u = ctl(t3.udrzeni).e, z = ctl(t3.zvyseni).e;
      expect(p, `${tag(t3.pokles)}: Zima ${p} vs Udržet ${u}`).toBeLessThanOrEqual(u + 1);
      if (!capped(t3.zvyseni)) expect(u, `${tag(t3.zvyseni)}: Udržet ${u} vs Zlepšit ${z}`).toBeLessThanOrEqual(z + 1);
    }
  });
  it("Zlepšit: kondice roste (kdo netrénuje denně), nikdy víc než o 6 za týden", () => {
    for (const t3 of trio) {
      const x = t3.zvyseni, c = ctl(x);
      for (const w of x.weeks) expect(w.ctlEnd - w.ctlStart, `${tag(x)} ${w.weekStart}`).toBeLessThanOrEqual(6);
      // trénink 6–7 dní týdně pravidlo „nejvýš 3 dny za sebou“ nepustí – tam se růst nevyžaduje
      if (x.a.dows.length <= 5 && !capped(x)) expect(c.e, `${tag(x)}: ${c.s} → ${c.e}`).toBeGreaterThan(c.s);
    }
  });
  it("Udržet: kondice za 12 týdnů zůstane v ±20 % (aspoň ±4), pokud se zátěž vejde do délek", () => {
    // kondice nad 100 (profesionálové) se do stropů délek nevejde ani bez zimy – mimo rozsah
    for (const t3 of trio) { if (capped(t3.udrzeni) || ctl(t3.udrzeni).s > 100) continue; const c = ctl(t3.udrzeni); expect(Math.abs(c.e - c.s), `${tag(t3.udrzeni)}: ${c.s} → ${c.e}`).toBeLessThanOrEqual(Math.max(4, c.s * 0.2)); }
  });
  it("Zima: kondice neroste (klesá k zimnímu základu, u něj drží)", () => {
    for (const t3 of trio) { const c = ctl(t3.pokles); expect(c.e, `${tag(t3.pokles)}: ${c.s} → ${c.e}`).toBeLessThanOrEqual(c.s + 2); }
  });
});

