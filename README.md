# compliance-scraper

Scrapes UK government digital service websites to extract reported compliance data across three areas: accessibility statements, cookie policies, and privacy notices. For each service it navigates to the live URL, locates the relevant page in the footer, and uses AWS Bedrock to extract structured information.

## What it extracts

**Accessibility statements**
- WCAG standard tested against (e.g. WCAG 2.2 AA)
- Compliance status (fully / partially / not compliant)
- Dates: prepared, reviewed, tested
- Areas of non-compliance and remediation commitments

**Cookie policies**
- Consent mechanism presence and framework (e.g. GOV.UK, OneTrust)
- Analytics tools detected (e.g. Google Analytics, GTM, Hotjar, Dynatrace)
- Tracking IDs (GA property, GTM container, etc.)
- Cookies listed and their stated purposes

**Privacy notices**
- Data controllers (name and contact)
- Legal basis for processing
- Data sharing recipients
- Retention period and last updated date

## Prerequisites

- Node.js 20+ and pnpm
- Docker (for local Postgres)
- AWS credentials with Bedrock access (see [Bedrock setup](#bedrock-setup) below)
- DSIT Internal Access SSO credentials (for the web UI)
- [gitleaks](https://github.com/gitleaks/gitleaks) (optional, for pre-commit secret scanning) — `brew install gitleaks` on macOS

## Setup

```bash
pnpm install
pnpm run prepare        # set up git hooks (husky)
npx playwright install chromium

cp .env.example .env
# Edit .env with your settings (see Environment variables below)

docker compose up postgres -d
npm run db:migrate
npm run db:seed
```

> **Note:** `.npmrc` sets `ignore-scripts=true` to prevent install-time script execution.
> You must run `pnpm run prepare` manually after install to set up git hooks.

## Scripts

- **`scripts/docker-entrypoint.sh`** — Docker container entrypoint. Runs database migrations, optionally seeds services (when `SEED_DATABASE=true`), then starts the app. Used by the Dockerfile `ENTRYPOINT`.
- **`scripts/fetch-services.sh`** — Clones the [x-govuk/govuk-services-list](https://github.com/x-govuk/govuk-services-list) repo, merges all service JSON files into a single array, and writes it to `services.json` (or a custom path passed as `$1`). Run this to refresh the services list from upstream.

## Running locally

### UI only (no worker)

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000). This starts only the Express server — no scraping will happen.

### Full app (server + worker)

```bash
npm run build && npm start
```

Starts the Express server and the pg-boss job worker in the same process. The worker runs 3 concurrent scrape loops and a daily cron at 2am London time.

Trigger checks from the Workers page (all services) or from individual service pages (single service).

### Docker Compose

If you are behind a corporate VPN or proxy that performs TLS inspection (MITM), you may need to export the macOS system CA bundle so the Docker container can verify certificates:

```bash
mkdir -p local
security export -t certs -f pemseq \
  -k /System/Library/Keychains/SystemRootCertificates.keychain \
  -o local/cert.pem && \
security export -t certs -f pemseq \
  -k /Library/Keychains/System.keychain >> local/cert.pem

docker compose up
```

The `app` service reads SSO credentials and session secret from your `.env` file via `env_file`.

A local PostgreSQL UI is available at [http://localhost:8080](http://localhost:8080) (Adminer — server: `postgres`, user: `scraper`, password: `scraper`).

## CI/CD

GitHub Actions workflows run on every PR and on push to `main`:

- **PR checks:** gitleaks, commitlint, ESLint, unit tests, Playwright e2e, Docker build
- **Deploy (push to main):** lint + test + e2e, then build and push image to GitHub Container Registry (`ghcr.io/co-cddo/octo-observability-compliance-scraper`)
- **Release Please:** automatically creates release PRs from conventional commits, bumps `package.json` version and generates a changelog

No GitHub secrets or variables are required — all workflows use the built-in `GITHUB_TOKEN`.

## Bedrock setup

The app uses **Claude Haiku 4.5** for scraping and (optionally) **Claude Haiku 4.5** for the Insights text-to-SQL feature, via the eu-west-2 cross-region inference profile:
`eu.anthropic.claude-haiku-4-5-20251001-v1:0`

### Enable model access (one-time, per account)

1. Open the AWS Console in your account: **Bedrock → Model access**
2. Click **Modify model access**
3. Select **Claude Haiku 4.5** (under Anthropic)
4. Fill in the Anthropic use-case form and submit
5. Wait for status to show **Access granted** (usually a few minutes)

### Verify access

```bash
aws bedrock get-foundation-model-availability \
  --model-id anthropic.claude-haiku-4-5-20251001-v1:0 \
  --region eu-west-2
```

## Architecture

```
services.json (seeded to DB)
     │
     ▼
pg-boss worker (src/worker/index.ts)
  ├── discover-urls job
  │     ├── browser.ts         (Playwright)
  │     ├── linkFinder.ts      (footer link discovery)
  │     └── redirectDetector.ts (auth/CAPTCHA detection)
  ├── scrape-accessibility job
  ├── scrape-cookies job       ──► bedrock.ts (AWS Bedrock)
  └── scrape-privacy job
     │
     ▼
db/queries.ts (Postgres, append-only)
     │
     ▼
server/app.ts (Express + GOV.UK Frontend)
  ├── /accessibility, /cookies, /privacy  — results tables
  ├── /services/:slug                     — service detail
  ├── /insights                           — text-to-SQL chatbot
  └── /workers                            — job queue stats
```

### Scrape statuses

| Status | Meaning |
|--------|---------|
| `success` | Page found, Bedrock extracted data successfully |
| `no_link_found` | No relevant link found in page footer |
| `scrape_error` | Navigation failed, auth wall, or CAPTCHA detected |
| `bedrock_error` | Page found but Bedrock call or JSON parsing failed |

Results are **append-only** — each run adds a new row. The UI always shows the latest result per service.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | Postgres connection string |
| `SESSION_SECRET` | *(required)* | Secret for signing session cookies |
| `SSO_CLIENT_ID` | *(required)* | DSIT Internal Access OAuth client ID |
| `SSO_CLIENT_SECRET` | *(required)* | DSIT Internal Access OAuth client secret |
| `APP_URL` | `http://localhost:3000` | Public base URL (used for OAuth redirect URI) |
| `AWS_REGION` | `eu-west-2` | AWS region for Bedrock |
| `BEDROCK_MODEL_ID` | `eu.anthropic.claude-haiku-4-5-20251001-v1:0` | Model for scraping |
| `INSIGHTS_MODEL_ID` | `eu.anthropic.claude-haiku-4-5-20251001-v1:0` | Model for Insights text-to-SQL |
| `PLAYWRIGHT_TIMEOUT` | `30000` | Navigation timeout in ms |
| `SERVICES_JSON_PATH` | `./services.json` | Path to services input file |
| `PORT` | `3000` | Express server port |
| `NODE_ENV` | `development` | Set to `production` in ECS |
