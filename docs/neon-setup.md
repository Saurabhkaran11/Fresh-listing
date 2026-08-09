# Neon PostgreSQL Setup

Neon has been provisioned for Fresh Listings. This document records the
non-secret identifiers and the remaining deployment steps; the connection
string is intentionally never committed to the repository.

## Provisioned database

- Project: `fresh-listings-production`
- Project ID: `flat-frog-83421495`
- Default branch: `main` (`br-round-dew-a68ccxrf`)
- Database: `neondb`
- Runtime role: `neondb_owner`
- Schema: `public`
- Tables created: 10, including users, jobs, scrape runs, settings, OAuth,
  Telegram, integrations, outbox events, and daily metrics.

## Add the connection securely

- Open the Neon project and copy the pooled connection string for the `main`
  branch; do not paste it into GitHub, chat, or a source file.
- Store it as the encrypted `DATABASE_URL` variable in Vercel for the target
  environment. Use a separate Neon branch and URL for preview/staging after
  the first deployment is connected.
- If CircleCI runs migrations, store the same value in a protected project
  context, preferably using a dedicated migration role rather than the runtime
  role.
- The app selects PostgreSQL whenever `DATABASE_URL` is present and falls back
  to Cloudflare D1 when it is absent.

## Validate locally or in staging

```bash
DATABASE_URL='[copy from Neon; do not commit]' npm run db:postgres:migrate
npm test
```

The migration is idempotent and is not executed during an application request.
The schema has already been applied to the provisioned Neon branch.

## Remaining deployment inputs

- Vercel project/team and production domain.
- Whether existing D1 data should be imported or the new database should start
  empty.
- Render (or another Node host) for the Socket.IO service and its Redis URL.
- Google OAuth, Telegram, provider, email, AI, and application-signing secrets.
- CircleCI organization/project slug if CI should be enabled now.
