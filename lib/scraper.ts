import { runtimeEnv } from "./runtime-db";

export type NormalizedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  source: string;
  directUrl: string;
  applyUrl: string | null;
  description: string;
  postedAt: string | null;
  remoteStatus: string | null;
  experience: string | null;
  salary: string | null;
  skills: string[];
};

type SerpJob = {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  share_link?: string;
  apply_options?: Array<{ link?: string; title?: string }>;
  detected_extensions?: { posted_at?: string; schedule_type?: string; work_from_home?: boolean; salary?: string };
  extensions?: string[];
};

export async function collectJobs(input: { keywords: string; location: string; timeWindow: string; sources: string[]; greenhouseBoards: string[] }) {
  const config = runtimeEnv();
  if (config.SERPAPI_API_KEY) {
    const jobs = await fetchSerpApiJobs(input.keywords, input.location, input.timeWindow, String(config.SERPAPI_API_KEY));
    return { provider: "serpapi_google_jobs", jobs };
  }

  try {
    const jobs = await fetchLinkedInJobs(input.keywords, input.location, input.timeWindow);
    return { provider: "linkedin_public_fallback", jobs };
  } catch {
    throw new Error("No live job provider is configured. Add SERPAPI_API_KEY for automated Google Jobs collection, or use the free browser extension for LinkedIn collection.");
  }
}

async function fetchSerpApiJobs(keywords: string, location: string, timeWindow: string, apiKey: string): Promise<NormalizedJob[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "google_jobs", q: keywords, location, api_key: apiKey, hl: "en" }).toString();
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`The job provider returned HTTP ${response.status}.`);
  const payload = await response.json() as { jobs_results?: SerpJob[]; error?: string };
  if (payload.error) throw new Error(payload.error);
  return (payload.jobs_results || []).filter((job) => isInWindow(job.detected_extensions?.posted_at, timeWindow)).flatMap((job) => {
    const title = clean(job.title);
    const company = clean(job.company_name);
    const directUrl = job.share_link || job.apply_options?.[0]?.link || "";
    if (!title || !company || !directUrl) return [];
    const applyUrl = job.apply_options?.[0]?.link || directUrl;
    return [{
      externalId: `google-jobs-${job.job_id || stableId(`${company}-${title}-${directUrl}`)}`,
      title,
      company,
      location: clean(job.location) || "Location not listed",
      source: "Google Jobs",
      directUrl,
      applyUrl,
      description: clean(job.description),
      postedAt: clean(job.detected_extensions?.posted_at) || null,
      remoteStatus: job.detected_extensions?.work_from_home ? "Remote" : null,
      experience: job.detected_extensions?.schedule_type || null,
      salary: job.detected_extensions?.salary || null,
      skills: extractSkills(`${job.title || ""} ${job.description || ""}`),
    }];
  });
}

async function fetchLinkedInJobs(keywords: string, location: string, timeWindow: string): Promise<NormalizedJob[]> {
  const target = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
  target.search = new URLSearchParams({ keywords, location, f_TPR: timeWindow, start: "0" }).toString();
  const response = await fetch(target, { headers: { "user-agent": "Mozilla/5.0 (compatible; FreshListings/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" } });
  if (!response.ok) throw new Error("LinkedIn public search is unavailable.");
  return parseLinkedInJobs(await response.text());
}

function parseLinkedInJobs(html: string): NormalizedJob[] {
  return html.split(/(?=<li\b)/i).filter((card) => /base-search-card--link/i.test(card)).flatMap((card) => {
    const id = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/i)?.[1];
    const directUrl = card.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"?]+)[^"]*"/i)?.[1];
    const title = classText(card, "base-search-card__title");
    const company = classText(card, "base-search-card__subtitle");
    if (!id || !directUrl || !title || !company) return [];
    return [{ externalId: `linkedin-${id}`, title, company, location: classText(card, "job-search-card__location") || "Location not listed", source: "LinkedIn", directUrl: decodeHtml(directUrl), applyUrl: decodeHtml(directUrl), description: "", postedAt: classText(card, "job-search-card__listdate") || null, remoteStatus: null, experience: null, salary: null, skills: extractSkills(title) }];
  });
}

function isInWindow(posted: string | undefined, timeWindow: string) {
  if (!posted) return true;
  const value = posted.toLowerCase();
  const match = value.match(/(\d+)\s*(hour|day|week|month)/);
  if (!match) return !value.includes("30+");
  const amount = Number(match[1]);
  const unit = match[2];
  const ageMs = unit === "hour" ? amount * 3_600_000 : unit === "day" ? amount * 86_400_000 : unit === "week" ? amount * 604_800_000 : amount * 2_592_000_000;
  const maxMs = timeWindow === "r86400" ? 86_400_000 : timeWindow === "r604800" ? 604_800_000 : 2_592_000_000;
  return ageMs <= maxMs;
}

function classText(card: string, className: string) {
  const match = card.match(new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(clean(match[1].replace(/<[^>]*>/g, " "))) : "";
}

function clean(value: unknown) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000); }
function decodeHtml(value: string) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function stableId(value: string) { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return Math.abs(hash).toString(36); }
function extractSkills(text: string) { const known = ["typescript", "javascript", "react", "node.js", "python", "java", "sql", "aws", "gcp", "azure", "docker", "kubernetes", "graphql", "figma", "product design", "machine learning"]; const lower = text.toLowerCase(); return known.filter((skill) => lower.includes(skill)); }
