// Test: pošle Workeru zprávu jako Telegram (s tajným tokenem a tvým chat_id). Bot odpoví do tvého Telegramu.
// node scripts/tg-sim.mjs "kolik sacharidů na 2 h?"
import { readDevVars } from "./devvars.mjs";

const { vars } = readDevVars();
const text = process.argv.slice(2).join(" ") || "/pomoc";
const res = await fetch(`${vars.WORKER_URL.replace(/\/$/, "")}/telegram/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": vars.TELEGRAM_WEBHOOK_SECRET },
  body: JSON.stringify({ update_id: Date.now(), message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: Number(vars.TELEGRAM_CHAT_ID), type: "private" }, text } }),
});
console.log(res.status, await res.text());
