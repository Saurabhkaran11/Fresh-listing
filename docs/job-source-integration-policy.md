# Job-source integration policy

This policy records the implementation decision for each portal after checking its current official API/developer documentation and terms. It is product and engineering guidance, not legal advice. Re-check terms before enabling a new source or changing retention/display behavior.

## Access modes

- `public_api`: server-side discovery is allowed without an end-user portal login, subject to the provider’s request limits.
- `approved_api`: server-side discovery is disabled until the provider approves the application and issues the required credentials or contract.
- `manual`: the app opens a native search and accepts a user-entered URL/CSV; it does not automate login or page interaction.
- The app never asks for job-portal passwords, session cookies, MFA codes, or CAPTCHA tokens.

## Source matrix

### Greenhouse — public API

- Greenhouse documents that Job Board GET endpoints are publicly available and do not require authentication.
- `GET /v1/boards/{board_token}/jobs?content=true` provides job metadata and full descriptions.
- The implementation requires named board tokens so requests remain attributable and bounded.
- Applications are a separate authenticated endpoint and are not automated by Fresh Listings.

Official references: [Greenhouse Job Board API](https://developer.greenhouse.io/job-board.html), [Greenhouse API overview](https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview).

### Google Jobs — configured provider

- Google Jobs collection uses the configured SerpApi provider, not a portal password.
- The provider key is server-side only and is never exposed to the browser.
- Results retain the provider’s direct job/application URL and capture timestamp.
- If the key is missing, the UI explains how to configure it instead of silently falling back to restricted scraping.

### LinkedIn — approved API only

- LinkedIn uses OAuth, but most API permissions and partner programs require explicit LinkedIn approval.
- The documented Job Postings API is for employer/talent integrations that create or manage postings, not a general job-seeker search API.
- LinkedIn’s crawling terms require express permission, and LinkedIn explicitly prohibits scraping browser extensions and unauthorized automation.
- The app therefore opens LinkedIn’s native search and does not run a server crawler or page-reading extension.

Official references: [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [LinkedIn Job Postings API](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/create-jobs?view=li-lts-2026-03), [LinkedIn crawling terms](https://www.linkedin.com/legal/crawling-terms), [LinkedIn prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en).

### Indeed — partner API or native search

- Indeed’s official integration docs describe partner/employer APIs and a publisher JavaScript plugin, not an unrestricted consumer job-search API.
- Indeed’s Terms prohibit bots, scrapers, automated data mining, and automated applications without express written permission.
- The app opens a native Indeed search until an Indeed-approved partner integration is obtained.
- Any approved connector must implement Indeed’s developer terms, scopes, quotas, attribution, and retention rules.

Official references: [Indeed job-posting integrations](https://docs.indeed.com/job-postings/), [Indeed API guides](https://docs.indeed.com/api-guides/), [Indeed Terms of Service](https://www.indeed.com/legal?hl=en_US).

### Glassdoor — written approval required

- Glassdoor requires an account for most services and its Terms prohibit automated agents, scraping, stripping, or mining without express written permission.
- A future connector must be based on a current Glassdoor API or partner agreement, not a logged-in browser session.
- The app currently opens native Glassdoor search and stores no Glassdoor credentials.
- Approved access must preserve any attribution, display, call-limit, and retention requirements in the agreement.

Official reference: [Glassdoor Terms of Use](https://www.glassdoor.com/about/terms-2022-12-01/).

### Built In — manual or approved feed

- No current official public developer job-search API was verified during the research pass.
- The app opens Built In’s native search and supports user-entered URL/CSV import.
- A future server connector requires written partner permission and a documented feed/API contract.
- The app does not inject an extension into Built In pages.

### TrueUp — manual or written partner consent

- TrueUp’s current Terms prohibit robots, scraping, automated browsing, automated login, automated search, and automated page interaction without prior written consent.
- No current public developer job-search API was verified during the research pass.
- The app opens TrueUp’s native search and supports user-entered URL/CSV import only.
- A future connector must be negotiated directly with TrueUp and isolated behind the `approved_api` source mode.

Official reference: [TrueUp Terms of Service](https://www.trueup.io/terms).

## Credential and storage rules

- App authentication and Google Drive/Sheets OAuth remain separate from job-source authorization.
- Store only approved OAuth refresh tokens/API keys, encrypted at rest and scoped to the required provider capabilities.
- Provide disconnect/revoke controls and delete tokens when a user disconnects a source.
- Persist source ID, external job ID, source URL, retrieval time, and attribution alongside normalized fields.
- Do not persist source passwords, session cookies, MFA codes, CAPTCHA responses, or hidden page payloads.

## Adding a new source

- Add one `SourcePolicy` entry with its access mode, user action, and native search URL.
- Implement a server adapter only after confirming a public or approved API and its storage/display restrictions.
- Add normalization, deduplication, rate-limit, failure, and retention tests before exposing the source in the default search.
- Keep new restricted sources opt-in and default the dashboard to public/approved providers only.
