import { getSessionUser } from "@/lib/session-user";
import { getDatabase } from "../../../lib/runtime-db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to view analytics." }, { status: 401 });

  const database = getDatabase();
  const [daily, sources, totals] = await Promise.all([
    database.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS saved
      FROM job_postings
      WHERE owner_user_id = ? AND created_at >= datetime('now', '-30 day')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).bind(user.userId).all<{ day: string; saved: number }>(),
    database.prepare(`
      SELECT source, COUNT(*) AS saved
      FROM job_postings
      WHERE owner_user_id = ?
      GROUP BY source
      ORDER BY saved DESC
    `).bind(user.userId).all<{ source: string; saved: number }>(),
    database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM job_postings WHERE owner_user_id = ?) AS saved,
        (SELECT COALESCE(SUM(result_count), 0) FROM scrape_runs WHERE owner_user_id = ? AND status = 'succeeded') AS searched,
        (SELECT COUNT(*) FROM telegram_links WHERE owner_user_id = ?) AS telegram
    `).bind(user.userId, user.userId, user.userId).first<{ saved: number; searched: number; telegram: number }>(),
  ]);

  const dailyRows = (daily.results || []) as Array<{ day: string; saved: number }>;
  const sourceRows = (sources.results || []) as Array<{ source: string; saved: number }>;
  return Response.json({
    totals: { saved: Number(totals?.saved || 0), searched: Number(totals?.searched || 0), telegramLinked: Number(totals?.telegram || 0) },
    daily: dailyRows.map((row) => ({ day: row.day, saved: Number(row.saved || 0) })),
    sources: sourceRows.map((row) => ({ source: row.source, saved: Number(row.saved || 0) })),
  }, { headers: { "cache-control": "no-store" } });
}
