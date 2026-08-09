import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureUserSettings, getD1 } from "../../../../lib/runtime-db";
import { secureToken } from "../../../../lib/security";
import { isTelegramConfigured, telegramConfig } from "../../../../lib/telegram";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to link Telegram." }, { status: 401 });
  if (!isTelegramConfigured()) return Response.json({ error: "Telegram is not configured yet. Add TELEGRAM_BOT_TOKEN on the server." }, { status: 503 });

  const database = getD1();
  await ensureUserSettings(database, user.userId, user.email);
  const token = secureToken(18);
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await database.prepare("DELETE FROM telegram_link_tokens WHERE owner_user_id = ? OR expires_at < ?").bind(user.userId, Date.now()).run();
  await database.prepare("INSERT INTO telegram_link_tokens (token, owner_user_id, expires_at) VALUES (?, ?, ?)").bind(token, user.userId, expiresAt).run();
  const { username } = telegramConfig();
  const botUrl = username ? `https://t.me/${username}?start=${encodeURIComponent(token)}` : null;
  return Response.json({ token, expiresAt, botUrl, instruction: botUrl ? "Open the Telegram link and press Start." : `Send /start ${token} to your bot.` });
}
