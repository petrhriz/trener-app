import type { Env } from "../env";
import { fetchRetry } from "../lib/http";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export async function tgCall<T = unknown>(env: Env, method: string, payload: unknown): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN chybí");
  const res = await fetchRetry(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await res.json()) as { ok: boolean; result?: T; description?: string };
  // V chybě nikdy nevypisujeme URL (obsahuje token)
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? res.status}`);
  return j.result as T;
}

/** Pošle HTML zprávu jen na povolené chat_id. */
export async function sendMessage(
  env: Env,
  html: string,
  buttons?: InlineButton[][],
): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID chybí");
  await tgCall(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
