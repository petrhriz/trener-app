// Vlastník prohlíží jiný účet: cookie kad_as platí jen s plným přihlášením vlastníka.
import { describe, expect, it } from "vitest";
import { viewAsOf } from "../src/api/session";

describe("prohlížení jiného účtu (vlastník)", () => {
  const owner = { uid: 1, ro: false };
  it("vlastník s cookie prohlíží daný účet", () => {
    expect(viewAsOf(owner, "kad_s=abc; kad_as=3")).toBe(3);
    expect(viewAsOf(owner, "kad_as=2")).toBe(2);
  });
  it("jiný uživatel ani náhledový odkaz cookie nevyužije", () => {
    expect(viewAsOf({ uid: 2, ro: false }, "kad_as=3")).toBeNull();
    expect(viewAsOf({ uid: 1, ro: true }, "kad_as=3")).toBeNull();
    expect(viewAsOf(null, "kad_as=3")).toBeNull();
  });
  it("bez cookie, s vlastním id nebo nesmyslem = vlastní účet", () => {
    expect(viewAsOf(owner, "kad_s=abc")).toBeNull();
    expect(viewAsOf(owner, "kad_as=1")).toBeNull();
    expect(viewAsOf(owner, "kad_as=x")).toBeNull();
    expect(viewAsOf(owner, "xkad_as=3")).toBeNull();
  });
});
