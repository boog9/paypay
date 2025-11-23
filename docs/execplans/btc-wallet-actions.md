# Bitcoin on-chain wallet maintenance actions via Greenfield

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this plan in accordance with .agent/PLANS.md.

Update (2025-11-23): The BTC wallet rescan action has been removed from the portal and BFF. Historical notes remain below, but rescan-specific tasks are now deprecated and should be ignored.
Update (2025-11-23 16:15Z): Reopened to restore the Actions menu in the new dashboard wallet settings view, ensure the `/wallets/:walletCode/actions` endpoint returns actionable entries without rescan, and add coverage for empty/error states on both BFF and frontend.

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
- [x] (2025-11-23 16:15Z) Investigated the missing Actions menu in the new dashboard wallet settings page; confirmed the page no longer renders actions, no BFF GET `/actions` listing exists, and rescan should stay removed.
- [x] (2025-11-23 16:17Z) Implemented BFF actions listing (without rescan) that reports available actions only when a BTC wallet is present and returns clear 404s for missing stores/unsupported wallets.
- [x] (2025-11-23 16:17Z) Reintroduced a frontend Actions menu in the `(dashboard)/(stores)` BTC wallet settings view using the new listing, with graceful empty/error handling and no rescan option.
- [x] (2025-11-23 16:17Z) Added backend and frontend tests covering actions listing, empty states, and menu rendering.

## Surprises & Discoveries

- BTCPay Greenfield rescan expects the `startIndex` field (not `startingIndex`), with `gapLimit` and `batchSize` matching the swagger payload. Body defaults remain 0/10000/3000.
- Frontend `@/` alias resolves to the workspace root, so wallet action API helpers need to live under `apps/frontend/lib/**` rather than `apps/frontend/src/lib/**`.
- Next.js `pnpm --filter frontend build` attempts live fetches to `/api/auth/me` and fails offline with `ENETUNREACH`; builds must be treated as best-effort in CI without BTCPay connectivity.
- Greenfield 2.2.1 exposes on-chain wallet actions under the standard store policies. Payment method mutations (enable/disable/remove) require `btcpay.store.canmodifypaymentmethods:<STORE_ID>` in addition to the modify/view store permissions.

## Decision Log

- Decision: Treat Actions dropdown and rescan page as additions to existing tenant-scoped wallet pages under `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/`. Rationale: aligns with current routing structure for wallet settings. Date/Author: 2025-03-05 / Assistant.
- Decision: Normalize `walletCode` in the BFF controller to accept `btc` or `bitcoin` but forward `btc`, while updating frontend helpers to always call `/wallets/btc/actions/...`. Rationale: prevent BTCPay 404s from legacy client calls and enforce canonical BTC routing. Date/Author: 2025-11-18 / Assistant.

## Outcomes & Retrospective

- Wallet routes and UI now normalize the BTC wallet code and handle maintenance actions. The rescan feature described earlier has since been removed; prune, clear, replace, and remove actions remain in scope. Store-scoped API keys include store modify/view permissions and `btcpay.store.canmodifypaymentmethods:<STORE_ID>` to cover wallet maintenance per Greenfield 2.2.1.

## Context and Orientation

Backend: NestJS BFF handles BTCPay interactions. Key files:
- `apps/bff/src/btcpay/btcpay.service.ts` currently wraps BTCPay operations but lacks wallet maintenance methods.
- Wallet controllers/services live under `apps/bff/src/wallets/`, including `onchain-wallets.controller.ts` for wallet metadata and configuration. There is also `btcpay.wallets.service.ts` for wallet presence and helpers.
 - `bitcoin-wallet-actions.controller.ts` exposes POST actions but does not offer a GET listing; the new dashboard expects a list to decide whether to render the menu.

Frontend: Next.js App Router under `apps/frontend/app/tenants/[tenantId]/stores/[storeId]/wallets/bitcoin/` has `settings/page.tsx` showing read-only wallet metadata. No Actions dropdown or rescan page exists yet. Shared fetch helper `@/lib/bff-fetch` handles BFF calls. UI components like `Card`, and dropdown/menu primitives likely live under `@/components/ui`.
New dashboard route: `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/settings/page.tsx` renders wallet settings without actions. Supporting view model lives in `_lib/get-wallet-settings.ts` and UI in `_components/wallet-settings-panel.tsx`.

