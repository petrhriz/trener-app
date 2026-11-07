// Vypíše jen „nastavený / chybí“ pro každý klíč v .dev.vars. Hodnoty nikdy.
import { readDevVars, SECRET_KEYS } from "./devvars.mjs";

const { vars } = readDevVars();
for (const k of SECRET_KEYS) {
  console.log(`${k.padEnd(26)} ${vars[k] ? "nastavený" : "chybí"}`);
}
console.log(`${"WORKER_URL".padEnd(26)} ${vars.WORKER_URL ? vars.WORKER_URL : "chybí"}`);
