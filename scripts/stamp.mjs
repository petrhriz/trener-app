// Před nasazením: do index.html dá číslo verze k app.css / app.js (?v=…), aby iPhone (aplikace na ploše)
// nenačítal starou verzi z mezipaměti.
import fs from "fs";
const p = new URL("../public/index.html", import.meta.url);
const v = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
let s = fs.readFileSync(p, "utf8");
s = s.replace(/href="app\.css(\?v=\w+)?"/, `href="app.css?v=${v}"`).replace(/src="app\.js(\?v=\w+)?"/, `src="app.js?v=${v}"`);
fs.writeFileSync(p, s);
console.log("verze", v);
