# Reduce throttling impact on wallet presence checks

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Frequent refreshes of the store dashboard trigger HTTP 429 responses from the BFF at `/api/stores/:storeId/wallets/:cryptoCode/presence`, causing the frontend to hide the Bitcoin menu entry and show a "Too many requests" banner. We need to exempt the read-only wallet presence endpoint from throttling and make the frontend treat 429 as a transient condition so navigation stays visible.

## Progress

- [x] (2025-02-26 12:10Z) Drafted ExecPlan capturing backend throttling exemption and frontend 429 handling.
- [x] (2025-02-26 15:30Z) Added SkipThrottle-backed regression coverage for wallet presence and ensured repeated requests are handled without throttling in a dedicated spec.
- [x] (2025-02-26 15:40Z) Updated frontend wallet presence fetcher and sidebar to treat 429 as non-fatal and refreshed unit tests.
- [ ] Run project tests/lint as appropriate and finalize retrospective.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: N/A.

## Decision Log

- Decision: Prefer `@SkipThrottle()` on the wallet presence handler instead of raising limits globally to avoid weakening protections on auth or invoice endpoints.
  Rationale: Exempting the single read-only route keeps security-sensitive throttling untouched while solving the UX issue.
  Date/Author: 2025-02-26 / assistant.

## Outcomes & Retrospective

To be completed after implementation and testing.

## Context and Orientation

Backend: NestJS BFF under `apps/bff`. `src/app.module.ts` registers global throttling via `ThrottlerModule` and `AppThrottlerGuard`. Wallet-related routes live under `src/wallets`, with an endpoint `GET /api/stores/:storeId/wallets/:cryptoCode/presence` that reports whether a store has a wallet. Tests reside in `apps/bff/test`.

Frontend: Next.js App Router under `apps/frontend`. Dashboard pages under `app/(dashboard)/(stores)/stores/[storeId]/` fetch wallet presence to decide whether to show Bitcoin navigation and setup prompts. Helper code likely in `_lib/get-wallet-presence.ts` or similar. Unit tests are typically under `apps/frontend/__tests__` or adjacent `__tests__` directories.

## Plan of Work

1. Locate the wallet presence handler in the BFF (likely `apps/bff/src/wallets/onchain-wallets.controller.ts` or similar) and confirm it only reads wallet status. Import `SkipThrottle` and decorate the presence method to bypass throttling. Remove any local `@Throttle` if present, leaving other endpoints unchanged.
2. Add or extend an e2e test under `apps/bff/test` to perform multiple sequential GET requests to the presence route (using mocked BTCPay responses) and assert none return 429.
3. On the frontend, find the wallet presence fetch helper and adjust error handling so an HTTP 429 returns `true` (or last known value) instead of surfacing a fatal error. Keep existing handling for other statuses.
4. Add unit tests for the frontend helper covering 200/hasWallet true, 200/hasWallet false, and 429 cases.
5. Run relevant test suites (at least targeted backend/frontend tests or lint/build) to ensure changes pass.

## Concrete Steps

- Work in repo root `/workspace/paypay`.
- Update the BFF controller and tests as described above; use `pnpm --filter bff test` or targeted Jest command if available.
- Update the frontend helper and add unit tests; run targeted frontend tests (e.g., `pnpm --filter frontend test` or matching script).
- Record test commands and outcomes for validation.

## Validation and Acceptance

- Multiple quick GETs to `/api/stores/:storeId/wallets/btc/presence` return 200 (or appropriate success) without 429, verified by the new test.
- Frontend wallet presence helper returns true on 429 and continues to show Bitcoin menu for stores with wallets while still showing setup prompts when no wallet exists (200/false case).
- Other throttled routes remain unchanged.
- Automated tests/lint/build succeed.

## Idempotence and Recovery

Changes are additive and configuration-free. If issues arise, remove the `@SkipThrottle` decorator and revert helper logic. Tests can be rerun safely.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

- NestJS `@nestjs/throttler` for `SkipThrottle` decorator on the presence route.
- Existing wallet presence DTO/response shape providing `hasWallet` boolean.
- Frontend fetch helper returning boolean presence state; adjust to handle 429 gracefully.
