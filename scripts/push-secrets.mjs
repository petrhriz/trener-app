// Nahraje vyplněné klíče z .dev.vars na Cloudflare (wrangler secret bulk).
// Prázdné ADMIN_TOKEN a TELEGRAM_WEBHOOK_SECRET nejdřív vygeneruje. Hodnoty nikdy nevypisuje.
import { randomBytes } from "node:crypto";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readDevVars, setDevVar, SECRET_KEYS, ROOT } from "./devvars.mjs";

for (const k of ["ADMIN_TOKEN", "TELEGRAM_WEBHOOK_SECRET"]) {
  if (!readDevVars().vars[k]) {
    setDevVar(k, randomBytes(24).toString("hex"));
    console.log(`${k}: vygenerován`);
  }
}

const { vars } = readDevVars();
const payload = {};
for (const k of SECRET_KEYS) if (vars[k]) payload[k] = vars[k];

const dir = mkdtempSync(join(tmpdir(), "trener-"));
const file = join(dir, "secrets.json");
writeFileSync(file, JSON.stringify(payload), { mode: 0o600 });
try {
  const r = spawnSync(`npx wrangler secret bulk "${file}"`, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  // wrangler vypisuje jen názvy klíčů; pro jistotu přesto skryjeme případné hodnoty
  let text = `${r.stdout}\n${r.stderr}`;
  for (const v of Object.values(payload)) if (v.length >= 6) text = text.split(v).join("***");
  console.log(text.trim());
  console.log(r.status === 0 ? `Nahráno: ${Object.keys(payload).join(", ")}` : "Nahrání selhalo.");
  process.exitCode = r.status ?? 1;
} finally {
  unlinkSync(file);
}
