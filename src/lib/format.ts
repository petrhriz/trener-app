// Formát čísel podle pravidel: desetinná čárka, mezera před jednotkou, záporná čísla s „−“.
import { dow } from "./time";

export const DASH = "–";
const MINUS = "−";

export function num(x: number | null | undefined, dec = 0): string {
  if (x == null || !Number.isFinite(x)) return DASH;
  const r = Math.abs(x).toFixed(dec).replace(".", ",");
  const isZero = Number(Math.abs(x).toFixed(dec)) === 0;
  return x < 0 && !isZero ? MINUS + r : r;
}

export function signed(x: number | null | undefined, dec = 0): string {
  if (x == null || !Number.isFinite(x)) return DASH;
  const isZero = Number(Math.abs(x).toFixed(dec)) === 0;
  if (isZero) return num(0, dec);
  return x > 0 ? "+" + num(x, dec) : num(x, dec);
}

export function unit(x: number | null | undefined, u: string, dec = 0): string {
  return x == null || !Number.isFinite(x) ? DASH : `${num(x, dec)} ${u}`;
}

const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAYS_LONG = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];

/** '2026-10-23' -> '23.10.' */
export function dm(date: string): string {
  return `${+date.slice(8, 10)}.${+date.slice(5, 7)}.`;
}
export function dayShort(date: string): string {
  return DAYS[dow(date) - 1]!;
}
export function dayLong(date: string): string {
  return DAYS_LONG[dow(date) - 1]!;
}
/** 'Pá 23.10.' */
export function dayDm(date: string): string {
  return `${dayShort(date)} ${dm(date)}`;
}

/** h:mm (zpráva) */
export function hmm(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** h:mm:ss, pod hodinu m:ss (tabulky) */
export function hms(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** čas v zóně: pod 60 s „25 s“; do 59:59 „m:ss“; od 1 h „h:mm:ss“ */
export function zoneTime(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  return hms(sec);
}

/** % v zónách: celé číslo, pod 1 % jedno desetinné místo */
export function zonePct(p: number): string {
  if (p <= 0) return DASH;
  return p < 1 ? `${num(p, 1)} %` : `${num(p, 0)} %`;
}

/** spánek „7:12 h“ */
export function sleepH(sec: number | null | undefined): string {
  return sec == null ? DASH : `${hmm(sec)} h`;
}

/** minuty -> „1:30“ */
export function minHm(min: number): string {
  return `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;
}

/** watty – rozsah „120–170 W“ */
export function wRange(lo: number, hi: number): string {
  return `${lo}–${hi} W`;
}
