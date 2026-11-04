import { getSessionUser } from "@/lib/session-user";
import { databaseErrorMessage, getDatabase, runtimeEnv } from "../../../../lib/runtime-db";
import { GeminiError, geminiText, validGeminiKey } from "../../../../lib/gemini.mjs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue to analyze job fit." }, { status: 401 });
  const config = runtimeEnv();
  // The visitor's own key: used for this call only, never stored or logged. There is no server key.
  const geminiKey = (request.headers.get("x-gemini-key") || "").trim();
  if (!validGeminiKey(geminiKey)) return Response.json({ error: "Add your own Gemini API key above the results to use AI Fit." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { externalId?: string; candidateSkills?: string };
  if (!body.externalId) return Response.json({ error: "A job id is required." }, { status: 400 });
  try {
    const database = getDatabase();
    const job = await database.prepare("SELECT external_id, title, company, description, skills_json FROM job_postings WHERE owner_user_id = ? AND external_id = ?").bind(user.userId, body.externalId).first<{ external_id: string; title: string; company: string; description: string; skills_json: string }>();
    if (!job) return Response.json({ error: "Save the job before analyzing fit." }, { status: 404 });
    const model = String(config.GEMINI_MODEL || "gemini-3.6-flash");
    const prompt = `You are a practical software engineering career coach. Return ONLY valid JSON with keys score (integer 0-100), summary (string), skillGaps (array of strings), portfolioProjects (array of exactly 3 strings). Compare the candidate skills to this job. Candidate skills: ${String(body.candidateSkills || "TypeScript, JavaScript, React, Node.js, SQL, AWS")}. Job title: ${job.title}. Company: ${job.company}. Job description: ${job.description || "Not provided; infer cautiously from the role title."}`;
    const text = await geminiText(geminiKey, model, prompt);
    const analysis = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as { score: number; summary: string; skillGaps: string[]; portfolioProjects: string[] };
    await database.prepare("UPDATE job_postings SET fit_score = ?, fit_summary = ?, skill_gaps = ?, portfolio_projects = ? WHERE owner_user_id = ? AND external_id = ?").bind(Math.max(0, Math.min(100, Number(analysis.score) || 0)), String(analysis.summary || ""), JSON.stringify(analysis.skillGaps || []), JSON.stringify((analysis.portfolioProjects || []).slice(0, 3)), user.userId, job.external_id).run();
    return Response.json({ analysis });
  } catch (error) {
    if (error instanceof GeminiError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Gemini replied in an unexpected format. Try again." }, { status: 502 });
    return Response.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}
