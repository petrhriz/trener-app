// Před nasazením: do index.html dá číslo verze z package.json (Nastavení ho ukazuje) a k app.css / app.js otisk obsahu (?v=…).
// Soubory s otiskem si prohlížeč drží natrvalo (public/_headers) a nové stáhne jen po změně obsahu –
// iPhone (aplikace na ploše) tak nikdy nenačte starou verzi a nezměněný soubor se nestahuje znovu.
import { createHash } from "crypto";
import fs from "fs";
const dir = new URL("../public/", import.meta.url);
const hash = (f) => createHash("sha256").update(fs.readFileSync(new URL(f, dir))).digest("hex").slice(0, 10);
const p = new URL("index.html", dir);
const css = hash("app.css"), js = hash("app.js");
const { version } = JSON.parse(fs.readFileSync(new URL("../package.json", dir), "utf8"));
const s = fs.readFileSync(p, "utf8");
const out = s.replace(/data-ver="[^"]*"/, `data-ver="${version}"`).replace(/href="app\.css(\?v=\w+)?"/, `href="app.css?v=${css}"`).replace(/src="app\.js(\?v=\w+)?"/, `src="app.js?v=${js}"`);
if (out !== s) fs.writeFileSync(p, out);
console.log("verze", version, "· otisk app.css", css, "· app.js", js);
