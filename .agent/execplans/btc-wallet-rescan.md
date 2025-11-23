# Align BTC wallet rescan endpoints with BTCPay

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this plan in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

The BTC wallet rescan button currently fails with “BTCPay request failed” because the frontend posts to `/wallets/bitcoin/actions/rescan` and the BFF forwards that wallet code to a BTCPay URL shaped like a payment-method path. BTCPay’s Greenfield API expects `/api/v1/stores/{storeId}/wallets/{cryptoCode}/actions/rescan` with the crypto code `BTC`. After this change, a user can start a rescan from the portal and see the request succeed instead of returning 404.

## Progress

- [x] (2025-11-23 12:20Z) Captured current rescan failure and outlined the plan.
- [x] (2025-11-23 12:34Z) Aligned frontend BTC wallet action requests to `/wallets/btc/actions/...` using a shared wallet code constant.
- [x] (2025-11-23 12:39Z) Updated BFF wallet action routes to accept the BTC wallet code and forward it to the service.
- [x] (2025-11-23 12:43Z) Pointed `rescanWallet` to the BTCPay wallet actions endpoint while keeping parameter normalization.
- [x] (2025-11-23 12:22Z) Added coverage for rescan routing/BTCPay path and ran frontend and BFF test suites.

## Surprises & Discoveries

- Vitest treats async page components as suspending client components when rendered directly; wrapping `RescanPage` rendering in act with awaited params avoids the "async Client Component" warning.
- Radix dropdown behavior in tests required a lightweight mock to expose menu items without portal interaction so wallet action assertions could exercise the correct handlers.

## Decision Log

- Decision: Use the existing BTC wallet code `btc` for frontend and controller routing, mapping it to uppercase `BTC` inside BtcpayWalletService to match other wallet methods.
  Rationale: Presence and other BTC routes already use `btc`; converting to uppercase aligns with existing normalization helpers and BTCPay’s expectations.
  Date/Author: 2025-11-23 / Assistant
- Decision: Mock Radix dropdown menu primitives in tenant wallet action tests to avoid nested button markup and to trigger `onSelect` handlers deterministically.
  Rationale: The real primitives rely on portal/pointer interactions that were leaving menu items hidden in JSDOM, blocking assertions about downstream callbacks.
  Date/Author: 2025-11-23 / Assistant

## Outcomes & Retrospective

- To be completed after implementation.

## Context and Orientation

The frontend rescan UI lives under `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/rescan/`, with `page.tsx` and `rescan-client.tsx` invoking `rescanBtcWallet` from `apps/frontend/lib/api/btc-wallet-actions.ts`. BTC wallet settings and presence already use the wallet code `btc`.

The BFF exposes wallet routes in `apps/bff/src/wallets`. The rescan endpoint currently sits in `bitcoin-wallet-actions.controller.ts` with a controller base path `stores/:storeId/wallets/bitcoin/actions`, and it calls `BtcpayWalletService.rescanWallet` with a hard-coded crypto code. Presence uses `/stores/:storeId/wallets/btc/presence` in `onchain-wallets.controller.ts` and the service `BtcpayWalletService.getBitcoinWalletPresence` maps to crypto code `BTC`.

`apps/bff/src/btcpay/btcpay.wallets.service.ts` contains helpers for on-chain wallets. `rescanWallet` currently builds a path from `buildWalletBasePath(...)/rescan`, which resolves to `/payment-methods/BTC-CHAIN/wallet/rescan`, not the Greenfield rescan path. Helpers like `normalizeCryptoCode` already uppercase wallet codes for BTCPay calls.

Frontend tests use Vitest via `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/rescan/rescan-client.test.tsx` and similar tenant-scoped tests. BFF tests use Jest under `apps/bff/test`, including `bitcoin-wallet-actions.controller.spec.ts` and `btcpay.wallets.service.spec.ts` for service behavior.

## Plan of Work

