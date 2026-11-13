// Jednotlivé části trenéra v milionech náhodných kombinací (vlastnosti, které musí platit vždy) – rychlé čisté funkce.
// COACH_FUZZ=N zvětší počty N×. Seed je pevný, selhání jde zopakovat.
import { describe, expect, it } from "vitest";
import { ADHERENCE_CUT, type AdherenceAct, type AdherenceDay, weekAdherence } from "../../../src/core/coach/adherence";
import { EMPTY_BLOCK, MIN_RECOVERY_LOAD, RECOVERY_SHARE, TAPER_SHARE, type BlockState, type BudgetInput, ctlAfter, loadToReach, usualLoad, weekTarget } from "../../../src/core/coach/budget";
import { fixedFromConstraints } from "../../../src/core/coach/common";
import { evaluateKeys, type KeyRecord } from "../../../src/core/coach/keys";
import { TIERS } from "../../../src/core/coach/library";
import { nextLevel } from "../../../src/core/coach/progress";
import { reentryOf } from "../../../src/core/coach/reentry";
import { MAX_STREAK, type SkDay, solveWeek } from "../../../src/core/coach/skeleton";
import { FORM_FLOOR, type Fatigue, fatigueFactor } from "../../../src/core/coach/target";
import { validateWeek } from "../../../src/core/coach/validate";
import { project, step } from "../../../src/core/fitness";
import type { Constraint } from "../../../src/core/plan";
import { addDays } from "../../../src/lib/time";
import { n, randomConstraints, rng } from "./gen";

const MON = "2026-11-16";
const WEEK = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(MON, i));

describe("plnění týdne (vynechání, přesun, přidání, menší zátěž)", () => {
  /** Nezávislý výpočet podle popisu pravidla v adherence.ts. */
  const oracle = (plan: AdherenceDay[], acts: AdherenceAct[], skip: Set<string>) => {
    const days = plan.filter((d) => d.training && !skip.has(d.date) && WEEK.includes(d.date));
    const inW = acts.filter((a) => WEEK.includes(a.date));
    const trainedDays = new Set(inW.filter((a) => (a.moving_s ?? 0) >= 1200).map((a) => a.date)).size;
    const planned = days.length, trained = Math.min(planned, trainedDays), missed = planned - trained;
    const lp = Math.round(days.reduce((t, d) => t + d.load, 0)), ld = Math.round(inW.reduce((t, a) => t + (a.load ?? 0), 0));
    const cut = planned > 0 && (missed >= 2 || trained / planned < 0.5 || (lp > 0 && ld < lp * 0.6));
    return { planned, trained, missed, factor: cut ? ADHERENCE_CUT : 1 };
  };
  const randomWeek = (r: ReturnType<typeof rng>) => {
    const plan: AdherenceDay[] = WEEK.map((date) => ({ date, training: r.chance(0.6), load: r.int(0, 150) }));
    const acts: AdherenceAct[] = [];
    for (let i = 0, k = r.int(0, 10); i < k; i++) acts.push({ date: addDays(MON, r.int(-3, 9)), load: r.chance(0.1) ? null : r.int(0, 200), moving_s: r.chance(0.1) ? null : r.int(0, 300) * 60 });
    const skip = new Set(WEEK.filter(() => r.chance(0.1)));
    return { plan, acts, skip };
  };

  it(`${n(1_000_000).toLocaleString("cs")} náhodných týdnů odpovídá pravidlu (2+ vynechané, pod 50 %, zátěž pod 60 % → ×0,85)`, () => {
    const r = rng(1);
    for (let i = 0; i < n(1_000_000); i++) {
      const { plan, acts, skip } = randomWeek(r);
      const got = weekAdherence(MON, plan, acts, skip);
      const exp = oracle(plan, acts, skip);
      if (got.planned !== exp.planned || got.trained !== exp.trained || got.missed !== exp.missed || got.factor !== exp.factor)
        expect({ i, got, exp }).toEqual({ i, got: exp, exp });
      if (got.factor < 1 && !got.note) expect.fail(`případ ${i}: úleva bez vysvětlení`);
    }
  }, 7_200_000);

  it("přesun tréninku na jiný den týdne není vynechání; trénink navíc nikdy neuškodí", () => {
    const r = rng(2);
    for (let i = 0; i < n(200_000); i++) {
      const { plan, acts, skip } = randomWeek(r);
      const base = weekAdherence(MON, plan, acts, skip);
      // trénink navíc (kterýkoli den týdne) → plnění ani úleva nemůže být horší
      const more = weekAdherence(MON, plan, [...acts, { date: WEEK[r.int(0, 6)]!, load: r.int(20, 120), moving_s: r.int(20, 180) * 60 }], skip);
      expect(more.factor, `případ ${i}`).toBeGreaterThanOrEqual(base.factor);
      expect(more.trained).toBeGreaterThanOrEqual(base.trained);
      // přesun: aktivitu z jednoho dne přesunu na jiný den týdne (bez jiné aktivity) → počet odjetých dnů stejný
      const inW = acts.filter((a) => WEEK.includes(a.date) && (a.moving_s ?? 0) >= 1200);
      if (!inW.length) continue;
      const a0 = inW[0]!;
      const busy = new Set(acts.map((a) => a.date));
      const free = WEEK.find((d) => !busy.has(d));
      if (!free || acts.filter((a) => a.date === a0.date).length > 1) continue;
      const moved = weekAdherence(MON, plan, acts.map((a) => (a === a0 ? { ...a, date: free } : a)), skip);
      expect(moved.trained, `případ ${i}: přesun ${a0.date} → ${free}`).toBe(base.trained);
      expect(moved.factor).toBe(base.factor);
    }
  }, 7_200_000);
});

