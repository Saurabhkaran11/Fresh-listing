# Production Migration Runbook

This runbook is intentionally staged so the existing private Sites deployment remains a rollback target until the new stack passes smoke tests.

## 1. Accounts and access

- Create Vercel, Render, managed PostgreSQL, managed Redis, Google Cloud, Telegram, job-provider, and error-monitoring accounts.
- Give CI only repository read/build access; keep production secrets in each platform’s secret manager.
- Use separate staging and production OAuth clients, databases, Redis instances, and Telegram bots.
- Choose one primary data region close to PostgreSQL; record the region and data-residency decision.

## 2. Repository and CI

- Mirror the private source to GitHub, GitLab, or Bitbucket so Vercel and Render can deploy from a supported provider.
- Protect `main` with required checks: typecheck, lint, unit tests, migration validation, and dependency audit.
- Require pull requests for schema, authentication, provider, and infrastructure changes.
- Never commit `.env`, OAuth JSON files, bot tokens, database URLs, or generated archives.

## 3. PostgreSQL bootstrap

- Provision a production PostgreSQL database with automated backups, TLS, connection pooling, and a restore test.
- Apply `infra/postgres/schema.sql` through a real migration tool; do not edit production tables manually.
- Create a least-privileged runtime role and a separate migration role with DDL permission.
- Import users/jobs from D1 using a checksum report before enabling production writes.

The application now has a database compatibility boundary in
`lib/runtime-db.ts`: `DATABASE_URL` selects PostgreSQL through the Neon
serverless driver, while omitting it preserves the current D1 rollback path.
For a staging bootstrap, set `DATABASE_URL` locally and run:

```bash
npm run db:postgres:migrate
npm test
```

Do not set `DATABASE_URL` in the hosted production environment until the
schema is applied, the D1 export has been reconciled, and the staging smoke
test has passed. The application deliberately does not create tables during a
request.

## 4. Redis bootstrap

- Provision managed Redis with TLS and a private connection URL where the host supports it.
- Set a max-memory policy appropriate for queue/realtime ephemeral data; PostgreSQL remains canonical.
- Verify pub/sub, queue claims, reconnects, and failover before scaling realtime beyond one instance.
- Rotate the Redis credential independently from database and OAuth credentials.

## 5. Render realtime service

- Create a Render Web Service from `render.yaml` using a paid production instance for predictable uptime.
- Add `REALTIME_SESSION_SECRET`, `REALTIME_EVENT_SECRET`, `REDIS_URL`, and exact `FRONTEND_ORIGIN` values.
- Configure `/ready` as the health check and verify `GET /health` reports Redis `ready`.
- Confirm WSS connections, reconnects, SIGTERM shutdown, and cross-instance events before public traffic.

## 6. Vercel web application

- Deploy only the migrated stock Next.js app; the current Vinext/Cloudflare-D1 root is a rollback artifact, not a Vercel target.
- Set `DATABASE_URL`, `AUTH_SECRET`, Google OAuth values, provider keys, and integration secrets in Vercel’s production environment.
- Add the Vercel production origin to Google OAuth, Telegram webhook configuration, and realtime CORS.
- Run a preview deployment against staging services before promoting production.

## 7. Google Drive and Sheets

- Add the exact production OAuth callback URL to the Google Cloud web client.
- Request only Drive file, Sheets, OpenID, email, and profile scopes needed by the application.
- Connect a test Google account, verify folder/sheet creation, append rows, retry a failed sync, and reconnect another account.
- Confirm encrypted refresh tokens are never returned by an API response or written to logs.

## 8. Telegram and scheduled jobs

- Create a production Telegram bot and set the webhook URL with a random secret token.
- Link a test chat from the dashboard, send a prompt, verify persistence, and test an invalid/oversized prompt.
- Configure a scheduler to call the daily digest endpoint with `Authorization: Bearer <CRON_SECRET>`.
- Verify duplicate webhook delivery does not duplicate jobs or notifications.

## 9. Cutover checks

- Compare job counts, source distributions, and daily metrics between the old and new stacks for a representative test account.
- Measure the latency budgets in `production-system-design.md` from at least three regions.
- Confirm Google sync, Telegram, email, realtime, rate limits, backups, and error alerts before DNS cutover.
- Keep the Sites URL live and read-only for rollback during the observation window.

## 10. Rollback

- Repoint the frontend/API traffic to the previous deployment if authentication or data integrity checks fail.
- Stop queue consumers before reverting schema changes; never roll back a database migration without a tested down plan.
- Drain or replay outbox events after recovery; use idempotency keys to prevent duplicate jobs and Sheets rows.
- Record incident timeline, user impact, metrics, and the exact commit/version used for recovery.
