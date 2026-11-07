// Čtení a zápis .dev.vars bez vypisování hodnot.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEVVARS = join(ROOT, ".dev.vars");

export function ensureDevVars() {
  if (!existsSync(DEVVARS)) copyFileSync(join(ROOT, ".dev.vars.example"), DEVVARS);
}

/** Vrátí { lines, vars } – lines kvůli zachování komentářů při zápisu. */
export function readDevVars() {
  ensureDevVars();
  const lines = readFileSync(DEVVARS, "utf8").split(/\r?\n/);
  const vars = {};
  for (const l of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return { lines, vars };
}

export function setDevVar(key, value) {
  const { lines } = readDevVars();
  let found = false;
  const out = lines.map((l) => {
    if (new RegExp(`^\\s*${key}\\s*=`).test(l)) {
      found = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!found) out.push(`${key}=${value}`);
  writeFileSync(DEVVARS, out.join("\n"));
}

export const SECRET_KEYS = [
  "GARMIN_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "ADMIN_TOKEN",
  "INTERVALS_API_KEY",
  "INTERVALS_ATHLETE_ID",
];
