// Datumy jako řetězce 'YYYY-MM-DD' (místní den v Europe/Prague). Aritmetika přes UTC poledne – bez problémů s DST.

export interface LocalNow {
  date: string;
  hh: number;
  mm: number;
  minutes: number; // od půlnoci
  dow: number; // 1 = Po … 7 = Ne
  iso: string; // 'YYYY-MM-DDTHH:MM'
}

export function localNow(d: Date = new Date(), tz = "Europe/Prague"): LocalNow {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const hh = Number(p.hour);
  const mm = Number(p.minute);
  return { date, hh, mm, minutes: hh * 60 + mm, dow: dow(date), iso: `${date}T${p.hour}:${p.minute}` };
}

const toUtc = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12);
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * 86400_000);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400_000);
}

/** 1 = pondělí … 7 = neděle */
export function dow(date: string): number {
  const d = new Date(toUtc(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - dow(date));
}

export function month(date: string): number {
  return +date.slice(5, 7);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 'HH:MM' -> minuty */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
