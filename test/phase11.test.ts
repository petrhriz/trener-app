// 7. kolo připomínek: cíle se liší i po slabších týdnech, kontrola FTP, osobní počasí, vlastní jízda.
import { describe, expect, it } from "vitest";
import { generatePlan, weekTargetAdjusted, z2MaxMinutes, type PlanInput } from "../src/core/plan";
import { ftpCheck } from "../src/core/ftpCheck";
import { bestWindow, dayWeather, hourKind, type Hour } from "../src/core/weather";
import { ownRideName, parseOwnRide } from "../src/core/ownRide";

function planInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    today: "2026-11-08",
    ftp: 298,
    hr: { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 54 },
    goal: "zvyseni",
    ridesPerWeek: 3,
    startYesterday: { ctl: 44, atl: 22 },
    startToday: null,
    acts: [],
    actsPower: [],
    past: () => null,
    calendar: [],
    constraints: [],
    weather: new Map(),
    weatherOk: false,
    recovery: "green",
    p5: 340,
    // stejné týdny jako 8. 11. 2026: po slabších týdnech by dřív vyšel stejný cíl pro Zlepšit i Udržet
    weekLoads: [430, 330, 52, 150],
    ...over,
  };
}

describe("cíl tréninku mění plán i po slabších týdnech", () => {
  it("strop proti běžnému týdnu závisí na cíli", () => {
    const base = { lo: 322, hi: 338, mid: 330 };
    const z = weekTargetAdjusted(base, [430, 330, 52, 150], "zvyseni");
    const u = weekTargetAdjusted({ lo: 276, hi: 338, mid: 307 }, [430, 330, 52, 150], "udrzeni");
    const p = weekTargetAdjusted({ lo: 246, hi: 276, mid: 261 }, [430, 330, 52, 150], "pokles");
    expect(z.mid).toBeGreaterThan(u.mid);
    expect(u.mid).toBeGreaterThan(p.mid);
  });
  it("Zlepšit / Udržet / Pokles = jiná zátěž týdne v plánu", () => {
    const load = (goal: PlanInput["goal"]) => generatePlan(planInput({ goal })).days.reduce((t, d) => t + d.load, 0);
    expect(load("zvyseni")).toBeGreaterThan(load("udrzeni"));
    expect(load("udrzeni")).toBeGreaterThan(load("pokles"));
  });
  it("delší Z2 při Zlepšit, kratší při Poklesu", () => {
    expect(z2MaxMinutes("zvyseni", false, true)).toBeGreaterThan(z2MaxMinutes("udrzeni", false, true));
    expect(z2MaxMinutes("pokles", true, false)).toBeLessThan(z2MaxMinutes("udrzeni", true, false));
  });
});

describe("kontrola FTP", () => {
  it("20 min výrazně nad FTP → test (FTP je nízké)", () => {
    const r = ftpCheck({ today: "2026-11-08", ftp: 270, eftp: null, best20: { w: 305, date: "2026-11-01" }, ftpSetAt: null, inSeason: false });
    expect(r.suggest).toBe(true);
    expect(r.kind).toBe("up");
  });
  it("eFTP o 10 % pod FTP → možná vysoké", () => {
    expect(ftpCheck({ today: "2026-11-08", ftp: 300, eftp: { w: 265, date: "2026-11-05" }, best20: null, ftpSetAt: null, inSeason: true }).kind).toBe("down");
  });
  it("dlouho neověřené FTP", () => {
    expect(ftpCheck({ today: "2026-11-08", ftp: 300, eftp: { w: 298, date: "2026-11-05" }, best20: null, ftpSetAt: "2026-06-01", inSeason: true }).kind).toBe("old");
  });
  it("odpovídá → nic", () => {
    expect(ftpCheck({ today: "2026-11-08", ftp: 300, eftp: { w: 296, date: "2026-11-05" }, best20: { w: 300, date: "2026-11-01" }, ftpSetAt: "2026-10-20", inSeason: false }).suggest).toBe(false);
  });
});

