# Bitcoin on-chain wallet maintenance actions via Greenfield

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this plan in accordance with .agent/PLANS.md.

Update (2025-11-23): The BTC wallet rescan action has been removed from the portal and BFF. Historical notes remain below, but rescan-specific tasks are now deprecated and should be ignored.

## Purpose / Big Picture

We need merchants to manage their BTCPay on-chain BTC wallet from the portal using only Greenfield API v1. After this change, the Bitcoin wallet settings page will expose an Actions dropdown with maintenance operations (prune, clear history, replace, remove). The backend will proxy these actions to BTCPay using store-scoped keys, ensuring no wallet secrets reach the frontend.

## Progress

- [x] (2025-03-05 00:00Z) Created initial ExecPlan and surveyed relevant backend/frontend files.
- [x] Implement backend BTCPay wallet action methods and controller endpoints.
- [x] Implement frontend Actions dropdown, modals, and API client wiring on wallet settings page.
- [x] Add rescan wallet page with form and behaviour.
- [x] Update/expand tests for UI interactions and endpoint behaviour.
- [x] Run test suite and finalize documentation/cleanup.
- [x] (2025-11-18 14:10Z) Reopened plan to enforce BTC wallet code normalization ("bitcoin" → "btc") and update frontend calls to use `/wallets/btc/...` consistently; began implementation.
- [x] (2025-11-18 14:50Z) Verified frontend routes use the BTC wallet code helper and added BFF wallet code normalization with back-compat tests; test suites executed.
- [x] (2025-11-23 14:35Z) Verified BTCPay rescan path `/api/v1/stores/{storeId}/wallets/{cryptoCode}/actions/rescan`, tightened wallet 404 handling, and noted wallet actions rely on store modify/view permissions only.

## Surprises & Discoveries

- BTCPay Greenfield rescan expects the `startIndex` field (not `startingIndex`), with `gapLimit` and `batchSize` matching the swagger payload. Body defaults remain 0/10000/3000.
- Frontend `@/` alias resolves to the workspace root, so wallet action API helpers need to live under `apps/frontend/lib/**` rather than `apps/frontend/src/lib/**`.
- Next.js `pnpm --filter frontend build` attempts live fetches to `/api/auth/me` and fails offline with `ENETUNREACH`; builds must be treated as best-effort in CI without BTCPay connectivity.
- Greenfield 2.2.1 exposes on-chain wallet actions under the standard store policies; there are no dedicated wallet permissions beyond `btcpay.store.canmodifystoresettings` and `btcpay.store.canviewstoresettings`.

## Decision Log

- Decision: Treat Actions dropdown and rescan page as additions to existing tenant-scoped wallet pages under `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/`. Rationale: aligns with current routing structure for wallet settings. Date/Author: 2025-03-05 / Assistant.
- Decision: Normalize `walletCode` in the BFF controller to accept `btc` or `bitcoin` but forward `btc`, while updating frontend helpers to always call `/wallets/btc/actions/...`. Rationale: prevent BTCPay 404s from legacy client calls and enforce canonical BTC routing. Date/Author: 2025-11-18 / Assistant.

## Outcomes & Retrospective

- Wallet routes and UI now normalize the BTC wallet code and handle maintenance actions. The rescan feature described earlier has since been removed; prune, clear, replace, and remove actions remain in scope. Store-scoped API keys include store modify/view permissions that cover wallet maintenance per Greenfield 2.2.1.

## Context and Orientation

Backend: NestJS BFF handles BTCPay interactions. Key files:
- `apps/bff/src/btcpay/btcpay.service.ts` currently wraps BTCPay operations but lacks wallet maintenance methods.
- Wallet controllers/services live under `apps/bff/src/wallets/`, including `onchain-wallets.controller.ts` for wallet metadata and configuration. There is also `btcpay.wallets.service.ts` for wallet presence and helpers.

Frontend: Next.js App Router under `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/` has `settings/page.tsx` showing read-only wallet metadata. No Actions dropdown or rescan page exists yet. Shared fetch helper `@/lib/bff-fetch` handles BFF calls. UI components like `Card`, and dropdown/menu primitives likely live under `@/components/ui`.

BTCPay: We must use Greenfield API v1 “Store On-Chain Wallets” endpoints for rescan, prune history, clear history, and wallet removal/reset. Operations require store-scoped API keys with minimal permissions; no wallet descriptors or keys may be exposed to the frontend.

