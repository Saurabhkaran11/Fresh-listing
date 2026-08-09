import { getSessionUser } from "@/lib/session-user";
import { databaseErrorMessage, ensureUserSettings, getDatabase } from "../../../../lib/runtime-db";
import { emitRealtimeEvent } from "../../../../lib/realtime";
import { collectJobs } from "../../../../lib/scraper";
import { normalizeSources } from "../../../../lib/source-policy";

const WINDOWS = new Set(["r86400", "r604800", "r2592000"]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue to run a saved search." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { keywords?: string; location?: string; timeWindow?: string; sources?: string[]; greenhouseBoards?: string[] };
  const keywords = clean(body.keywords, 120);
  const location = clean(body.location, 120) || "Worldwide";
  const timeWindow = WINDOWS.has(body.timeWindow || "") ? body.timeWindow! : "r86400";
  const sources = normalizeSources(body.sources);
  const greenhouseBoards = Array.isArray(body.greenhouseBoards) ? body.greenhouseBoards.slice(0, 12).map((value) => clean(value, 80)) : [];
  if (!keywords) return Response.json({ error: "A job title or keyword is required." }, { status: 400 });

  const database = getDatabase();
  await ensureUserSettings(database, user.userId, user.email);
  const startedAt = new Date().toISOString();
  try {
    await emitRealtimeEvent("scrape:started", { userId: user.userId, keywords, location, timeWindow });
    const result = await collectJobs({ keywords, location, timeWindow, sources, greenhouseBoards });
    const statements = result.jobs.map((job) => database.prepare(`
      INSERT INTO job_postings (owner_user_id, external_id, title, company, location, source, direct_url, apply_url, description, posted_at, remote_status, experience, salary, skills_json, search_query, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, external_id) DO UPDATE SET title = excluded.title, company = excluded.company, location = excluded.location, direct_url = excluded.direct_url, apply_url = excluded.apply_url, description = excluded.description, posted_at = excluded.posted_at, remote_status = excluded.remote_status, experience = excluded.experience, salary = excluded.salary, skills_json = excluded.skills_json, search_query = excluded.search_query, captured_at = excluded.captured_at
    `).bind(user.userId, job.externalId, job.title, job.company, job.location, job.source, job.directUrl, job.applyUrl, job.description, job.postedAt, job.remoteStatus, job.experience, job.salary, JSON.stringify(job.skills), `${keywords} · ${location}`, startedAt));
    statements.push(database.prepare("INSERT INTO scrape_runs (owner_user_id, provider, keywords, location, time_window, result_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(user.userId, result.provider, keywords, location, timeWindow, result.jobs.length, "succeeded"));
    await database.batch(statements);
    await emitRealtimeEvent("scrape:progress", { userId: user.userId, scanned: result.scanned, saved: result.jobs.length, provider: result.provider });
    await emitRealtimeEvent("job:saved", { userId: user.userId, count: result.jobs.length, provider: result.provider });
    const jobs = result.jobs.map((job) => ({ id: job.externalId, title: job.title, company: job.company, location: job.location, posted: job.postedAt || "Recently listed", link: job.directUrl, source: job.source, capturedAt: startedAt }));
    return Response.json({ jobs, provider: result.provider, persistedCount: result.jobs.length, scanned: result.scanned, exhausted: true, sourceLinks: result.sourceLinks, notice: result.notices.join(" ") || undefined }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = databaseErrorMessage(error);
    try { await database.prepare("INSERT INTO scrape_runs (owner_user_id, provider, keywords, location, time_window, result_count, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(user.userId, "unavailable", keywords, location, timeWindow, 0, "failed", message).run(); } catch { /* preserve the provider error */ }
    return Response.json({ error: message }, { status: /provider|SERPAPI|approved|Greenhouse/i.test(message) ? 503 : 500 });
  }
}

function clean(value: unknown, max: number) { return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
