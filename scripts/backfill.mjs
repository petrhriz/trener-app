// Stažení celé historie: opakovaně volá /admin/sync, dokud backfill aktivit i wellness neskončí.
// (Cron to zvládne sám po dávkách, tohle jen zrychlí první stažení.)
import { readDevVars } from "./devvars.mjs";

const { vars } = readDevVars();
const url = `${vars.WORKER_URL.replace(/\/$/, "")}/admin/sync?pages=5`;
let actDone = false;
let wellDone = false;
for (let i = 0; i < 300 && !(actDone && wellDone); i++) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}` } });
  const body = await res.json().catch(() => ({ errors: [`HTTP ${res.status}`] }));
  const steps = (body.steps ?? []).join(" | ");
  if ((body.steps ?? []).some((s) => s.startsWith("backfill aktivit") && s.includes("hotovo"))) actDone = true;
  if ((body.steps ?? []).some((s) => s.startsWith("backfill wellness") && s.includes("hotovo"))) wellDone = true;
  if (!(body.steps ?? []).some((s) => s.startsWith("backfill aktivit"))) actDone = actDone || i > 0;
  if (!(body.steps ?? []).some((s) => s.startsWith("backfill wellness"))) wellDone = wellDone || i > 0;
  console.log(`#${i + 1} ${steps}${body.errors?.length ? "  CHYBY: " + body.errors.join("; ") : ""}`);
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(actDone && wellDone ? "Backfill hotový." : "Backfill nedokončen, pokračuje cron.");
