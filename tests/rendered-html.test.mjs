import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("renders the Fresh Listings experience", async () => {
  const [page, insights, route, extension, popup, popupHtml, layout, scraperRoute, googleRoute, googleStatus, aiRoute, runtimeDb, auth, telegramRoute, analyticsRoute, realtimeServer, sourcePolicy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/insights-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/popup.js", import.meta.url), "utf8"),
    readFile(new URL("../extension/fresh-listings/popup.html", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scraper/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/fit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/runtime-db.ts", import.meta.url), "utf8"),
    readFile(new URL("../auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analytics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../realtime/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/source-policy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Don&apos;t miss the/);
  assert.match(page, /Last 24 hours/);
  assert.match(page, /Last 7 days/);
  assert.match(page, /Last 30 days/);
  assert.match(page, /\/api\/scraper\/run/);
  assert.match(page, /Google Drive archive/);
  assert.match(page, /Manual save helper/);
  assert.match(page, /Greenhouse board tokens/);
  assert.match(route, /boards-api\.greenhouse\.io/);
  assert.match(route, /Greenhouse/);
  assert.doesNotMatch(route, /jobs-guest|fetchLinkedInJobs/);
  assert.match(extension, /manifest_version/);
  assert.match(popup, /saveManualJob|Save job to Drive/);
  assert.doesNotMatch(popup, /executeScript|jobs-guest/);
  assert.match(popupHtml, /Manual job save helper/);
  assert.match(page, /Automation control room/);
  assert.match(page, /InsightsPanel/);
  assert.match(insights, /AreaChart/);
  assert.match(insights, /socket.io-client/);
  assert.match(scraperRoute, /SEARCHAPI_API_KEY|collectJobs/);
  assert.match(googleRoute, /syncJobsToSheet/);
  assert.match(googleStatus, /googleAccountEmail|driveFolderUrl/);
  assert.match(aiRoute, /GEMINI_API_KEY/);
  assert.match(runtimeDb, /DATABASE_URL/);
  assert.match(runtimeDb, /@neondatabase\/serverless/);
  assert.doesNotMatch(runtimeDb, /D1Database|cloudflare/);
  assert.match(auth, /NextAuth/);
  assert.match(telegramRoute, /TELEGRAM_WEBHOOK_SECRET|webhookSecret/);
  assert.match(analyticsRoute, /scrape_runs/);
  assert.match(realtimeServer, /Socket.IO|socket.io/);
  assert.match(sourcePolicy, /approved_api/);
  assert.match(sourcePolicy, /greenhouse/);
  assert.match(sourcePolicy, /trueup/);
  assert.match(layout, /Fresh Listings/);
  assert.match(layout, /og\.png/);
});
