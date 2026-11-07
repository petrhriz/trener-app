// Volání admin endpointů nasazeného Workeru: node scripts/admin.mjs <cesta> [GET]
// např. node scripts/admin.mjs send/rano · node scripts/admin.mjs scheduler · node scripts/admin.mjs secrets GET
import { readDevVars } from "./devvars.mjs";

const { vars } = readDevVars();
const [path = "secrets", method = "POST"] = process.argv.slice(2);
const res = await fetch(`${vars.WORKER_URL.replace(/\/$/, "")}/admin/${path}`, { method, headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}` } });
const text = await res.text();
console.log(res.status, text.slice(0, 4000));
