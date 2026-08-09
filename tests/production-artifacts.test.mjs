import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("production migration artifacts define the durable and realtime boundaries", async () => {
  const [render, schema, design, runbook, realtime, runtimeDb, packageJson, migration, cronRoute, vercelConfig] = await Promise.all([
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
    readFile(new URL("../infra/postgres/schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../docs/production-system-design.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/production-migration-runbook.md", import.meta.url), "utf8"),
    readFile(new URL("../realtime/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/runtime-db.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/migrate-postgres.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cron/daily-digest/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);
  assert.match(render, /healthCheckPath: \/ready/);
  assert.match(render, /REALTIME_EVENT_SECRET/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS job_postings/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS outbox_events/);
  assert.match(design, /Initial latency budgets/);
  assert.match(design, /PostgreSQL/);
  assert.match(runbook, /PostgreSQL bootstrap/);
  assert.match(runbook, /Vercel web application/);
  assert.match(realtime, /createAdapter/);
  assert.match(realtime, /SIGTERM/);
  assert.match(runtimeDb, /DATABASE_URL/);
  assert.match(runtimeDb, /@neondatabase\/serverless/);
  assert.match(runtimeDb, /getDatabase/);
  assert.doesNotMatch(runtimeDb, /D1Database|cloudflare:workers/);
  assert.match(packageJson, /db:postgres:migrate/);
  assert.match(packageJson, /"build": "next build --webpack"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|drizzle/);
  assert.match(migration, /DATABASE_URL is required/);
  assert.match(cronRoute, /export async function GET/);
  assert.match(vercelConfig, /daily-digest/);
});
