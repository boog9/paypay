# Read endpoint throttling relief and frontend 429 resilience

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this file in accordance with .agent/PLANS.md.

## Purpose / Big Picture

Frequent clicks on Settings or Transactions currently trigger 429 responses from the BFF, which then surface as fatal Application errors in the Next.js App Router. This plan relieves throttling on read-only BFF endpoints that back those screens and teaches the frontend to render a clear rate-limit message instead of throwing, so users can retry without the whole app crashing.

## Progress

- [x] (2025-11-17 17:50Z) Drafted ExecPlan outlining BFF throttling exemptions and frontend 429 handling.
- [x] (2025-11-17 17:53Z) Applied `@SkipThrottle()` to wallet read-only GET routes while keeping global guard for writes/auth.
- [x] (2025-11-17 17:54Z) Updated Settings and Transactions pages to surface rate-limit states gracefully and added targeted Vitest coverage for 429 responses.

## Surprises & Discoveries

## Surprises & Discoveries

- Observation: Vitest only picked up the new specs when invoked from the `apps/frontend` working tree with relative `app/...` paths; absolute repository paths were ignored by the configured include patterns.
  Evidence: `pnpm --filter frontend exec vitest run "app/(dashboard)/(stores)/stores/[storeId]/settings/page.test.ts" ...` succeeded after earlier attempts using repository-relative paths returned "No test files found".

## Decision Log

- Decision: Use `@SkipThrottle()` on read-only GET endpoints rather than defining new throttle profiles, keeping the existing global guard for writes and auth.
  Rationale: Simpler, matches current patterns in `StoresController` and `OnchainWalletsController`, and directly prevents 429s on UI fetches without weakening protections elsewhere.
  Date/Author: 2025-11-17 / assistant

## Outcomes & Retrospective

Read-only wallet endpoints now bypass the global throttler, while auth and write routes stay protected by the existing guard. Settings and Transactions pages render clear rate-limit notices instead of throwing on HTTP 429, and new Vitest cases cover those scenarios. Remaining work would focus on monitoring real traffic to confirm 429s no longer occur during normal navigation.

## Context and Orientation

- Global throttling is configured in `apps/bff/src/app.module.ts` with multiple named throttlers and enforced via `AppThrottlerGuard` registered as an `APP_GUARD`. Certain auth/health routes are skipped via `skipIf`.
- `StoresController` (`apps/bff/src/stores/stores.controller.ts`) already uses `@SkipThrottle()` for `GET /stores` and `GET /stores/:storeId` but write routes use `@Throttle` for stricter limits.
- Wallet-related read endpoints live in `apps/bff/src/wallets/wallets.controller.ts` (transactions, overview, fee rate, utxos, receive address) and `apps/bff/src/wallets/onchain-wallets.controller.ts` (BTC presence). These currently use `@Throttle` profiles and are subject to the global guard, leading to 429s after bursts of UI requests.
- On the frontend, store settings page is at `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/settings/page.tsx`, fetching via `bffFetch` and throwing on non-OK responses. Transactions page is at `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/transactions/page.tsx`, which fetches transactions and overview via `bffFetch` and surfaces failures through errors in server components. These need explicit 429 handling.
- Shared UI components such as alerts/live messages live under `apps/frontend/components`, and `bffFetch` helper is in `apps/frontend/lib/bff-fetch.ts` (already in use by these pages).

## Plan of Work

Describe the sequence of edits to achieve throttling relief and frontend resilience.

1. Backend throttling adjustments
   - Review `WalletsController` methods for read-only GET routes (`transactions`, `transactions/:txId`, `overview`, `utxos`, `address`, `feerate`). Replace or augment current `@Throttle` usage with `@SkipThrottle()` to bypass global limits while preserving any per-route throttling where it matters; ensure write/CSRF-protected routes remain guarded.
   - Confirm `OnchainWalletsController#getPresence` already skips throttling; ensure no other read-only methods backing UI require the exemption (e.g., additional overview endpoints) and avoid touching write routes.
   - Verify the global `AppThrottlerGuard` is registered only once and no duplicate guard application exists after changes.

