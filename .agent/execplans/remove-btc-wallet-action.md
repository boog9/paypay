# Fix BTC wallet removal action via Greenfield delete payment method

This ExecPlan is a living document maintained per .agent/PLANS.md. Update every section as work proceeds.

## Purpose / Big Picture

Ensure the portal's "Remove wallet" action for BTC stores uses BTCPay Greenfield v1 correctly. The goal is that BFF deletes the BTC on-chain payment method through DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId} (normalized to BTC-CHAIN) with the store-scoped internal key. Users should see successful removal instead of a 400 error, and error logging should surface meaningful BTCPay codes/messages without leaking secrets.

## Progress

- [x] (2025-11-23 17:50Z) Created initial ExecPlan with scope and intent.
- [x] (2025-11-23 17:54Z) Updated BTC remove wallet action to call normalized payment method delete with store-scoped key.
- [x] (2025-11-23 17:55Z) Enhanced BTCPay error handling to log status/message safely and surface BTCPay error codes in 4xx responses.
- [x] (2025-11-23 17:57Z) Updated documentation to describe the normalized delete endpoint, store-settings permission, and non-destructive nature of removal.
- [x] (2025-11-23 17:58Z) Ran BFF Jest suite to cover wallet actions and BTCPay integration after the updates.
- [ ] Finalize retrospective.
- [ ] Run relevant tests/checks and finalize retrospective.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Remove wallet calls must target DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId} using normalizePaymentMethodId('BTC') and the per-store internal key instead of legacy wallet endpoints.
  Rationale: BTCPay 2.x standardizes payment method identifiers (BTC-CHAIN) and the delete operation is authorized by store settings permission.
  Date/Author: 2025-11-23 / Assistant
- Decision: Error masking should include BTCPay status, short messages, and propagate errorCode/errorMessage for 4xx responses while truncating logged payloads.
  Rationale: Improves frontend toasts and diagnostics without exposing secrets or oversized payloads.
  Date/Author: 2025-11-23 / Assistant

## Outcomes & Retrospective

BTC wallet removal now issues `DELETE /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` via the portal-internal key, avoiding legacy wallet paths. BTCPay error masking logs status/error snippets safely and forwards BTCPay error codes/messages on 4xx responses. Documentation across route maps and wallet settings plans highlights the normalized endpoint, required store-settings permission, and the fact that removal deletes configuration only. BFF Jest suite passes after these changes.

## Context and Orientation

The monorepo hosts BFF (NestJS) under apps/bff and frontend (Next.js) under apps/frontend. BTCPay integration lives in apps/bff/src/btcpay with services like btcpay.payment-methods.service.ts and btcpay.service.ts handling normalized payment method IDs and HTTP calls. The "Remove wallet" action is triggered via POST /api/stores/:storeId/wallets/:walletCode/actions/remove, likely wired in a BitcoinWalletActionsController. The BTCPay store-scoped internal key portal-internal-<STORE_ID> carries permissions including btcpay.store.canmodifystoresettings:<STORE_ID>, which should authorize deleting a payment method via the Greenfield endpoint DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId}. After BTCPay 2.0, BTC on-chain paymentMethodId must be normalized to BTC-CHAIN using normalizePaymentMethodId('BTC').

## Plan of Work

1. Inspect apps/bff wallet actions controller/service for the BTC remove route to confirm current BTCPay endpoint and key selection. Identify helper utilities (likely btcpay.payment-methods.service.ts or btcpay.wallets service) involved.
2. Update the removal implementation to call DELETE /api/v1/stores/{storeId}/payment-methods/${normalizePaymentMethodId('BTC')} without a body, ensuring the store-scoped internal key (portal-internal-<STORE_ID>) with btcpay.store.canmodifystoresettings:<STORE_ID> is used. Remove legacy endpoint usage if present.
3. Adjust BtcpayService error handling to log status and brief BTCPay error messages safely (no secrets, truncate long payloads) and propagate errorCode/errorMessage from BTCPay 4xx responses into BFF errors to improve client toasts.
4. Update repository docs (e.g., .agent/execplans/bitcoin-wallet-settings.md, docs/ROUTE_MAPS.md or other relevant notes) to document the remove wallet action using the normalized paymentMethodId and correct permission. Remove any mention of obsolete permissions.
5. Run targeted tests or linting as available, then summarize outcomes and update retrospective. Commit changes and prepare PR message.

## Concrete Steps

- Work from repo root /workspace/paypay.
- Read apps/bff wallet action controller/service to locate BTC remove path and current BTCPay call.
- Modify the BTCPay call to use normalizePaymentMethodId('BTC') with DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId} and correct key resolution.
- Enhance BtcpayService error logging/masking with status and short BTCPay message; include errorCode/errorMessage in thrown errors for 4xx bodies when present.
- Update documentation files describing Bitcoin wallet removal to reflect the normalized endpoint and permission.
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