describe("únava jen ubírá (všechny kombinace)", () => {
  it("úplná mřížka: násobek v [0,7; 1], kvality 0–2, víc únavy nikdy nepřidá", () => {
    const forms = [null, -60, -45, -31, -30, -29, -15, 0, 20];
    const grid: Fatigue[] = [];
    for (const form of forms) for (let bad = 0; bad <= 5; bad++) for (const hrv of [false, true]) for (let he = 0; he <= 3; he++)
      for (const ad of [null, { factor: 0.85, note: "x" }]) for (const st of [null, "strain"]) for (let ill = 0; ill <= 8; ill++)
        grid.push({ form, badMornings: bad, hrvLow: hrv, hardEasy: he, adherence: ad, strain: st, illnessDays: ill });
    const worse = (a: Fatigue, b: Fatigue) => // b je aspoň tak unavený jako a ve všech rozměrech
      (b.form ?? 99) <= (a.form ?? 99) && b.badMornings >= a.badMornings && (b.hrvLow || !a.hrvLow) && (b.hardEasy ?? 0) >= (a.hardEasy ?? 0) && (!!b.adherence || !a.adherence) && (!!b.strain || !a.strain) && b.illnessDays >= a.illnessDays;
    const res = grid.map((f) => ({ f, r: fatigueFactor(f) }));
    for (const { f, r } of res) {
      expect(r.factor).toBeGreaterThanOrEqual(0.7);
      expect(r.factor).toBeLessThanOrEqual(1);
      expect(r.keysMax).toBeGreaterThanOrEqual(0);
      expect(r.keysMax).toBeLessThanOrEqual(2);
      if (f.illnessDays >= 4) expect(r.keysMax).toBe(0);
      if (f.form != null && f.form < FORM_FLOOR) expect(r.keysMax).toBeLessThanOrEqual(1);
      if (r.factor < 1) expect(r.notes.length, JSON.stringify(f)).toBeGreaterThan(0);
    }
    // monotónnost: náhodné dvojice z mřížky (celá mřížka × mřížka je ~10^9)
    const r = rng(3);
    for (let i = 0; i < n(1_000_000); i++) {
      const a = res[r.int(0, res.length - 1)]!, b = res[r.int(0, res.length - 1)]!;
      if (!worse(a.f, b.f)) continue;
      if (b.r.factor > a.r.factor + 1e-12 || b.r.keysMax > a.r.keysMax) expect.fail(`víc únavy přidalo: ${JSON.stringify(a.f)} → ${JSON.stringify(b.f)}`);
    }
  }, 7_200_000);
});

