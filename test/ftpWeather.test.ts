// Cíle se liší i po slabších týdnech, kontrola FTP, osobní počasí, vlastní jízda.
import { describe, expect, it } from "vitest";
import { ftpCheck } from "../src/core/ftpCheck";
import { bestWindow, dayWeather, hourKind, type Hour } from "../src/core/weather";



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



