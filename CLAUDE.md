# SaasTemplate

At the start of each conversation, read the following package.json files to understand available scripts and dependencies:

- `package.json` (root)
- `apps/server/package.json`
- `apps/client/package.json`
- `apps/e2e/package.json`

## Server Architecture

The server follows a strict three-layer architecture. Never skip or mix layers.

**Controllers** (`src/http/controllers/`)

- HTTP concerns only: parse request, call one service method, return response.
- No business logic. No direct repository access. No direct Stripe/DB calls.
- Validation is declared with `validator("json" | "param" | "query", schema)` — schemas live in `src/http/validations/`.
- Auth-protected routes go after `.use(authMiddleware)` in the chain.

**Services** (`src/services/`)

- All business logic lives here. Extend `BaseService`, access deps via `this.context`.
- One public method per use case. Private helpers for shared internal logic.
- Never import anything HTTP-specific (Hono, cookies, headers).
- Throw typed errors (`BadRequestError`, `NotFoundError`) from `@server/lib/errors`.

**Repositories** (`src/repositories/`)

- Database queries only. Extend `BaseRepository`, use `this.db`.
- No business logic, no error throwing, no calls to other services.
- One method per query. Name methods after what they return: `findCustomerByUserId`, `createCheckoutAttempt`.

**Infrastructure** (`src/infrastructure/`)

- Concrete implementations of abstract base classes (`BaseBilling`, `BaseMailer`, `BaseStorage`, etc.).
- A `disabled.ts` stub must exist for every abstraction so the app runs without external services configured.

**Shared constants** (`src/config/constants.ts`)

- App-wide types and constants go here, not scattered across files.
- Things shared between client and server go in `packages/` (e.g. `@repo/constants`).

## Environment Variables

The env schema lives in `apps/server/src/config/env.ts`. When you add a new key to it (or to any env schema), update both of these files in the same change:

- `.env.example` — document the key with an empty value, grouped under the section header of related keys.
- `.env.ci` — give the key a deterministic, non-secret value so the CI `check` job boots and runs tests. Never put a real secret here.

A key missing from `.env.ci` fails CI at env-parse time before any test runs; a key missing from `.env.example` leaves setup undocumented. Keep both in sync with the schema.

## Client Architecture

**API layer** (`src/api/`)

- One class per domain extending `BaseApi`, registered in `src/api/index.ts`.
- All server calls go through `this.call(() => http.api...)`. Never call `fetch` directly.
- `onError` from `@/lib/base-api` is always passed to `useMutation`'s `onError`.

**State and mutations**

- Server state: `useQuery` / `useMutation` from TanStack Query. No local state for server data.
- After a successful mutation, invalidate the relevant query key via `queryClient.invalidateQueries`.
- Loading state pattern: `disabled={mutation.isPending}` + `{mutation.isPending && <Spinner />}` inline in the button — never a separate loading variable.

**Forms**

- Always use `react-hook-form` with `zodResolver`. Use `Controller` for each field.
- Never use uncontrolled inputs or `useState` for form fields.

**Destructive actions**

- Always wrap in an `AlertDialog` before executing. Follow the pattern in `change-password.tsx`.

## Client Page Structure

Pages in `apps/client/src/pages/` follow a strict separation of concerns:

- `page.tsx` — shell only. Contains the page wrapper, header, title, and description. Imports and renders the main feature component. No logic, no queries, no mutations.
- The main feature component (e.g. `billing.tsx`, `sign-in.tsx`) — owns all queries, mutations, and state. Composes sub-components.
- Sub-components (e.g. `current-plan.tsx`, `plan-cards.tsx`) — receive props, own only local UI state (open/close, selected value). No data fetching.

Example structure for a complex page:

```
pages/user/billing/
  page.tsx          ← shell: UserPage + header + <Billing />
  billing.tsx       ← queries, mutations, isAnyMutating, composition
  current-plan.tsx  ← receives props, owns dialog open state
  plan-cards.tsx    ← receives props, owns interval toggle state
```

When creating or editing pages, always check if there is already a pattern to follow in the existing pages before deciding on structure.

## Client Routing

Route files in `apps/client/src/routes/` are wiring only. **Never wrap the page component in an anonymous function to pull data from route context and pass it as a prop.**