describe("rovnice kondice (stejná jako intervals.icu)", () => {
  it(`${n(1_000_000).toLocaleString("cs")}×: zátěž na cíl a kondice po zátěži jsou navzájem inverzní a sedí s výpočtem po dnech`, () => {
    const r = rng(4);
    for (let i = 0; i < n(1_000_000); i++) {
      const c0 = r.real(0, 150), days = r.int(1, 14), c1 = c0 + r.real(-10, 10);
      const need = loadToReach(c0, c1, days);
      expect(Number.isFinite(need) && need >= 0).toBe(true);
      if (need > 0) expect(Math.abs(ctlAfter(c0, need, days) - c1)).toBeLessThan(1e-6);
      else expect(ctlAfter(c0, 0, days)).toBeGreaterThanOrEqual(c1 - 1e-9); // cíl jde i bez zátěže
      if (i % 50 === 0) {
        let s = { ctl: c0, atl: r.real(0, 150) };
        for (let d = 0; d < days; d++) s = step(s, need / days);
        expect(Math.abs(s.ctl - ctlAfter(c0, need, days))).toBeLessThan(1e-6);
        const p = project({ ctl: c0, atl: s.atl }, MON, Array.from({ length: days }, () => need / days));
        expect(p.length).toBe(days);
      }
    }
  }, 7_200_000);
});

