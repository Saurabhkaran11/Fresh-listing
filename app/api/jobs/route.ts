import { NextRequest } from "next/server";

type Source = "linkedin" | "indeed" | "builtin" | "glassdoor" | "greenhouse" | "trueup";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  link: string;
  source: Source;
  capturedAt: string;
};

type SourceLink = { source: Source; label: string; url: string; note: string };

const TIME_WINDOWS = new Set(["r86400", "r604800", "r2592000"]);
const SOURCE_IDS = new Set<Source>(["linkedin", "indeed", "builtin", "glassdoor", "greenhouse", "trueup"]);
const PAGE_SIZE = 25;
const MAX_RESULTS = 250;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keywords = cleanInput(searchParams.get("keywords"), 120);
  const location = cleanInput(searchParams.get("location"), 120) || "Worldwide";
  const time = TIME_WINDOWS.has(searchParams.get("time") || "") ? searchParams.get("time")! : "r86400";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || MAX_RESULTS, PAGE_SIZE), MAX_RESULTS);
  const sources = parseSources(searchParams.get("sources"));
  const greenhouseBoards = parseBoardTokens(searchParams.get("greenhouseBoards"));

  if (!keywords) return Response.json({ error: "A job title or keyword is required." }, { status: 400 });

  const jobs = new Map<string, Job>();
  let scanned = 0;
  let exhausted = false;
  const notices: string[] = [];

  if (sources.includes("linkedin")) {
    try {
      const linkedIn = await fetchLinkedInJobs(keywords, location, time, limit);
      linkedIn.jobs.forEach((job) => jobs.set(job.id, job));
      scanned += linkedIn.scanned;
      exhausted = linkedIn.exhausted;
    } catch {
      notices.push("LinkedIn live collection runs in the free Fresh Listings browser extension. Download it below to search from your own browser and save selected jobs to Drive.");
    }
  }

  if (sources.includes("greenhouse")) {
    if (!greenhouseBoards.length) {
      notices.push("Add public Greenhouse board tokens to collect company career-board results.");
    } else {
      const results = await Promise.all(greenhouseBoards.map(async (board) => {
        try {
          return await fetchGreenhouseBoard(board, keywords, location, time);
        } catch {
          return { jobs: [] as Job[], scanned: 0, notice: `Could not read the Greenhouse board “${board}”.` };
        }
      }));
      for (const result of results) {
        scanned += result.scanned;
        result.jobs.forEach((job) => jobs.set(job.id, job));
        if (result.notice) notices.push(result.notice);
      }
    }
  }

  if (sources.some((source) => ["indeed", "builtin", "glassdoor", "trueup"].includes(source))) {
    notices.push("Use the source shortcuts below for Indeed, Built In, Glassdoor, and TrueUp; the extension can save each job you choose there.");
  }

  const sortedJobs = [...jobs.values()]
    .sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title))
    .slice(0, limit);

  return Response.json(
    {
      jobs: sortedJobs,
      scanned,
      exhausted,
      sources,
      sourceLinks: buildSourceLinks(keywords, location, time, sources),
      notice: notices.join(" ") || (exhausted ? undefined : "LinkedIn returned a full set of results; showing the first 250 public listings."),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function fetchLinkedInJobs(keywords: string, location: string, time: string, limit: number) {
  const jobs = new Map<string, Job>();
  let scanned = 0;
  let exhausted = false;

  for (let start = 0; start < limit; start += PAGE_SIZE) {
    const target = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
    target.search = new URLSearchParams({ keywords, location, f_TPR: time, start: String(start) }).toString();
    const response = await fetch(target, { headers: publicFeedHeaders() });
    if (!response.ok) throw new Error(response.status === 429 ? "LinkedIn is temporarily rate-limiting searches. Please retry in a minute." : "LinkedIn's public search is unavailable right now.");

    const pageJobs = parseLinkedInJobs(await response.text());
    scanned += pageJobs.length;
    pageJobs.forEach((job) => jobs.set(job.id, job));
    if (pageJobs.length < PAGE_SIZE) { exhausted = true; break; }
  }

  return { jobs: [...jobs.values()], scanned, exhausted };
}

async function fetchGreenhouseBoard(board: string, keywords: string, location: string, time: string) {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}`;
  const [boardResponse, jobsResponse] = await Promise.all([fetch(base), fetch(`${base}/jobs`)]);
  if (!jobsResponse.ok) return { jobs: [] as Job[], scanned: 0, notice: `Could not read the Greenhouse board “${board}”.` };

  const company = boardResponse.ok ? ((await boardResponse.json() as { name?: string }).name || board) : board;
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
      return [{
        id: `greenhouse-${board}-${job.id}`,
        title: job.title,
        company,
        location: job.location?.name || "Location not listed",
        posted: date ? `Updated ${new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Recently listed",
        link: job.absolute_url,
        source: "greenhouse" as const,
        capturedAt: new Date().toISOString(),
      }];
    }),
  };
}

