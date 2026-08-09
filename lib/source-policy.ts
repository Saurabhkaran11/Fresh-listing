/**
 * Source access is deliberately explicit.  A portal can be shown in the
 * search UI without being a server-side scraper target.
 *
 * Keep this module dependency-free so it can be used by the Worker API and
 * the client dashboard without duplicating provider policy in two places.
 */
export type JobSource = "linkedin" | "indeed" | "builtin" | "glassdoor" | "greenhouse" | "trueup" | "google_jobs";
export type SourceAccessMode = "public_api" | "approved_api" | "manual";

export type SourcePolicy = {
  id: JobSource;
  label: string;
  accessMode: SourceAccessMode;
  automated: boolean;
  detail: string;
  userAction: string;
  searchUrl?: (keywords: string, location: string, timeWindow: string) => string;
};

export const SOURCE_POLICIES: readonly SourcePolicy[] = [
  {
    id: "google_jobs",
    label: "Google Jobs",
    accessMode: "approved_api",
    automated: true,
    detail: "Automated feed",
    userAction: "Uses the configured SerpApi provider; no job-portal password is collected.",
  },
  {
    id: "greenhouse",
    label: "Greenhouse",
    accessMode: "public_api",
    automated: true,
    detail: "Public board API",
    userAction: "Enter public board tokens (for example, stripe or airbnb). No login is required for job discovery.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    accessMode: "approved_api",
    automated: false,
    detail: "Approved API only",
    userAction: "Open the native search and save a link manually unless LinkedIn grants an approved partner integration.",
    searchUrl: (keywords, location, timeWindow) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_TPR=${encodeURIComponent(timeWindow)}`,
  },
  {
    id: "indeed",
    label: "Indeed",
    accessMode: "approved_api",
    automated: false,
    detail: "Partner API or native",
    userAction: "Open the native search or use an Indeed-approved partner integration.",
    searchUrl: (keywords, location, timeWindow) => `https://www.indeed.com/jobs?q=${encodeURIComponent(keywords)}&l=${encodeURIComponent(location)}&fromage=${timeWindow === "r86400" ? "1" : timeWindow === "r604800" ? "7" : "30"}`,
  },
  {
    id: "builtin",
    label: "Built In",
    accessMode: "manual",
    automated: false,
    detail: "Manual import",
    userAction: "Open the native search and paste the job URL or import a CSV; no public developer API was verified.",
    searchUrl: (keywords) => `https://builtin.com/jobs?search=${encodeURIComponent(keywords)}`,
  },
  {
    id: "glassdoor",
    label: "Glassdoor",
    accessMode: "approved_api",
    automated: false,
    detail: "Written approval required",
    userAction: "Open the native search unless Glassdoor approves an API/partner integration for this application.",
    searchUrl: (keywords) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(keywords)}`,
  },
  {
    id: "trueup",
    label: "TrueUp",
    accessMode: "manual",
    automated: false,
    detail: "Manual import",
    userAction: "Open the native search and paste the job URL or import a CSV; automated login/search requires written consent.",
    searchUrl: (keywords) => `https://www.trueup.io/jobs?search=${encodeURIComponent(keywords)}`,
  },
] as const;

export const SOURCE_IDS = SOURCE_POLICIES.map((source) => source.id) as JobSource[];
export const AUTOMATED_SOURCE_IDS = SOURCE_POLICIES.filter((source) => source.automated).map((source) => source.id) as JobSource[];

export function getSourcePolicy(source: string): SourcePolicy | undefined {
  return SOURCE_POLICIES.find((item) => item.id === source);
}

export function normalizeSources(sources: unknown, fallback: JobSource[] = ["google_jobs", "greenhouse"]): JobSource[] {
  const values = Array.isArray(sources) ? sources : [];
  const normalized = [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter((value): value is JobSource => SOURCE_IDS.includes(value as JobSource)))];
  return normalized.length ? normalized : fallback;
}

export type SourceLink = { source: JobSource; label: string; url: string; note: string };

export function buildSourceLinks(keywords: string, location: string, timeWindow: string, sources: JobSource[]): SourceLink[] {
  return sources.flatMap((source) => {
    const policy = getSourcePolicy(source);
    if (!policy?.searchUrl || policy.automated) return [];
    return [{
      source,
      label: policy.label,
      url: policy.searchUrl(keywords, location, timeWindow),
      note: policy.userAction,
    }];
  });
}

export function describeManualSources(sources: JobSource[]): string {
  const labels = sources.flatMap((source) => {
    const policy = getSourcePolicy(source);
    return policy && !policy.automated ? [policy.label] : [];
  });
  return labels.length ? `${labels.join(", ")} are available as native-search/manual sources; no portal password or browser cookie is stored.` : "";
}