2. Frontend rate-limit aware fetching for Settings
   - In `settings/page.tsx`, adjust `loadStoreSettings` to return a discriminated union result with a `rate-limited` variant when the response status is 429, instead of throwing. Preserve redirects for 401/404 and existing error handling for other statuses.
   - Update the page component to branch on the result and render a friendly rate-limit message (using existing alert/callout styles) rather than letting the server component throw.

3. Frontend rate-limit aware fetching for Transactions
   - In `wallets/btc/transactions/page.tsx`, adapt `loadTransactions` and `loadOverview` helpers (and any shared response handling) to return union results marking 429 separately from other errors. Avoid throwing in 429 cases.
   - Update the page render logic to detect `rate-limited` and show a clear message on the transactions view, while keeping existing behaviors for auth failures or missing config.

4. Error boundaries (if absent)
   - Check for `error.tsx` under the relevant routes. If missing and helpful, add minimal boundaries that render non-rate-limit errors without crashing the entire App Router, ensuring rate-limit states continue to be handled inline.

5. Testing and validation
   - Add/extend unit or integration tests for the frontend helpers/pages to assert 429 responses render the rate-limit message instead of throwing. If backend tests exist around throttling, add lightweight coverage to ensure GET store/settings endpoints are not throttled for authenticated users.
   - Run existing test suites (e.g., `pnpm test --filter=...` or `pnpm lint`/`pnpm test` as appropriate) to confirm no regressions.

## Concrete Steps

- Backend
  - Edit `apps/bff/src/wallets/wallets.controller.ts` to apply `@SkipThrottle()` on read-only GET handlers, retaining or adjusting existing `@Throttle` decorators only if needed for additional per-route limits (or remove them if redundant once skipped globally).
  - Reconfirm `apps/bff/src/stores/stores.controller.ts` already skips throttling on its GET routes; make no changes to POST/PUT/DELETE throttling.
  - If other read-only wallet endpoints back the UI, add `@SkipThrottle()` similarly.

- Frontend
  - Modify `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/settings/page.tsx` to return structured results from `loadStoreSettings`, detect 429, and render a rate-limit alert component.
  - Update `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/transactions/page.tsx` to propagate 429 as a rate-limit result for both transactions and overview calls, and render an appropriate message instead of throwing.
  - Reuse existing UI components for alerts/messages (e.g., `@/components/ui/alert` or similar) to keep styling consistent.

- Tests and commands
  - Add or update frontend tests (likely in `apps/frontend/app/...` or `apps/frontend/e2e/...`) simulating 429 responses and asserting the rate-limit message is shown.
  - Run `pnpm lint` and relevant test commands (e.g., `pnpm test` or `pnpm vitest run apps/frontend`) from the repository root to validate changes.

## Validation and Acceptance

- Rapidly clicking Settings or Transactions triggers multiple GET calls without producing 429s from the BFF for normal usage (thanks to `@SkipThrottle()` on those routes). If infrastructure still returns 429, the frontend shows an inline rate-limit message instead of crashing.
- Settings page: a mocked 429 response from `/api/stores/:storeId` results in a user-facing warning advising to retry later; 401 still redirects to sign-in and 404 to store list.
- Transactions page: a mocked 429 from either overview or transactions endpoints renders a rate-limit notice while preserving existing handling for unauthorized or missing configuration cases.
- All automated tests pass, including new 429 coverage.

## Idempotence and Recovery

- Adding `@SkipThrottle()` is additive and safe; rerunning the change is idempotent. If a route was incorrectly skipped, remove the decorator to restore throttling.
- Frontend changes are local to the pages; reverting the branch returns prior throwing behavior. Test fixtures for 429 can be rerun without side effects.

## Artifacts and Notes

- Capture relevant diffs and test outputs once implementation is done to document observed behavior.

## Interfaces and Dependencies

- Backend controllers rely on NestJS decorators from `@nestjs/throttler` (`SkipThrottle`, `Throttle`). Ensure imports are correct and no new external dependencies are introduced.
- Frontend uses existing `bffFetch` helper for authenticated requests; maintain credentials/options currently in place. Rate-limit UI should leverage existing components under `apps/frontend/components/ui` for consistency.
