// Volání /api/* nasazeného Workeru s admin tokenem: node scripts/api.mjs <cesta> [METHOD] [json]
import { readDevVars } from "./devvars.mjs";

const { vars } = readDevVars();
const [path = "status", method = "GET", body] = process.argv.slice(2);
const res = await fetch(`${vars.WORKER_URL.replace(/\/$/, "")}/api/${path.replace(/^\//, "")}`, { method, headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}`, "content-type": "application/json" }, body });
const text = await res.text();
console.log(res.status, text.slice(0, Number(process.env.MAX ?? 4000)));
