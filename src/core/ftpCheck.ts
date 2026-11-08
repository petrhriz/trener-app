// Kdy doporučit FTP test: FTP určuje zóny výkonu, cíle intervalů a zátěž nových tréninků.
// Čistá funkce – vstup: FTP, odhad eFTP z jízd, nejlepší 20 min za 6 týdnů, kdy bylo FTP naposledy změněno.
import { addDays } from "../lib/time";

export interface FtpCheckInput {
  today: string;
  ftp: number | null;
  /** eFTP intervals.icu (nebo náš odhad z 20 min × 0,95) */
  eftp: { w: number; date: string } | null;
  /** nejlepší 20min výkon za 42 dní */
  best20: { w: number; date: string } | null;
  /** datum poslední změny FTP (null = nevím) */
  ftpSetAt: string | null;
  /** v sezóně (březen–září) se FTP ověřuje častěji */
  inSeason: boolean;
}

export interface FtpCheck {
  /** doporučit test */
  suggest: boolean;
  /** "up" = FTP je asi nízké, "down" = asi vysoké, "old" = dlouho neověřené, "ok" */
  kind: "up" | "down" | "old" | "ok";
  title: string;
  reasons: string[];
}

const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);

export function ftpCheck(i: FtpCheckInput): FtpCheck {
  if (!i.ftp) return { suggest: true, kind: "old", title: "FTP nemám – udělej test (20 min nebo ramp test).", reasons: [] };
  const reasons: string[] = [];
  let kind: FtpCheck["kind"] = "ok";
  const fresh = (d: string) => d >= addDays(i.today, -42);
  // 20 min × 0,95 nad FTP = jel jsi déle nad prahem, než FTP dovoluje → FTP je nízké
  if (i.best20 && fresh(i.best20.date) && i.best20.w * 0.95 >= i.ftp * 1.03) {
    kind = "up";
    reasons.push(`20 min ${i.best20.w} W (${i.best20.date.slice(8, 10).replace(/^0/, "")}.${i.best20.date.slice(5, 7).replace(/^0/, "")}.) × 0,95 = ${Math.round(i.best20.w * 0.95)} W je o ${pct(i.best20.w * 0.95, i.ftp)} % nad FTP ${i.ftp} W.`);
  }
  if (i.eftp && fresh(i.eftp.date)) {
    const d = i.eftp.w / i.ftp;
    if (d >= 1.05) {
      kind = "up";
      reasons.push(`eFTP z jízd ${i.eftp.w} W je o ${pct(i.eftp.w, i.ftp)} % nad FTP – zóny a intervaly jsou asi moc lehké.`);
    } else if (d <= 0.9 && kind !== "up") {
      kind = "down";
      reasons.push(`eFTP z jízd ${i.eftp.w} W je o ${-pct(i.eftp.w, i.ftp)} % pod FTP. Může to být jen tím, že poslední týdny nebylo nic tvrdého – ale když ti intervaly nejdou dojet, FTP je vysoké.`);
    }
  }
  const age = i.ftpSetAt ? Math.round((Date.parse(i.today) - Date.parse(i.ftpSetAt)) / 86400_000) : null;
  const maxAge = i.inSeason ? 56 : 84;
  if (age != null && age > maxAge) {
    if (kind === "ok") kind = "old";
    reasons.push(`FTP je ${Math.round(age / 7)} týdnů beze změny (doporučeno ověřit každých ${maxAge / 7} týdnů${i.inSeason ? " v sezóně" : ""}).`);
  }
  const suggest = kind !== "ok";
  const title = kind === "up" ? "FTP je asi nízké – doporučuji test." : kind === "down" ? "FTP je možná vysoké – ověř ho testem, až budeš čerstvý." : kind === "old" ? "Čas ověřit FTP testem." : "FTP odpovídá jízdám.";
  return { suggest, kind, title, reasons };
}
