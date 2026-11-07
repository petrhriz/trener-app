// Najde tvoje chat_id z poslední zprávy botovi a zapíše ho do .dev.vars.
// Předtím pošli botovi v Telegramu libovolnou zprávu (např. /start).
import { readDevVars, setDevVar } from "./devvars.mjs";

const { vars } = readDevVars();
if (!vars.TELEGRAM_BOT_TOKEN) {
  console.log("TELEGRAM_BOT_TOKEN chybí v .dev.vars");
  process.exit(1);
}
const api = `https://api.telegram.org/bot${vars.TELEGRAM_BOT_TOKEN}`;

// Když už je nastavený webhook, getUpdates nefunguje – dočasně ho vypneme (bez mazání čekajících zpráv).
const info = await (await fetch(`${api}/getWebhookInfo`)).json();
if (info.ok && info.result?.url) {
  await fetch(`${api}/deleteWebhook`);
  console.log("Webhook byl nastavený, dočasně jsem ho vypnul (nastaví se znovu při deploy kroku).");
}

const res = await (await fetch(`${api}/getUpdates`)).json();
if (!res.ok) {
  console.log("Telegram odmítl token:", res.description);
  process.exit(1);
}
const chats = new Map();
for (const u of res.result) {
  const m = u.message ?? u.edited_message;
  if (m?.chat?.type === "private") chats.set(m.chat.id, m.chat.first_name ?? m.chat.username ?? "?");
}
if (chats.size === 0) {
  console.log("Nenašel jsem žádnou zprávu. Napiš botovi v Telegramu /start a spusť znovu.");
  process.exit(1);
}
if (chats.size > 1) {
  console.log(`Bot dostal zprávy z ${chats.size} soukromých chatů. Zapisuji ten poslední.`);
}
const [id, name] = [...chats.entries()].at(-1);
setDevVar("TELEGRAM_CHAT_ID", String(id));
console.log(`chat_id nalezeno (${name}) a zapsáno do .dev.vars.`);
