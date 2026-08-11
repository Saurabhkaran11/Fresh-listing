import { runtimeEnv } from "./runtime-db";
import { buildSourceLinks, getSourcePolicy, normalizeSources, type JobSource, type SourceLink } from "./source-policy";

export type NormalizedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  source: JobSource;
  portal: string;
  provider: string;
  directUrl: string;
  applyUrl: string | null;
  description: string;
  postedAt: string | null;
  remoteStatus: string | null;
  experience: string | null;
  salary: string | null;
  skills: string[];
};

type SearchApiJob = {
  position?: number;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  via?: string;
  sharing_link?: string;
  apply_link?: string;
  apply_links?: Array<{ link?: string; source?: string }>;
  detected_extensions?: {
    posted_at?: string;
    schedule?: string;
    schedule_type?: string;
    salary?: string;
    work_from_home?: boolean;
  };
  extensions?: string[];
};

type GreenhouseJob = {
  id?: number;
  title?: string;
  updated_at?: string;
  first_published?: string;
  content?: string;
  location?: { name?: string };
  absolute_url?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
};

type GreenhousePayload = { jobs?: GreenhouseJob[] };

export type CollectResult = {
  provider: string;
  jobs: NormalizedJob[];
  scanned: number;
  notices: string[];
  sourceLinks: SourceLink[];
};

/**
 * Collect only from public or explicitly approved providers.  Restricted
 * portals are represented as native-search links and never receive a user
 * password, session cookie, CAPTCHA token, or browser-automation request.
 */
export async function collectJobs(input: { keywords: string; location: string; timeWindow: string; sources: unknown; greenhouseBoards: string[] }): Promise<CollectResult> {
  const config = runtimeEnv();
  const sources = normalizeSources(input.sources);
  const jobs: NormalizedJob[] = [];
  const notices: string[] = [];
  const providers: string[] = [];
  let scanned = 0;

  if (sources.includes("google_jobs")) {
    const searchApiKey = config.SEARCHAPI_API_KEY;
    if (searchApiKey) {
      const result = await fetchSearchApiJobs(input.keywords, input.location, input.timeWindow, String(searchApiKey));
      jobs.push(...result.jobs);
      scanned += result.scanned;
      providers.push("searchapi_google_jobs");
    } else {
      notices.push("Google Jobs automation is not configured. Add SEARCHAPI_API_KEY to enable the approved SearchApi provider.");
    }
  }

  if (sources.includes("greenhouse")) {
    if (!input.greenhouseBoards.length) {
      notices.push("Greenhouse discovery is public, but it needs one or more company board tokens (for example, stripe or airbnb).");
    } else {
      const results = await Promise.all(input.greenhouseBoards.map((board) => fetchGreenhouseBoard(board, input.keywords, input.location, input.timeWindow)));
      results.forEach((result) => {
        jobs.push(...result.jobs);
        scanned += result.scanned;
      });
      providers.push("greenhouse_job_board");
    }
  }

  const manualSources = sources.filter((source) => !getSourcePolicy(source)?.automated);
  if (manualSources.length) notices.push(`${manualSources.map((source) => getSourcePolicy(source)?.label || source).join(", ")} are available through native search/manual import. No portal password or browser cookie is stored.`);

  const deduped = [...new Map(jobs.map((job) => [job.externalId, job])).values()];
  const sourceLinks = buildSourceLinks(input.keywords, input.location, input.timeWindow, sources);
  const automatedSourcesRequested = sources.some((source) => getSourcePolicy(source)?.automated);
  if (!deduped.length && automatedSourcesRequested && !manualSources.length) {
    throw new Error(notices.join(" ") || "No approved/public job provider returned results.");
  }

  return {
    provider: providers.join("+") || "manual_sources",
    jobs: deduped,
    scanned,
    notices,
    sourceLinks,
  };
}

/**
 * SearchApi's Google Jobs engine aggregates public job listings without
 * logging in to individual portals. The returned portal is derived from the
 * provider's application source metadata, so users can see where each result
 * came from without confusing an aggregator with a job-board login.
 */