function parseLinkedInJobs(html: string): Job[] {
  return html
    .split(/(?=<li\b)/i)
    .filter((card) => /base-search-card--link/i.test(card))
    .flatMap((card) => {
      const id = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/i)?.[1];
      const link = card.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"?]+)[^"]*"/i)?.[1];
      const title = getClassText(card, "base-search-card__title");
      const company = getClassText(card, "base-search-card__subtitle");
      const location = getClassText(card, "job-search-card__location");
      const posted = getClassText(card, "job-search-card__listdate") || getClassText(card, "job-search-card__listdate--new");
      if (!id || !link || !title || !company) return [];
      return [{ id: `linkedin-${id}`, link: decodeHtml(link), title, company, location: location || "Location not listed", posted: posted || "Recently posted", source: "linkedin" as const, capturedAt: new Date().toISOString() }];
    });
}

function buildSourceLinks(keywords: string, location: string, time: string, sources: Source[]): SourceLink[] {
  const encodedKeywords = encodeURIComponent(keywords);
  const encodedLocation = encodeURIComponent(location);
  const days = time === "r86400" ? "1" : time === "r604800" ? "7" : "30";
  const all: Record<Exclude<Source, "greenhouse">, SourceLink> = {
    linkedin: { source: "linkedin", label: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${encodedKeywords}&location=${encodedLocation}&f_TPR=${time}`, note: "Open native search or use extension" },
    indeed: { source: "indeed", label: "Indeed", url: `https://www.indeed.com/jobs?q=${encodedKeywords}&l=${encodedLocation}&fromage=${days}`, note: "Open native search" },
    builtin: { source: "builtin", label: "Built In", url: `https://builtin.com/jobs?search=${encodedKeywords}`, note: "Open native search" },
    glassdoor: { source: "glassdoor", label: "Glassdoor", url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodedKeywords}`, note: "Open native search" },
    trueup: { source: "trueup", label: "TrueUp", url: `https://www.trueup.io/jobs?search=${encodedKeywords}`, note: "Open native search" },
  };
  return sources.filter((source) => source !== "greenhouse").map((source) => all[source]);
}

function publicFeedHeaders() {
  return { "user-agent": "Mozilla/5.0 (compatible; FreshListings/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" };
}

function parseSources(value: string | null): Source[] {
  const sourceList = (value || "linkedin,indeed,builtin,glassdoor,greenhouse,trueup").split(",").map((source) => source.trim().toLocaleLowerCase()).filter((source): source is Source => SOURCE_IDS.has(source as Source));
  return sourceList.length ? [...new Set(sourceList)] : ["linkedin"];
}

function parseBoardTokens(value: string | null) {
  return [...new Set((value || "").split(",").map((token) => token.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]/g, "")).filter(Boolean))].slice(0, 12);
}

function timeWindowMs(time: string) {
  return time === "r86400" ? 86_400_000 : time === "r604800" ? 604_800_000 : 2_592_000_000;
}

function getClassText(card: string, className: string) {
  const match = card.match(new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function cleanInput(value: string | null, maxLength: number) {
  return (value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
