// Vlastní jízda: „zítra jedu projížďku 4 h“, „v sobotu pojedu 120 km s Honzou“ → pevný den v plánu,
// ostatní dny týdne se dopočítají (zátěž jízdy se započítá do týdenního cíle).
// Pozor na \b: v JS bere jako písmena jen A–Z, takže u slov s diakritikou (pondělí, úterý) nefunguje –
// hranice slova se proto hlídá přes (?<!\p{L}) … (?!\p{L}) s příznakem u.
import { addDays, dow } from "../lib/time";

export interface OwnRide {
  /** délka v minutách */
  min: number;
  km: number | null;
  /** s kým (null = sám) */
  with: string | null;
}

// celé názvy dnů; zkratky („po“, „ne“, „st“…) jen s předložkou („v po“, „ve st“) – samotné „po“ je i „po obědě“
const DAY_WORDS: [RegExp, number][] = [
  [/(?<!\p{L})(?:pond[eě]l[ií]|v\s+po)(?!\p{L})/u, 1],
  [/(?<!\p{L})(?:[uú]ter[yý]|v\s+[uú]t)(?!\p{L})/u, 2],
  [/(?<!\p{L})(?:st[rř]ed[uay]|ve\s+st)(?!\p{L})/u, 3],
  [/(?<!\p{L})(?:[cč]tvrt(?:ek|ka|ku)|ve\s+[cč]t)(?!\p{L})/u, 4],
  [/(?<!\p{L})(?:p[aá]tek|p[aá]tk[uy]|v\s+p[aá])(?!\p{L})/u, 5],
  [/(?<!\p{L})(?:sobot[uay]|v\s+so)(?!\p{L})/u, 6],
  [/(?<!\p{L})(?:ned[eě]l[ieu]|v\s+ne)(?!\p{L})/u, 7],
];

/** den z textu (dnes, zítra, pozítří, v sobotu, 21. 11.) – vždy dnes nebo později */
export function dayFromText(t: string, T: string): string | null {
  if (/(?<!\p{L})dnes(?!\p{L})/u.test(t)) return T;
  if (/poz[ií]t[rř][ií]/u.test(t)) return addDays(T, 2);
  if (/z[ií]tra/u.test(t)) return addDays(T, 1);
  // datum „21. 11.“ / „21.11“ – ne desetinné číslo délky („2.5 h“)
  for (const m of t.matchAll(/(?<![\d.,])(\d{1,2})\.\s*(\d{1,2})(\.)?(?![\d,])/g)) {
    const day = +m[1]!, mon = +m[2]!;
    const rest = t.slice(m.index! + m[0].length);
    if (!m[3] && /^\s*(h(?!\p{L})|hod|min)/u.test(rest)) continue;
    if (day < 1 || day > 31 || mon < 1 || mon > 12) continue;
    let d = `${T.slice(0, 4)}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (d < T) d = `${+T.slice(0, 4) + 1}${d.slice(4)}`;
    return d;
  }
  // den v týdnu: když jich je víc, rozhoduje první v textu
  let best: { at: number; wd: number } | null = null;
  for (const [re, wd] of DAY_WORDS) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.at)) best = { at: m.index, wd };
  }
  return best ? addDays(T, (best.wd - dow(T) + 7) % 7) : null;
}

/**
 * Rozpozná vlastní jízdu ve volném textu. Potřebuje sloveso jízdy, den a délku (hodiny, minuty nebo km).
 * Km bez času → odhad 25 km/h. Vrací null, když to vlastní jízda není.
 */
export function parseOwnRide(text: string, T: string): ({ date: string } & OwnRide) | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  if (!/(jedu|pojedu|jedeme|pojedeme|vyr[aá][zž][ií]m|vyr[aá][zž][ií]me|projížď|projizd|vyjížď|vyjizd|m[aá]m (v pl[aá]nu )?trasu|pl[aá]nuju (jet|jízdu|jizdu))/u.test(t)) return null;
  if (/(?<!\p{L})(nepojedu|nejedu|nepojedeme)(?!\p{L})/u.test(t)) return null;
  const date = dayFromText(t, T);
  if (!date) return null;
  let min: number | null = null;
  const h = /(?<![\d:.,])(\d+(?:[.,]\d+)?)\s*(?:h(?!\p{L})|hod|hodin)/u.exec(t);
  const mm = /(\d{2,3})\s*min/u.exec(t);
  // „3:30“ jako délka jen bez výslovných hodin a ne jako čas startu („v 9:00“, „od 8:30“)
  const hm = /(\d{1,2}):(\d{2})(\s*h(?!\p{L}))?/u.exec(t);
  const isStart = hm && !hm[3] && /(?:^|\s)(v|ve|od|kolem|start|startujeme|sraz)\s*$/u.test(t.slice(0, hm.index));
  if (hm && hm[3] && +hm[1]! <= 12) min = +hm[1]! * 60 + +hm[2]!; // „3:30 h“ = výslovně délka
  else if (h) min = Math.round(parseFloat(h[1]!.replace(",", ".")) * 60);
  else if (hm && !isStart && +hm[1]! <= 12) min = +hm[1]! * 60 + +hm[2]!;
  if (mm) min = (min ?? 0) + +mm[1]!;
  const kmM = /(\d{2,3})\s*km/u.exec(t);
  const km = kmM ? +kmM[1]! : null;
  if (min == null && km) min = Math.round((km / 25) * 60 / 15) * 15;
  if (min == null || min < 20 || min > 12 * 60) return null;
  let withWho: string | null = null;
  if (/(ve skupin|se skupinou|s part[aou]|s kamar[aá]d|s kluky|s klukama|s par[tť][aá]k|grupet)/u.test(t)) withWho = "skupina";
  const w = /(?<!\p{L})s[e]?\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)/u.exec(text);
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
