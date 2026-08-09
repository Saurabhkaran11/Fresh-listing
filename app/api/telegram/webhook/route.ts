import { getDatabase, databaseErrorMessage } from "../../../../lib/runtime-db";
import { clampText } from "../../../../lib/security";
import { emitRealtimeEvent } from "../../../../lib/realtime";
import { formatJobDigest, parseTelegramPrompt, sendTelegramMessage, telegramConfig } from "../../../../lib/telegram";
import { collectJobs } from "../../../../lib/scraper";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
    from?: { username?: string; first_name?: string; last_name?: string };
    text?: string;
  };
};

export async function POST(request: Request) {
  const { webhookSecret } = telegramConfig();
  if (!webhookSecret || request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) return Response.json({ error: "Unauthorized webhook." }, { status: 401 });
  const update = await request.json().catch(() => ({})) as TelegramUpdate;
  const message = update.message;
  if (!message || message.chat?.id === undefined || !message.text) return Response.json({ ok: true });
  const chatId = message?.chat?.id === undefined ? "" : String(message.chat.id);
  const text = clampText(message?.text, 500);
  if (!chatId || !text) return Response.json({ ok: true });

  try {
    const database = getDatabase();
    const startToken = text.match(/^\/start(?:\s+([A-Za-z0-9_-]+))?/i)?.[1];
    if (startToken) {
      const token = await database.prepare("SELECT token, owner_user_id AS ownerUserId FROM telegram_link_tokens WHERE token = ? AND expires_at > ? AND used_at IS NULL LIMIT 1").bind(startToken, Date.now()).first<{ token: string; ownerUserId: string }>();
      if (!token) { await sendTelegramMessage(chatId, "That Fresh Listings link has expired. Generate a new link from your dashboard."); return Response.json({ ok: true }); }
      const displayName = [message.chat?.first_name, message.chat?.last_name].filter(Boolean).join(" ") || null;
      await database.batch([
        database.prepare("INSERT INTO telegram_links (owner_user_id, chat_id, username, display_name) VALUES (?, ?, ?, ?) ON CONFLICT(owner_user_id) DO UPDATE SET chat_id = excluded.chat_id, username = excluded.username, display_name = excluded.display_name, last_seen_at = CURRENT_TIMESTAMP").bind(token.ownerUserId, chatId, message.from?.username || message.chat?.username || null, displayName),
        database.prepare("UPDATE telegram_link_tokens SET used_at = ? WHERE token = ?").bind(Date.now(), token.token),
      ]);
      await sendTelegramMessage(chatId, "Telegram is connected. Send a job-search prompt whenever you like, for example: Find remote React jobs in Canada posted in the last 7 days.");
      return Response.json({ ok: true });
    }

    const link = await database.prepare("SELECT owner_user_id AS ownerUserId FROM telegram_links WHERE chat_id = ? LIMIT 1").bind(chatId).first<{ ownerUserId: string }>();
    if (!link) { await sendTelegramMessage(chatId, "Connect this chat from Fresh Listings first, then send your job-search prompt here."); return Response.json({ ok: true }); }
    await database.prepare("UPDATE telegram_links SET last_seen_at = CURRENT_TIMESTAMP WHERE chat_id = ?").bind(chatId).run();
    if (/^\/(?:help|start)$/i.test(text)) { await sendTelegramMessage(chatId, "Send a prompt like: Find senior TypeScript jobs in New York posted today. I’ll save the matching jobs and reply with the links."); return Response.json({ ok: true }); }

    const prompt = parseTelegramPrompt(text);
    await sendTelegramMessage(chatId, `Searching ${prompt.keywords} in ${prompt.location}…`);
    await emitRealtimeEvent("scrape:started", { userId: link.ownerUserId, keywords: prompt.keywords, location: prompt.location, source: "telegram" });
    const result = await collectJobs({ ...prompt, greenhouseBoards: [] });
    const capturedAt = new Date().toISOString();
    const statements = result.jobs.map((job) => database.prepare(`
      INSERT INTO job_postings (owner_user_id, external_id, title, company, location, source, direct_url, apply_url, description, posted_at, remote_status, experience, salary, skills_json, search_query, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, external_id) DO UPDATE SET title = excluded.title, company = excluded.company, location = excluded.location, direct_url = excluded.direct_url, apply_url = excluded.apply_url, description = excluded.description, posted_at = excluded.posted_at, remote_status = excluded.remote_status, experience = excluded.experience, salary = excluded.salary, skills_json = excluded.skills_json, search_query = excluded.search_query, captured_at = excluded.captured_at
    `).bind(link.ownerUserId, job.externalId, job.title, job.company, job.location, job.source, job.directUrl, job.applyUrl, job.description, job.postedAt, job.remoteStatus, job.experience, job.salary, JSON.stringify(job.skills), `${prompt.keywords} · ${prompt.location}`, capturedAt));
    statements.push(database.prepare("INSERT INTO scrape_runs (owner_user_id, provider, keywords, location, time_window, result_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(link.ownerUserId, result.provider, prompt.keywords, prompt.location, prompt.timeWindow, result.jobs.length, "succeeded"));
    await database.batch(statements);
    await emitRealtimeEvent("job:saved", { userId: link.ownerUserId, count: result.jobs.length, source: "telegram" });
    const heading = `Saved ${result.jobs.length} jobs for “${prompt.keywords}”`;
    const suffix = result.notices.length ? `\n\n${result.notices.join(" ")}` : "";
    await sendTelegramMessage(chatId, `${formatJobDigest(result.jobs.map((job) => ({ title: job.title, company: job.company, location: job.location, directUrl: job.directUrl })), heading)}${suffix}`);
    return Response.json({ ok: true, saved: result.jobs.length });
  } catch (error) {
    await sendTelegramMessage(chatId, `I couldn’t complete that search: ${databaseErrorMessage(error)}`);
    return Response.json({ ok: true, error: "Search failed." });
  }
}
