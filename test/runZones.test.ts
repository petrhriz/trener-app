import { describe, expect, it } from "vitest";
import { buildWorkout } from "../src/core/coach/library";
import { zonesFor } from "../src/lib/zoneHistory";

// Zóny tepu z Garminu (heartRateZones/v2): kolo a běh mají jiné hranice; čas v zónách u běhu Garmin počítá podle RUNNING
const ride = { floors: [112, 135, 163, 182, 200], max: 204, lthr: 196, rest: 48 };
const run = { floors: [112, 157, 173, 182, 194], max: 204, lthr: 196, rest: 48 };

describe("běžecké zóny tepu z Garminu", () => {
  it("zonesFor předá běžecké zóny z nastavení", () => {
    const z = zonesFor([], "2026-11-16", { ftp: 298, hr_zones: { ...ride, source: "garmin" }, hr_zones_run: { ...run, source: "garmin" } });
    expect(z.hrRun?.floors).toEqual(run.floors);
    expect(z.hr?.floors).toEqual(ride.floors);
  });

  it("bez běžeckých zón v nastavení je hrRun null", () => {
    expect(zonesFor([], "2026-11-16", { ftp: 298, hr_zones: { ...ride, source: "garmin" } }).hrRun).toBeNull();
  });

  it("běžecký trénink bere zóny z Garminu, ne dopočet z prahu", () => {
    const b = (zones: Parameters<typeof buildWorkout>[0]["zones"]) =>
      JSON.stringify(buildWorkout({ sport: "run", family: "end", level: 0, wid: null, minutes: 50, indoor: false, zones }).workout);
    const withRun = b({ ftp: 298, hr: ride, hrRun: run });
    // výsledek nezávisí na zónách kola, když jsou běžecké k dispozici
    expect(b({ ftp: 298, hr: { ...ride, floors: [100, 120, 140, 160, 180] }, hrRun: run })).toBe(withRun);
    // a liší se od dopočtu z prahu (runHrZones), který se použije jen bez běžeckých zón
    expect(b({ ftp: 298, hr: ride })).not.toBe(withRun);
  });
});
