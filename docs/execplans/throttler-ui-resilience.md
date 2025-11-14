```md
# Relax UI throttling while preserving auth hardening

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Merchants need to refresh the dashboard without losing access to their stores or wallet status. Currently, the NestJS BFF applies a global rate limiter that returns HTTP 429 for ordinary GET requests such as `/api/stores` and `/api/stores/:storeId/wallets/btc/presence` after a handful of quick refreshes. The frontend interprets those failures as an empty store list and missing wallet, hiding navigation. We will exempt the high-frequency read endpoints from throttling while keeping strict limits on authentication routes. The UI will surface a “Too many requests” message without discarding the previously loaded data.

## Progress

- [x] (2024-05-06 12:40Z) Documented repository context and wrote the plan.
- [x] (2024-05-06 13:05Z) Adjusted BFF controllers to skip throttling for store listing and wallet presence.
- [x] (2024-05-06 13:20Z) Extended BFF E2E tests to cover store rate-limit exemption and login throttling.
- [x] (2024-05-06 13:45Z) Updated frontend store selector and wallet presence context for graceful 429 handling.
- [x] (2024-05-06 14:25Z) Ran targeted backend/frontend tests (noting existing Btcpay service spec failures in the full Jest suite) and updated documentation.

## Surprises & Discoveries

- Observation: React Query can retain previous data after a failed fetch, but its behaviour depends on cache timing. Adding an explicit client-side cache in the store selector guarantees the UI keeps the last successful store list even if the query returns `undefined` during refetches.
  Evidence: React Query exposes `data` as `undefined` during initial loads or failed refetches (per library behaviour), so the selector now stores the last successful payload explicitly.
- Observation: Running the entire BFF Jest suite still fails because `btcpay.payment-methods.service.spec.ts` expects BadRequest/Unauthorized exceptions while the current implementation throws BadGateway for upstream failures.
  Evidence: `pnpm --filter bff exec npx jest --runInBand` fails with those assertions, but the new throttling tests execute before the failure (`chunk 6da81c`).

## Decision Log

- Decision: Use `@SkipThrottle()` on the high-frequency GET handlers instead of raising global limits to ensure the UI endpoints bypass throttling without widening the attack surface for other routes.
  Rationale: Raising the shared burst limit could weaken protection on write endpoints, whereas skipping specific handlers keeps authentication and mutation limits intact.
  Date/Author: 2024-05-06 / assistant.
- Decision: Surface rate-limit messaging in the sidebar and store selector while caching the last successful data locally.
  Rationale: Users should understand why fresh data is unavailable without losing previously loaded navigation context.
  Date/Author: 2024-05-06 / assistant.

## Outcomes & Retrospective

- Implemented targeted rate-limit skips, UI messaging, and test updates; remaining work involves addressing unrelated Btcpay service test failures tracked separately.

## Context and Orientation

The NestJS BFF lives under `apps/bff`. `src/app.module.ts` configures `ThrottlerModule.forRoot` with multiple named throttlers and registers `AppThrottlerGuard` as a global guard. `AppThrottlerGuard` builds a tracker key from user id, IP, HTTP method, and path. `StoresController` in `src/stores/stores.controller.ts` exposes `GET /api/stores` and secures write operations with JWT and throttling. `OnchainWalletsController` in `src/wallets/onchain-wallets.controller.ts` provides `GET /api/stores/:storeId/wallets/btc/presence` and related routes.

Frontend code that renders the left navigation sits in `apps/frontend/src/components/stores/store-selector.tsx` and `apps/frontend/components/shell/sidebar.tsx`. The store selector uses the `useStoresQuery` hook (`apps/frontend/src/hooks/use-stores.ts`) which calls the `api` helper (`apps/frontend/lib/api.ts`). Wallet presence state is managed by `apps/frontend/src/contexts/wallet-presence.tsx` and consumed in the sidebar to decide whether to show wallet links. Errors currently clear stored data, so a 429 response hides stores and wallet indicators.

Backend E2E tests are located in `apps/bff/test`. `stores.e2e-spec.ts` exercises store creation and listing, and `auth.e2e-spec.ts` covers login flows. We will extend these to cover the new rate-limit expectations.

## Plan of Work

1. Update `StoresController` to import `SkipThrottle` from `@nestjs/throttler` and decorate the `listStores` handler with `@SkipThrottle()`. Keep the existing `@Throttle` on the POST route to protect store creation.
2. In `OnchainWalletsController`, import `SkipThrottle` and decorate `getPresence` with `@SkipThrottle()`. Preserve the existing `@Throttle` on other wallet endpoints to maintain UI burst limits for metadata.
3. Review other controllers for authentication endpoints. Ensure `AuthController` keeps its explicit `@Throttle({ login: ... })` decorator so that the login route remains protected.
4. Extend `apps/bff/test/stores.e2e-spec.ts` with a new test that performs more than the global burst limit worth of sequential `GET /api/stores` requests while asserting each response is HTTP 200. Mock `btcpayMock.listStores` to resolve quickly for all calls.
5. Extend `apps/bff/test/auth.e2e-spec.ts` with a test that reuses one IP address and CSRF token to send repeated `POST /api/auth/login` attempts with an invalid password, expecting HTTP 401 for the first five requests and HTTP 429 on the sixth.
6. Modify `useStoresQuery` to:
   - Disable automatic retry when a request fails with HTTP 429 (`retry` callback).
   - Expose the underlying error so components can detect `ApiError` status codes.
7. Update `StoreSelector` to:
   - Track the last successfully loaded store list in local state so that a 429 error does not clear it.
   - Detect an `ApiError` with status 429 and show “Too many requests, please try again in a few seconds.” instead of the generic failure text.
   - Allow opening the selector when stores are cached even if the most recent fetch failed.
8. Enhance `WalletPresenceProvider` to handle HTTP 429 responses from `bffFetch` by leaving the existing `hasWallet` state intact and setting a `RateLimitError` with a friendly message. Only clear `hasWallet` for other errors.
9. Surface wallet presence rate-limit feedback in the sidebar by reading the `error` from `useWalletPresence` and rendering the “Too many requests…” message near the wallet navigation without hiding existing wallet links when `hasWallet` is known.
10. Update or add frontend unit tests if necessary to cover the new messaging logic (e.g., in `components/shell/__tests__/shell-sidebar.test.tsx`), ensuring snapshots or expectations account for the rate-limit notice when provided.
11. Run backend Jest tests with `pnpm --filter bff exec pnpm test` (or the appropriate script) and frontend Vitest suites covering the touched components. Document commands in the plan and final summary.
12. Revisit this ExecPlan after each milestone to record progress, discoveries, and decisions, then finalize the `Outcomes & Retrospective` once testing passes.

## Concrete Steps

1. Work in `/workspace/paypay`.
2. Apply backend code changes (controllers and tests) with the repository’s TypeScript conventions.
3. Apply frontend hook, component, and context updates, ensuring TypeScript types compile.
4. Run `pnpm --filter bff exec pnpm test` to execute backend Jest suites.
5. Run targeted frontend tests, e.g. `pnpm --filter frontend exec vitest run components/shell/__tests__/shell-sidebar.test.tsx`.
6. Update this plan’s `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections as work advances.

## Validation and Acceptance

- After backend changes, hitting `/api/stores` rapidly (e.g., 40 consecutive requests with the same IP) should return HTTP 200 each time. The new Jest test must pass and would fail before the change due to HTTP 429.
- After frontend changes, performing multiple quick refreshes should keep the store list and wallet links visible. When the BFF returns HTTP 429, the UI shows “Too many requests, please try again in a few seconds.” without clearing previously loaded data.
- Aggressive repeated `POST /api/auth/login` attempts still yield HTTP 429 after the configured limit, proven by the added test.
- All automated tests introduced or modified must pass.

## Idempotence and Recovery

The modifications are additive and configuration-driven. Re-running the tests or the application after failures is safe. If a new decorator causes an unexpected regression, remove the decorator and rerun the suites. Frontend state management changes only touch local React state, so reloading the page restores the original behavior.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

- `@nestjs/throttler` provides `Throttle` and `SkipThrottle` decorators; ensure imports come from this package.
- React Query (`@tanstack/react-query`) supplies the `useQuery` hook, which accepts `retry`, `select`, and `placeholderData` options to control caching and error handling.
- Custom frontend helpers `api` and `bffFetch` encapsulate HTTP calls and must remain the single source for network logic.
```
