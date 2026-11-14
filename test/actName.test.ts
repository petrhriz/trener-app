// Název aktivity podle naplánovaného tréninku → jednotný tvar „místo + druh“ (jako Garmin bez plánu).
import { describe, expect, it } from "vitest";
import { PLAN_NAME_SQL, garminLikeName } from "../src/core/actName";

describe("název aktivity ze spárovaného tréninku", () => {
  it("místo - trénink → místo + druh", () => {
    expect(garminLikeName("Hostomice - Z2 vytrvalost 2h", "ride", "Z2 vytrvalost 2h")).toBe("Hostomice Silniční cyklistika");
    expect(garminLikeName("Hostomice - Trenažér – Z2", "indoor", "Trenažér – Z2")).toBe("Hostomice Cyklistika v interiéru");
  });
  it("Garmin název tréninku zkrátil – pořád se pozná", () => {
    expect(garminLikeName("Hostomice - Z2 ", "ride", "Z2 vytrvalost")).toBe("Hostomice Silniční cyklistika");
  });
  it("vlastní název nebo bez plánu zůstává", () => {
    expect(garminLikeName("Praha - Brno", "ride", "Z2 vytrvalost")).toBe("Praha - Brno");
    expect(garminLikeName("Hostomice - Z2 vytrvalost", "ride", null)).toBe("Hostomice - Z2 vytrvalost");
    expect(garminLikeName("Ohníč Běh", "run", "Běh – Z2")).toBe("Ohníč Běh");
  });
  it("SQL mění jen spárované aktivity a zná všechny druhy", () => {
    expect(PLAN_NAME_SQL).toMatch(/^UPDATE activities SET name = /);
    expect(PLAN_NAME_SQL).toContain("json_extract(icu_event, '$.name') IS NOT NULL");
    expect(PLAN_NAME_SQL).toContain("WHEN 'mtb' THEN 'Horská cyklistika'");
  });
});
