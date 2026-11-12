// Volání admin endpointů nasazeného Workeru: node scripts/admin.mjs <cesta> [GET]
// např. node scripts/admin.mjs login-link (jednorázové přihlášení, ?uid=2 pro dalšího uživatele) · scheduler · secrets GET
import { readDevVars } from "./devvars.mjs";

const { vars } = readDevVars();
const [path = "secrets", method = "POST"] = process.argv.slice(2);
const res = await fetch(`${vars.WORKER_URL.replace(/\/$/, "")}/admin/${path}`, { method, headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}` } });
const text = await res.text();
console.log(res.status, text.slice(0, 4000));
