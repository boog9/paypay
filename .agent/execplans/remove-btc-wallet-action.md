# Fix BTC wallet removal action via Greenfield delete payment method

This ExecPlan is a living document maintained per .agent/PLANS.md. Update every section as work proceeds.

## Purpose / Big Picture

Ensure the portal's "Remove wallet" action for BTC stores uses BTCPay Greenfield v1 correctly, treats BTCPay 404 deletes as idempotent success, and redirects users to the dashboard wizard when no BTC payment method exists. Navigating to BTC wallet routes without a configured payment method should redirect to the dashboard so the wallet-creation wizard launches automatically. No frontend toasts should show errors after a successful removal.

## Progress

- [x] (2025-11-23 17:50Z) Created initial ExecPlan with scope and intent.
- [x] (2025-11-23 17:54Z) Updated BTC remove wallet action to call normalized payment method delete with store-scoped key.
- [x] (2025-11-23 17:55Z) Enhanced BTCPay error handling to log status/message safely and surface BTCPay error codes in 4xx responses.
- [x] (2025-11-23 17:57Z) Updated documentation to describe the normalized delete endpoint, store-settings permission, and non-destructive nature of removal.
- [x] (2025-11-23 17:58Z) Ran BFF Jest suite to cover wallet actions and BTCPay integration after the updates.
- [x] (2025-11-23 19:05Z) Add idempotent 404 handling for wallet removal, dashboard redirect responses, and presence gating on frontend BTC routes.
- [x] (2025-11-23 19:06Z) Update documentation to capture redirect behavior and wizard launch on absent wallets.
- [x] (2025-11-23 19:09Z) Finalize retrospective.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Remove wallet calls must target DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId} using normalizePaymentMethodId('BTC') and the per-store internal key instead of legacy wallet endpoints.
  Rationale: BTCPay 2.x standardizes payment method identifiers (BTC-CHAIN) and the delete operation is authorized by store settings permission.
  Date/Author: 2025-11-23 / Assistant
- Decision: Error masking should include BTCPay status, short messages, and propagate errorCode/errorMessage for 4xx responses while truncating logged payloads.
  Rationale: Improves frontend toasts and diagnostics without exposing secrets or oversized payloads.
  Date/Author: 2025-11-23 / Assistant
- Decision: Treat BTCPay 404 responses during wallet deletion as idempotent success and redirect users to the store dashboard so the BTC wallet wizard appears when no payment method exists.
  Rationale: Removes noisy toasts after repeated delete attempts and ensures wallet-less navigation consistently launches the setup wizard.
  Date/Author: 2025-11-23 / Assistant

## Outcomes & Retrospective

BTC wallet removal now issues `DELETE /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` via the portal-internal key, avoiding legacy wallet paths. BTCPay error masking logs status/error snippets safely and forwards BTCPay error codes/messages on 4xx responses. 404 responses from BTCPay during deletion are treated as idempotent success. Clients receive a simple success payload and redirect to the store dashboard, where the wallet wizard appears when no BTC payment method exists. Frontend BTC routes guard with the wallet presence check and redirect to the dashboard when no wallet is configured, preventing false BTCPay error toasts. Documentation across route maps and wallet settings plans highlights the normalized endpoint, required store-settings permission, redirect behavior, and the fact that removal deletes configuration only. BFF Jest suite passes after these changes.

## Context and Orientation

The monorepo hosts BFF (NestJS) under apps/bff and frontend (Next.js) under apps/frontend. BTCPay integration lives in apps/bff/src/btcpay with services like btcpay.payment-methods.service.ts and btcpay.service.ts handling normalized payment method IDs and HTTP calls. The "Remove wallet" action is triggered via POST /api/stores/:storeId/wallets/:walletCode/actions/remove, likely wired in a BitcoinWalletActionsController. The BTCPay store-scoped internal key portal-internal-<STORE_ID> carries permissions including btcpay.store.canmodifystoresettings:<STORE_ID>, which should authorize deleting a payment method via the Greenfield endpoint DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId}. After BTCPay 2.0, BTC on-chain paymentMethodId must be normalized to BTC-CHAIN using normalizePaymentMethodId('BTC').

## Plan of Work

1. Update BFF wallet removal flow: in btcpay.wallets.service.ts treat BTCPay 404 on delete as successful idempotent removal; in the wallet actions controller return a success payload (or 204) whenever removal completes without throw, ensuring no internal error bubbles up.
2. Add frontend handling for successful removal to toast "Wallet removed" and redirect to /stores/{storeId}/dashboard without showing error toasts after a 2xx response; refresh caches as needed.
3. Enforce wallet presence checks on BTC routes (transactions, send, receive, settings) by calling GET /api/stores/:storeId/wallets/btc/presence and redirecting to the dashboard when hasWallet is false so the wizard appears. Ensure the transactions loader fetches data only when a wallet exists to avoid false BTCPay error banners.
4. Update documentation (.agent/execplans/remove-btc-wallet-action.md and bitcoin-wallet-settings.md) to describe redirect behavior, idempotent 404 deletes, and wizard launch on missing wallets.
5. Run targeted tests or linting as available, update progress/outcomes/decision log, and prepare PR message.

## Concrete Steps

- Work from repo root /workspace/paypay.
- Adjust apps/bff/src/btcpay/btcpay.wallets.service.ts removeWallet to treat BTCPay 404 delete responses as success and avoid handleBtcpayError in that case.
- Update the wallet actions controller (apps/bff/src/wallets/bitcoin-wallet-actions.controller.ts or equivalent) to return a clean success (204 or { removed: true }) when removal completes without throwing.
- Modify frontend BTC settings actions component to toast success and push to /stores/{storeId}/dashboard after a 2xx removal response without surfacing error toasts.
- Add wallet presence guarding to BTC routes under apps/frontend/(dashboard)/(stores)/stores/[storeId]/wallets/btc/* pages by calling the BFF presence endpoint before loading data and redirecting to the dashboard when hasWallet is false; ensure transactions loader only fetches when a wallet exists.
- Update documentation (.agent/execplans/remove-btc-wallet-action.md progress plus bitcoin-wallet-settings.md) to reflect redirect behavior, idempotent deletes, and wizard-triggered dashboard redirect for missing wallets.
- Run available tests (e.g., pnpm test or scoped commands) if feasible; record results.

## Validation and Acceptance

- Calling POST /api/stores/:storeId/wallets/btc/actions/remove results in BFF issuing DELETE /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN with the store-scoped internal key and succeeds when authorized, returning success instead of 400.
- BtcpayService logs include HTTP status and concise BTCPay message on failures without exposing secrets, and BFF error responses surface BTCPay errorCode/errorMessage for 4xx bodies when provided.
- Documentation clearly states the remove wallet action uses normalized BTC-CHAIN paymentMethodId and requires btcpay.store.canmodifystoresettings:<STORE_ID> on the portal-internal-<STORE_ID> key, clarifying that only payment method configuration is removed.

## Idempotence and Recovery

Edits are configuration and call-path changes; re-running steps is safe. If issues arise, revert commits. Error logging additions should remain non-sensitive and bounded to prevent noisy logs.

## Artifacts and Notes

To be filled with key diffs or test outputs after changes are made.

## Interfaces and Dependencies

- BTCPay Greenfield DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId} (paymentMethodId normalized to BTC-CHAIN for BTC on-chain).
- Existing normalizePaymentMethodId utility in apps/bff/src/btcpay/btcpay.payment-methods.service.ts.
- BtcpayService wrappers for HTTP requests and error masking in apps/bff/src/btcpay/btcpay.service.ts.
