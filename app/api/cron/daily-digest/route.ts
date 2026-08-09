import { getDatabase, runtimeEnv } from "../../../../lib/runtime-db";
import { emitRealtimeEvent } from "../../../../lib/realtime";
import { sendTelegramMessage, telegramConfig } from "../../../../lib/telegram";

export async function POST(request: Request) {
  const secret = String(runtimeEnv().CRON_SECRET || "");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || "";
  if (!secret || supplied !== secret) return Response.json({ error: "Unauthorized cron request." }, { status: 401 });
  if (!telegramConfig().token) return Response.json({ skipped: true, reason: "Telegram is not configured." });

  const database = getDatabase();
  const links = await database.prepare("SELECT owner_user_id AS ownerUserId, chat_id AS chatId FROM telegram_links WHERE notifications_enabled = 1").all<{ ownerUserId: string; chatId: string }>();
  let sent = 0;
  for (const link of links.results) {
    const stats = await database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM scrape_runs WHERE owner_user_id = ? AND created_at >= datetime('now', '-1 day') AND status = 'succeeded') AS runs,
        (SELECT COALESCE(SUM(result_count), 0) FROM scrape_runs WHERE owner_user_id = ? AND created_at >= datetime('now', '-1 day') AND status = 'succeeded') AS searched,
        (SELECT COUNT(*) FROM job_postings WHERE owner_user_id = ? AND captured_at >= datetime('now', '-1 day')) AS saved
    `).bind(link.ownerUserId, link.ownerUserId, link.ownerUserId).first<{ runs: number; searched: number; saved: number }>();
    await sendTelegramMessage(link.chatId, `Fresh Listings daily update\n\nSearch runs: ${Number(stats?.runs || 0)}\nJobs searched: ${Number(stats?.searched || 0)}\nJobs saved: ${Number(stats?.saved || 0)}\n\nOpen your dashboard for the full history.`);
    await emitRealtimeEvent("digest:ready", { userId: link.ownerUserId, searched: Number(stats?.searched || 0), saved: Number(stats?.saved || 0) });
    sent += 1;
  }
  return Response.json({ sent });
}
