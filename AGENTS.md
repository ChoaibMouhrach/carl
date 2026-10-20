# Carl

At the start of each conversation, read the following package.json files to understand available scripts and dependencies:

- `package.json` (root)
- `apps/server/package.json`
- `apps/client/package.json`
- `apps/e2e/package.json`

## Server Architecture

The server follows a strict three-layer architecture. Never skip or mix layers.

**Controllers** (`src/http/controllers/`)

- HTTP concerns only: parse request, call one service method, return response.
- No business logic. No direct repository access. No direct provider/DB calls.
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

- Concrete implementations of abstract base classes (`BaseMailer`, `BaseQueueHub`, `BaseRateLimiter`, etc.).
- Provide a `disabled.ts` stub only when the external integration is optional and the app can operate without it.

### Infrastructure strategy pattern

External integrations always use the same strategy pattern as mailer, logger, and queue:

1. Define the provider-agnostic contract in `src/lib/base-<domain>.ts`.
2. Create one concrete provider implementation in `src/infrastructure/<domain>/` for each provider (for example, `ResendMailer`, `BullMQ`, or `RedisRateLimiter`).
3. Type the dependency in `Context` and services as the base contract only. Never expose a concrete provider type outside its infrastructure module.
4. Select the concrete provider once in `initContext`; services call only the base contract.
5. Provide a disabled implementation when the external service is optional.

For integrations that expose several independently typed capabilities, use a hub contract composed of strategy contracts:

```ts
abstract class BaseQueue<Input> {
  abstract add(input: Input): Promise<void>;
}

abstract class BaseQueueHub {
  abstract email: BaseQueue<EmailJob>;
}
```

The provider-specific hub (for example, a BullMQ hub) wires its concrete queues internally. Context and services use only `BaseQueueHub` and `BaseQueue<Input>` — never provider-specific queue classes. Add a new queue by adding a typed abstract property to the hub contract, then implementing it in every provider strategy.

**Shared constants** (`src/config/constants.ts`)

- App-wide types and constants go here, not scattered across files.
- Things shared between client and server go in `packages/` (e.g. `@repo/constants`).

## Environment Variables

The env schema lives in `apps/server/src/config/env.ts`. When you add a new key to it (or to any env schema), update both of these files in the same change:

- `.env.example` — document the key with an empty value, grouped under the section header of related keys.
- `.env.ci` — give the key a deterministic, non-secret value so the CI `check` job boots and runs tests. Never put a real secret here.

A key missing from `.env.ci` fails CI at env-parse time before any test runs; a key missing from `.env.example` leaves setup undocumented. Keep both in sync with the schema.

## Client Architecture

## UI Components

- Use only the existing shadcn components exported from `@repo/ui/components/ui` for user-interface primitives.
- Do not introduce another component library or create custom replacements for shadcn primitives.
- When a needed primitive is missing, add the corresponding shadcn component to `@repo/ui` before using it.
- Do not override the theme or visual styling of shadcn components with `className`. Use their default appearance and documented variants or size props only.
- `className` is allowed only on non-shadcn layout wrappers; it must not be used to restyle a shadcn primitive.
- Anything that scrolls uses the shadcn `ScrollArea` from `@repo/ui/components/ui/scroll-area` (add `<ScrollBar orientation="horizontal" />` for sideways scrolling). Never use `overflow-auto`, `overflow-scroll`, `overflow-x-auto` or `overflow-y-auto` for a scrolling region. `ScrollArea` is the one shadcn primitive that may take a `className`, and only to size it (`h-*`, `max-h-*`, `min-h-0`, `flex-1`). Plain `overflow-hidden` for clipping is fine.
- Every button has a tooltip: wrap it with the shadcn `Tooltip` from `@repo/ui/components/ui/tooltip` and say in one short line what it does (for a disabled button, why it is disabled). Icon-only buttons need one most of all, since it is their only label. This covers `Button`, dropdown triggers and row-action triggers alike; the tooltip uses its default appearance with no `className`.

