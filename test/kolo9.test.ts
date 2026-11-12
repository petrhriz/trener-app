// 9. kolo: FTP a zóny s datem platnosti.
import { describe, expect, it } from "vitest";
import { type HrZones, type ZoneHistRow, ftpChanges, zonesAt, zonesChanged } from "../src/core/zones";
import { efficiency } from "../src/core/analytics";

const hzA: HrZones = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 55 };
const hzB: HrZones = { floors: [55, 130, 160, 180, 198], max: 204, lthr: 190, rest: 55 };
const today = { ftp: 298, hr: hzA };

describe("zóny s datem platnosti", () => {
  const hist: ZoneHistRow[] = [
    { date: "2025-09-04", ftp: 250, hr: null },
    { date: "2026-03-01", ftp: null, hr: hzB },
    { date: "2026-09-26", ftp: 298, hr: null },
  ];
  it("hodnota platná v den aktivity; FTP a tep se hledají každý zvlášť", () => {
    expect(zonesAt(hist, "2026-08-10", today)).toEqual({ ftp: 250, hr: hzB });
    expect(zonesAt(hist, "2026-09-26", today).ftp).toBe(298);
    expect(zonesAt(hist, "2025-12-01", today)).toEqual({ ftp: 250, hr: hzB }); // tep před prvním záznamem = nejstarší známý
  });
  it("před historií nejstarší známá hodnota, bez historie dnešní nastavení", () => {
    expect(zonesAt(hist, "2020-05-01", today).ftp).toBe(250);
    expect(zonesAt([], "2020-05-01", today)).toEqual(today);
  });
  it("body FTP z jízd → jen změny; ±2 W není další změna, ale upraví číslo", () => {
    const pts = [["2025-09-04", 250], ["2025-10-01", 250], ["2026-09-26", 297], ["2026-09-27", 298], ["2026-10-02", 298], ["2025-09-10", 251]].map(([date, ftp]) => ({ date: date as string, ftp: ftp as number }));
    expect(ftpChanges(pts)).toEqual([{ date: "2025-09-04", ftp: 250 }, { date: "2026-09-26", ftp: 298 }]);
  });
  it("nový řádek jen při skutečné změně (klidový tep změnu zón nedělá)", () => {
    expect(zonesChanged([], "2026-11-12", today)).toEqual({ ftp: true, hr: true });
    const h: ZoneHistRow[] = [{ date: "2026-09-26", ftp: 298, hr: hzA }];
    expect(zonesChanged(h, "2026-11-12", { ftp: 298, hr: { ...hzA, rest: 50 } })).toEqual({ ftp: false, hr: false });
    expect(zonesChanged(h, "2026-11-12", { ftp: 305, hr: hzA })).toEqual({ ftp: true, hr: false });
  });
  it("EF: lehká jízda se pozná podle FTP platného v den jízdy", () => {
    // NP 200: při FTP 250 je IF 0,8 (není lehká), při dnešním 298 by vyšlo 0,67 (lehká)
    const act = (date: string) => ({ id: date, date, sport: "ride", moving_s: 3600, np: 200, avg_power: 190, avg_hr: 140, if_garmin: null, name: null });
    const acts = [act("2026-05-01"), act("2026-05-08"), act("2026-10-01"), act("2026-10-08")] as any;
    expect(efficiency(acts, 298).points.length).toBe(4);
    expect(efficiency(acts, (d) => zonesAt([{ date: "2025-09-04", ftp: 250, hr: null }, { date: "2026-09-26", ftp: 298, hr: null }], d, today).ftp).points.length).toBe(2);
  });
});
