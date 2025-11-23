# Remove BTC wallet rescan feature end-to-end

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this plan in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

After this change, the merchant portal will no longer expose or support the BTC wallet "Rescan" action anywhere in the UI or BFF. Users should no longer see rescan navigation or buttons, and backend routes/mutations for rescan must be removed so the project compiles cleanly without unused code. Removing the feature avoids a broken action path and simplifies wallet management.

## Progress

- [x] (2025-11-23 15:50Z) Captured scope and wrote initial plan to remove rescan UI, API hooks, and BFF endpoints.
- [x] (2025-11-23 16:15Z) Removed frontend rescan pages, components, hooks, menu references, and updated copy.
- [x] (2025-11-23 16:20Z) Deleted BFF rescan route, DTO, service method, helpers, and related tests; cleaned docs.
- [ ] Run frontend/BFF tests to ensure build success; finalize plan and summary. (BFF Jest passed; frontend test runner aborted due to ENETUNREACH to BTCPay during /api/auth/me fetch.)

## Surprises & Discoveries

- Frontend test runner attempted to reach BTCPay during `/api/auth/me` fetch and failed with `ENETUNREACH`, requiring manual cancellation in this environment.

## Decision Log

- Decision: Remove the feature completely rather than hiding it behind flags; delete routes/components instead of stubbing.
  Rationale: Requirement mandates full removal and avoids dead code or unused endpoints.
  Date/Author: 2025-11-23 / Assistant

## Outcomes & Retrospective

- Rescan endpoints and UI have been removed across frontend and BFF; wallet maintenance now covers prune/clear/replace/remove only. Pending: confirm test runs.

## Context and Orientation

Frontend: BTC wallet UI lives under `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/`. Rescan currently has a dedicated page `rescan/page.tsx`, client component `rescan-client.tsx`, and API interactions in `apps/frontend/lib/api/btc-wallet-actions.ts` with hooks under `apps/frontend/lib/hooks`. Wallet menus exist in layout components and wallet action dropdowns (e.g., `wallet-actions.tsx`). Queries/mutations for rescan likely under `apps/frontend/lib/queries` or `mutations` and shared `btc-wallet` utilities.

Backend (BFF): Wallet-related controllers in `apps/bff/src/wallets` include `bitcoin-wallet-actions.controller.ts` exposing a rescan POST, delegating to `BtcpayWalletService` in `apps/bff/src/btcpay/btcpay.wallets.service.ts`. Jest specs in `apps/bff/test` cover controller/service rescan behavior. Removing these requires cleaning shared helpers and DTOs only used for rescan.

## Plan of Work

Remove the frontend rescan page directory and any components referencing it. Update wallet navigation menus and action dropdowns to exclude rescan links/buttons. Delete rescan hooks and API helpers from `apps/frontend/lib/api` and related query/mutation utilities, cleaning imports wherever used.

On the BFF, delete the rescan route from `bitcoin-wallet-actions.controller.ts`, remove the corresponding DTO and method in `BtcpayWalletService`, and drop any helper functions solely used by rescan. Update module providers and tests to reflect removal. Ensure remaining wallet routes continue to compile without unused imports.

## Concrete Steps

1. Delete `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/rescan/` (page, client, tests) and remove rescan exports/hooks from `apps/frontend/lib` (API helpers, queries/mutations, hooks). Search for `rescan` references in wallet components and remove related menu items/buttons.
2. Adjust wallet navigation/menu components (e.g., sidebar wallet links, action dropdowns) to ensure no rescan option remains and UI still renders without gaps.
3. Update or remove any frontend tests referencing rescan. Ensure TypeScript paths compile.
4. In BFF, remove rescan route definition from `apps/bff/src/wallets/bitcoin-wallet-actions.controller.ts`, delete service method and helpers in `apps/bff/src/btcpay/btcpay.wallets.service.ts`, and clean DTOs if unused.
5. Update BFF module bindings and tests (`apps/bff/test/*`) to drop rescan coverage. Fix any import errors.
6. Run relevant test suites: `pnpm --filter frontend test` for frontend and `pnpm --filter bff --dir apps/bff test` (or targeted Jest files). Verify builds succeed with no TypeScript errors.

## Validation and Acceptance

Project should build with no references to rescan. Navigating wallet UI should show no rescan links or buttons. Frontend and BFF tests should pass. Attempting to access the old rescan route should result in Next.js 404 and no BFF endpoint available.

## Idempotence and Recovery

Steps involve deletions; rerunning searches is safe. If issues arise, revert via git. Ensure imports are cleaned to avoid unused code errors.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

No new interfaces. Ensure remaining wallet-related APIs continue to use existing modules without rescan-specific DTOs or methods.
