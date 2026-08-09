# Fresh Listings

Fresh Listings is an authenticated job-search workspace for collecting, ranking, and tracking software-engineering opportunities. It stores each scrape in Cloudflare D1, supports a server-side Google Jobs provider, can sync new rows to a native Google Sheet that is Excel-compatible, sends an optional digest, and provides an optional AI fit analysis. LinkedIn live collection remains available through the free browser extension when a hosted server is rate-limited.

## Product surface

- **Live search:** role, location, and 24-hour / 7-day / 30-day windows.
- **Persistent history:** title, company, source, location, direct and application links, posting age, salary, skills, fit fields, search query, and capture time.
- **Provider adapter:** SerpApi Google Jobs JSON, with a LinkedIn public-feed fallback and the browser extension for local collection.
- **Google sync:** OAuth with `drive.file` and `spreadsheets` scopes; creates a `Fresh Listings Job Tracker` sheet and appends only unsynced rows.
- **AI Fit Analyzer:** optional Gemini scoring with skill gaps and three portfolio-project suggestions.
- **Digest:** optional Resend HTML email endpoint.
- **Progress intelligence:** interactive Recharts analytics for saved momentum and source mix.
- **Realtime updates:** the dashboard can connect to a separately hosted Socket.IO service with short-lived signed user tokens; searches emit progress and job-saved events.
- **Telegram automation:** link one Telegram chat to the account, send natural-language search prompts, save results to the same history, and receive daily searched/saved totals.

## Runtime secrets

Copy `.env.example` for local development. In production, set the same names in the Site's private runtime environment. Never commit real values, put them in frontend code, or paste them into a public issue.

| Variable | Required for | Notes |
| --- | --- | --- |
| `SERPAPI_API_KEY` | Automated cloud scraping | SerpApi Google Jobs key |
| `GOOGLE_CLIENT_ID` | Drive/Sheets OAuth | Web application OAuth client |
| `GOOGLE_CLIENT_SECRET` | Drive/Sheets OAuth | Keep secret |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Drive/Sheets OAuth | Base64-encoded 32-byte AES-GCM key |
| `RESEND_API_KEY` | Email digest | Resend API key |
| `EMAIL_FROM` | Email digest | Verified sender, such as `Fresh Listings <jobs@example.com>` |
| `GEMINI_API_KEY` | AI Fit Analyzer | Gemini API key, server-side only |
| `GEMINI_MODEL` | AI Fit Analyzer | Defaults to `gemini-2.0-flash` |
| `TELEGRAM_BOT_TOKEN` | Telegram search + notifications | Create a bot with BotFather; server-side only |
| `TELEGRAM_BOT_USERNAME` | Telegram dashboard linking | Bot username without the `@` |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook authentication | Long random value configured in Telegram `setWebhook` |
| `CRON_SECRET` | Daily digest endpoint | Long random value sent by your scheduler as a Bearer token |
| `REALTIME_SERVICE_URL` | Live dashboard events | Public URL of the Node Socket.IO service |
| `REALTIME_SESSION_SECRET` | Socket.IO user authentication | Shared long random HMAC secret; never expose it to the browser |
| `REALTIME_EVENT_SECRET` | App-to-Socket.IO event ingress | Shared long random Bearer secret |
| `FRONTEND_ORIGIN` | Socket.IO CORS | Exact dashboard origin, without a trailing slash |

For Google OAuth, register this exact redirect URI:

```text
https://fresh-linkedin-listings.saurabhkaran11.chatgpt.site/api/google/oauth/callback
```

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

The app uses vinext and Cloudflare-compatible output. D1 is declared as the `DB` binding in `.openai/hosting.json`; Drizzle migrations live under `drizzle/`.

## API routes

- `POST /api/scraper/run` — authenticate, collect, normalize, and persist jobs.
- `GET /api/jobs` — public-feed/native-search compatibility route.
- `GET /api/google/status` — report Drive connection and provider readiness.
- `GET /api/google/oauth/start` and `/api/google/oauth/callback` — Google OAuth.
- `POST /api/google/sync` — append unsynced jobs to the user's Sheet.
- `POST /api/digest/send` — send the latest saved jobs by email.
- `POST /api/ai/fit` — score a saved job and persist the fit analysis.
- `GET /api/analytics` — return saved/search totals and chart-ready daily/source series.
- `GET /api/auth/session` — return the current signed-in workspace user or a safe sign-in path.
- `GET /api/realtime/token` — mint a 15-minute signed Socket.IO session token.
- `POST /api/telegram/link` — create a short-lived Telegram account-link token.
- `GET /api/telegram/status` — report Telegram configuration and link state.
- `POST /api/telegram/webhook` — receive authenticated Telegram updates and run prompt searches.
- `POST /api/cron/daily-digest` — send daily searched/saved counts to linked Telegram chats.

## Scalable realtime service

The current Sites deployment remains the web and D1 surface. Run the Socket.IO
service as a small Node.js service on a Node-capable host:

```bash
REALTIME_SESSION_SECRET="<same value as the web app>" \
REALTIME_EVENT_SECRET="<same value as the web app>" \
FRONTEND_ORIGIN="https://your-dashboard.example.com" \
npm run realtime:start
```

Expose `/health` for the host health check and set the resulting public URL as
`REALTIME_SERVICE_URL` in the web app. The service never receives Google or
Telegram credentials; it only accepts signed user tokens and an internal event
secret.

After deployment, configure the Telegram webhook once (replace the placeholders
with your values):

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-dashboard.example.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

Configure a daily scheduler to `POST /api/cron/daily-digest` with
`Authorization: Bearer <CRON_SECRET>`. The endpoint is intentionally separate
from the scrape request so the scheduler can retry safely without exposing a
cron credential to the browser.

## Browser extension

The downloadable `public/fresh-listings-extension.zip` searches LinkedIn from the user's browser, supports the same posting windows, saves selected jobs to the Drive archive, and can save a job detail page from LinkedIn, Indeed, Built In, Glassdoor, Greenhouse, or TrueUp.

## Git and deployment

Keep the repository private because the application handles user-linked job history and OAuth state. Deployment uses the private Sites project and the `main` branch. Before publishing, run:

```bash
npm test
npm run lint
npm run build
```

## Workspace authentication

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Dispatch-owned ChatGPT sign-in

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build and run the rendered-experience checks
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn more

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
