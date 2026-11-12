// AI shrnutí na pozadí: klíč se mění jen s novými daty (a u Přehledu s částí dne), ne každé 3 hodiny.
import { describe, expect, it } from "vitest";
import { noteKey } from "../src/report/aiBackground";

const ctx = (hh: number, acts = 3, sleep = true) => ({ T: "2026-11-12", now: { hh } as any, acts: Array.from({ length: acts }, (_x, i) => ({ id: `a${i}` })) as any, well: [{ date: "2026-11-12", sleep_s: sleep ? 25000 : null, hrv: 50 }] as any });

describe("klíč AI shrnutí stránky", () => {
  it("stejná data = stejný klíč celý den (Trenér, Zotavení)", () => {
    expect(noteKey("trener", ctx(8))).toBe(noteKey("trener", ctx(16)));
  });
  it("nová aktivita nebo ranní spánek = nový klíč", () => {
    expect(noteKey("trener", ctx(8, 4))).not.toBe(noteKey("trener", ctx(8, 3)));
    expect(noteKey("zotaveni", ctx(8, 3, false))).not.toBe(noteKey("zotaveni", ctx(8, 3, true)));
  });
  it("Přehled: ráno / odpoledne / večer zvlášť", () => {
    expect(new Set([7, 13, 20].map((h) => noteKey("prehled", ctx(h)))).size).toBe(3);
    expect(noteKey("prehled", ctx(7))).toBe(noteKey("prehled", ctx(11)));
  });
});
