import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("renders the Fresh Listings experience", async () => {
  const [page, route, extension, popup, layout, scraperRoute, googleRoute, aiRoute, schema, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/popup.js", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scraper/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/fit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Don&apos;t miss the/);
  assert.match(page, /Last 24 hours/);
  assert.match(page, /Last 7 days/);
  assert.match(page, /Last 30 days/);
  assert.match(page, /\/api\/scraper\/run/);
  assert.match(page, /Google Drive archive/);
  assert.match(page, /fresh-listings-extension\.zip/);
  assert.match(page, /Greenhouse board tokens/);
  assert.match(route, /boards-api\.greenhouse\.io/);
  assert.match(route, /indeed/);
  assert.match(extension, /manifest_version/);
  assert.match(extension, /linkedin\.com/);
  assert.match(popup, /Search LinkedIn/);
  assert.match(page, /Automation control room/);
  assert.match(scraperRoute, /SERPAPI_API_KEY|collectJobs/);
  assert.match(googleRoute, /syncJobsToSheet/);
  assert.match(aiRoute, /GEMINI_API_KEY/);
  assert.match(schema, /jobPostings/);
  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(layout, /Fresh Listings/);
  assert.match(layout, /og\.png/);
});