## Plan of Work

1. Extend Btcpay integration:
   - Add wallet action methods in `apps/bff/src/btcpay/btcpay.service.ts` or a dedicated wallet service to call Greenfield endpoints for rescan, prune history, clear history, replace/reset wallet, and remove wallet. Each method should accept `StoreEntity`, cryptoCode BTC, and relevant parameters, resolve store-scoped API key, and map errors via existing helpers. Document operation names in comments.
   - Ensure permissions align with existing minimal set; if new permissions are required for wallet maintenance, extend constants appropriately.

2. Expose BFF endpoints:
   - Create or extend a controller (likely under `apps/bff/src/wallets/`) to add POST routes `/stores/:storeId/wallets/bitcoin/actions/*` for rescan, prune-history, clear-history, replace, and remove. Use JWT + CSRF guards and throttling consistent with other write endpoints.
   - Define DTOs with validation for rescan parameters (startingIndex, gapLimit, batchSize with defaults and non-negative integers) and optional confirmation strings for destructive actions. Responses return minimal `{ status: "ok" }`.

3. Frontend API helpers:
   - Add `apps/frontend/src/lib/api/btc-wallet-actions.ts` (or similar) exporting functions to call BFF endpoints for each action using `bffFetch`. Handle JSON body and errors consistent with existing helpers.

4. Wallet settings Actions UI:
   - Update `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/settings/page.tsx` (or split into client component) to render an Actions dropdown when wallet metadata is available. Items: Rescan wallet for missing transactions (navigates to rescan page), Prune old transactions from history, Clear all transactions from history, Replace wallet, Remove wallet.
   - Implement confirmation modals for prune, clear, replace (requires typing REPLACE), and remove (requires typing REMOVE). Use loading states and toast feedback. Replace and remove should show guidance that wallet will need reconfiguration in BTCPay.

5. Rescan wallet page:
   - Add new route `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/rescan/page.tsx` with form fields for starting index (default 0), gap limit (10000), batch size (3000). Validate non-negative integers, submit to BFF rescan endpoint, show pending state, success toast, and navigate back to settings on success; cancel button returns to settings.

6. State updates and navigation:
   - Ensure actions refresh or invalidate wallet presence where appropriate (e.g., after removal navigate back to store dashboard and update caches if applicable). Use existing hooks/state patterns.

7. Testing and validation:
   - Add/extend frontend tests (Vitest/RTL) for Actions dropdown interactions and rescan form validation + submission paths. Add backend tests (supertest/Nest) for new endpoints if patterns exist; otherwise ensure minimal coverage.
   - Run existing test suite (e.g., `pnpm test` or scoped commands) and linting if applicable.

## Concrete Steps

- Worktree: `/workspace/paypay`.
- Add ExecPlan file (this document) under `docs/execplans/`.
- Implement backend service methods and controller routes; update module wiring as needed.
- Implement frontend API helpers and UI changes (Actions dropdown, modals, rescan page) using existing components and routing.
- Add tests and run `pnpm test` (or targeted packages) to validate.
- Enforce canonical BTC wallet code usage (`btc`) across frontend API calls and normalize legacy `bitcoin` codes in the backend controller to keep BTCPay requests targeting `/wallets/BTC/...`.

## Validation and Acceptance

- Backend endpoints respond with 200/202 and `{ status: "ok" }` when called with valid store and token; errors are masked without leaking secrets.
- Wallet settings page shows Actions dropdown with listed items when wallet metadata loads; clicking items triggers appropriate modals/navigation.
- Rescan page displays default values, blocks negative inputs, submits to BFF and shows success toast then returns to settings.
- Removing or replacing wallet triggers success flow; removal navigates away safely.
- Test suite passes and new tests cover dropdown behaviour and rescan form logic.

## Idempotence and Recovery

- Actions are POST-based and safe to retry from UI; backend calls are proxied to BTCPay which handles duplicates gracefully. If a request fails midway, retry after reviewing error. Code changes are additive; migrations not involved. Use git to revert if needed.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

- Greenfield API v1 Store On-Chain Wallet endpoints for rescan, prune, clear history, and wallet removal/reset.
- NestJS controllers/DTOs under `apps/bff/src/wallets` and BTCPay service under `apps/bff/src/btcpay/btcpay.service.ts`.
- Frontend Next.js App Router pages under `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/` and shared fetch/toast components.
