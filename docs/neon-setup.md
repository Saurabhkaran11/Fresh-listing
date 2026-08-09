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
  environment. Use a separate Neon branch and URL for preview/staging.
- If CircleCI runs migrations, store the same value in a protected project
  context, preferably using a dedicated migration role rather than the runtime
  role.
- The app requires PostgreSQL; requests fail fast when `DATABASE_URL` is absent.

## Validate locally or in staging

```bash
DATABASE_URL='[copy from Neon; do not commit]' npm run db:postgres:migrate
npm test
```

The migration is idempotent and is not executed during an application request.
The schema has already been applied to the provisioned Neon branch.

## Vercel project

- Project: `fresh-listings-production`
- Project ID: `prj_TfpvGIKVrAeUeWTAUmjqgIvkxRwR`
- Team: `saurabhkaran11's projects`
- Git repository: `Saurabhkaran11/Fresh-listing`
- Current state: project created and Git-connected; deploy after production
  environment variables and Google callback URLs are configured.
- Framework: Next.js, detected from `next` and the `next build` script.

## Deployment inputs

- Vercel project/team and production domain.
- Whether any legacy export should be imported into the provisioned schema.
- Render (or another Node host) for the Socket.IO service and its Redis URL.
- Google OAuth, Telegram, provider, email, AI, and application-signing secrets.
- CircleCI organization/project slug if CI should be enabled now.
