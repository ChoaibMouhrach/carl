# Carl

A go-to-market (GTM) app for Skool. Carl finds Skool communities, treats each
community's owner as a lead, and runs those leads through a multi-stage
pipeline, organised into campaigns.

## Contents

- [Overview](#overview)
- [How a campaign works](#how-a-campaign-works)
- [Running a scrape](#running-a-scrape)
- [Tech stack](#tech-stack)
- [Monorepo layout](#monorepo-layout)
- [How requests are routed](#how-requests-are-routed)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Live updates](#live-updates)
- [AI filter (stage 2)](#ai-filter-stage-2)
- [Web search (stage 3)](#web-search-stage-3)
- [Email finder (stage 4)](#email-finder-stage-4)
- [MCP for AI agents](#mcp-for-ai-agents)
- [Observability](#observability)
- [Scripts](#scripts)
- [Database & migrations](#database--migrations)
- [Testing](#testing)
- [Deployment](#deployment)
- [Architecture & conventions](#architecture--conventions)

## Overview

Carl is a Turborepo monorepo with two deployable apps and a set of shared
packages. In production, a **single compiled server binary** serves everything:
the API and the dashboard SPA.

**What it does:**

- **Scrapes Skool** discovery and community pages for your keywords, then stores
  each community and its owner. The owner is the lead; the community is how we
  found them
- **Campaigns** — several can run side by side, each with its own keywords,
  search settings and filters, and its own view of where every lead sits in the
  pipeline
- **A dashboard** to manage campaigns, leads and communities, start scrapes and
  watch their progress
- **A single admin account**, created by a first-run setup flow. There is no
  public sign-up
- Rate limiting (Redis-backed), background job queues, and a provider-agnostic
  infrastructure layer

Every external integration is required. Environment validation fails immediately
when any required configuration is missing.

## How a campaign works

A campaign moves leads through **8 pipeline stages**. Stage 1 is the Skool
scrape. Stages 2–8 are generic slots in the UI: they show lead counts, but their
work is not implemented yet.

A campaign has these scrape settings:

| Setting       | Meaning                                                               |
| ------------- | --------------------------------------------------------------------- |
| Keywords      | What to search for on Skool: up to 10, one per line                   |
| Type          | `public` or `private` communities                                     |
| Pricing model | `free`, `paid` or `free-trial`                                        |
| Monthly price | Optional minimum and maximum, in USD. Yearly prices are divided by 12 |
| Members       | Optional minimum and maximum member count                             |

Searches always use English. Free communities count as a $0 price, and
communities with a one-time or unknown price have no monthly price to compare,
so they are dropped whenever a price limit is set.

Leads found by a scrape are attached to the campaign at stage 1 as `done`, ready
for stage 2. Each lead then has a status per stage: `pending`, `running`, `done`
or `failed`.

## Running a scrape

Open an **active** campaign and run the scrape from its stage 1 panel. The API
returns `202` immediately and a BullMQ worker does the work. The page updates
live while the run is queued or running, then shows a summary: communities
found, new communities, leads added, filtered out and failed.

How the scraper works:

1. **Discover** — queries Skool's discovery pages for each keyword, one search per
   chosen type and pricing model, and fetches the remaining pages in parallel.
   Discovery results are not deduplicated
2. **Skip known communities** — one database lookup skips every community
   already stored, so nothing is fetched twice. Owners are cached the same way
3. **Fetch each new community's `/about` page** — the owner, pricing, tiers,
   links, counts and reviews come from the page's `__NEXT_DATA__` JSON
4. **Apply the campaign's filters** — price and member limits are applied here,
   before anything is stored, so a filtered-out community and its owner never
   reach the database
5. **Store** — the owner's profile (followers, posts, created communities, links)
   is fetched, emails are extracted from their bio, and the lead and community
   are saved. A filtered-out community is not remembered, so a later scrape
   fetches it again

Skool is reached through a `BaseSkoolScraper` contract. The current
implementation is `infrastructure/skool/custom`; an Apify-based one can be added
at `infrastructure/skool/apify` without touching the services.

You can also run a scrape from the command line, without a campaign:

```bash
bun --cwd apps/server run scrape --keyword "business coaching" --keyword "online courses" \
  --type public --pricing paid \
  --min-price 10 --max-price 100 --min-members 50 --max-members 5000
```

`--keyword` is required and can be repeated. `--type` and `--pricing` can be
repeated too, and leaving them out searches all of their options.

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
| Email           | [Resend](https://resend.com)                                                      |

## Monorepo layout

```
apps/
  server/   Hono API + background workers; in prod serves the client too
  client/   Vite + React SPA — the authenticated dashboard, served at /
  e2e/      Playwright end-to-end tests
packages/
  constants/  Shared types & constants (@repo/constants): error codes, campaign enums…
  ui/         Shared shadcn/ui component library (@repo/ui)
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
| `LOG_LEVEL`                                                               | Minimum log level: `debug`, `info`, `warn`, `error`, `silent` (default `info`)    |
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

## Live updates

The dashboard stays current without polling. The server publishes an event
whenever campaigns, leads or communities change — from any request, or from a
scrape in progress — and an admin's browser receives it over a Server-Sent
Events stream at `GET /api/events`. Each event tells the page which data to
refetch (`campaigns.changed`, `leads.changed`, `communities.changed`); the
dashboard invalidates the matching queries, and refetches everything after the
stream reconnects.

Events travel over Redis pub/sub (`infrastructure/event-bus/redis.ts`, behind
`BaseEventBus`), so a change made on one server instance — or by the queue
worker — reaches the browsers connected to any other. Publishing is best
effort: if Redis fails, the request that caused the change still succeeds.

## AI filter (stage 2)

Each campaign has its own AI filter. Open a campaign, go to its Stage 2 tab and
choose **AI filter settings**: there you describe what the campaign is trying to do (who you are, what you offer,
what a good lead looks like) and the
questions the AI answers about every lead. A question has a role: a
**requirement** must be yes, a **disqualifier** removes the lead on yes, a
**competitor** question marks competitors on yes, and an **evidence** question
checks the answers are backed by the lead's data. A **signal** never changes the
verdict; the assessment shows how many signals were yes as a priority. For each question you also say
whether an answer the AI cannot give sends the lead to review or disqualifies it.
**Show prompt** writes out exactly what the AI is sent. **Re-apply rules** (on the Stage 2 tab) recomputes every verdict from
the answers already stored, matching questions by their text, so changing a role
costs nothing; leads missing an answer to a newly added question are skipped until
the AI is run again.

**Run AI filter** moves every lead that finished stage 1 to stage 2 and queues
one classification per lead (`filter` queue, `AI_FILTER_CONCURRENCY` at a time, 12 by default). The AI only sees
what we scraped: the owner's profile and their communities, written out as plain
text. Every yes must come with a quote that really appears in that text, otherwise
it counts as unknown. Plain rules in `lib/assessment.ts` turn the answers into a
verdict, in this order: competitor, disqualified, needs review, qualified. Only
qualified leads are done at stage 2; the others are marked failed with the verdict
as the reason and keep their assessment, which opens from the verdict badge in the
campaign's lead list. A lead the AI could not be asked about is failed with the
error and tried again by the next run.

The model is a strategy. `LlmLeadClassifier` asks a `BaseLlm` for a structured
answer; the implementation is `AiSdkLlm`, which uses the Vercel AI SDK with its
OpenAI provider (`OPENAI_API_KEY`, which is required and stops the server from
starting when missing, and `AI_FILTER_MODEL`). Moving to a native OpenAI or Anthropic SDK later means
adding another `BaseLlm` and selecting it in `infrastructure/llm/index.ts`; nothing
else changes. For e2e tests a scripted classifier replaces the whole thing when
`SKOOL_SCRIPTING` is on.

## Web search (stage 3)

Qualified leads (done at stage 2) that have neither a website nor a LinkedIn
profile are looked up on [Tavily](https://tavily.com) (`enrich` queue,
`ENRICH_CONCURRENCY` at a time, 5 by default). `POST /api/campaigns/:id/enrich/run`
moves them to stage 3 and queues one job. For each lead it searches LinkedIn
first (query: name, first community, "LinkedIn") and saves the first
`linkedin.com/in/…` profile whose title or address contains the lead's first and
last name. When there is none it searches the web and saves the first result that
is not a social site or Skool and that names the lead or the whole community, as
the website. Leads that
already have either one are done without a search. A lead with nothing found
fails with "Nothing found" and is not searched again; a lead whose search
errored is retried on the next run. `TAVILY_API_KEY` is required and the server
will not start without it.

## Email finder (stage 4)

Leads that finished stage 3 get a work email from
[FullEnrich](https://fullenrich.com) (`find-email` queue). `POST
/api/campaigns/:id/find-email/run` moves them to stage 4 and queues one job.
FullEnrich has no SDK, so `FullEnrichEmailFinder` calls its REST API directly
behind `BaseEmailFinder`. Leads go in batches of 100 (two batches at a time): one bulk enrichment per batch for
`contact.work_emails`, polled every 5 seconds until it finishes. Each lead is sent
once, with its LinkedIn URL, its first and last name and the domain of its
website, whichever it has. Credits are only used when an email is found, and
identical lookups in one run are sent once.

- A lead that already has an email is done without a lookup.
- Without a LinkedIn URL a lead needs a first and a last name ("No usable name")
  and a website that is not a link-in-bio or social page ("No usable website").
- A lead with no email found fails with "No email found" and is not looked up
  again. A batch that errored (no credits, rate limit, timeout) is retried on the
  next run, and re-running the same contacts within 3 months is free.
- The Stage 4 tab has a "Find emails" button, and the lead list shows why a lead
  failed under its status.
- If a run dies (a crash or restart), leads left "running" are queued again by
  the next start, here and for stages 2 and 3, unless a job for the campaign is
  still queued or running.
- The email is added to the lead's `emails`. `FULLENRICH_API_KEY` is required and
  the server will not start without it.

## MCP for AI agents

An AI agent can look Skool up through Carl and work with its leads, communities and
campaigns. Account
settings shows the address (`<API URL>/api/mcp`) to give an MCP client
(Streamable HTTP) and lists the connected agents, each with a remove option.
Clicking an agent opens its page: its details and a table of every request it
made, where a request opens as the JSON the agent sent and the JSON it was
answered with, each with a copy button. Those requests are kept in
`mcp_requests` (bodies clipped at 100,000 characters) and deleted with the
agent.
Better Auth's MCP plugin
runs the OAuth sign-in, so the agent opens the normal sign-in page once and then
holds a token. Only admins are accepted.

Two kinds of tools are offered. The Skool lookups are read-only:
`search_communities` (keyword, visibility, pricing model, page, member and price
limits), `get_community` (a community with its owner and the emails found in
their bio) and `get_owner` (a profile and the communities they created). What
they find is not saved. The data tools work on what is already in Carl:
`list_campaigns`, `list_leads` and `list_saved_communities`, and `create_*` and
`update_*` for campaigns, leads and communities. Stage 2 can be driven end to
end: `get_filter` and `save_filter` read and replace a campaign's AI filter,
`show_filter_prompt` writes out what the AI would be sent, `run_filter` starts the
AI filter (paid, one request per lead), `list_campaign_leads` and `get_assessment`
read the verdicts and the evidence, and `reapply_filter` recomputes verdicts from
the stored answers. Agents can never delete, change a campaign's status or start a
scrape: campaigns are always created as drafts, so a person activates a campaign
before `run_filter` will work.
Skool answers are cached in Redis for an hour (`infrastructure/cache/redis.ts`,
behind `BaseCache`), so repeating a question does not hit Skool again.

The OAuth tokens themselves live in the `oauth_*` tables. Discovery documents are
served at `/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource`.

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

### Logging

The server logs with [pino](https://github.com/pinojs/pino) behind `BaseLogger`
(`debug`, `info`, `warn`, `error`, `child`). In production every entry is one JSON
line on stdout, so Docker, Dokploy or any log shipper can collect it:

```json
{
  "level": "warn",
  "time": "2026-10-22T13:20:45.395Z",
  "service": "carl-server",
  "hostname": "…",
  "requestId": "…",
  "method": "GET",
  "path": "/api/campaigns",
  "status": 401,
  "durationMs": 3,
  "msg": "Request completed."
}
```

- `LOG_LEVEL` (`debug | info | warn | error | silent`, default `info`) sets the minimum level.
- Every `/api/*` request is logged once when it ends: `info` below 400, `warn` for 4xx, `error` for 5xx. The path never includes the query string. A request id (a safe incoming `x-request-id`, else a new UUID) is logged and returned in the `x-request-id` response header.
- Unexpected errors are logged with their stack under `err`, with the request id, before the `500` is returned.
- Values under `password`, `token`, `secret`, `apiKey`, `authorization` and `cookie` (top level or one level down) are written as `[Redacted]`.
- Failed jobs log at `warn` while they retry and at `error` once they are exhausted. `unhandledRejection` is logged; `uncaughtException` is logged and the process exits so the platform restarts it.
- In development the output is pretty-printed (`pino-pretty`, a dev dependency).

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