BTCPay: We must use Greenfield API v1 “Store On-Chain Wallets” endpoints for rescan, prune history, clear history, and wallet removal/reset. Operations require store-scoped API keys with minimal permissions; no wallet descriptors or keys may be exposed to the frontend.

## Plan of Work

1. Extend BFF actions surface:
   - Add a GET `/stores/:storeId/wallets/:walletCode/actions` handler in `bitcoin-wallet-actions.controller.ts` that validates the store and wallet code, checks BTC on-chain presence, and returns a list of available actions excluding rescan. Return an empty list when no wallet is connected instead of falling back to errors.
   - Keep existing POST actions intact and ensure 404/401 propagate for missing stores or unsupported wallet codes.

2. Frontend data loaders and UI:
   - Introduce a loader under `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/settings/_lib/` to fetch wallet actions, handling 401 refresh and normalizing unknown payloads to a typed list.
   - Add a client-side Actions menu component under `_components` that consumes the loader result, renders a dropdown when actions exist, shows a controlled empty state when they do not, and surfaces fetch errors. Ensure no rescan option appears.
   - Wire the new component into `settings/page.tsx`, passing storeId and loader results alongside existing settings data.

3. Behaviour and UX:
   - Use existing API helpers for prune/clear/replace/remove. Show toasts on success/failure, confirmation prompts for destructive actions, and disable interactions while pending. Navigate back to the store overview after removal.
   - When no actions are available, display a muted "No available actions" hint instead of rendering an empty dropdown.

4. Testing and validation:
   - Add backend tests covering the GET actions listing success path, empty-state path, and 404 for missing store or unsupported wallet codes.
   - Add frontend tests for the new loader and menu component to assert rendering of actions, empty-state behaviour, error display, and absence of any rescan label.
   - Update page tests to expect the Actions control to appear when actions are returned and to hide or show the empty state appropriately.

## Concrete Steps

- Worktree: `/workspace/paypay`.
- Update this ExecPlan as progress is made.
- Extend `bitcoin-wallet-actions.controller.ts` with a GET listing route that normalizes the wallet code, validates store ownership, checks BTC wallet presence, and returns the available non-rescan actions array.
- Add frontend loader and menu components under the new dashboard wallet settings path to fetch and render actions with empty/error states; wire to existing POST helpers for prune/clear/replace/remove.
- Expand backend and frontend tests to cover the listing endpoint, the loader normalization, and UI rendering for available/empty/error scenarios.
- Run targeted test commands for BFF and frontend packages to verify coverage before committing.

## Validation and Acceptance

- GET `/stores/:storeId/wallets/:walletCode/actions` returns a typed list without rescan for valid stores and a controlled empty list when no wallet exists; unsupported wallets or missing stores return 404/401 as appropriate.
- Wallet settings page in `(dashboard)/(stores)` renders the Actions control when actions exist, hides or shows a muted empty state when none exist, and never surfaces a rescan option.
- Destructive actions still succeed via existing POST endpoints with confirmation flows and show toast feedback; removal navigates back to the store overview.
- Targeted backend and frontend tests pass, covering listing, empty/error handling, and UI rendering.

## Idempotence and Recovery

- Actions are POST-based and safe to retry from UI; backend calls are proxied to BTCPay which handles duplicates gracefully. If a request fails midway, retry after reviewing error. Code changes are additive; migrations not involved. Use git to revert if needed.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

- Greenfield API v1 Store On-Chain Wallet endpoints for pruning history, clearing history, and wallet removal/reset.
- NestJS controllers/DTOs under `apps/bff/src/wallets` and BTCPay service under `apps/bff/src/btcpay/btcpay.service.ts`.
- Frontend Next.js App Router pages under both tenant and `(dashboard)/(stores)` paths, plus shared fetch/toast components under `apps/frontend/lib` and `@/components/ui`.