describe("cíl týdne (rozpočet zátěže)", () => {
  const randomBudget = (r: ReturnType<typeof rng>): { inp: BudgetInput; ctl: number; blk: BlockState; k: number } => {
    const loads = Array.from({ length: 4 }, () => (r.chance(0.1) ? 0 : r.int(0, 900)));
    const goal = r.pick(["pokles", "udrzeni", "zvyseni", "zavod"] as const);
    const from = addDays(addDays("2026-01-05", 7 * r.int(0, 100)), r.int(0, 6));
    const blkLoads = Array.from({ length: r.int(0, 6) }, () => r.int(50, 900));
    const blk: BlockState = r.chance(0.2) ? EMPTY_BLOCK : { streak: r.int(0, 5), loads: blkLoads, recent: blkLoads.slice(-3) };
    return {
      inp: {
        goal, raceDate: goal === "zavod" ? addDays(from, r.int(-10, 120)) : null, from, ctlNow: r.real(0, 130),
        doneLoad: r.chance(0.5) ? 0 : r.int(0, 500),
        history: { weekLoads: loads, weekSessions: loads.map(() => r.int(0, 7)), weekOff: loads.map(() => (r.chance(0.1) ? r.int(1, 7) : 0)), seasonPeak: r.chance(0.7) ? r.real(10, 140) : null },
        fatigue: r.pick([1, 1, 0.9, 0.85, 0.8, 0.7]), weeks: 4, blockWeeks: r.pick([2, 3]),
      },
      ctl: r.real(0, 130), blk, k: r.int(0, 3),
    };
  };

  it(`${n(300_000).toLocaleString("cs")} náhodných týdnů: konečná nezáporná čísla, strop přidávání, lehčí týden, ladění`, () => {
    const r = rng(5);
    for (let i = 0; i < n(300_000); i++) {
      const { inp, ctl, blk, k } = randomBudget(r);
      const t = weekTarget(inp, k, ctl, blk);
      const tag = `případ ${i} ${JSON.stringify({ k, goal: inp.goal, phase: t.phase, limit: t.limit })}`;
      for (const x of [t.load, t.need, t.ctlEnd, t.ctlGoal]) if (!Number.isFinite(x)) expect.fail(`${tag}: nekonečné číslo`);
      if (t.load < 0 || t.need < 0) expect.fail(`${tag}: záporné`);
      // únava jen ubírá
      const fresh = weekTarget({ ...inp, fatigue: 1 }, k, ctl, blk);
      if (t.load > fresh.load + 1) expect.fail(`${tag}: únava přidala ${fresh.load} → ${t.load}`);
      // tento týden: nejvýš +30 % (aspoň +40) proti obvyklé zátěži z historie (bez historie 150), včetně odjetého
      const usual = usualLoad(inp.history), has = inp.history.weekLoads.some((x) => x > 0);
      const cap = has ? Math.max(usual * 1.3, usual + 40) : 150;
      if (k === 0 && t.phase !== "taper" && t.load + t.done > Math.max(cap, t.done) + 1) expect.fail(`${tag}: ${t.done}+${t.load} nad strop ${cap}`);
      // lehčí týden = 55 % průměru zátěžových týdnů bloku (bez únavy, minus odjeté), jen nad spodní hranicí
      if (t.recoveryWeek) {
        expect(t.base!, tag).toBeGreaterThanOrEqual(MIN_RECOVERY_LOAD - 1);
        if (inp.fatigue === 1) expect(t.load, tag).toBeLessThanOrEqual(Math.max(0, Math.round(t.base! * RECOVERY_SHARE) - t.done) + 1);
      }
      if (t.phase === "taper" && inp.fatigue === 1) {
        const raceWeek = t.weekStart <= inp.raceDate! && inp.raceDate! < addDays(t.weekStart, 7);
        expect(t.load, tag).toBe(Math.max(0, Math.round(t.base! * (raceWeek ? TAPER_SHARE.race : TAPER_SHARE.before)) - t.done));
      }
    }
  }, 7_200_000);

  it("stejná situace, jiný cíl: potřebná zátěž Zima ≤ Udržet ≤ Zlepšit", () => {
    const r = rng(6);
    for (let i = 0; i < n(200_000); i++) {
      const { inp, ctl, blk, k } = randomBudget(r);
      const need = (goal: "pokles" | "udrzeni" | "zvyseni") => weekTarget({ ...inp, goal, raceDate: null }, k, ctl, blk).need;
      const p = need("pokles"), u = need("udrzeni"), z = need("zvyseni");
      if (p > u + 1 || u > z + 1) expect.fail(`případ ${i}: Zima ${p}, Udržet ${u}, Zlepšit ${z}`);
    }
  }, 7_200_000);

  it("obvyklá zátěž leží mezi nejmenším a největším týdnem a jeden výpadek ji nestáhne", () => {
    const r = rng(7);
    for (let i = 0; i < n(500_000); i++) {
      const w = Array.from({ length: 4 }, () => r.int(0, 900));
      const h = { weekLoads: w, weekOff: [0, 0, 0, 0] };
      const u = usualLoad(h);
      expect(u).toBeGreaterThanOrEqual(Math.min(...w) - 1);
      expect(u).toBeLessThanOrEqual(Math.max(...w) + 1);
      // jeden týden nemoci (≥ 3 dny mimo) se nepočítá: obvyklá zátěž je pak mezi ostatními týdny
      const j = r.int(0, 3), off = [0, 0, 0, 0];
      off[j] = 3;
      const others = w.filter((_x, q) => q !== j);
      const u2 = usualLoad({ weekLoads: w, weekOff: off });
      expect(u2).toBeGreaterThanOrEqual(Math.min(...others) - 1);
      expect(u2).toBeLessThanOrEqual(Math.max(...others) + 1);
    }
  }, 7_200_000);
});

