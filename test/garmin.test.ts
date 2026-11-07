import { describe, expect, it } from "vitest";
import { parseTokenResponse } from "../src/datasource/garmin";

describe("parseTokenResponse", () => {
  it("čistý text", () => expect(parseTokenResponse("abc.def.ghi\n")).toBe("abc.def.ghi"));
  it("text v uvozovkách", () => expect(parseTokenResponse('"abc"')).toBe("abc"));
  it("JSON access_token", () => expect(parseTokenResponse('{"access_token":"xyz"}')).toBe("xyz"));
  it("prázdná odpověď = chyba", () => expect(() => parseTokenResponse("  ")).toThrow());
  it("neznámý JSON = chyba", () => expect(() => parseTokenResponse('{"foo":1}')).toThrow());
});