Begin by updating the frontend API helper `apps/frontend/lib/api/btc-wallet-actions.ts` so rescan posts to `/api/stores/${storeId}/wallets/btc/actions/rescan`, reusing the same wallet code used for presence and settings. Ensure the payload shape remains `{ startIndex, gapLimit, batchSize }`. If shared constants for wallet codes exist, adopt them instead of the literal string.

Adjust the rescan UI if necessary to rely on the updated helper but keep behavior otherwise intact.

On the BFF side, retarget the rescan controller route to accept `walletCode` (e.g., `btc`) instead of `bitcoin`, matching the presence route. Pass the wallet code through to `BtcpayWalletService.rescanWallet` so crypto code normalization happens in the service. Keep guards, throttling, and response shapes the same.

In `BtcpayWalletService`, change `rescanWallet` to call the official Greenfield path `/api/v1/stores/{storeId}/wallets/{cryptoCode}/actions/rescan` using the normalized crypto code (uppercase) rather than the payment-method wallet base path. Maintain existing parameter normalization and error masking.

Update and extend tests: adjust `bitcoin-wallet-actions.controller.spec.ts` to hit the new controller URL and expect the wallet code to be forwarded; add a service test that asserts the rescan method posts to `/api/v1/stores/{storeId}/wallets/BTC/actions/rescan` with normalized payload values. Update frontend rescan client tests to expect the `btc` route. Finally, run the relevant frontend Vitest suite and BFF Jest tests.

## Concrete Steps

1. Edit `apps/frontend/lib/api/btc-wallet-actions.ts` to send the rescan request to `/api/stores/${storeId}/wallets/btc/actions/rescan` (or a shared BTC wallet code constant). Verify the payload matches the DTO fields.
2. Adjust any frontend tests referencing the old path, especially `rescan-client` tests under the dashboard and tenant folders.
3. Update `apps/bff/src/wallets/bitcoin-wallet-actions.controller.ts` to expose the rescan endpoint at `/stores/:storeId/wallets/:walletCode/actions/rescan`, forwarding the wallet code to the service alongside the store and payload.
4. Modify `apps/bff/src/btcpay/btcpay.wallets.service.ts` so `rescanWallet` posts to `/api/v1/stores/{storeId}/wallets/{cryptoCode}/actions/rescan`, using normalized crypto code (`BTC`) and the same startIndex/gapLimit/batchSize normalization.
5. Extend `apps/bff/test/bitcoin-wallet-actions.controller.spec.ts` and `apps/bff/test/btcpay.wallets.service.spec.ts` with expectations for the new routes and BTCPay call; update frontend rescan client tests to assert the corrected URL.
6. From the repo root, run `pnpm --filter frontend test` for frontend checks and execute the relevant BFF Jest tests (e.g., `pnpm --filter bff --dir apps/bff npx jest test/bitcoin-wallet-actions.controller.spec.ts test/btcpay.wallets.service.spec.ts`). Ensure tests pass.

## Validation and Acceptance

After changes, submitting the rescan form should POST `/api/stores/{storeId}/wallets/btc/actions/rescan` from the frontend. The BFF should respond with the existing success payload (e.g., `{ status: 'ok' }` and HTTP 202) and issue a BTCPay call to `/api/v1/stores/{BTCPAY_STORE_ID}/wallets/BTC/actions/rescan` containing `startIndex`, `gapLimit`, and `batchSize`. All updated tests should pass.

## Idempotence and Recovery

The changes are additive and route-aligned; rerunning the steps is safe. If BTCPay rescan calls still return 404 after updates, verify the wallet code normalization and controller route; reverting to the previous commit restores prior behavior.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

- `BtcpayWalletService.rescanWallet(storeId: string, cryptoCode: string, options?: RescanWalletOptions): Promise<void>` should issue a POST to `/api/v1/stores/{storeId}/wallets/{CRYPTOCODE}/actions/rescan` with normalized numeric fields and continue using existing error handling.
- Frontend `rescanBtcWallet(storeId: string, payload: { startIndex: number; gapLimit: number; batchSize: number }): Promise<void>` should target `/api/stores/${storeId}/wallets/btc/actions/rescan`.
