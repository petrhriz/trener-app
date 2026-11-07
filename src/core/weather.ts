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
  /** hodiny 7–20: zelená = srážky ≤ 30 %, nárazy ≤ 40 km/h, pocitově ≥ 3 °C */
  hours: { h: number; green: boolean; temp: number | null; prob: number | null; gust: number | null; feels: number | null; precip: number | null }[];
  window: { from: number; to: number } | null;
  text: string;
}

const DAY_FROM = 7;
const DAY_TO = 20;

const hourOf = (t: string) => +t.slice(11, 13);

export function isGreen(h: Pick<Hour, "precip_prob" | "gust" | "feels">): boolean {
  return (h.precip_prob ?? 100) <= 30 && (h.gust ?? 99) <= 40 && (h.feels ?? -99) >= 3;
}

export function dayWeather(all: Hour[], date: string): DayWeather | null {
  const dayAll = all.filter((h) => h.time.startsWith(date));
  const day = dayAll.filter((h) => hourOf(h.time) >= DAY_FROM && hourOf(h.time) <= DAY_TO);
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
  const hours = day.map((h) => ({
    h: hourOf(h.time),
    green: isGreen(h),
    temp: h.temp,
    prob: h.precip_prob,
    gust: h.gust,
    feels: h.feels,
    precip: h.precip,
  }));
  const window = bestWindow(hours);
  const parts: string[] = [`${num(tmax)} / ${num(tmin)} °C`];
  if (rain) parts.push(`déšť ${num(rainProb)} % (${num(rainSum, 1)} mm)`);
  else if (rainSum >= 0.2 || rainProb >= 30) parts.push(`slabé srážky ${num(rainProb)} % (${num(rainSum, 1)} mm)`);
  else parts.push("sucho");
  parts.push(`nárazy ${num(gustMax)} km/h`);
  if (frost) parts.push("mráz ráno, riziko náledí");
  return { date, tmax, tmin, rainProb, rainSum, gustMax, rain, gusty, frost, bad: rain || gusty || frost, hours, window, text: parts.join(", ") };
}

/** Nejlepší okno 3 po sobě jdoucích zelených hodin (nejvyšší pocitová teplota, nejmenší srážky a vítr). */
export function bestWindow(hours: DayWeather["hours"]): { from: number; to: number } | null {
  let best: { from: number; to: number; score: number } | null = null;
  for (let i = 0; i + 2 < hours.length; i++) {
    const w = hours.slice(i, i + 3);
    if (!w.every((x) => x.green)) continue;
    if (w[2]!.h - w[0]!.h !== 2) continue;
    const score = w.reduce((s, x) => s + (x.feels ?? 0) - (x.prob ?? 0) / 10 - (x.gust ?? 0) / 10, 0);
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
