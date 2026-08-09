import { getChatGPTUser } from "../../../chatgpt-auth";
import { databaseErrorMessage, getD1, runtimeEnv } from "../../../../lib/runtime-db";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to analyze job fit." }, { status: 401 });
  const config = runtimeEnv();
  if (!config.GEMINI_API_KEY) return Response.json({ error: "AI Fit Analyzer is not configured. Add GEMINI_API_KEY in Site settings." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { externalId?: string; candidateSkills?: string };
  if (!body.externalId) return Response.json({ error: "A job id is required." }, { status: 400 });
  try {
    const database = getD1();
    const job = await database.prepare("SELECT external_id, title, company, description, skills_json FROM job_postings WHERE owner_user_id = ? AND external_id = ?").bind(user.userId, body.externalId).first<{ external_id: string; title: string; company: string; description: string; skills_json: string }>();
    if (!job) return Response.json({ error: "Save the job before analyzing fit." }, { status: 404 });
    const model = String(config.GEMINI_MODEL || "gemini-2.0-flash");
    const prompt = `You are a practical software engineering career coach. Return ONLY valid JSON with keys score (integer 0-100), summary (string), skillGaps (array of strings), portfolioProjects (array of exactly 3 strings). Compare the candidate skills to this job. Candidate skills: ${String(body.candidateSkills || "TypeScript, JavaScript, React, Node.js, SQL, AWS")}. Job title: ${job.title}. Company: ${job.company}. Job description: ${job.description || "Not provided; infer cautiously from the role title."}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(String(config.GEMINI_API_KEY))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] },) });
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || `Gemini returned HTTP ${response.status}.`);
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const analysis = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as { score: number; summary: string; skillGaps: string[]; portfolioProjects: string[] };
    await database.prepare("UPDATE job_postings SET fit_score = ?, fit_summary = ?, skill_gaps = ?, portfolio_projects = ? WHERE owner_user_id = ? AND external_id = ?").bind(Math.max(0, Math.min(100, Number(analysis.score) || 0)), String(analysis.summary || ""), JSON.stringify(analysis.skillGaps || []), JSON.stringify((analysis.portfolioProjects || []).slice(0, 3)), user.userId, job.external_id).run();
    return Response.json({ analysis });
  } catch (error) { return Response.json({ error: databaseErrorMessage(error) }, { status: 500 }); }
}
