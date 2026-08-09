import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("renders the Fresh Listings experience", async () => {
  const [page, insights, route, extension, popup, layout, scraperRoute, googleRoute, googleStatus, aiRoute, schema, hosting, telegramRoute, analyticsRoute, realtimeServer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/insights-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/popup.js", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scraper/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/fit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analytics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../realtime/server.mjs", import.meta.url), "utf8"),
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
  assert.match(page, /InsightsPanel/);
  assert.match(insights, /AreaChart/);
  assert.match(insights, /socket.io-client/);
  assert.match(scraperRoute, /SERPAPI_API_KEY|collectJobs/);
  assert.match(googleRoute, /syncJobsToSheet/);
  assert.match(googleStatus, /googleAccountEmail|driveFolderUrl/);
  assert.match(aiRoute, /GEMINI_API_KEY/);
  assert.match(schema, /jobPostings/);
  assert.match(schema, /telegramLinks/);
  assert.match(telegramRoute, /TELEGRAM_WEBHOOK_SECRET|webhookSecret/);
  assert.match(analyticsRoute, /scrape_runs/);
  assert.match(realtimeServer, /Socket.IO|socket.io/);
  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(layout, /Fresh Listings/);
  assert.match(layout, /og\.png/);
});
