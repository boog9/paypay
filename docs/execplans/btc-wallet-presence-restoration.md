# Restore BTCPay-backed Bitcoin wallet presence gating

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Refer to `.agent/PLANS.md` for format and maintenance requirements.

## Purpose / Big Picture

Merchants using the PayPay portal need consistent Bitcoin wallet navigation. When a BTCPay store already has an on-chain wallet, the dashboard must expose the Transactions, Send, Receive, and Settings views and land the root Bitcoin entry on the transactions list. When no wallet exists, the UI should suppress submenu links and direct users into the wallet wizard while the BFF reports `hasWallet: false` without throwing. This plan delivers a BTCPay 2.x compliant presence check in the NestJS BFF and threads that state through the Next.js shell and wallet pages so navigation reflects the real wallet status without leaking API secrets.

## Progress

- [x] (2025-11-13 17:50Z) Reviewed existing BFF wallet services/controllers and frontend layouts; drafted ExecPlan documenting the restoration strategy.
- [x] (2025-11-13 18:28Z) Implemented BFF wallet presence detection via `BtcpayWalletService`, updated the controller route, and expanded backend unit tests.
- [x] (2025-11-13 19:05Z) Refactored frontend presence context/hook, sidebar navigation, and wallet pages to consume `{ hasWallet }` while preventing duplicate fetches.
- [x] (2025-11-13 19:20Z) Ran targeted Jest and Vitest suites; Playwright skipped due to explicit opt-out in commands.
- [x] (2025-11-14 17:12Z) Audited repository for regressions after feedback; confirmed backend/frontend sources align with the `{ hasWallet }` contract but located Playwright fixtures still returning legacy payloads.
- [x] (2025-11-14 17:40Z) Refreshed Playwright specs and related fixtures to emit `{ hasWallet }`, reran Jest/Vitest successfully, and documented Playwright's browser-install dependency blocking e2e execution.
- [x] (2025-11-14 19:11Z) Re-verified frontend wallet presence context after regression report; refreshed provider/sidebar to consume live store state and reran backend/frontend tests (Playwright blocked by missing browsers).

## Surprises & Discoveries

- Observation: Vitest execution within the frontend workspace does not resolve the `@/` alias used by Next.js components.
  Evidence: `vitest run components/shell/__tests__/shell-sidebar.test.tsx` failed with "Failed to resolve import \"@/lib/bff-fetch\"" until the context module switched to relative paths.

- Observation: Local Playwright runs fail without downloading browser binaries.
  Evidence: `pnpm --filter frontend exec playwright test …` aborted with "Executable doesn't exist … run `pnpm exec playwright install`" because the container lacks cached Chromium builds.

## Decision Log

- Decision: Reuse `BtcpayWalletService` for presence checks instead of the database-backed `OnchainWalletsService` so the BFF reflects BTCPay truth and can distinguish 404 (missing wallet) from other errors.
  Rationale: `BtcpayWalletService` already centralizes BTCPay HTTP access, request signing, and error mapping. Extending it avoids duplicating host/API key lookups and ensures 404 results are interpreted consistently across controllers.
  Date/Author: 2025-11-13 / Assistant

- Decision: Extend the existing `WalletPresenceProvider` context into a stateful client provider that fetches `/api/stores/:id/wallets/btc/presence` once per store and exposes `{ hasWallet, loading, error, refresh }` to consumers.
  Rationale: The dashboard shell and wallet pages already rely on the provider; expanding it keeps caching localized and prevents repeated fetches across components while satisfying the requirement for a hook-driven presence API.
  Date/Author: 2025-11-13 / Assistant

## Outcomes & Retrospective