describe("kostra týdne (řešič)", () => {
  it(`${n(200_000).toLocaleString("cs")} náhodných týdnů: tvoje volby platí, pravidla drží, nikdy prázdný týden kvůli jedné volbě`, () => {
    const r = rng(8);
    for (let i = 0; i < n(200_000); i++) {
      const len = r.int(1, 7);
      const days: SkDay[] = WEEK.slice(7 - len).map((date) => {
        const d: SkDay = { date };
        if (r.chance(0.12)) d.blocked = true;
        else if (r.chance(0.08)) d.rest = true;
        else if (r.chance(0.12)) d.must = true;
        if (!d.blocked && !d.rest && r.chance(0.1)) d.type = r.pick(["z2", "quality"] as const);
        if (r.chance(0.1)) d.noKey = true;
        if (r.chance(0.15)) d.badWeather = true;
        // vlastní dlouhá jízda nemá druh dne (fixedFromConstraints ho maže)
        if (d.must && r.chance(0.3)) { d.ownLong = true; delete d.type; }
        return d;
      });
      const tail = [3, 2, 1].map((k) => ({ date: addDays(days[0]!.date, -k), trained: r.chance(0.6), hard: r.chance(0.3) }));
      const want = { sessions: r.int(0, 7), keys: r.int(0, 2), long: r.chance(0.7) };
      const res = solveWeek({ days, tail, ...want });
      const role = (d: string) => res.roles.get(d) ?? "rest";
      const tag = `případ ${i}: ${JSON.stringify({ days, tail, want })}`;
      const must = days.filter((d) => !d.blocked && !d.rest && (d.must || d.type));
      for (const d of days) {
        if ((d.blocked || d.rest) && role(d.date) !== "rest") expect.fail(`${tag}: blok/volno trénuje`);
        if (!d.blocked && !d.rest && (d.must || d.type) && role(d.date) === "rest") expect.fail(`${tag}: tvoje volba ${d.date} je volno`);
        if (!d.blocked && !d.rest && d.type === "quality" && role(d.date) !== "key") expect.fail(`${tag}: chtěl kvalitu ${d.date}`);
        if (d.type === "z2" && role(d.date) === "key") expect.fail(`${tag}: chtěl Z2 ${d.date}`);
        if (d.noKey && d.type !== "quality" && role(d.date) === "key") expect.fail(`${tag}: kvalita ve dni bez kvality`);
        if (d.ownLong && role(d.date) === "key") expect.fail(`${tag}: vlastní dlouhá jízda jako kvalita`);
      }
      // řada dní a kvalita po těžkém dni – porušit je smí jen tvoje volba
      let run = 0;
      const all = [...tail.map((t) => ({ date: t.date, tr: t.trained, mine: false })), ...days.map((d) => ({ date: d.date, tr: role(d.date) !== "rest", mine: must.includes(d) }))];
      for (const x of all) { run = x.tr ? run + 1 : 0; if (run > MAX_STREAK && !x.mine && days.some((d) => d.date === x.date)) expect.fail(`${tag}: ${run} dny za sebou bez tvé volby`); }
      for (const d of days) {
        if (role(d.date) !== "key" || d.type === "quality") continue;
        const y = addDays(d.date, -1);
        const yr = res.roles.get(y);
        if (yr === "key" || yr === "long" || (yr === undefined && tail.find((t) => t.date === y)?.hard)) expect.fail(`${tag}: kvalita po těžkém dni ${y}`);
      }
      const roles = [...res.roles.values()];
      if (roles.filter((x) => x === "long").length > 1) expect.fail(`${tag}: dva dlouhé`);
      const keys = roles.filter((x) => x === "key").length;
      if (keys > Math.max(want.keys, days.filter((d) => !d.blocked && !d.rest && d.type === "quality").length)) expect.fail(`${tag}: víc kvalit, než se chtělo`);
      if (res.sessions > Math.max(want.sessions, must.length)) expect.fail(`${tag}: víc tréninků, než se chtělo`);
      // co chybí, to se řekne
      if (res.sessions < Math.min(want.sessions, days.filter((d) => !d.blocked && !d.rest).length) && !res.notes.length) expect.fail(`${tag}: méně tréninků bez vysvětlení`);
    }
  }, 7_200_000);
});