describe("počasí podle tebe", () => {
  // letní den: ráno 14 °C, v poledne 27 °C
  const summer = (h: number): Hour => ({ time: `2026-07-10T${String(h).padStart(2, "0")}:00`, temp: 14 + Math.max(0, Math.min(13, (h - 6) * 2)), feels: 14 + Math.max(0, Math.min(13, (h - 6) * 2)), precip_prob: 0, precip: 0, gust: 15, wind: 8, code: 0 });
  const hours = Array.from({ length: 24 }, (_, h) => summer(h));
  it("chladné ráno v teplém dni = „chladno“, ne vhodné", () => {
    expect(hourKind({ precip_prob: 0, gust: 10, feels: 15 }, 27).kind).toBe("cool");
    expect(hourKind({ precip_prob: 0, gust: 10, feels: 15 }, 17).kind).toBe("ok");
  });
  it("okno nejblíž ideální teplotě, ne v poledním vedru ani ráno nabalený", () => {
    const w = dayWeather(hours, "2026-07-10", { cold: 3, hot: 30, ideal: 20 })!;
    expect(w.window).not.toBeNull();
    expect(w.window!.from).toBeGreaterThanOrEqual(8);
    expect(w.window!.from).toBeLessThan(12);
  });
  it("vlastní hranice: pod 8 °C už je zima", () => {
    expect(hourKind({ precip_prob: 0, gust: 10, feels: 6 }, 10, { cold: 8, hot: 30, ideal: 18 }).kind).toBe("cold");
    expect(bestWindow([], { cold: 8, hot: 30, ideal: 18 })).toBeNull();
  });
});

describe("vlastní jízda", () => {
  it("rozpozná den, délku a s kým", () => {
    const a = parseOwnRide("zítra jedu projížďku na 4 hodiny s Honzou", "2026-11-08")!;
    expect(a).toMatchObject({ date: "2026-11-09", min: 240, with: "Honzou" });
    const b = parseOwnRide("V sobotu pojedu 120 km ve skupině", "2026-11-08")!;
    expect(b.date).toBe("2026-11-14");
    expect(b.with).toBe("skupina");
    expect(b.min).toBeGreaterThan(240);
    expect(parseOwnRide("pozítří jedu 3:30 h", "2026-11-08")!.min).toBe(210);
  });
  it("není to jízda → null", () => {
    expect(parseOwnRide("jak jsem na tom se spánkem?", "2026-11-08")).toBeNull();
    expect(parseOwnRide("zítra nepojedu 2 h", "2026-11-08")).toBeNull();
  });
  it("plán den nechá, započítá zátěž a ostatní dny zkrátí", () => {
    const base = generatePlan(planInput({ goal: "udrzeni" }));
    const note = JSON.stringify({ min: 240, km: null, with: "Honzou" });
    const p = generatePlan(planInput({ goal: "udrzeni", constraints: [{ date: "2026-11-14", kind: "jizda", note }] }));
    const d = p.days.find((x) => x.date === "2026-11-14")!;
    expect(d.name).toBe(ownRideName({ min: 240, km: null, with: "Honzou" }));
    expect(d.durationMin).toBe(240);
    expect(d.load).toBeGreaterThan(150);
    expect(p.changes.some((c) => c.date === "2026-11-14" && c.action === "nová")).toBe(true);
    // ostatní Z2 v tom týdnu nesmí být delší než bez vlastní jízdy
    const otherMin = (x: typeof p) => x.days.filter((y) => y.date !== "2026-11-14" && y.date <= "2026-11-15" && y.kind === "z2").reduce((t, y) => t + (y.durationMin ?? 0), 0);
    expect(otherMin(p)).toBeLessThanOrEqual(otherMin(base));
  });
});

describe("Zlepšit nemá kratší jízdy než Udržet (8. kolo)", () => {
  it("přidaná jízda jen doplní, ostatní se nezkracují", () => {
    const cal = (id: number, date: string) => ({ id, date, kind: "z2" as const, quality_type: null, name: "Z2 vytrvalost", indoor: 0, duration_min: 75, steps_json: null, steps_text: null, target_load: 80, reason: null, status: "planned", sport: "ride", goal: "zvyseni" });
    const constraints = [{ date: "2026-11-09", kind: "sport" as const, note: "ride" }, { date: "2026-11-11", kind: "sport" as const, note: "ride" }, { date: "2026-11-10", kind: "sport" as const, note: "run" }, { date: "2026-11-13", kind: "sport" as const, note: "run" }];
    const mins = (goal: PlanInput["goal"]) => { const p = generatePlan(planInput({ goal, calendar: [cal(1, "2026-11-10"), cal(2, "2026-11-13")], constraints })); return ["2026-11-09", "2026-11-11"].map((d) => p.days.find((x) => x.date === d)!.durationMin ?? 0); };
    const z = mins("zvyseni"), u = mins("udrzeni"), p = mins("pokles");
    for (let i = 0; i < 2; i++) { expect(z[i]!).toBeGreaterThanOrEqual(u[i]!); expect(u[i]!).toBeGreaterThanOrEqual(p[i]!); }
  });
});