- Backend: `BtcpayWalletService` exposes `getBitcoinWalletPresence`, mapping 200 responses to `{ hasWallet: true }` with raw payloads and treating 404 as `{ hasWallet: false }` while preserving standard error handling for other codes.
- Frontend: The cached presence helper, context provider, sidebar, and wallet pages all consume the `{ hasWallet }` flag, hiding submenu items or redirecting to the wizard when the wallet is absent. All mocks and fixtures now emit the simplified contract.
- Testing: Jest suites (`test/btcpay.wallets.service.spec.ts`, `test/onchain-wallets.controller.spec.ts`) and Vitest suites (`app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence.test.ts`, `components/shell/__tests__/shell-sidebar.test.tsx`) pass. Playwright scenarios require running `pnpm exec playwright install` to fetch browsers before tests can execute inside the container.

## Context and Orientation

Backend:
- `apps/bff/src/btcpay/btcpay.wallets.service.ts` creates Axios clients scoped to store API keys and already builds wallet URL paths like `/api/v1/stores/{storeId}/payment-methods/{paymentMethodId}/wallet`. It handles list, overview, UTXO, and receive address operations with shared error translation.
- `apps/bff/src/wallets/onchain-wallets.controller.ts` wires `GET /api/stores/:storeId/wallets/btc/presence` to `BtcpayWalletService.getBitcoinWalletPresence`, returning `{ hasWallet }` based on BTCPay's wallet endpoint instead of local metadata.
- `apps/bff/src/wallets/wallets.controller.ts` proxies transactions, overview, and related read operations through `OnchainWalletReadService`, which in turn depends on `BtcpayWalletService`.
- Tests touching these services live in `apps/bff/test/btcpay.wallets.service.spec.ts`, `apps/bff/test/onchain-wallets.controller.spec.ts`, and related integration specs.

Frontend:
- `apps/frontend/app/(dashboard)/layout.tsx` wraps the dashboard shell in `WalletPresenceProvider`, currently passing a boolean derived from `getWalletPresence`.
- `apps/frontend/src/contexts/wallet-presence.tsx` exports `WalletPresenceProvider` and `useBtcWalletPresence`, exposing `{ hasWallet, loading, error, refresh }` while caching a single fetch per store layout.
- `apps/frontend/components/shell/sidebar.tsx` reads the context to render the Wallets section.
- Server components such as `wallets/btc/page.tsx`, `wallets/btc/transactions/page.tsx`, `wallets/btc/send/page.tsx`, `wallets/btc/receive/page.tsx`, and `wallets/btc/settings/page.tsx` call `getWalletPresence` to redirect unauthorized access.
- Playwright spec `apps/frontend/e2e/sidebar-wallet-menu.spec.ts` and Vitest spec `apps/frontend/components/shell/__tests__/shell-sidebar.test.tsx` assert menu behaviour.

## Plan of Work

Describe modifications sequentially:

1. **Backend presence endpoint**: In `BtcpayWalletService`, implement `getOnchainWalletOverview` that uses `prepareStoreContext`, constructs the wallet URL via `buildWalletBasePath`, and maps BTCPay responses: return `{ hasWallet: true, raw: data }` on HTTP 200, `{ hasWallet: false }` on 404, and rethrow other errors through the existing error mapper. Ensure `context.cleanup()` runs in `finally` and add a docstring summarizing the HTTP code interpretation. Expose `getBitcoinWalletPresence` delegating to the overview helper.

2. **Controller wiring**: Update `OnchainWalletsController` to inject `BtcpayWalletService` and replace the existing presence handler with one that calls `getBitcoinWalletPresence`, returning `{ hasWallet }`. Remove the legacy DTO fields and update `WalletPresenceDto` (or introduce a new DTO) to match the new response. Adjust unit tests under `apps/bff/test/onchain-wallets.controller.spec.ts` and expand `apps/bff/test/btcpay.wallets.service.spec.ts` with coverage for the new helper (verifying 200 vs 404 vs 401/500 paths).

3. **Frontend presence utilities**: Refactor `getWalletPresence` under `app/(dashboard)/(stores)/stores/[storeId]/_lib/` to parse the `{ hasWallet }` payload and expose `result.hasWallet`. Update all server components that consume `connected` to use the renamed property, keeping redirects intact.

