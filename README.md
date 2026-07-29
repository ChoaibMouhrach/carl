# SaaS Template

A clean, typed, batteries-included foundation for building focused SaaS products.
It gives you the essential infrastructure — accounts, first-admin setup, billing,
notifications, a marketing site, and a polished app shell — without inheriting
another product's domain assumptions. Add your own domain model on top.

## Contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Monorepo layout](#monorepo-layout)
- [How requests are routed](#how-requests-are-routed)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Database & migrations](#database--migrations)
- [Internationalization](#internationalization)
- [Testing](#testing)
- [Deployment](#deployment)
- [Architecture & conventions](#architecture--conventions)

## Overview

This is a Turborepo monorepo containing three deployable apps and a set of shared
packages. In production, a **single compiled server binary** serves everything:
the API, the marketing site, and the dashboard SPA.

**What's included out of the box:**

- Secure, session-based authentication (sign up, sign in, email verification,
  password reset, change password with optional other-session revocation)
- A first-admin **setup flow** — the first account created becomes the admin;
  no demo data
- **Billing** via Stripe (checkout, plan changes with proration, cancel/resume,
  billing portal, webhooks) gated behind a paywall/onboarding step
- **Notifications** with unread counts and a background email queue
- **Internationalization** across the whole stack (English, French, Spanish)
- Rate limiting (Redis-backed), storage and email abstractions, and a
  provider-agnostic infrastructure layer
- Marketing landing page with localized, statically-exported pages

Every external integration is required. Environment validation fails immediately
when any required configuration is missing.

## Tech stack

| Area            | Choice                                                                            |
| --------------- | --------------------------------------------------------------------------------- |
| Runtime / PM    | [Bun](https://bun.sh) `1.3.5`                                                     |
| Monorepo        | [Turborepo](https://turbo.build)                                                  |
| API             | [Hono](https://hono.dev)                                                          |
| Database        | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team)                              |
| Queue / cache   | Redis + [BullMQ](https://docs.bullmq.io)                                          |
| Dashboard (SPA) | Vite + React 19 + [TanStack Router](https://tanstack.com/router) + TanStack Query |
| Marketing site  | [Next.js 16](https://nextjs.org) (App Router, static export)                      |
| UI              | Tailwind CSS v4 + shadcn/ui (shared in `@repo/ui`)                                |
| Forms           | react-hook-form + Zod                                                             |
| i18n            | next-intl (front) + react-i18next (client), shared catalogs                       |
| Billing         | [Stripe](https://stripe.com)                                                      |
| Email           | [Resend](https://resend.com)                                                      |
| Storage         | S3-compatible (AWS S3, or `s3rver` locally)                                       |

## Monorepo layout

```
apps/
  server/   Hono API + background workers; in prod serves the front & client too
  client/   Vite + React SPA — the authenticated dashboard, mounted at /app
  front/    Next.js marketing site — statically exported, localized per locale
  s3rver/   Local S3-compatible server for development (port 4566)
packages/
  constants/  Shared types & constants (@repo/constants): billing, error codes…
  ui/         Shared shadcn/ui component library (@repo/ui)
  i18n/       Shared locale config + message catalogs (@repo/i18n)
```

The server follows a strict three-layer architecture (controllers → services →
repositories) with a provider-agnostic **infrastructure** layer
(`billing`, `mailer`, `storage`, `queue`, `rate-limiter`, `logger`, …). See
[Architecture & conventions](#architecture--conventions).

## How requests are routed

In production the server (`apps/server`) is the single entry point:

| Path          | Served by                                                                          |
| ------------- | ---------------------------------------------------------------------------------- |
| `/`           | Redirect to `/{locale}/` (from `NEXT_LOCALE` cookie → `Accept-Language` → default) |
| `/{locale}/…` | Marketing site — the Next.js static export (`./front`)                             |
| `/app/*`      | Dashboard SPA — the Vite build (`./client`), router basepath `/app`                |
| `/api/*`      | The Hono API                                                                       |

## Prerequisites

- [Bun](https://bun.sh) `1.3.5+`
- Docker (for local PostgreSQL and Redis) — or your own Postgres/Redis instances
- Optional, only if you exercise those features: a Stripe account, a Resend API
  key, and an S3 bucket (the bundled `s3rver` covers storage locally)

## Getting started

```bash
# 1. Install dependencies (also sets up Husky git hooks)
bun install

# 2. Create your env file and fill it in (see the table below)
cp .env.example .env

# 3. Start PostgreSQL and Redis
bun run containers:up        # docker compose up

# 4. Apply database migrations
bun run db:migrate

# 5. Start everything in dev (API + dashboard + marketing site)
bun run dev
```

Then open the marketing site, or go straight to the dashboard at `/app`. The
**first account you create becomes the admin** — the app redirects you to the
setup flow until that account exists.

For local file storage, start the S3 mock in a separate terminal and point the
`S3_*` variables at it:

```bash
bun --cwd apps/s3rver run dev   # S3-compatible server on http://localhost:4566
```

## Environment variables

All apps read a single root `.env`. Copy `.env.example` and fill it in.

| Variable                                                                              | Description                                                     |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `NODE_ENV`                                                                            | `development` or `production`                                   |
| `API_PORT`                                                                            | Port the server listens on                                      |
| `VITE_API_URL`                                                                        | Base URL the dashboard uses to reach the API                    |
| `CLIENT_URL`                                                                          | Public URL of the dashboard (server builds email links from it) |
| `NEXT_PUBLIC_CLIENT_URL`                                                              | Marketing site's link target for the app (used to build `/app`) |
| `VITE_LP_URL`                                                                         | Dashboard's link back to the marketing/landing page             |
| `POSTGRES_HOST` / `PORT` / `USER` / `PASS` / `NAME`                                   | PostgreSQL connection                                           |
| `REDIS_HOST` / `PORT` / `PASSWORD`                                                    | Redis connection (queue + rate limiting)                        |
| `RATE_LIMIT_KEY_SECRET`                                                               | Secret used to hash rate-limit keys                             |
| `TRUST_PROXY`                                                                         | `true` when running behind a reverse proxy (for client IPs)     |
| `QUEUE_CONCURRENCY`                                                                   | Max concurrent background jobs                                  |
| `QUEUE_BACKLOG_THRESHOLD`                                                             | Waiting-jobs count that triggers a backlog alert (default 100)  |
| `S3_ENDPOINT` / `REGION` / `ACCESS_KEY` / `SECRET_KEY` / `BUCKET_NAME` / `PUBLIC_URL` | Object storage                                                  |
| `RESEND_API_KEY` / `MAIL_DOMAIN`                                                      | Transactional email                                             |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                                         | Billing                                                         |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE`                                            | Server error tracking → Better Stack                            |
| `VITE_SENTRY_DSN`                                                                     | Dashboard error tracking → Better Stack                         |
| `NEXT_PUBLIC_SENTRY_DSN`                                                              | Marketing error tracking → Better Stack                         |

Run `bun run check:env` to validate that your `.env` satisfies every app's schema.

<details>
<summary>Example local <code>.env</code> (single-origin dev)</summary>

```dotenv
NODE_ENV=development
API_PORT=3002
VITE_API_URL=http://localhost:3002
CLIENT_URL=http://localhost:3002/app
NEXT_PUBLIC_CLIENT_URL=http://localhost:3002
VITE_LP_URL=http://localhost:3000

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASS=postgres
POSTGRES_NAME=saas_template

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
RATE_LIMIT_KEY_SECRET=change-me
TRUST_PROXY=false
QUEUE_CONCURRENCY=5
QUEUE_BACKLOG_THRESHOLD=100

# Required infrastructure
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET_NAME=
S3_PUBLIC_URL=
RESEND_API_KEY=
MAIL_DOMAIN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Observability
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=1
VITE_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

</details>

## Stripe Customer Portal

The app uses Stripe Checkout for a customer's first subscription and provides
plan changes, cancellation, and resumption in the billing page. Stripe Customer
Portal is used for invoice history and payment-method management. Configure the
portal in both Stripe test mode and live mode before enabling billing in an
environment:

1. Enable invoice history and payment method updates.
2. Set the portal return URL to `/app/user/billing`.

For local webhook forwarding, run `bun run stripe:listen`, copy the printed
`whsec_...` value into `STRIPE_WEBHOOK_SECRET`, and restart the server.

## Observability

Error tracking, uptime, and alerting run on [Better Stack](https://betterstack.com/docs/getting-started/welcome/).
Errors are sent through the Sentry SDK pointed at Better Stack's ingest endpoint —
no Sentry account is involved. Everything is off until you set the DSNs, so the
template runs clean locally.

**What the code does:** the server exposes `GET /health` (a readiness probe) and
forwards three failure signals into Better Stack Errors, each tagged so you can
alert on it.

The probe checks Postgres, Redis, and the mail provider (Resend), returning a
tiered status. Postgres and Redis are **critical** — if either is down the app
can't serve, so `status` is `unhealthy` and the endpoint returns **`503`**. The
mail provider is **advisory** — if only email is unreachable the app still works
(jobs retry), so `status` is `degraded` but the endpoint stays **`200`**. All
green is `200 {status:"ok"}`.

```jsonc
// 200 — degraded example (email provider unreachable, app still serving)
{
  "status": "degraded",
  "checks": { "database": "ok", "redis": "ok", "email": "down" },
}
```

Signals forwarded into Better Stack Errors:

| Signal                 | Where it fires                                                 | Tags                                   |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Unhandled 500s         | HTTP `onError`                                                 | —                                      |
| Stripe webhook failure | `POST /api/billing/webhooks/stripe` failing                    | `signal=stripe_webhook`                |
| Failed background job  | A job that exhausts all retries                                | `signal=job_failed`, `queue=<name>`    |
| Queue backlog          | Waiting jobs ≥ `QUEUE_BACKLOG_THRESHOLD` (checked each minute) | `signal=queue_backlog`, `queue=<name>` |

### Set it up in Better Stack

1. **Create an application per surface** (server, dashboard, marketing site) under
   **Errors → Applications**. Open each app's **Ingest** tab, copy the DSN, and set
   `SENTRY_DSN` / `VITE_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`. Restart / rebuild.
   Trigger a test error and confirm it lands under **Errors**.
2. **Uptime monitor** — under **Monitors**, create an HTTP monitor for
   `https://<your-api-host>/health`, expecting status `200`. Non-`200` (the `503`
   returned when Postgres or Redis is unreachable) triggers a downtime alert. To
   also be paged when only email is degraded, add a second monitor that additionally
   requires the response body to contain `"status":"ok"` — that one fires on both
   `unhealthy` and `degraded`.
3. **Alert policies** — in the server application's **Errors** view, create one alert
   policy per signal, filtering on its tag (`signal:stripe_webhook`,
   `signal:job_failed`, `signal:queue_backlog`), and attach an on-call / notification
   channel to each.

`QUEUE_BACKLOG_THRESHOLD` tunes how many waiting jobs count as a backlog.

### Scheduled maintenance

Periodic tasks — the backlog check (every minute) and Stripe reconciliation
(hourly, only when Stripe is configured) — run as **BullMQ job schedulers**
consumed by the maintenance worker, not `setInterval`. A scheduled occurrence is
processed by exactly one worker across the cluster, so running multiple server
instances does not duplicate the work or the alerts. Schedules are registered in
`server.ts`; the handlers live in `workers/maintenance.ts`.

### Failed jobs (dead-letter handling)

There is no separate dead-letter queue — BullMQ's **failed set** is the dead-letter
store. A job retries with exponential backoff (`attempts: 5`); once exhausted it
lands in the failed set, fires the `signal=job_failed` alert, and is retained for
inspection and re-drive (`age`/`count` limits in
`infrastructure/queue/bullmq.ts`, then aged out). Inspect, retry, or purge failed
jobs through `QueueService` (`listFailed`, `retry`, `retryAllFailed`, `remove`).
If a product later needs an isolated dead-letter queue, add a second queue and
enqueue exhausted jobs to it from the worker's `failed` handler.

## Scripts

Run from the repo root; Turborepo fans them out to each workspace.

| Script                    | What it does                                     |
| ------------------------- | ------------------------------------------------ |
| `bun run dev`             | Start all apps in watch mode                     |
| `bun run build`           | Build all apps                                   |
| `bun run test`            | Run the test suites (server tests need Postgres) |
| `bun run lint`            | ESLint across workspaces                         |
| `bun run lint:fix`        | ESLint with `--fix`                              |
| `bun run typecheck`       | `tsc` across workspaces                          |
| `bun run format`          | Prettier                                         |
| `bun run check:env`       | Validate `.env` against every app's schema       |
| `bun run db:generate`     | Generate a Drizzle migration from schema changes |
| `bun run db:migrate`      | Apply pending migrations                         |
| `bun run db:studio`       | Open Drizzle Studio                              |
| `bun run stripe:listen`   | Forward Stripe CLI webhooks to the local server  |
| `bun run containers:up`   | `docker compose up` (Postgres + Redis)           |
| `bun run containers:down` | `docker compose down`                            |

A Husky pre-commit hook runs `lint-staged` (Prettier + ESLint) and `turbo
typecheck`; a pre-push hook runs the test suite.

## Database & migrations

Schemas live in `apps/server/src/infrastructure/database/schemas`, and generated
SQL migrations in `apps/server/drizzle/`. After changing a schema:

```bash
bun run db:generate   # writes a new migration
bun run db:migrate    # applies it
```

## Internationalization

Supported locales: **English (`en`), French (`fr`), Spanish (`es`)**.

- **Shared foundation** — `@repo/i18n` holds the locale config (`locales`,
  `defaultLocale`, `Locale`, `localeLabels`) and the message catalogs:
  `messages/{en,fr,es}.json` for the marketing site and `messages/app/*` for the
  dashboard. Both apps import the same config; each has its own catalogs.
- **Marketing site (next-intl)** — a `[locale]` route segment statically
  exports one HTML page per language (`/en/`, `/fr/`, `/es/`).
- **Dashboard (react-i18next)** — language is detected in this order:
  `?lng=` query → `NEXT_LOCALE` cookie → `localStorage` → browser.
- **One shared cookie** — locale is unified across all three surfaces on the
  `NEXT_LOCALE` cookie: the marketing switcher writes it, the server's `/`
  redirect reads it, and the dashboard reads **and** writes it — so a choice made
  in either app follows the user to the other.
- **Errors** — form validation (Zod) is localized via a custom error map, and
  API errors carry a stable `code` (`@repo/constants/errors`) that the client
  translates, falling back to the server's message.

## Testing

Server tests use Bun's test runner against a real PostgreSQL instance. Each test
spins up an isolated database from a migrated template, so a running Postgres is
required (`bun run containers:up`).

```bash
bun run test                      # all suites
bun --cwd apps/server test        # server only
```

Testing rules (see [`AGENTS.md`](AGENTS.md)): no `any`, no `as`, every mutation
test verifies the change in the database, and quality over quantity. The
dashboard and marketing app don't have test setups yet.

## Deployment

`bun run build` compiles the server into a single self-contained binary
(`bun build --compile`) and builds the marketing and dashboard bundles; the
[`Dockerfile`](Dockerfile) assembles them so the runtime image serves the API,
the marketing export (`./front`), and the dashboard (`./client`) from one
process on `API_PORT`.

CI ([`.github/workflows/build-and-push.yml`](.github/workflows/build-and-push.yml))
builds the image and pushes it to GitHub Container Registry on every push to
`main`. Secrets are materialized into `.env` at build time.

> **Note:** when adding a new workspace package, add a matching
> `COPY packages/<name>/package.json …` line to the `Dockerfile`'s install stage,
> or the container install will fail to resolve the workspace.

## Architecture & conventions

The detailed, enforced conventions live in [`AGENTS.md`](AGENTS.md) /
[`CLAUDE.md`](CLAUDE.md). In brief:

- **Server** — strict three layers. Controllers handle HTTP only and call one
  service method; services hold all business logic and throw typed errors;
  repositories do database queries only. External integrations sit behind
  abstract base classes in `infrastructure/`, each with a `disabled.ts` stub.
- **Dashboard** — one API class per domain over a `BaseApi`; TanStack Query for
  all server state; react-hook-form + Zod for forms; destructive actions wrapped
  in an `AlertDialog`. Pages are split into a shell (`page.tsx`) and feature
  components; route files are one-line wiring.
- **Comments** — the codebase is intentionally near comment-free; add a comment
  only for a non-obvious _why_.

---
