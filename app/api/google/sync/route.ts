import { getChatGPTUser } from "../../../chatgpt-auth";
import { databaseErrorMessage, ensureUserSettings, getD1 } from "../../../../lib/runtime-db";
import { syncJobsToSheet } from "../../../../lib/google";

type StoredJob = Record<string, unknown> & { id: number };

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to sync jobs." }, { status: 401 });
  try {
    const database = getD1();
    await ensureUserSettings(database, user.userId, user.email);
    const rows = await database.prepare("SELECT id, title, company, source, location, posted_at, direct_url, apply_url, remote_status, experience, salary, fit_score, skill_gaps, captured_at, search_query FROM job_postings WHERE owner_user_id = ? AND synced_at IS NULL ORDER BY created_at DESC LIMIT 500").bind(user.userId).all<StoredJob>();
    const jobs = rows.results || [];
    const result = await syncJobsToSheet(database, user.userId, jobs);
    if (jobs.length) await database.batch(jobs.map((job) => database.prepare("UPDATE job_postings SET synced_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").bind(job.id, user.userId)));
    return Response.json(result);
  } catch (error) { return Response.json({ error: databaseErrorMessage(error) }, { status: 400 }); }
}