4. **Client context and hook**: Replace `WalletPresenceProvider` with a client component that accepts `{ storeId, initial }`, initializes state from the server-provided value, and lazily fetches `/api/stores/${storeId}/wallets/btc/presence` via `bffFetch` when needed. Expose a hook `useBtcWalletPresence()` returning `{ hasWallet, loading, error, refresh }`, and update `ShellSidebar` to consume it so clicks route to the wizard when `hasWallet === false` while hiding the submenu otherwise. Ensure the provider caches the fetched state for the lifetime of the layout and avoids duplicate requests when multiple consumers subscribe.

5. **Redirect guards**: Update wallet pages (Transactions, Send, Receive, Settings, root redirect) to use the new presence result and maintain the redirect rules. Confirm they rely on the cached server helper instead of issuing additional HTTP calls.

6. **Tests and fixtures**: Adjust Vitest and Playwright tests to mock the new payload shape. Add unit tests covering the provider state transitions if practical, or extend existing component tests to assert loading/error handling. Update any type definitions under `apps/frontend/src/types` if necessary.

7. **Validation**: After implementation, run `pnpm --filter bff test -- --runTestsByPath apps/bff/test/btcpay.wallets.service.spec.ts apps/bff/test/onchain-wallets.controller.spec.ts` and `pnpm --filter frontend test -- --run tests/components/shell/sidebar.test.ts --run tests/e2e/sidebar-wallet-menu.spec.ts` (or the appropriate script arguments) to ensure backend and frontend suites pass. If Playwright cannot run in CI, document the limitation.

## Concrete Steps

1. Implement backend changes in `apps/bff/src/btcpay/btcpay.wallets.service.ts` and `apps/bff/src/wallets/onchain-wallets.controller.ts`, updating related DTOs and tests.
2. Refactor frontend context, hook, and consumers (`wallet-presence.tsx`, `components/shell/sidebar.tsx`, server utilities, wallet pages) along with unit and e2e tests.
3. Execute the targeted test commands noted above, capture outputs, and update this plan with outcomes.

## Validation and Acceptance

The change is accepted when:
- Calling `GET /api/stores/{storeId}/wallets/btc/presence` on a store with a BTCPay on-chain wallet returns `{ "hasWallet": true }`, and calling it on a store without a wallet returns `{ "hasWallet": false }` without throwing.
- Navigating to the dashboard renders the Bitcoin submenu only when `hasWallet` is true, and clicking “Bitcoin” routes to the wizard otherwise.
- Direct navigation to `/stores/{storeId}/wallets/btc/transactions` redirects to the wizard when no wallet exists and loads normally when it does.
- Backend and frontend automated tests covering wallet navigation and presence behaviour pass.

## Idempotence and Recovery

The backend changes are additive and reuse existing HTTP clients; rerunning migrations or restarting the BFF will not duplicate data. Reverting the feature consists of rolling back the Git commit, redeploying, and clearing any cached frontend bundles. No data migrations are involved.

## Artifacts and Notes

- Jest: `pnpm --filter bff exec jest --runTestsByPath test/btcpay.wallets.service.spec.ts test/onchain-wallets.controller.spec.ts` → 2 passed suites.
- Vitest: `pnpm --filter frontend exec vitest run "app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence.test.ts"` and `pnpm --filter frontend exec vitest run components/shell/__tests__/shell-sidebar.test.tsx` → all tests passed (with the expected prefetch warning from React Testing Library when rendering Next.js links).
- Playwright: `pnpm --filter frontend exec playwright test …` failed because Chromium binaries were not installed; run `pnpm exec playwright install` before retrying locally.

## Interfaces and Dependencies

- Backend relies on `BtcpayWalletService` helpers (`prepareStoreContext`, `buildWalletBasePath`, `normalizePaymentMethodId`) to communicate with BTCPay.
- Frontend relies on `bffFetch` for authenticated API calls and the existing dashboard layout that provides `storeId` context.
- Tests depend on Vitest for component assertions and Playwright for end-to-end navigation checks.
