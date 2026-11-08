// Vlastní jízda: „zítra jedu projížďku 4 h“, „v sobotu pojedu 120 km s Honzou“ → pevný den v plánu,
// ostatní dny týdne se dopočítají (zátěž jízdy se započítá do týdenního cíle).
import { addDays, dow } from "../lib/time";

export interface OwnRide {
  /** délka v minutách */
  min: number;
  km: number | null;
  /** s kým (null = sám) */
  with: string | null;
}

const DAY_WORDS: [RegExp, number][] = [
  [/\b(v\s+)?(po|pond[eě]l[ií])\b/, 1],
  [/\b(v\s+)?([uú]t|[uú]ter[yý])\b/, 2],
  [/\b(ve\s+)?(st|st[rř]ed[uay])\b/, 3],
  [/\b(ve\s+)?([cč]t|[cč]tvrt(ek|ka))\b/, 4],
  [/\b(v\s+)?(p[aá]|p[aá]tek|p[aá]tk[uy])\b/, 5],
  [/\b(v\s+)?(so|sobot[uay])\b/, 6],
  [/\b(v\s+)?(ne|ned[eě]l[ieu])\b/, 7],
];

/** den z textu (dnes, zítra, pozítří, v sobotu, 21. 11.) – vždy dnes nebo později */
export function dayFromText(t: string, T: string): string | null {
  if (/\bdnes\b/.test(t)) return T;
  if (/poz[ií]t[rř][ií]/.test(t)) return addDays(T, 2);
  if (/z[ií]tra/.test(t)) return addDays(T, 1);
  const m = /(\d{1,2})\.\s*(\d{1,2})\.?/.exec(t);
  if (m) {
    let d = `${T.slice(0, 4)}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    if (d < T) d = `${+T.slice(0, 4) + 1}${d.slice(4)}`;
    return d;
  }
  for (const [re, wd] of DAY_WORDS) if (re.test(t)) return addDays(T, (wd - dow(T) + 7) % 7);
  return null;
}

/**
 * Rozpozná vlastní jízdu ve volném textu. Potřebuje sloveso jízdy, den a délku (hodiny, minuty nebo km).
 * Km bez času → odhad 25 km/h. Vrací null, když to vlastní jízda není.
 */
export function parseOwnRide(text: string, T: string): ({ date: string } & OwnRide) | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  if (!/(jedu|pojedu|jedeme|pojedeme|vyraz[ií]m|vyraz[ií]me|projížď|projizd|vyjížď|vyjizd|m[aá]m (v pl[aá]nu )?trasu|pl[aá]nuju (jet|jízdu|jizdu))/.test(t)) return null;
  if (/\b(nepojedu|nejedu|nepojedeme)\b/.test(t)) return null;
  const date = dayFromText(t, T);
  if (!date) return null;
  let min: number | null = null;
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hod|hodin)/.exec(t);
  const hm = /(\d{1,2}):(\d{2})\s*h?/.exec(t);
  const mm = /(\d{2,3})\s*min/.exec(t);
  if (hm && +hm[1]! <= 12) min = +hm[1]! * 60 + +hm[2]!;
  else if (h) min = Math.round(parseFloat(h[1]!.replace(",", ".")) * 60);
  if (mm) min = (min ?? 0) + +mm[1]!;
  const kmM = /(\d{2,3})\s*km/.exec(t);
  const km = kmM ? +kmM[1]! : null;
  if (min == null && km) min = Math.round((km / 25) * 60 / 15) * 15;
  if (min == null || min < 20 || min > 12 * 60) return null;
  let withWho: string | null = null;
  if (/(ve skupin|se skupinou|s part[aou]|s kamar[aá]d|s kluky|s klukama|s par[tť][aá]k|grupet)/.test(t)) withWho = "skupina";
  const w = /\bs[e]?\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)/.exec(text);
  if (w && !/^(Garmin|Edge)/.test(w[1]!)) withWho = w[1]!;
  return { date, min, km, with: withWho };
}

export function ownRideNote(o: OwnRide): string {
  return JSON.stringify({ min: o.min, km: o.km, with: o.with });
}

export function readOwnRide(note: string | null): OwnRide | null {
  if (!note) return null;
  try {
    const o = JSON.parse(note) as Partial<OwnRide>;
    return typeof o.min === "number" && o.min > 0 ? { min: o.min, km: o.km ?? null, with: o.with ?? null } : null;
  } catch {
    return null;
  }
}

/** Název do plánu a kalendáře: „Vlastní jízda 4 h (s Honzou)“ */
export function ownRideName(o: OwnRide): string {
  const h = Math.floor(o.min / 60), m = o.min % 60;
  const d = h ? `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} h` : `${m} min`;
  return `Vlastní jízda ${d}${o.km ? ` · ${o.km} km` : ""}${o.with ? ` (${o.with === "skupina" ? "ve skupině" : `s ${o.with}`})` : ""}`;
}
