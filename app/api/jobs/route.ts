import { NextRequest } from "next/server";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  link: string;
};

const TIME_WINDOWS = new Set(["r86400", "r604800", "r2592000"]);
const PAGE_SIZE = 25;
const MAX_RESULTS = 250;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keywords = cleanInput(searchParams.get("keywords"), 120);
  const location = cleanInput(searchParams.get("location"), 120) || "Worldwide";
  const time = TIME_WINDOWS.has(searchParams.get("time") || "") ? searchParams.get("time")! : "r86400";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || MAX_RESULTS, PAGE_SIZE), MAX_RESULTS);

  if (!keywords) return Response.json({ error: "A job title or keyword is required." }, { status: 400 });

  const jobs = new Map<string, Job>();
  let scanned = 0;
  let exhausted = false;

  try {
    for (let start = 0; start < limit; start += PAGE_SIZE) {
      const target = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
      target.search = new URLSearchParams({ keywords, location, f_TPR: time, start: String(start) }).toString();
      const response = await fetch(target, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FreshListings/1.0; +https://fresh-listings.example)",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) throw new Error(response.status === 429 ? "LinkedIn is temporarily rate-limiting searches. Please retry in a minute." : "LinkedIn's public search is unavailable right now.");

      const pageJobs = parseJobs(await response.text());
      scanned += pageJobs.length;
      pageJobs.forEach((job) => jobs.set(job.id, job));
      if (pageJobs.length < PAGE_SIZE) { exhausted = true; break; }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search is unavailable right now.";
    return Response.json({ error: message }, { status: 502 });
  }

  return Response.json(
    {
      jobs: [...jobs.values()].slice(0, limit),
      scanned,
      exhausted,
      notice: exhausted ? undefined : "LinkedIn returned a full set of results; showing the first 250 public listings.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function parseJobs(html: string): Job[] {
  // A card contains nested elements with `base-search-card` in their class names,
  // so split at the outer result list item rather than at every matching div.
  const cards = html
    .split(/(?=<li\b)/i)
    .filter((card) => /base-search-card--link/i.test(card));
  return cards.flatMap((card) => {
    const id = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/i)?.[1];
    const link = card.match(/href="(https:\/\/[^\"]*linkedin\.com\/jobs\/view\/[^\"?]+)[^\"]*"/i)?.[1];
    const title = getClassText(card, "base-search-card__title");
    const company = getClassText(card, "base-search-card__subtitle");
    const location = getClassText(card, "job-search-card__location");
    const posted = getClassText(card, "job-search-card__listdate") || getClassText(card, "job-search-card__listdate--new");
    if (!id || !link || !title || !company) return [];
    return [{ id, link: decodeHtml(link), title, company, location: location || "Location not listed", posted: posted || "Recently posted" }];
  });
}

function getClassText(card: string, className: string) {
  const match = card.match(new RegExp(`<[^>]*class="[^\"]*${className}[^\"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function cleanInput(value: string | null, maxLength: number) {
  return (value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