async function fetchSearchApiJobs(keywords: string, location: string, timeWindow: string, apiKey: string) {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", keywords);
  url.searchParams.set("hl", "en");
  if (location && location !== "Worldwide") url.searchParams.set("location", location);

  const response = await fetch(url, { headers: { accept: "application/json", authorization: `Bearer ${apiKey}` } });
  const payload = await response.json().catch(() => ({})) as { jobs?: SearchApiJob[]; error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error || payload.message || `The SearchApi provider returned HTTP ${response.status}.`);

  const sourceJobs = payload.jobs || [];
  return {
    scanned: sourceJobs.length,
    jobs: sourceJobs.filter((job) => isInWindow(job.detected_extensions?.posted_at, timeWindow)).flatMap((job) => {
      const title = clean(job.title);
      const company = clean(job.company_name);
      const directUrl = job.apply_link || job.apply_links?.[0]?.link || job.sharing_link || "";
      if (!title || !company || !directUrl) return [];
      const applyUrl = directUrl;
      const metadata = `${job.title || ""} ${job.description || ""} ${job.location || ""} ${(job.extensions || []).join(" ")}`;
      const portal = clean(job.apply_links?.[0]?.source || job.via).replace(/^via\s+/i, "") || "Google Jobs";
      return [{
        externalId: `google-jobs-${stableId(`${company}-${title}-${directUrl}`)}`,
        title,
        company,
        location: clean(job.location) || "Location not listed",
        source: "google_jobs" as const,
        portal,
        provider: "SearchApi Google Jobs",
        directUrl,
        applyUrl,
        description: clean(job.description),
        postedAt: clean(job.detected_extensions?.posted_at) || null,
        remoteStatus: job.detected_extensions?.work_from_home || /remote/i.test(metadata) ? "Remote" : null,
        experience: job.detected_extensions?.schedule_type || job.detected_extensions?.schedule || null,
        salary: job.detected_extensions?.salary || null,
        skills: extractSkills(metadata),
      }];
    }),
  };
}

async function fetchGreenhouseBoard(board: string, keywords: string, location: string, timeWindow: string) {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}`;
  const [boardResponse, jobsResponse] = await Promise.all([fetch(base), fetch(`${base}/jobs?content=true`)]);
  if (!jobsResponse.ok) throw new Error(`Could not read the public Greenhouse board “${board}” (HTTP ${jobsResponse.status}).`);

  const company = boardResponse.ok ? clean((await boardResponse.json() as { name?: string }).name) || board : board;
  const payload = await jobsResponse.json() as GreenhousePayload;
  const query = keywords.toLocaleLowerCase();
  const requestedLocation = location.toLocaleLowerCase();
  const cutoff = Date.now() - windowMs(timeWindow);
  const sourceJobs = (payload.jobs || []).filter((job) => {
    const text = `${job.title || ""} ${job.content || ""} ${job.departments?.map((item) => item.name || "").join(" ") || ""} ${job.location?.name || ""}`.toLocaleLowerCase();
    const keywordMatch = text.includes(query);
    const locationMatch = location === "Worldwide" || (job.location?.name || "").toLocaleLowerCase().includes(requestedLocation);
    const dateValue = job.first_published || job.updated_at;
    const timestamp = dateValue ? Date.parse(dateValue) : Number.NaN;
    return keywordMatch && locationMatch && (!Number.isFinite(timestamp) || timestamp >= cutoff);
  });

  return {
    scanned: payload.jobs?.length || 0,
    jobs: sourceJobs.flatMap((job) => {
      if (!job.id || !job.title || !job.absolute_url) return [];
      const date = job.first_published || job.updated_at;
      const office = job.offices?.map((item) => item.location || item.name || "").filter(Boolean).join(", ");
      return [{
        externalId: `greenhouse-${board}-${job.id}`,
        title: clean(job.title),
        company,
        location: clean(job.location?.name || office) || "Location not listed",
        source: "greenhouse" as const,
        portal: "Greenhouse",
        provider: "Greenhouse public board API",
        directUrl: job.absolute_url,
        applyUrl: job.absolute_url,
        description: clean(job.content),
        postedAt: date || null,
        remoteStatus: /remote/i.test(`${job.location?.name || ""} ${job.content || ""}`) ? "Remote" : null,
        experience: null,
        salary: null,
        skills: extractSkills(`${job.title || ""} ${job.content || ""}`),
      }];
    }),
  };
}

function isInWindow(posted: string | undefined, timeWindow: string) {
  if (!posted) return true;
  const value = posted.toLowerCase();
  const parsedDate = Date.parse(posted);
  if (Number.isFinite(parsedDate)) return parsedDate >= Date.now() - windowMs(timeWindow);
  const match = value.match(/(\d+)\s*(hour|day|week|month)/);
  if (!match) return !value.includes("30+");
  const amount = Number(match[1]);
  const unit = match[2];
  const ageMs = unit === "hour" ? amount * 3_600_000 : unit === "day" ? amount * 86_400_000 : unit === "week" ? amount * 604_800_000 : amount * 2_592_000_000;
  return ageMs <= windowMs(timeWindow);
}

function windowMs(timeWindow: string) { return timeWindow === "r86400" ? 86_400_000 : timeWindow === "r604800" ? 604_800_000 : 2_592_000_000; }
function clean(value: unknown) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 8000); }
function stableId(value: string) { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return Math.abs(hash).toString(36); }
function extractSkills(text: string) { const known = ["typescript", "javascript", "react", "node.js", "python", "java", "sql", "aws", "gcp", "azure", "docker", "kubernetes", "graphql", "figma", "product design", "machine learning"]; const lower = text.toLowerCase(); return known.filter((skill) => lower.includes(skill)); }