Bad (do not do this):

```tsx
component: () => {
  const { user } = adminLayoutRoute.useRouteContext();
  return <AdminDashboardPage user={user} />;
};
```

Good — route file is a one-liner, page pulls context itself:

```tsx
// routes/admin/dashboard.tsx
component: AdminDashboardPage;
```

```tsx
// pages/admin/dashboard/page.tsx
import { getRouteApi } from "@tanstack/react-router";
const route = getRouteApi("/admin-layout");

export const AdminDashboardPage = () => {
  const { user } = route.useRouteContext();
  // ...
};
```

Rules:

- Route file `component` is always a direct reference: `component: PageComponent`. No anonymous wrapper, no prop forwarding, no children wrapping.
- Layouts render `<Outlet />` inside themselves — the layout route's `component: LayoutComponent` is still a direct reference, and the layout component both self-fetches route context and renders `<Outlet />`.
- Pages consume route context via `getRouteApi("/route-id").useRouteContext()`. Route IDs always start with `/` (e.g. `/user-layout`, `/user/select-plan`).
- Pages never take `user` (or similar route-context data) as a prop.

## Code Comments

- Do not add comments that narrate what the code does or explain a change you just made. Let clear naming and structure carry the meaning. This codebase is intentionally near comment-free — match it.
- Add a comment only when it records a non-obvious _why_ the code itself cannot express (a real constraint, workaround, or gotcha), and keep it to one terse line.
- Never leave AI-narration, TODO, or placeholder commentary in committed code.

## Code Style

- Don't inline an `await`ed call as an argument to another call. Bind the result to a descriptive `const` on its own line first, then pass the variable. Prefer `const emailHtml = await renderX(...);` followed by `email.add({ html: emailHtml })` over `email.add({ html: await renderX(...) })`.

## Testing Rules

When writing tests, follow these rules strictly:

- No `any` type — ever. Use proper types.
- No `as` type assertions — no casting to bypass type safety.
- Every mutation test MUST verify the change in the database. Never assume success from status code alone.
- No empty test bodies — every `test()` must contain meaningful assertions.
- No hacks or workarounds to make tests pass. If a test is hard to write, fix the approach, not the test.
- No skipping validations — test the actual behavior, not a simplified version of it.
- Quality over quantity. Fewer thorough tests beat many shallow ones.

## End-to-End Tests

End-to-end tests live in `apps/e2e` (a standalone Playwright package), never in `apps/client`. They drive the real app in a browser against a running stack (`bun run containers:up` + `bun dev`). See `apps/e2e/README.md`.

- Import `test`/`expect` from `../fixtures`, not `@playwright/test`, so the `seed` fixture is available. Name spec files `*.test.ts` under `tests/`.
- Seed data through the `seed` fixture (`createVerifiedUser`, `getPasswordResetToken`), backed by `@repo/server/testing/e2e-seed`. Never hardcode a user, password, or reset token, and never read a real inbox. Each test creates its own user with a unique email and is independent of the others.
- Form inputs use `getByLabel`. Never `getByRole("textbox")` — it does not match `<input type="password">` and fails silently on password fields. Buttons and links use `getByRole`.
  - Exception: the sign-in password field's label embeds the "Forgot password?" link and is ambiguous, so target it with `#password`.
- Assert on behavior — `toHaveURL(...)` and reaching auth-protected pages — not on translated copy or transient toasts.
- Clean up whatever `playwright codegen` emits: drop stray `.click()`/`.press(...)` cruft and hardcoded hosts (use the config `baseURL`, e.g. `page.goto("/app/sign-in")`), and give every test a descriptive name — never `test("test", ...)`.
- Seeding logic belongs in the server's exported `testing/e2e-seed` surface, not as raw SQL in the test package. Extend that module when a new flow needs seeding.

## Git

NEVER commit unless the user explicitly asks you to. No exceptions.

Before committing, review all written code and check for:

- Unused variables, imports, or dead code
- Unnecessary code that can be removed
- Poorly performing code that can be optimized
- Hacks or workarounds
- Type assertions (`as`, `any`)
- Anything that violates best practices

Fix all issues found before committing.
