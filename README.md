# Fresh Listings

Fresh Listings is a production Next.js job-search workspace. It collects jobs from approved/public providers, stores each user’s searches in managed PostgreSQL, syncs saved jobs to Google Drive/Sheets, and supports optional AI, email, Telegram, and Socket.IO features.

## Production architecture

- Next.js App Router runs the UI and API routes on Vercel’s Node runtime.
- Neon PostgreSQL is the only application database; there is no Cloudflare D1 or local fallback.
- NextAuth uses Google OAuth and encrypted JWT sessions; job-board passwords and cookies are never collected.
- SearchApi and Greenhouse provide approved/public discovery; restricted portals remain native-search links unless an official API is configured.
- Google Drive/Sheets, Resend, Gemini, Telegram, Redis, and Socket.IO are optional integrations enabled by server variables.

## Runtime flow

1. A user signs in with Google at `/api/auth/signin`.
2. API routes resolve the NextAuth session and upsert the user in PostgreSQL.
3. A scrape normalizes provider results, writes jobs and scrape metrics in one transaction, and emits realtime events.
4. The Google integration creates a Fresh Listings folder and spreadsheet using least-privilege `drive.file` and Sheets scopes.
5. Vercel Cron invokes the daily digest route with `CRON_SECRET`; Telegram and email are sent only when configured.

## Local setup

- Install Node.js `>=22.13.0` and run `npm install`.
- Copy `.env.example` to `.env.local`; `DATABASE_URL`, `AUTH_SECRET`, and Google sign-in values are required.
- Apply the PostgreSQL schema with `npm run db:postgres:migrate`.
- Start the app with `npm run dev`, then open `http://localhost:3000`.
- Run `npm run typecheck`, `npm run lint`, and `npm test` before pushing.

## Required environment variables

- `DATABASE_URL`: Neon pooled PostgreSQL URL with SSL; never expose it as `NEXT_PUBLIC_*`.
- `AUTH_SECRET`, `AUTH_GOOGLE_CLIENT_ID`, and `AUTH_GOOGLE_CLIENT_SECRET`: NextAuth session and sign-in configuration.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a base64 32-byte `GOOGLE_TOKEN_ENCRYPTION_KEY`: Drive/Sheets OAuth and token encryption.
- `SEARCHAPI_API_KEY`: the only live Google Jobs provider; without it, automated Google Jobs results are not returned and no provider fallback is used.
- `NEXT_PUBLIC_APP_URL`: canonical HTTPS origin used for OAuth callbacks and links.

## Optional integrations

- Resend: set `RESEND_API_KEY` and `EMAIL_FROM` for on-demand email digests.
- Gemini: set `GEMINI_API_KEY` and `GEMINI_MODEL` for fit scoring and portfolio suggestions.
- Telegram: set `TELEGRAM_BOT_TOKEN`, username, and webhook secret for prompt-driven searches and daily notifications.
- Realtime: set `REALTIME_SERVICE_URL`, HMAC secrets, and `REDIS_URL` for the separate Socket.IO service.
- Monitoring: set `SENTRY_DSN` and `OTEL_EXPORTER_OTLP_ENDPOINT` when an observability backend is available.

## OAuth callback configuration

- Add `https://YOUR_DOMAIN/api/auth/callback/google` to the Google sign-in OAuth client.
- Add `https://YOUR_DOMAIN/api/google/oauth/callback` to the Drive/Sheets OAuth client.
- Add `http://localhost:3000/...` equivalents for local development.
- Use separate OAuth clients and secrets for local, preview, and production environments.
- Rotate `AUTH_SECRET` and encryption keys through the deployment provider, never in Git.

## Deployment

- Import `Saurabhkaran11/Fresh-listing` into Vercel as a Next.js project.
- Add all required variables to Vercel Production and Preview scopes; do not commit `.env.local`.
- Confirm the Neon schema is applied, then deploy with `npx vercel --prod` or the connected Git branch.
- Configure Vercel Cron to call `/api/cron/daily-digest` at 08:00 UTC (the checked-in `vercel.json` schedule); Vercel supplies `Authorization: Bearer $CRON_SECRET`.
- Set the production URL in `NEXT_PUBLIC_APP_URL` and update both Google OAuth clients before smoke testing.

## Database and migrations

- Canonical schema: [`infra/postgres/schema.sql`](infra/postgres/schema.sql).
- Idempotent migration command: `npm run db:postgres:migrate`.
- Tables cover users, settings, jobs, scrape runs, OAuth state, Telegram links, and realtime events.
- Apply migrations to a disposable preview database before production changes.
- Back up Neon and verify restore procedures before changing the schema.

## Job-source policy

- Public Greenhouse boards and approved aggregator APIs are queried server-side.
- LinkedIn, Indeed, Glassdoor, Built In, TrueUp, and similar portals are not credential-scraped.
- The UI supplies source-specific native search links with supported keyword, location, and date parameters where available and records any remaining portal-side filtering limitations. Collected jobs always include the reported portal and provider provenance.
- Add a new source behind a provider adapter, rate limit, terms review, normalization tests, and feature flag.
- Never store portal passwords, cookies, MFA codes, or CAPTCHA material.

## Security and operations

- All secrets are server-only environment variables and are excluded from Git.
- Database queries are parameterized through the PostgreSQL adapter; user ownership is checked on every private route.
- OAuth state expires quickly and refresh tokens are encrypted with AES-GCM before storage.
- Cron and Telegram webhooks require independent secrets; realtime events use HMAC verification.
- Monitor Vercel logs, Neon metrics, provider quotas, and error rates before opening public access.

## Performance targets

- Cached/static UI: p95 under 200 ms at the Vercel edge.
- Authenticated read APIs: p95 under 500 ms with indexed PostgreSQL queries.
- Scrape requests: asynchronous provider work with a 30-second route budget and progress events.
- Google sync and email/Telegram delivery are bounded background-style operations and report provider failures explicitly.
- Neon pooled connections and bounded result limits prevent connection exhaustion and unbounded responses.

## Repository scripts

- `npm run dev` — local Next.js development server.
- `npm run build` — production Next.js build.
- `npm run start` — serve the production build.
- `npm run typecheck` / `npm run lint` — static checks.
- `npm test` — build plus Node smoke tests.

## License

See [`LICENSE`](LICENSE).
