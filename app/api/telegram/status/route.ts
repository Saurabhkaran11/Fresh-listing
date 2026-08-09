import { getSessionUser } from "@/lib/session-user";
import { getDatabase } from "../../../../lib/runtime-db";
import { isTelegramConfigured, telegramConfig } from "../../../../lib/telegram";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to view Telegram settings." }, { status: 401 });
  const database = getDatabase();
  const link = await database.prepare("SELECT chat_id AS chatId, username, display_name AS displayName, notifications_enabled AS notificationsEnabled FROM telegram_links WHERE owner_user_id = ? LIMIT 1").bind(user.userId).first<{ chatId: string; username: string | null; displayName: string | null; notificationsEnabled: number }>();
  const { username } = telegramConfig();
  return Response.json({ configured: isTelegramConfigured(), linked: Boolean(link), link: link || null, botUsername: username || null }, { headers: { "cache-control": "no-store" } });
}
