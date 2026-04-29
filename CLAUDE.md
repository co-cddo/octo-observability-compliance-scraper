# compliance-scraper

## Project overview

TypeScript app that scrapes UK government digital service websites for accessibility compliance data, extracts structured information using AWS Bedrock (Claude Haiku 4.5), persists results append-only to Postgres, and serves a GOV.UK-styled Express/Nunjucks UI behind Internal Access SSO.

Part of the View of Digital Government (VODG) project. OFFICIAL classification — internal civil servant tool.

GitHub: `https://github.com/co-cddo/octo-observability-compliance-scraper`

## Architecture

- **Express server** (`src/server/`) — GOV.UK Frontend UI with SSO auth
- **pg-boss worker** (`src/worker/`) — PostgreSQL-backed job queue, runs alongside the server in a single process via `src/main.ts`
- **Scraper** (`src/scraper/`) — Playwright + Bedrock extraction pipeline
- **Insights** (`src/insights/`) — text-to-SQL chatbot using Bedrock Converse API (Sonnet 4.6)

The daily cron (2 AM London) enqueues one job per service. Jobs are processed sequentially (one Chromium instance at a time). Manual triggers available via `/trigger` (all services), `/services/:slug/trigger` (single service), and `/services/:slug/trigger/:type` (single service, specific scrape type).

## Key files

- `src/main.ts` — unified entry point: starts Express server + pg-boss worker
- `src/server/app.ts` — Express app factory with session, auth, and route setup
- `src/server/auth.ts` — OAuth2 auth flow (Internal Access SSO) + `requireAuth` middleware
- `src/worker/index.ts` — pg-boss job loop: sequential fetch, scrape, complete/fail
- `src/scraper/scrapeService.ts` — orchestration: navigate → detect block → find link → follow deeper link → Bedrock extract → persist
- `src/scraper/linkFinder.ts` — four-strategy waterfall for footer links. Priority: "accessibility statement" > "accessibility policy" > "accessibility"
- `src/scraper/redirectDetector.ts` — detects auth walls, CAPTCHAs, geo-restrictions on both live service and statement pages
- `src/scraper/bedrock.ts` — Bedrock InvokeModel + JSON parsing (strips code fences, detects credential expiry)
- `src/db/migrate.ts` — lightweight migration runner using `schema_migrations` table
- `src/db/seed.ts` — upserts services from `services.json` into the `services` table
- `src/db/queries.ts` — all SQL queries (parameterised, no string interpolation)
- `src/insights/sqlValidator.ts` — AST-based SQL validation (allowlist functions, cap LIMIT, reject non-SELECT)
- `src/server/validateUrl.ts` — HTTPS + gov.uk domain validation for URL overrides
- `src/insights/sanitiseHtml.ts` — sanitise-html wrapper for LLM output

## Running locally

```bash
# Start Postgres
docker compose up postgres -d

# Run migrations and seed
npm run db:migrate
npm run db:seed

# UI server only (no worker)
npm run dev

# Full app (server + worker) — same as production
npm run build && npm start

```

Required `.env` (see `.env.example`):
```
DATABASE_URL=postgres://scraper:scraper@localhost:5432/compliance_scraper
SESSION_SECRET=<any long random string>
SSO_CLIENT_ID=<from Internal Access>
SSO_CLIENT_SECRET=<from Internal Access>
APP_URL=http://localhost:3000
```

## Auth

OAuth2 authorization code flow via Internal Access (`sso.service.security.gov.uk`). Sessions stored in Postgres via `connect-pg-simple` (auto-creates `session` table). 2-hour session expiry matching token lifetime. No refresh tokens.

Session is regenerated on login (`session.regenerate()`) to prevent session fixation. The OIDC `sub` claim is stored as the stable user identifier (email may change).

Public routes: `/`, `/health`, `/auth/*`, `/public/*`, `/assets/*`
Protected routes: `/accessibility`, `/cookies`, `/privacy`, `/insights`, `/services/*`

`trust proxy` is enabled for the ALB (HTTPS termination).

## Database

- **Append-only results tables** — `accessibility_results`, `cookie_results`, `privacy_results` — never UPDATE. UI uses `DISTINCT ON (service_slug)` for latest per service, with pagination (25 per page)
- **`services` table** — seeded from `services.json`, used by pg-boss worker to look up service data at job processing time
- **`compliance_urls` table** — tracks discovered and manually overridden URLs for accessibility statements, cookie policies, and privacy notices
- **`audit_events` table** — logs security-relevant actions (URL overrides) with user, action, JSONB detail, and timestamp
- **Migrations** in `src/db/migrations/` — numbered SQL files, applied by `src/db/migrate.ts`
- **Sessions** — `session` table auto-created by `connect-pg-simple`

## Security

- **CSRF** — synchroniser token pattern via `csrf-sync`. Tokens delivered in a `<meta>` tag and submitted as `_csrf` body field or `x-csrf-token` header. All POST endpoints are protected.
- **SQL validation** — LLM-generated SQL is parsed with `pgsql-ast-parser` (AST-based). Only single SELECT/WITH statements allowed; function calls checked against an allowlist; LIMIT capped at 100. The read-only pool also enforces `default_transaction_read_only` and `statement_timeout` at DB level.
- **URL validation** — manual URL overrides restricted to HTTPS + `*.gov.uk` domains (`src/server/validateUrl.ts`).
- **Prompt injection** — scraper extracts `innerText` (not `innerHTML`) before sending to Bedrock, so hidden elements, scripts, and HTML comments never reach the LLM.
- **HTML sanitisation** — LLM prose responses are sanitised server-side with `sanitize-html` (strict tag allowlist) before rendering.
- **TLS** — database connections use `ssl: { rejectUnauthorized: true }` in production.
- **Headers** — `helmet` adds security headers (CSP, HSTS, X-Frame-Options, etc.).
- **Rate limiting** — Bedrock-spending endpoints are rate-limited per session.
- **Session** — `SESSION_SECRET` must be ≥32 chars in production; `httpOnly`, `sameSite: lax`, `secure` (in prod) cookies.

## Package manager

**pnpm** (v10.33.0) — `.nvmrc` specifies Node 20. CI workflows use pnpm.

## TypeScript conventions

- `strict: true`, explicit return types on exported functions
- `type` for data shapes (not `interface`)
- No `as` assertions — fix the underlying types
- CommonJS module — no `.js` extensions in imports
- `lib` includes `"dom"` because `page.evaluate()` callbacks reference browser globals

## Docker

Multi-stage Dockerfile: `chromium` stage (system deps + Playwright browser, cached independently), `build` stage (pnpm install + tsc), `release` stage (prod deps + copies from both). Must use `node:20-slim` (Debian), not Alpine — Chromium requires glibc. Build with `--platform linux/amd64` for ECS Fargate.

`PLAYWRIGHT_BROWSERS_PATH=/pw-browsers` ensures the browser is in a fixed location accessible to the `node` user.

## CI/CD

GitHub Actions workflows (all inlined, no shared workflow dependencies):
- **CI** (`.github/workflows/ci.yml`): gitleaks, commitlint (PR only), lint, test, e2e (Playwright via Docker Compose `test` profile), Docker build. On push to main, also pushes to GHCR with provenance + SBOM attestations.
- **Release Please** (`.github/workflows/release-please.yml`): auto-creates release PRs from conventional commits, bumps `package.json`, generates `CHANGELOG.md`

All workflows use `GITHUB_TOKEN` — no additional secrets or variables required.

Container image: `ghcr.io/co-cddo/octo-observability-compliance-scraper`
