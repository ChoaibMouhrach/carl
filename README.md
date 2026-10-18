# Carl

A clean, typed, batteries-included foundation for building focused SaaS products.
It gives you the essential infrastructure — a single admin account, first-admin setup,
and a polished app shell — without inheriting
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

This is a Turborepo monorepo containing two deployable apps and a set of shared
packages. In production, a **single compiled server binary** serves everything:
the API and the dashboard SPA.

**What's included out of the box:**

- Secure, session-based authentication (sign in, email verification,
  password reset, change email, change password with optional other-session
  revocation). There is no public sign-up
- A first-admin **setup flow** — the setup page creates the one verified admin
  account; no demo data
- **Internationalization** across the whole stack (English, French, Spanish)
- Rate limiting (Redis-backed), a background email queue, and a
  provider-agnostic infrastructure layer

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
| UI              | Tailwind CSS v4 + shadcn/ui (shared in `@repo/ui`)                                |
| Forms           | react-hook-form + Zod                                                             |
| i18n            | react-i18next, shared catalogs                                                    |
| Email           | [Resend](https://resend.com)                                                      |

## Monorepo layout

```
apps/
  server/   Hono API + background workers; in prod serves the client too
  client/   Vite + React SPA — the authenticated dashboard, served at /
packages/
  constants/  Shared types & constants (@repo/constants): error codes…
  ui/         Shared shadcn/ui component library (@repo/ui)
  i18n/       Shared locale config + message catalogs (@repo/i18n)
```

The server follows a strict three-layer architecture (controllers → services →
repositories) with a provider-agnostic **infrastructure** layer
(`mailer`, `queue`, `rate-limiter`, `logger`, …). See
[Architecture & conventions](#architecture--conventions).

## How requests are routed

In production the server (`apps/server`) is the single entry point:

| Path     | Served by                                                  |
| -------- | ---------------------------------------------------------- |
| `/api/*` | The Hono API                                               |
| `/*`     | Dashboard SPA — the Vite build (`./client`), router at `/` |

## Prerequisites

- [Bun](https://bun.sh) `1.3.5+`
- Docker (for local PostgreSQL and Redis) — or your own Postgres/Redis instances
- Optional: a Resend API key (emails are logged in development)

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

# 5. Start everything in dev (API + dashboard)
bun run dev
```

Then open the dashboard at `/`. Run
the setup flow once to create the admin account (it is created already verified);
after that, sign in at `/sign-in`. There is no sign-up page and
`/api/auth/sign-up/*` is closed.

## Environment variables

All apps read a single root `.env`. Copy `.env.example` and fill it in.

| Variable                                                                  | Description                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                | `development` or `production`                                                     |
| `API_PORT`                                                                | Port the server listens on                                                        |
| `VITE_API_URL`                                                            | Base URL the dashboard uses to reach the API                                      |
| `CLIENT_URL`                                                              | Public URL of the dashboard (server builds email links from it)                   |
| `POSTGRES_URL` **or** `POSTGRES_HOST` / `PORT` / `USER` / `PASS` / `NAME` | PostgreSQL connection: a URL, or all five keys (the URL wins)                     |
| `REDIS_URL` **or** `REDIS_HOST` / `PORT` / `PASSWORD`                     | Redis connection (queue + rate limiting): a URL, or all three keys (the URL wins) |
| `RATE_LIMIT_KEY_SECRET`                                                   | Secret used to hash rate-limit keys                                               |
| `TRUST_PROXY`                                                             | `true` when running behind a reverse proxy (for client IPs)                       |
| `QUEUE_CONCURRENCY`                                                       | Max concurrent background jobs                                                    |
| `QUEUE_BACKLOG_THRESHOLD`                                                 | Waiting-jobs count that triggers a backlog alert (default 100)                    |
| `RESEND_API_KEY` / `MAIL_DOMAIN` / `MAIL_RATE_LIMIT_PER_SECOND`           | Transactional email                                                               |

Run `bun run check:env` to validate that your `.env` satisfies every app's schema.

<details>
<summary>Example local <code>.env</code> (single-origin dev)</summary>

```dotenv
NODE_ENV=development
API_PORT=3002
VITE_API_URL=http://localhost:3002
CLIENT_URL=http://localhost:3002

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASS=postgres
POSTGRES_NAME=carl

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
RATE_LIMIT_KEY_SECRET=change-me
TRUST_PROXY=false
QUEUE_CONCURRENCY=5
QUEUE_BACKLOG_THRESHOLD=100

# Required infrastructure
RESEND_API_KEY=
MAIL_DOMAIN=
MAIL_RATE_LIMIT_PER_SECOND=2
```

</details>

## Observability

The server exposes `GET /health` (a readiness probe) and has an
`errorMonitor` hook (`BaseErrorMonitor`, `apps/server/src/lib/base-error-monitor.ts`)
that failure signals are reported through.

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

Signals reported through `errorMonitor`:

| Signal                | Where it fires                                                 | Tags                                   |
| --------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Unhandled 500s        | HTTP `onError`                                                 | —                                      |
| Failed background job | A job that exhausts all retries                                | `signal=job_failed`, `queue=<name>`    |
| Queue backlog         | Waiting jobs ≥ `QUEUE_BACKLOG_THRESHOLD` (checked each minute) | `signal=queue_backlog`, `queue=<name>` |

By default `errorMonitor` is `DisabledErrorMonitor` (`apps/server/src/infrastructure/error-monitor/disabled.ts`)
— a no-op, so these signals go nowhere. To wire up a real error-tracking
provider, add an implementation of `BaseErrorMonitor` under
`infrastructure/error-monitor/` and swap it in in `context.ts`.

An uptime monitor can poll `GET /health`, expecting `200`. Non-`200` (the
`503` returned when Postgres or Redis is unreachable) means the app can't
serve. A response body containing `"status":"degraded"` means only the mail
provider is unreachable — the app still works, jobs just retry.

`QUEUE_BACKLOG_THRESHOLD` tunes how many waiting jobs count as a backlog.

### Scheduled maintenance

Periodic tasks — the backlog check (every minute) — runs as **BullMQ job schedulers**
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
  `messages/app/*` for the dashboard.
- **Dashboard (react-i18next)** — language is detected in this order:
  `?lng=` query → `NEXT_LOCALE` cookie → `localStorage` → browser.
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
dashboard doesn't have a test setup yet.

## Deployment

`bun run build` compiles the server into a single self-contained binary
(`bun build --compile`) and builds the dashboard bundle; the
[`Dockerfile`](Dockerfile) assembles them so the runtime image serves the API,
the dashboard (`./client`) from one
process on `API_PORT`.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) builds the image and
pushes it to GitHub Container Registry on every push to `main`. The image
contains **no configuration and no secrets**: nothing is read from GitHub
secrets or a `.env` at build time (`.env*` files are excluded from the build
context). Set every variable from [`.env.example`](.env.example) in your
platform's environment manager (e.g. Dockploy) instead; the container reads
them when it starts.

The dashboard's `VITE_API_URL` and `VITE_SENTRY_DSN` are runtime values too:
the server injects them into `index.html` as `window.__ENV__` on each request,
so the same image works for any environment. (In `bun run dev`, Vite reads them
from `.env` as usual.)

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