**API layer** (`src/api/`)

- One class per domain extending `BaseApi`, registered in `src/api/index.ts`.
- All server calls go through `this.call(() => http.api...)`. Never call `fetch` directly.
- `onError` from `@/lib/base-api` is always passed to `useMutation`'s `onError`.

**State and mutations**

- Server state: `useQuery` / `useMutation` from TanStack Query. No local state for server data.
- After a successful mutation, invalidate the relevant query key via `queryClient.invalidateQueries`.
- Loading state pattern: `disabled={mutation.isPending}` + `{mutation.isPending && <Spinner />}` inline in the button — never a separate loading variable.
- For paginated or filtered list queries, use `placeholderData: (previousData) => previousData` when retaining the previous result during a refetch improves continuity.
- Every `useQuery` call must set `placeholderData` (typically `(previousData) => previousData`). Never omit it.

**Forms**

- Always use `react-hook-form` with `zodResolver`. Use `Controller` for each field.
- Never use uncontrolled inputs or `useState` for form fields.
- Every required field's `FieldLabel` must render the shared `RequiredIndicator` component (`@/components/required-indicator`) right after the label text, showing a red asterisk. Never hand-roll a `*` or asterisk styling inline.

**Destructive actions**

- Always wrap in an `AlertDialog` before executing. Follow the pattern in `change-password.tsx`.
- The confirm button of a delete dialog is an `AlertDialogAction` with `variant="destructive"`. `AlertDialogAction` already renders a `Button`, so no `asChild`/`render` wrapper is needed.

**Loading states**

- Any page-level `useQuery` that gates the page's main content (e.g. the queues page) must render a skeleton matching the loaded layout while pending — never a bare `Spinner` or blank screen. Use the shared `Skeleton` component from `@repo/ui/components/ui/skeleton`.
- The skeleton must mirror the real structure (row count, card grid, table columns), not a single generic placeholder block.
- This is mandatory: any new or edited data-fetching page must be checked for a skeleton state before merging.

## Client Page Structure

Pages in `apps/client/src/pages/` follow a strict separation of concerns:

- `page.tsx` — shell only. Contains the page wrapper, header, title, and description. Imports and renders the main feature component. No logic, no queries, no mutations.
- The main feature component (e.g. `account.tsx`, `sign-in.tsx`) — owns all queries, mutations, and state. Composes sub-components.
- Sub-components (e.g. `queue-counts.tsx`, `failed-jobs-table.tsx`) — receive props, own only local UI state (open/close, selected value). No data fetching.

Example structure for a complex page:

```
pages/admin/queues/
  page.tsx               ← shell: AdminPage + header + <Queues />
  queues.tsx             ← queries, mutations, isAnyMutating, composition
  queue-counts.tsx       ← receives props
  failed-jobs-table.tsx  ← receives props, owns dialog open state
```

When creating or editing pages, always check if there is already a pattern to follow in the existing pages before deciding on structure.

## Management Pages

Management pages (lists of records and similar resources) follow these rules:

- `page.tsx` is shell-only: page layout, title, description, and the main feature component.
- The main feature component owns route search params, queries, mutations, query invalidation, and composition.
- Split filters, tables or lists, and row actions into sub-components. Sub-components receive props and do not fetch server data.
- Put the main content inside `Card` and `CardContent`.
- When a table row or list item is meant to be clickable, make the entire row or item the click target (a link across the full row), not just one cell or a name, and give it `cursor-pointer`.
- Row actions always go in a `DropdownMenu`, even when there is only one action. Never render standalone action buttons or icon buttons in a row.
- Validate all list state in the route search schema: page, search text, filters, sorting, and similar controls.
- Use the shared `Search` component for text search. It debounces input and updates route search params; changing search resets `page` to `1`.
- Never put a `key` prop on `Search`. It syncs its internal value from the `value` prop on its own; a `key` forces a remount instead, which can drop focus/state.
- Filters use shadcn controls and update route search params; changing a filter resets `page` to `1`.
- Pagination always renders, uses shadcn pagination primitives, and updates the `page` route search param.
- Disable Previous and Next when there is no adjacent page using the component's native disabled state.
- Server list endpoints must validate and apply every URL-backed filter in the repository query. Never filter a paginated result set only on the client.

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
- Pages consume route context via `getRouteApi("/route-id").useRouteContext()`. Route IDs always start with `/` (e.g. `/admin-layout`, `/admin/queues`).
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

