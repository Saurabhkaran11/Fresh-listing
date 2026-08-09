import { getSessionUser } from "@/lib/session-user";
import { databaseErrorMessage, ensureUserSettings, getDatabase, runtimeEnv } from "../../../../lib/runtime-db";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue to send a digest." }, { status: 401 });
  const config = runtimeEnv();
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) return Response.json({ error: "Email is not configured. Add RESEND_API_KEY and EMAIL_FROM in Site settings." }, { status: 503 });
  try {
    const database = getDatabase();
    await ensureUserSettings(database, user.userId, user.email);
    const rows = await database.prepare("SELECT title, company, source, location, direct_url, posted_at FROM job_postings WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.userId).all<{ title: string; company: string; source: string; location: string; direct_url: string; posted_at: string | null }>();
    const jobs = rows.results || [];
    if (!jobs.length) return Response.json({ error: "Run a scrape before sending a digest." }, { status: 400 });
    const html = `<h2>Fresh Listings — ${jobs.length} opportunities</h2><p>Here are your latest saved matches.</p><ul>${jobs.map((job) => `<li><a href="${escapeHtml(job.direct_url)}"><strong>${escapeHtml(job.title)}</strong></a> — ${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${escapeHtml(job.source)}${job.posted_at ? ` · ${escapeHtml(job.posted_at)}` : ""}</li>`).join("")}</ul>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${String(config.RESEND_API_KEY)}`, "content-type": "application/json" }, body: JSON.stringify({ from: String(config.EMAIL_FROM), to: [user.email], subject: `Fresh Listings — ${jobs.length} opportunities`, html }) });
    if (!response.ok) return Response.json({ error: "The email provider rejected the digest." }, { status: 502 });
    return Response.json({ sent: true, recipient: user.email, count: jobs.length });
  } catch (error) { return Response.json({ error: databaseErrorMessage(error) }, { status: 500 }); }
}

function escapeHtml(value: string) { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] || character)); }
