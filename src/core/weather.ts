// Počasí z Open-Meteo (náhrada AccuWeather, kap. 8) + nejlepší 3hodinové okno na jízdu.
import { num } from "../lib/format";

export interface Hour {
  time: string; // 'YYYY-MM-DDTHH:00' místní
  temp: number | null;
  feels: number | null;
  precip_prob: number | null;
  precip: number | null;
  gust: number | null;
  wind: number | null;
  code: number | null;
}

export interface DayWeather {
  date: string;
  tmax: number;
  tmin: number;
  rainProb: number;
  rainSum: number;
  gustMax: number;
  rain: boolean;
  gusty: boolean;
  frost: boolean;
  bad: boolean;
  /** hodiny 7–20 (v létě od rozednění, nejdřív 4 h): zelená = srážky ≤ 30 %, nárazy ≤ 40 km/h, teplota vzduchu mezi tvými hranicemi (výchozí 3–30 °C), za světla */
  hours: { h: number; green: boolean; kind?: HourKind; why?: string; temp: number | null; prob: number | null; gust: number | null; feels: number | null; precip: number | null; code?: number | null }[];
  window: { from: number; to: number } | null;
  text: string;
  /** typický kód počasí přes den (WMO, Open-Meteo) – pro ikonu */
  code: number | null;
}

/**
 * Osobní hranice počasí (Nastavení): teplota vzduchu, kdy ještě / už jezdíš, a ideální teplota pro okno.
 * Teplota vzduchu, ne pocitová: pocitová se počítá pro stojícího člověka hlavně z větru – na kole ofukuje vlastní
 * rychlost a vítr se hlídá zvlášť (nárazy), takže by se počítal dvakrát.
 */
export interface RideTemps {
  cold: number;
  hot: number;
  ideal: number;
}
export const DEFAULT_TEMPS: RideTemps = { cold: 3, hot: 30, ideal: 18 };

/** ok = vhodné · cool = chladné ráno / večer v teplém dni (oblečení na celou jízdu nesedí) · cold · hot · rain · wind · dark = tma */
export type HourKind = "ok" | "cool" | "cold" | "hot" | "rain" | "wind" | "dark";

/** Východ a západ slunce dne (místní čas „HH:MM“, Open-Meteo). */
export interface SunDay {
  rise: string | null;
  set: string | null;
}

/** Po západu je ještě asi 30–40 min občanský soumrak (u nás) → jízda může skončit nejpozději 30 min po západu
 *  a začít nejdřív 30 min před východem. Hodina h = jízda h:00–(h+1):00. */
export const TWILIGHT_H = 0.5;
const hm = (s: string | null) => (s && /^\d{2}:\d{2}$/.test(s) ? +s.slice(0, 2) + +s.slice(3, 5) / 60 : null);
export function darkWhy(h: number, sun: SunDay | null | undefined): string | null {
  const rise = hm(sun?.rise ?? null), set = hm(sun?.set ?? null);
  if (set != null && h + 1 > set + TWILIGHT_H) return `tma (západ ${sun!.set})`;
  if (rise != null && h < rise - TWILIGHT_H) return `tma (východ ${sun!.rise})`;
  return null;
}

const DAY_FROM = 7;
const DAY_TO = 20;

const hourOf = (t: string) => +t.slice(11, 13);

export function isGreen(h: Pick<Hour, "precip_prob" | "gust" | "temp">, t: RideTemps = DEFAULT_TEMPS): boolean {
  return (h.precip_prob ?? 100) <= 30 && (h.gust ?? 99) <= 40 && (h.temp ?? -99) >= t.cold && (h.temp ?? 99) <= t.hot;
}

/**
 * Druh hodiny. Navíc „chladno“ relativně ke dni: když den vystoupá o 8+ °C nad danou hodinu a je teplý (≥ 18 °C),
 * je ranní / večerní hodina sice jezditelná, ale oblečení na začátek pak nesedí (ráno nabalený, v 10 h vedro).
 */
export function hourKind(h: Pick<Hour, "precip_prob" | "gust" | "temp">, dayMax: number | null, t: RideTemps = DEFAULT_TEMPS): { kind: HourKind; why: string } {
  if ((h.precip_prob ?? 100) > 30) return { kind: "rain", why: `déšť ${num(h.precip_prob)} %` };
  if ((h.gust ?? 99) > 40) return { kind: "wind", why: `nárazy ${num(h.gust)} km/h` };
  if ((h.temp ?? -99) < t.cold) return { kind: "cold", why: `${num(h.temp)} °C (pod ${num(t.cold)} °C)` };
  if ((h.temp ?? 99) > t.hot) return { kind: "hot", why: `${num(h.temp)} °C (nad ${num(t.hot)} °C)` };
  if (dayMax != null && h.temp != null && dayMax >= t.ideal && dayMax - h.temp >= 8) return { kind: "cool", why: `chladno ${num(h.temp)} °C, přes den až ${num(dayMax)} °C` };
  return { kind: "ok", why: "vhodné" };
}

