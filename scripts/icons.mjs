// Ikony aplikace Kadence: z jednoho znaku (klika v neúplném kruhu, docs/kadence/logo.svg) udělá public/icon.svg a PNG.
// Spuštění: node scripts/icons.mjs (balík sharp je v node_modules díky wrangleru).
import fs from "node:fs";
import sharp from "sharp";

const BG = "#0E0D0C";
const pub = new URL("../public/", import.meta.url);

/** k = jak velkou část plochy zabere pole znaku 48 × 48 (sám znak je 78 % pole); rx = zaoblení rohů podkladu */
const svg = (k, rx = 0) => {
  const s = (512 * k) / 48;
  const o = (512 - 48 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${BG}"/><g transform="translate(${o} ${o}) scale(${s})"><circle cx="24" cy="24" r="16" fill="none" stroke="#F58A3C" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="72 28.5" transform="rotate(-22 24 24)"/><path d="M24 24 L36 12" stroke="#F4F1EC" stroke-width="5.5" stroke-linecap="round"/><circle cx="24" cy="24" r="3.4" fill="#F4F1EC"/></g></svg>\n`;
};

fs.writeFileSync(new URL("icon.svg", pub), svg(0.8, 112));
const png = (name, size, k) => sharp(Buffer.from(svg(k))).resize(size, size).flatten({ background: BG }).png().toFile(new URL(name, pub).pathname.replace(/^\/(\w:)/, "$1"));
await png("apple-touch-icon.png", 180, 0.8);
await png("icon-192.png", 192, 0.8);
await png("icon-512.png", 512, 0.8);
// maskovatelná: znak uvnitř prostředních 60 % plochy (systém ořezává do kruhu)
await png("icon-maskable.png", 512, 0.72);
console.log("ikony hotové");
