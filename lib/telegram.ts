import { runtimeEnv } from "./runtime-db";
import { clampText } from "./security";

export type TelegramPrompt = {
  keywords: string;
  location: string;
  timeWindow: "r86400" | "r604800" | "r2592000";
  sources: string[];
};

type TelegramResponse = { ok?: boolean; result?: unknown; description?: string };

export function telegramConfig() {
  const config = runtimeEnv();
  return {
    token: String(config.TELEGRAM_BOT_TOKEN || ""),
    username: String(config.TELEGRAM_BOT_USERNAME || "").replace(/^@/, ""),
    webhookSecret: String(config.TELEGRAM_WEBHOOK_SECRET || ""),
  };
}

export function isTelegramConfigured() {
  return Boolean(telegramConfig().token);
}

export async function telegramApi(method: string, body: Record<string, unknown>) {
  const { token } = telegramConfig();
  if (!token) throw new Error("Telegram is not configured. Add TELEGRAM_BOT_TOKEN.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as TelegramResponse;
  if (!response.ok || payload.ok === false) throw new Error(payload.description || `Telegram API returned HTTP ${response.status}.`);
  return payload;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  return telegramApi("sendMessage", { chat_id: chatId, text: clampText(text, 3900), disable_web_page_preview: true });
}

export function parseTelegramPrompt(message: string): TelegramPrompt {
  const raw = clampText(message.replace(/^\/(?:search|find)\s*/i, ""), 500);
  const lower = raw.toLowerCase();
  const timeWindow = /\b(today|last\s*24\s*hours?|24h|past\s*day)\b/.test(lower)
    ? "r86400"
    : /\b(this\s*week|last\s*7\s*days?|7d|past\s*week)\b/.test(lower)
      ? "r604800"
      : "r2592000";
  const locationMatch = raw.match(/\b(?:in|near|around|from)\s+(.+?)(?=\s+(?:posted|today|this\s+week|last\s+7|last\s+30|remote)\b|$)/i);
  const location = clampText(locationMatch?.[1] || (lower.includes("remote") ? "Remote" : "Worldwide"), 120);
  let keywords = raw
    .replace(/\b(?:posted|within|from)\s+(?:today|the\s+last\s+24\s+hours?|the\s+last\s+7\s+days?|the\s+last\s+30\s+days?)\b/gi, "")
    .replace(/\b(?:today|this\s+week|last\s+(?:24\s+hours?|7\s+days?|30\s+days?)|24h|7d|30d|remote)\b/gi, "")
    .replace(locationMatch?.[0] || "", "")
    .replace(/\s+/g, " ")
    .trim();
  if (!keywords) keywords = "Software engineer";

  const sources = ["google_jobs"];
  for (const source of ["linkedin", "indeed", "builtin", "glassdoor", "greenhouse", "trueup"]) {
    if (lower.includes(source)) sources.push(source);
  }
  return { keywords: clampText(keywords, 120), location, timeWindow, sources };
}

export function formatJobDigest(jobs: Array<{ title: string; company: string; location: string; directUrl: string }>, heading: string) {
  const lines = [heading, ""];
  if (!jobs.length) return `${heading}\n\nNo new matching jobs were saved.`;
  for (const job of jobs.slice(0, 20)) lines.push(`• ${job.title} — ${job.company} (${job.location})\n${job.directUrl}`);
  if (jobs.length > 20) lines.push(`\n…and ${jobs.length - 20} more saved in your dashboard.`);
  return lines.join("\n");
}