describe("návrat po pauze, stupně kvalit, tvoje volby", () => {
  it("strop intenzity po pauze jde jen nahoru (Z1–Z2 → tempo → plně) a odpovídá délce pauzy", () => {
    const r = rng(9);
    const T = "2026-06-30";
    const ord = { base: 0, tempo: 1, full: 2 } as const;
    for (let i = 0; i < n(50_000); i++) {
      const acts = Array.from({ length: r.int(0, 30) }, () => ({ date: addDays(T, -r.int(0, 70)), moving_s: r.chance(0.15) ? r.int(1, 19) * 60 : r.int(20, 200) * 60 }));
      const level = r.pick(["beginner", "intermediate", "advanced"] as const);
      const re = reentryOf(acts, T, level);
      const trained = [...new Set(acts.filter((a) => a.moving_s >= 1200 && a.date >= addDays(T, -56)).map((a) => a.date))].sort();
      if (!trained.length) { expect(re.resume).toBeNull(); continue; }
      if (re.resume) expect(re.gapDays, `případ ${i}`).toBeGreaterThanOrEqual(7);
      let prev = -1;
      // od návratu dál strop jen roste
      for (let d = 0; d < 60 && re.resume; d++) {
        const c = ord[re.ceilingOn(addDays(re.resume, d))];
        expect(c, `případ ${i}`).toBeGreaterThanOrEqual(prev === -1 ? 0 : prev);
        prev = c;
      }
      // úplný oracle: najít poslední mezeru ≥ 7 dní (nebo trvající pauzu)
      let gap = 0;
      const last = trained[trained.length - 1]!;
      const since = Math.round((Date.parse(T) - Date.parse(last)) / 864e5) - 1;
      if (since >= 7) gap = since;
      else for (let j = trained.length - 1; j > 0; j--) { const g = Math.round((Date.parse(trained[j]!) - Date.parse(trained[j - 1]!)) / 864e5) - 1; if (g >= 7) { gap = g; break; } }
      expect(re.gapDays, `případ ${i}`).toBe(gap);
    }
  }, 7_200_000);

  it("stupeň náročnosti: vždy 0–5, mění se nejvýš o 1, Udržet a Zima po zvládnutí nerostou", () => {
    for (let l = 0; l < TIERS; l++) for (const o of ["posun", "zopakovat", "ubrat", "nove"] as const) for (const g of ["pokles", "udrzeni", "zvyseni", "zavod"] as const) {
      const x = nextLevel(l, o, g);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(TIERS);
      expect(Math.abs(x - l)).toBeLessThanOrEqual(1);
      if (o === "posun" && (g === "udrzeni" || g === "pokles")) expect(x).toBe(l);
      if (o === "ubrat") expect(x).toBeLessThanOrEqual(l);
      if (o === "posun") expect(x).toBeGreaterThanOrEqual(l);
    }
    // vyhodnocení: náhodná splnění, stupeň se mění nejvýš o 1 za kvalitu, nezvládnutá nikdy nezvýší
    const r = rng(10);
    for (let i = 0; i < n(50_000); i++) {
      const date = "2026-06-10";
      const comp = r.int(0, 100);
      const rec: KeyRecord = { date, sport: "ride", cat: "thr", level: r.int(0, 5), base: r.int(0, 5), plan: null, minutes: 60, name: null, state: "pending" };
      const goal = r.pick(["pokles", "udrzeni", "zvyseni", "zavod"] as const);
      const lvl = { "ride:thr": { level: rec.base!, last: null } };
      const act = { id: "a", date, sport: "ride" as const, load: 80, moving_s: 3600, quality: true, hr_z: null, pwr_z: null, laps: null, compliance: comp, rpe: r.pick([null, 5, 9]) };
      const ev = evaluateKeys([rec], [act], "2026-06-13", goal, lvl);
      for (const u of ev.updates) {
        expect(Math.abs(u.level - rec.base!), `případ ${i}`).toBeLessThanOrEqual(1);
        if (comp < 95) expect(u.level, `případ ${i}: splněno ${comp} %`).toBeLessThanOrEqual(rec.base!);
        if (goal === "udrzeni" || goal === "pokles") expect(u.level).toBeLessThanOrEqual(rec.base!);
      }
    }
  }, 7_200_000);

  it("tvoje volby: výsledek nezávisí na pořadí zadání a nesmyslné hodnoty se ignorují", () => {
    const r = rng(11);
    for (let i = 0; i < n(100_000); i++) {
      const cons: Constraint[] = randomConstraints(r, MON, r.int(1, 10));
      const a = JSON.stringify([...fixedFromConstraints(cons).entries()]);
      const shuffled = cons.slice().sort(() => r.next() - 0.5);
      expect(JSON.stringify([...fixedFromConstraints(shuffled).entries()]), `případ ${i}`).toBe(a);
      for (const [, f] of fixedFromConstraints(cons)) {
        if (f.minutes != null) expect(f.minutes >= 20 && f.minutes <= 420).toBe(true);
        if (f.own) expect(f.own.min > 0 && f.own.min <= 600).toBe(true);
        if (f.rest && !f.blocked) expect(Object.keys(f)).toEqual(["rest"]);
      }
    }
  }, 7_200_000);
});

