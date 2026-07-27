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
  const user = await seed.createVerifiedUser(); // real signup + verified
  const token = await seed.getPasswordResetToken(user.email); // from the DB
  // ...
});
```

`createVerifiedUser` signs up through the real API (correct password hashing),
then flips `emailVerified` in the database so the user can sign in.
`getPasswordResetToken` reads the token better-auth stores in the `verification`
table, so you can build a `/app/reset-password?token=...` URL without an inbox.

## Locator conventions

Keep specs consistent — codegen defaults are cleaned up to follow these:

- **Form inputs → `getByLabel`.** `getByRole("textbox")` (what codegen emits)
  does not match `<input type="password">`, so it silently fails on password
  fields. `getByLabel` works for every input type.
- **Buttons and links → `getByRole`** (`"button"` / `"link"`).
- **Assert on behavior, not copy** — prefer `toHaveURL(...)` over matching
  translated text, which changes with i18n.
- **Exception:** the sign-in password field's label embeds the
  "Forgot password?" link (and a "Show password" button also matches
  "password"), so `getByLabel("Password")` is ambiguous there — use
  `#password` for that one field only.

## Config

`config.ts` loads the repo-root `.env` and derives the client URL, API URL, and
database connection. Override the app target with `E2E_BASE_URL`.
