import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("restricted sources are represented as policy metadata instead of scrapers", async () => {
  const [policy, scraper, jobsRoute, manifest, extension] = await Promise.all([
    readFile(new URL("../lib/source-policy.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/scraper.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/popup.js", import.meta.url), "utf8"),
  ]);

  for (const source of ["linkedin", "indeed", "builtin", "glassdoor", "greenhouse", "trueup", "google_jobs"]) assert.match(policy, new RegExp(`"${source}"`));
  assert.match(policy, /public_api/);
  assert.match(policy, /approved_api/);
  assert.match(policy, /manual/);
  assert.match(scraper, /boards-api\.greenhouse\.io/);
  assert.match(scraper, /jobs\?content=true/);
  assert.doesNotMatch(scraper, /linkedin\.com|jobs-guest|browser extension/i);
  assert.doesNotMatch(jobsRoute, /linkedin\.com|jobs-guest|fetchLinkedInJobs/);
  assert.doesNotMatch(manifest, /activeTab|scripting|linkedin\.com/);
  assert.doesNotMatch(extension, /executeScript|tabs\.query|linkedin\.com|jobs-guest/);
});