export function dayWeather(all: Hour[], date: string, t: RideTemps = DEFAULT_TEMPS, sun?: SunDay | null): DayWeather | null {
  const dayAll = all.filter((h) => h.time.startsWith(date));
  // brzký východ (léto): okna i před 7. hodinou, od 30 min před východem; večer v Česku světlo končí do 21:30
  const rise = hm(sun?.rise ?? null);
  const from = rise != null ? Math.max(4, Math.min(DAY_FROM, Math.ceil(rise - TWILIGHT_H))) : DAY_FROM;
  const day = dayAll.filter((h) => hourOf(h.time) >= from && hourOf(h.time) <= DAY_TO);
  if (day.length < 10) return null; // předpověď den nepokrývá
  const night = dayAll.filter((h) => hourOf(h.time) <= 8);
  const vals = (arr: Hour[], k: keyof Hour) => arr.map((h) => h[k]).filter((x): x is number => typeof x === "number");
  const temps = vals(dayAll, "temp");
  const tmax = Math.max(...temps);
  const tmin = Math.min(...temps);
  const rainProb = Math.max(0, ...vals(day, "precip_prob"));
  const rainSum = Math.round(vals(day, "precip").reduce((a, b) => a + b, 0) * 10) / 10;
  const gustMax = Math.round(Math.max(0, ...vals(day, "gust")));
  const nightTemps = vals(night, "temp");
  const frost = nightTemps.length > 0 && Math.min(...nightTemps) < 0;
  const rain = rainProb >= 50 && rainSum >= 1;
  const gusty = gustMax > 40;
  const dayMax = Math.max(...vals(day, "temp"));
  const hours = day.map((h) => {
    const dark = darkWhy(hourOf(h.time), sun);
    return {
      h: hourOf(h.time),
      green: !dark && isGreen(h, t),
      ...(dark ? { kind: "dark" as HourKind, why: dark } : hourKind(h, isFinite(dayMax) ? dayMax : null, t)),
      temp: h.temp,
      prob: h.precip_prob,
      gust: h.gust,
      feels: h.feels,
      precip: h.precip,
      code: h.code,
    };
  });
  const window = bestWindow(hours, t);
  const parts: string[] = [`${num(tmax)} / ${num(tmin)} °C`];
  if (rain) parts.push(`déšť ${num(rainProb)} % (${num(rainSum, 1)} mm)`);
  else if (rainSum >= 0.2 || rainProb >= 30) parts.push(`slabé srážky ${num(rainProb)} % (${num(rainSum, 1)} mm)`);
  else parts.push("sucho");
  parts.push(`nárazy ${num(gustMax)} km/h`);
  if (frost) parts.push("mráz ráno, riziko náledí");
  return { code: dayCode(day), date, tmax, tmin, rainProb, rainSum, gustMax, rain, gusty, frost, bad: rain || gusty || frost, hours, window, text: parts.join(", ") };
}

/**
 * Nejlepší okno 3 po sobě jdoucích zelených hodin: teplota vzduchu co nejblíž tvé ideální (ne nejtepleji –
 * v létě by vyšlo poledne ve vedru), malý rozdíl teplot během jízdy (jedno oblečení), málo srážek a větru.
 */
export function bestWindow(hours: DayWeather["hours"], t: RideTemps = DEFAULT_TEMPS): { from: number; to: number } | null {
  let best: { from: number; to: number; score: number } | null = null;
  for (let i = 0; i + 2 < hours.length; i++) {
    const w = hours.slice(i, i + 3);
    if (!w.every((x) => x.green)) continue;
    if (w[2]!.h - w[0]!.h !== 2) continue;
    const ts = w.map((x) => x.temp ?? t.ideal);
    const swing = Math.max(...ts) - Math.min(...ts);
    const score = w.reduce((s, x) => s - Math.abs((x.temp ?? t.ideal) - t.ideal) - (x.prob ?? 0) / 10 - (x.gust ?? 0) / 10 - (x.kind === "cool" ? 4 : 0), 0) - swing;
    if (!best || score > best.score) best = { from: w[0]!.h, to: w[2]!.h + 1, score };
  }
  return best ? { from: best.from, to: best.to } : null;
}

export function windowText(w: DayWeather | null): string {
  if (!w) return "bez předpovědi";
  if (!w.window) return "žádné 3h okno";
  const p = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${p(w.window.from)}–${p(w.window.to)}`;
}

/**
 * Typické počasí dne z hodinových kódů WMO (8–18 h): bouřka, když je aspoň 1 h; sníh / déšť, když aspoň 2–3 h;
 * jinak nejčastější oblačnost (jasno / polojasno / zataženo / mlha).
 */
export function dayCode(day: Pick<Hour, "time" | "code">[]): number | null {
  const c = day.filter((h) => hourOf(h.time) >= 8 && hourOf(h.time) <= 18).map((h) => h.code).filter((x): x is number => typeof x === "number");
  if (!c.length) return null;
  const n = (f: (x: number) => boolean) => c.filter(f).length;
  if (n((x) => x >= 95)) return Math.max(...c);
  const snow = c.filter((x) => (x >= 71 && x <= 77) || x === 85 || x === 86);
  if (snow.length >= 2) return Math.max(...snow);
  const rain = c.filter((x) => (x >= 51 && x <= 67) || (x >= 80 && x <= 82));
  if (rain.length >= 3) return Math.max(...rain);
  const cnt = new Map<number, number>();
  for (const x of c) { const k = x <= 1 ? 0 : x === 2 ? 2 : x === 3 ? 3 : x >= 45 && x <= 48 ? 45 : x; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}
