// Workout jako FIT soubor (záloha bez intervals.icu): nahraje se do cyklopočítače Garmin přes USB do Garmin/NewFiles.
import { stripDiacritics, type Workout } from "../core/workout";

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, crc = 0): number {
  for (let i = start; i < end; i++) {
    const b = bytes[i]!;
    let tmp = CRC_TABLE[crc & 0xf]!;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf]!;
    tmp = CRC_TABLE[crc & 0xf]!;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf]!;
  }
  return crc;
}

type BaseType = "enum" | "uint8" | "uint16" | "uint32" | "uint32z" | "string";
const BT: Record<BaseType, number> = { enum: 0x00, uint8: 0x02, uint16: 0x84, uint32: 0x86, uint32z: 0x8c, string: 0x07 };
const SIZE: Record<Exclude<BaseType, "string">, number> = { enum: 1, uint8: 1, uint16: 2, uint32: 4, uint32z: 4 };

interface FieldDef {
  num: number;
  type: BaseType;
  size?: number; // pro string
}

class Writer {
  buf: number[] = [];
  u8(v: number) {
    this.buf.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v);
    this.u8(v >> 8);
  }
  u32(v: number) {
    this.u16(v & 0xffff);
    this.u16((v >>> 16) & 0xffff);
  }
  str(s: string, size: number) {
    const b = new TextEncoder().encode(stripDiacritics(s)).slice(0, size - 1);
    for (let i = 0; i < size; i++) this.u8(i < b.length ? b[i]! : 0);
  }
  define(local: number, global: number, fields: FieldDef[]) {
    this.u8(0x40 | local);
    this.u8(0);
    this.u8(0); // little endian
    this.u16(global);
    this.u8(fields.length);
    for (const f of fields) {
      this.u8(f.num);
      this.u8(f.type === "string" ? f.size! : SIZE[f.type]);
      this.u8(BT[f.type]);
    }
  }
  data(local: number, fields: FieldDef[], values: (number | string)[]) {
    this.u8(local);
    fields.forEach((f, i) => {
      const v = values[i]!;
      if (f.type === "string") this.str(String(v), f.size!);
      else if (SIZE[f.type] === 1) this.u8(Number(v));
      else if (SIZE[f.type] === 2) this.u16(Number(v));
      else this.u32(Number(v));
    });
  }
}

// FIT konstanty
const DUR_TIME = 0;
const DUR_OPEN = 5;
const DUR_REPEAT = 6;
const TGT_HR = 1;
const TGT_OPEN = 2;
const TGT_POWER = 4;
const INT = { active: 0, rest: 1, warmup: 2, cooldown: 3 };

export function encodeWorkoutFit(name: string, w: Workout, created = new Date()): Uint8Array {
  // rozbalení bloků na kroky FIT
  type FStep = { name: string; durType: number; durVal: number; tgtType: number; tgtVal: number; lo: number; hi: number; intensity: number };
  const steps: FStep[] = [];
  for (const b of w.blocks) {
    const startIdx = steps.length;
    b.steps.forEach((s, i) => {
      const isRestInRep = (b.reps ?? 1) > 1 && i > 0;
      const intensity = b.kind === "warmup" ? INT.warmup : b.kind === "cooldown" ? INT.cooldown : b.kind === "pause" || isRestInRep ? INT.rest : INT.active;
      const hrZone = s.hr ? Number(/Z(\d)/.exec(s.hr)?.[1] ?? 2) : 0;
      steps.push({
        name: b.label,
        durType: s.lap ? DUR_OPEN : DUR_TIME,
        durVal: s.lap ? 0 : s.dur_s * 1000,
        tgtType: s.hr ? TGT_HR : s.lo != null ? TGT_POWER : TGT_OPEN,
        tgtVal: s.hr ? hrZone : 0,
        lo: s.lo != null ? s.lo + 1000 : 0,
        hi: s.hi != null ? s.hi + 1000 : 0,
        intensity,
      });
    });
    if ((b.reps ?? 1) > 1) {
      steps.push({ name: `${b.label} ${b.reps}x`, durType: DUR_REPEAT, durVal: startIdx, tgtType: TGT_OPEN, tgtVal: b.reps!, lo: 0, hi: 0, intensity: INT.active });
    }
  }

  const wr = new Writer();
  const fileId: FieldDef[] = [
    { num: 0, type: "enum" },
    { num: 1, type: "uint16" },
    { num: 2, type: "uint16" },
    { num: 3, type: "uint32z" },
    { num: 4, type: "uint32" },
  ];
  wr.define(0, 0, fileId);
  const ts = Math.floor(created.getTime() / 1000) - FIT_EPOCH;
  wr.data(0, fileId, [5, 255, 0, (ts % 0xfffffff) + 1, ts]);

  const wkt: FieldDef[] = [
    { num: 4, type: "enum" },
    { num: 6, type: "uint16" },
    { num: 8, type: "string", size: 32 },
  ];
  wr.define(1, 26, wkt);
  wr.data(1, wkt, [2, steps.length, name]);

  const st: FieldDef[] = [
    { num: 254, type: "uint16" },
    { num: 0, type: "string", size: 16 },
    { num: 1, type: "enum" },
    { num: 2, type: "uint32" },
    { num: 3, type: "enum" },
    { num: 4, type: "uint32" },
    { num: 5, type: "uint32" },
    { num: 6, type: "uint32" },
    { num: 7, type: "enum" },
  ];
  wr.define(2, 27, st);
  steps.forEach((s, i) => wr.data(2, st, [i, s.name, s.durType, s.durVal, s.tgtType, s.tgtVal, s.lo, s.hi, s.intensity]));

  const data = Uint8Array.from(wr.buf);
  const header = new Uint8Array(14);
  const dv = new DataView(header.buffer);
  header[0] = 14;
  header[1] = 0x20;
  dv.setUint16(2, 2132, true);
  dv.setUint32(4, data.length, true);
  header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  dv.setUint16(12, fitCrc(header, 0, 12), true);
  const out = new Uint8Array(14 + data.length + 2);
  out.set(header, 0);
  out.set(data, 14);
  const crc = fitCrc(out, 0, 14 + data.length);
  out[14 + data.length] = crc & 0xff;
  out[15 + data.length] = crc >> 8;
  return out;
}
