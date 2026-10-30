# @repo/e2e

End-to-end tests that drive the real app in a browser (Playwright) against a
running stack. Specs live in `tests/` as `*.spec.ts` or `*.test.ts`.

## Prerequisites

These are true end-to-end flows — they need the whole stack up:

```bash
# repo root
bun run containers:up   # Postgres + Redis
bun dev                 # client + API server (+ marketing site)
```

Playwright also auto-starts the client dev server (port 5173) and reuses a
running one, but the **API server and database must already be up** for anything
that signs in, seeds a user, or hits the backend.

## Running

```bash
# from apps/e2e
bun run e2e          # headless
bun run e2e:ui       # interactive UI mode
bun run e2e:gen      # codegen -> tests/_codegen.ts (scratch, gitignored)
bun run e2e:report   # open the last HTML report
```

## Seeding data

Tests get a `seed` fixture backed by the server's own DB layer
(`@repo/server/testing/e2e-seed`) — no duplicated SQL:

```ts
import { test, expect } from "../fixtures";

test("...", async ({ page, seed }) => {
  const user = await seed.createVerifiedAdmin(); // verified admin with credentials
  const token = await seed.getPasswordResetToken(user.email); // from the DB
  // ...
});
```

`createVerifiedAdmin` inserts a verified admin with a hashed credential directly in the database (public sign-up is closed),
then flips `emailVerified` in the database so the user can sign in.
`getPasswordResetToken` reads the token better-auth stores in the `verification`
table, so you can build a `/reset-password?token=...` URL without an inbox.

## Locator conventions

Keep specs consistent — codegen defaults are cleaned up to follow these:

- **Form inputs → `getByLabel`.** `getByRole("textbox")` (what codegen emits)
  does not match `<input type="password">`, so it silently fails on password
  fields. `getByLabel` works for every input type.
- **Buttons and links → `getByRole`** (`"button"` / `"link"`).
- **Assert on behavior, not copy** — prefer `toHaveURL(...)` over matching
  the visible copy, which changes.
- **Exception:** the sign-in password field's label embeds the
  "Forgot password?" link (and a "Show password" button also matches
  "password"), so `getByLabel("Password")` is ambiguous there — use
  `#password` for that one field only.

## Config

`config.ts` loads the repo-root `.env` and derives the client URL, API URL, and
database connection. Override the app target with `E2E_BASE_URL`.

The website pipeline test serves HTML on an ephemeral local HTTP port so the
real worker can fetch it. CI uses `.github/compose.e2e.yml` to let the app
container reach that server through `host.docker.internal`.
