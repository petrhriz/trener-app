// Surová odpověď zdroje: node scripts/raw.mjs garmin|icu <cesta>  (MAX=znaků)
import { readDevVars } from "./devvars.mjs";

const { vars } = readDevVars();
const [src = "garmin", path = "/"] = process.argv.slice(2);
const url = `${vars.WORKER_URL.replace(/\/$/, "")}/admin/raw?src=${src}&path=${encodeURIComponent(path)}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}` } });
const text = await res.text();
console.log(res.status, text.slice(0, Number(process.env.MAX ?? 3000)));
