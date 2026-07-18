# Server test standard

Tests exercise the real controller, service, repository, and PostgreSQL stack.

- A successful mutation is never proven by an HTTP status alone; assert the
  persisted database state.
- Include validation, authorization, ownership, idempotency, and isolation
  cases where they apply.
- Keep tests typed: no `any`, no type assertions, no skipped assertions, and no
  test-only shortcuts around production behavior.
- Prefer a smaller number of complete behavior tests over shallow coverage.