E2E tests live in `apps/e2e` (a standalone Playwright package), never in `apps/client`. They drive the real app in a browser against a running stack (`bun run containers:up` + `bun dev`). See `apps/e2e/README.md`. Import `test`/`expect` from `../fixtures` (never `@playwright/test`) so the `seed` fixture is available; specs are `*.test.ts` under `tests/`, with descriptive names — never `test("test", ...)`.

**Seeding and data isolation**

- Seed only through the `seed` fixture, backed by `@repo/server/testing/e2e-seed`. Never hardcode a user, password, or token, and never read a real inbox. Seeding logic belongs in that exported module — never raw SQL in the test package; extend it when a flow needs new data.
- Every test creates its own data with a unique token (`faker.string.uuid()`) and is fully independent. The database is shared across tests and parallel workers — never assert exact global counts or unscoped list contents; scope every list assertion by a unique search term.
- Authenticate with `seed.authenticate` (session cookie), not by driving the sign-in form — unless sign-in itself is under test.
- Bulk-seed with direct-insert helpers (e.g. `createVerifiedAdmin`); public sign-up is closed, so never create users through the sign-up API.

**Locators** — verify against the real DOM before writing; never guess labels.

- Form inputs use `getByLabel`. Never `getByRole("textbox")` — it does not match `<input type="password">` and fails silently. Buttons and links use `getByRole("button" | "link", { name })`.
- shadcn `Select` triggers have no accessible name: open with `getByRole("combobox").filter({ hasText })`, and pick options with `getByRole("option", { name, exact: true })`.
- Pagination `PaginationLink` is an `<a>` with no `href` (no `link` role): scope to `getByRole("navigation", { name: "pagination" })` and click the page-number text.
- Use `{ exact: true }` on `getByText` for short or ambiguous strings (status and plan badges) and to avoid strict-mode collisions when the same text appears twice (e.g. a card title and a disabled button).
- The sign-in password field's label embeds the "Forgot password?" link and is ambiguous — target it with `#password`.
- Clean up whatever `playwright codegen` emits: drop stray `.click()`/`.press(...)` cruft and hardcoded hosts (use the config `baseURL`, e.g. `page.goto("/sign-in")`).

**Assertions**

- Assert on behavior, never translated copy or transient toasts: `toHaveURL(...)`, reaching an auth-protected page, HTTP status via `page.waitForResponse(...)`, and persisted state via `seed.*` reads.
- For state that appears asynchronously after a request, use `expect.poll` — never `waitForTimeout` or a fixed sleep.
- When a spec covers a form, assert every required field shows the `RequiredIndicator` asterisk next to its label and that its input has a `placeholder`.
- For a page whose main content is gated by a `useQuery` (e.g. `/admin/queues`), assert the skeleton loading state is present. This is mandatory, not optional: delay the underlying request with `page.route(...)` to make the pending state observable, then assert the `Skeleton` element is visible before the real content appears.

**Scope**

- Prefer few deep flows over many shallow ones; do not duplicate coverage another file already owns.
- Do not E2E what the environment cannot exercise deterministically — email delivery, or rate-limit thresholds — cover those with server tests. Auth is IP-rate-limited on the shared localhost; the fixture clears that budget before each test.
- Know the real behavior before asserting it — don't assert intended behavior the app doesn't have.

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
