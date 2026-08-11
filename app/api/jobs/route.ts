import { NextRequest } from "next/server";
import { buildSourceLinks, describeManualSources, normalizeSources, type JobSource } from "../../../lib/source-policy";

type Source = JobSource;
type Job = { id: string; title: string; company: string; location: string; posted: string; link: string; source: Source; portal: string; provider: string; capturedAt: string };

const TIME_WINDOWS = new Set(["r86400", "r604800", "r2592000"]);
const MAX_RESULTS = 250;

/**
 * Compatibility route for clients that still call GET /api/jobs.  It exposes
 * public Greenhouse board data and native-search links; it never crawls a
 * signed-in portal or accepts a job-board credential.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keywords = cleanInput(searchParams.get("keywords"), 120);
  const location = cleanInput(searchParams.get("location"), 120) || "Worldwide";
  const time = TIME_WINDOWS.has(searchParams.get("time") || "") ? searchParams.get("time")! : "r86400";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || MAX_RESULTS, 25), MAX_RESULTS);
  const sources = parseSources(searchParams.get("sources"));
  const greenhouseBoards = parseBoardTokens(searchParams.get("greenhouseBoards"));

  if (!keywords) return Response.json({ error: "A job title or keyword is required." }, { status: 400 });

  const jobs = new Map<string, Job>();
  let scanned = 0;
  const notices: string[] = [];

  if (sources.includes("greenhouse")) {
    if (!greenhouseBoards.length) {
      notices.push("Greenhouse discovery is public, but it needs one or more company board tokens.");
    } else {
      const results = await Promise.all(greenhouseBoards.map(async (board) => {
        try { return await fetchGreenhouseBoard(board, keywords, location, time); }
        catch { return { jobs: [] as Job[], scanned: 0, notice: `Could not read the Greenhouse board “${board}”.` }; }
      }));
      for (const result of results) {
        scanned += result.scanned;
        result.jobs.forEach((job) => jobs.set(job.id, job));
        if (result.notice) notices.push(result.notice);
      }
    }
  }

  if (sources.includes("linkedin")) notices.push("LinkedIn live scraping is intentionally disabled; use its native search or an approved LinkedIn API integration.");
  const manualNotice = describeManualSources(sources);
  if (manualNotice) notices.push(manualNotice);

  const sortedJobs = [...jobs.values()].sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title)).slice(0, limit);
  return Response.json({
    jobs: sortedJobs,
    scanned,
    exhausted: Boolean(greenhouseBoards.length),
    sources,
    sourceLinks: buildSourceLinks(keywords, location, time, sources),
    notice: notices.join(" ") || "Public results are shown above; restricted portals remain native-search links until approved access is available.",
  }, { headers: { "cache-control": "no-store" } });
}

async function fetchGreenhouseBoard(board: string, keywords: string, location: string, time: string) {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}`;
  const [boardResponse, jobsResponse] = await Promise.all([fetch(base), fetch(`${base}/jobs?content=true`)]);
  if (!jobsResponse.ok) return { jobs: [] as Job[], scanned: 0, notice: `Could not read the Greenhouse board “${board}”.` };

  const company = boardResponse.ok ? cleanInput(((await boardResponse.json()) as { name?: string }).name || board, 160) : board;
  const payload = await jobsResponse.json() as { jobs?: Array<{ id: number; title?: string; updated_at?: string; first_published?: string; location?: { name?: string }; absolute_url?: string }> };
  const cutoff = Date.now() - timeWindowMs(time);
  const query = keywords.toLocaleLowerCase();
  const requestedLocation = location.toLocaleLowerCase();
  const sourceJobs = (payload.jobs || []).filter((job) => {
    const freshness = Date.parse(job.first_published || job.updated_at || "");
    const text = `${job.title || ""} ${job.location?.name || ""}`.toLocaleLowerCase();
    const keywordMatch = text.includes(query);
    const locationMatch = location === "Worldwide" || (job.location?.name || "").toLocaleLowerCase().includes(requestedLocation);
    return keywordMatch && locationMatch && (!Number.isFinite(freshness) || freshness >= cutoff);
  });

  return {
    scanned: payload.jobs?.length || 0,
    jobs: sourceJobs.flatMap((job) => {
      if (!job.id || !job.title || !job.absolute_url) return [];
      const date = job.first_published || job.updated_at;
      return [{ id: `greenhouse-${board}-${job.id}`, title: job.title, company, location: job.location?.name || "Location not listed", posted: date ? `Updated ${new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Recently listed", link: job.absolute_url, source: "greenhouse" as const, portal: "Greenhouse", provider: "Greenhouse public board API", capturedAt: new Date().toISOString() }];
    }),
  };
}

function parseSources(value: string | null): Source[] { return normalizeSources(value ? value.split(",") : undefined); }
function parseBoardTokens(value: string | null) { return [...new Set((value || "").split(",").map((token) => token.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]/g, "")).filter(Boolean))].slice(0, 12); }
function timeWindowMs(time: string) { return time === "r86400" ? 86_400_000 : time === "r604800" ? 604_800_000 : 2_592_000_000; }
function cleanInput(value: string | null, maxLength: number) { return (value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength); }
