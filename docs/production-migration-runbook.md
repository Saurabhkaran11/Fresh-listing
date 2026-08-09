# Production Migration Runbook

This runbook describes the completed production migration to stock Next.js, Vercel, Neon PostgreSQL, and the separately hosted realtime service. The old Sites/D1 runtime is not part of the application.

## 1. Accounts and access

- Create Vercel, Render (realtime), managed PostgreSQL, managed Redis, Google Cloud, Telegram, job-provider, and error-monitoring accounts.
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
- Apply the canonical schema to the Neon branch before enabling production writes.
- If legacy exports exist, import them with a one-time checksum report; no D1 runtime code remains.

For a staging bootstrap, set `DATABASE_URL` locally and run:

```bash
npm run db:postgres:migrate
npm test
```

The application requires `DATABASE_URL` and deliberately does not create tables during a request.

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

- Deploy the stock Next.js app; Vercel must detect the Next.js framework and build with `next build`.
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
- Keep the previous Vercel deployment available for instant rollback during the observation window.

## 10. Rollback

- Promote the previous Vercel deployment if authentication or data integrity checks fail.
- Stop queue consumers before reverting schema changes; never roll back a database migration without a tested down plan.
- Drain or replay outbox events after recovery; use idempotency keys to prevent duplicate jobs and Sheets rows.
- Record the incident timeline, user impact, metrics, and exact commit/version used for recovery.
