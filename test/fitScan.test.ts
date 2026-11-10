import { describe, expect, it } from "vitest";
import { fitVo2max } from "../src/datasource/fitScan";

/** minimální FIT: hlavička 14 B, definice zprávy 140 (pole 7, uint32) a jedna datová zpráva */
function fakeFit(raw: number): Uint8Array {
  const recs: number[] = [];
  recs.push(0x40, 0, 0, 140, 0, 2, 7, 4, 134, 0, 1, 2); // definice: lokální 0, LE, global 140, 2 pole (7: 4 B, 0: 1 B)
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, raw, true);
  recs.push(0x00, ...b, 99);
  const out = new Uint8Array(14 + recs.length + 2);
  out[0] = 14;
  new DataView(out.buffer).setUint32(4, recs.length, true);
  out.set(recs, 14);
  return out;
}

describe("fitVo2max", () => {
  it("čte zprávu 140 pole 7", () => {
    expect(fitVo2max(fakeFit(1108935))).toBe(59.2);
    expect(fitVo2max(fakeFit(1079365))).toBe(57.6);
  });
  it("neplatná hodnota → null", () => {
    expect(fitVo2max(fakeFit(0xffffffff))).toBeNull();
    expect(fitVo2max(new Uint8Array(5))).toBeNull();
  });
});
