// Smazání všech dat aplikace jedním příkazem: npm run wipe -- --yes
// Smaže obsah D1 (aktivity, wellness, plán, nastavení…), Garmin token v KV a události, které aplikace zapsala do intervals.icu.
// Účet Cloudflare, Worker a klíče (secrets) zůstanou – ty smažeš v dashboardu Cloudflare.
import { execSync } from "node:child_process";
import { readDevVars, ROOT } from "./devvars.mjs";

if (!process.argv.includes("--yes")) {
  console.log("Tohle smaže VŠECHNA data trenéra. Pro potvrzení spusť: npm run wipe -- --yes");
  process.exit(1);
}
const { vars } = readDevVars();
const tables = ["activities", "wellness", "daily_metrics", "planned_workouts", "constraints", "proposals", "weather_hourly", "sent_messages", "training_log", "events_log", "weekly_reviews", "settings", "sync_state"];
const sql = tables.map((t) => `DELETE FROM ${t};`).join(" ");
execSync(`npx wrangler d1 execute trener-db --remote --command "${sql}"`, { cwd: ROOT, stdio: "inherit" });
try {
  execSync(`npx wrangler kv key delete --binding KV --remote "garmin:token"`, { cwd: ROOT, stdio: "inherit" });
} catch {
  /* token nemusí existovat */
}
if (vars.INTERVALS_API_KEY && vars.INTERVALS_ATHLETE_ID) {
  const auth = "Basic " + Buffer.from(`API_KEY:${vars.INTERVALS_API_KEY}`).toString("base64");
  const from = "2020-01-01";
  const to = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  const evs = await fetch(`https://intervals.icu/api/v1/athlete/${vars.INTERVALS_ATHLETE_ID}/events?oldest=${from}&newest=${to}`, { headers: { Authorization: auth } }).then((r) => r.json());
  const ours = evs.filter((e) => String(e.external_id ?? "").startsWith("trener-"));
  for (const e of ours) await fetch(`https://intervals.icu/api/v1/athlete/${vars.INTERVALS_ATHLETE_ID}/events/${e.id}`, { method: "DELETE", headers: { Authorization: auth } });
  console.log(`intervals.icu: smazáno ${ours.length} událostí aplikace (poznámky NOTE z omezení smaž ručně, pokud chceš).`);
}
console.log("Hotovo. Data jsou smazaná; při dalším spuštění cronu se historie stáhne znovu, pokud Worker nesmažeš.");