describe("závěrečná kontrola týdne najde každé porušení", () => {
  const day = (date: string, role: "rest" | "endurance" | "key" | "long", o: Partial<{ minutes: number; userQuality: boolean; mine: boolean }> = {}) =>
    ({ date, role, sport: "ride" as const, minutes: role === "rest" ? 0 : (o.minutes ?? 60), tiz: role === "key" ? 20 : 0, blocked: false, own: false, userQuality: !!o.userQuality, userMinutes: false, mine: !!o.mine, downgraded: null });
  const base = (days: ReturnType<typeof day>[]) => ({ weekStart: MON, from: MON, days, past: new Map(), keys: 1, long: true, caps: { easy: 120, long: 240, key: 70 }, runCap: 90, tsbFloor: -30, forms: days.map((d) => ({ date: d.date, form: -10 })) });

  it(`${n(100_000).toLocaleString("cs")} náhodných týdnů: chyba ⇔ porušené pravidlo bez tvé volby`, () => {
    const r = rng(12);
    for (let i = 0; i < n(100_000); i++) {
      const days = WEEK.map((d) => day(d, r.pick(["rest", "rest", "endurance", "endurance", "key", "long"] as const), { mine: r.chance(0.1), userQuality: r.chance(0.05), minutes: r.pick([60, 90, 200, 300]) }));
      const v = validateWeek(base(days));
      // vlastní spočítání porušení
      let run = 0, streakErr = false, streakAny = false;
      for (let j = 0; j < 7; j++) {
        run = days[j]!.role !== "rest" ? run + 1 : 0;
        if (run > MAX_STREAK) { streakAny = true; if (!days.slice(j - run + 1, j + 1).some((x) => x.mine || x.userQuality)) streakErr = true; }
      }
      const kahErr = days.some((d, j) => j > 0 && d.role === "key" && !d.userQuality && ["key", "long"].includes(days[j - 1]!.role));
      const capErr = days.some((d) => d.role !== "rest" && d.minutes > (d.role === "long" ? 240 : d.role === "key" ? 90 : 120) + 15);
      const errs = v.items.filter((x) => x.level === "error").map((x) => x.code);
      expect(errs.includes("key_after_hard"), `případ ${i}`).toBe(kahErr);
      expect(errs.includes("cap"), `případ ${i}`).toBe(capErr);
      if (streakErr) expect(errs.includes("streak") || v.items.some((x) => x.code === "streak"), `případ ${i}`).toBe(true);
      if (!streakAny) expect(v.items.some((x) => x.code === "streak"), `případ ${i}`).toBe(false);
      expect(v.ok).toBe(!errs.length);
    }
  }, 7_200_000);

  it("propad formy jen z minulých dní (i volno by ho nechalo) není chyba plánu", () => {
    const days = WEEK.map((d, j) => day(d, j % 2 ? "endurance" : "rest"));
    const forms = days.map((d) => ({ date: d.date, form: -40 }));
    const v = validateWeek({ ...base(days), forms, formsRest: forms.map((f) => ({ ...f, form: f.form + 0.2 })) });
    expect(v.items.find((x) => x.code === "tsb_floor")?.level).toBe("warn");
    const v2 = validateWeek({ ...base(days), forms, formsRest: forms.map((f) => ({ ...f, form: -20 })) });
    expect(v2.items.find((x) => x.code === "tsb_floor")?.level).toBe("error");
  });
});
