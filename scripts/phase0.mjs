// Spustí test fáze 0 na nasazeném Workeru (z Cloudflare IP) a vypíše výsledek.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readDevVars, ROOT } from "./devvars.mjs";

const { vars } = readDevVars();
if (!vars.WORKER_URL || !vars.ADMIN_TOKEN) {
  console.log("Chybí WORKER_URL nebo ADMIN_TOKEN v .dev.vars");
  process.exit(1);
}
const telegram = process.argv.includes("--no-telegram") ? "0" : "1";
const res = await fetch(`${vars.WORKER_URL.replace(/\/$/, "")}/admin/phase0?telegram=${telegram}`, {
  headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}` },
});
const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
mkdirSync(join(ROOT, ".wrangler"), { recursive: true });
writeFileSync(join(ROOT, ".wrangler", "phase0-result.json"), JSON.stringify(body, null, 2));
console.log(JSON.stringify(body, null, 2));
