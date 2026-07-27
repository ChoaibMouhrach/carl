# End-to-end tests

Playwright tests that drive the real app in a browser. Put specs here as
`*.spec.ts` (e.g. `sign-in.spec.ts`).

## Running

```bash
# from apps/client
bun run e2e          # headless run
bun run e2e:ui       # interactive UI mode
bun run e2e:report   # open the last HTML report
```

Playwright starts the client dev server automatically (`bun run dev`, port
5173). If you already have the full stack running via `bun dev` at the repo
root, it reuses that instead.

## Backend requirement

These are true end-to-end flows: anything past a static page (sign in, billing,
the core product action) needs the **API server, Postgres, and Redis** up.
Start them before running:

```bash
# repo root
bun run containers:up   # Postgres + Redis
bun dev                 # client + server + marketing site
```

Override the target with `E2E_BASE_URL` if the app runs elsewhere.

## Config

See `../playwright.config.ts` — base URL, the auto-started dev server, and the
Chromium project live there.
