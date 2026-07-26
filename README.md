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

**Infrastructure is optional.** Every external integration (Stripe, Resend, S3,
Redis queue) has a `disabled.ts` stub, so the app boots and runs even when those
services aren't configured — wire them in when you need them.

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
| `S3_ENDPOINT` / `REGION` / `ACCESS_KEY` / `SECRET_KEY` / `BUCKET_NAME` / `PUBLIC_URL` | Object storage (leave blank to use the disabled stub)           |
| `RESEND_API_KEY` / `MAIL_DOMAIN`                                                      | Transactional email (blank → disabled stub)                     |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                                         | Billing (blank → disabled stub)                                 |

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

# Optional integrations — leave blank to run against the disabled stubs
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
