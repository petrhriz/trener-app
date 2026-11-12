// Rychlé čtení jednoho údaje z FIT souboru aktivity bez celého FIT SDK (Worker má 10 ms CPU).
// Garmin Personal API VO2max nevrací a intervals.icu ho bere jen z některých aktivit → čteme ho z FIT:
// nedokumentovaná zpráva 140 („activity metrics“), pole 7 = VO2max × 65536 / 3,5.
// Ověřeno proti hodnotám v Garmin Connect (shoda po zaokrouhlení).

const VO2_MSG = 140;
const VO2_FIELD = 7;

/** Rozbalí první soubor ze ZIPu (Garmin download-service vrací ZIP s jedním .fit). */
export async function unzipFirst(zip: Uint8Array): Promise<Uint8Array | null> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (zip.length < 30 || dv.getUint32(0, true) !== 0x04034b50) return zip; // není ZIP → asi rovnou FIT
  const method = dv.getUint16(8, true);
  let csize = dv.getUint32(18, true);
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const start = 30 + nameLen + extraLen;
  // velikost může být až v central directory (bit 3) → vezmi ji odtud
  if (!csize || dv.getUint16(6, true) & 8) {
    for (let i = zip.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        const cd = dv.getUint32(i + 16, true);
        if (dv.getUint32(cd, true) === 0x02014b50) csize = dv.getUint32(cd + 20, true);
        break;
      }
    }
  }
  const data = zip.subarray(start, start + csize);
  if (method === 0) return data;
  if (method !== 8) return null;
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

interface Def {
  global: number;
  little: boolean;
  size: number;
  /** offset a velikost hledaného pole (nebo -1) */
  fOff: number;
  fSize: number;
}

/**
 * Projde FIT záznamy (jen hlavičky a délky, data nedekóduje) a vrátí poslední VO2max ze zprávy 140.
 * null = zpráva v souboru není (starší hodinky, aktivita bez odhadu).
 */
export function fitVo2max(fit: Uint8Array): number | null {
  if (fit.length < 14) return null;
  const dv = new DataView(fit.buffer, fit.byteOffset, fit.byteLength);
  const hdr = fit[0]!;
  const dataSize = dv.getUint32(4, true);
  let p = hdr;
  const end = Math.min(fit.length, hdr + dataSize);
  const defs: (Def | undefined)[] = new Array(16);
  let vo2: number | null = null;
  while (p < end) {
    const h = fit[p++]!;
    if (h & 0x80) {
      // compressed timestamp header → datová zpráva s lokálním typem v bitech 5–6
      const d = defs[(h >> 5) & 3];
      if (!d) return vo2;
      p += d.size;
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {
      // definice
      const little = fit[p + 1] === 0;
      const global = little ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false);
      const nf = fit[p + 4]!;
      let q = p + 5;
      let size = 0;
      let fOff = -1;
      let fSize = 0;
      for (let i = 0; i < nf; i++) {
        const num = fit[q]!;
        const sz = fit[q + 1]!;
        if (global === VO2_MSG && num === VO2_FIELD) {
          fOff = size;
          fSize = sz;
        }
        size += sz;
        q += 3;
      }
      if (h & 0x20) {
        // developer fields
        const nd = fit[q++]!;
        for (let i = 0; i < nd; i++) {
          size += fit[q + 1]!;
          q += 3;
        }
      }
      defs[local] = { global, little, size, fOff, fSize };
      p = q;
    } else {
      const d = defs[local];
      if (!d) return vo2;
      if (d.global === VO2_MSG && d.fOff >= 0 && d.fSize === 4) {
        const raw = dv.getUint32(p + d.fOff, d.little);
        if (raw !== 0xffffffff && raw > 0) {
          const v = (raw * 3.5) / 65536;
          if (v >= 15 && v <= 95) vo2 = Math.round(v * 10) / 10;
        }
      }
      p += d.size;
    }
  }
  return vo2;
}
