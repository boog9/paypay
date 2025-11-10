# Restore watch-only wallet import via minimal Greenfield payload

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Refer to `.agent/PLANS.md` for format and maintenance requirements.

## Purpose / Big Picture

Portal users currently hit HTTP 422 when importing a watch-only Bitcoin wallet into BTCPay Server v2.2.1 using a tpub. The regression stems from relying on deprecated Greenfield payloads (e.g., `derivationScheme`, `accountKeyPath`) and legacy endpoints. After this change, an operator can configure a testnet watch-only wallet via our BFF, confirm the import with `GET .../payment-methods?includeConfig=true`, and fetch a receive address from `/wallet/address` using the new `BTC-CHAIN` payment method routes.

## Progress

- [x] (2025-02-15 00:45Z) Drafted ExecPlan capturing current behaviour and desired migration targets.
- [x] (2025-02-15 02:10Z) Implemented BTCPay payload refactor, controller updates, tests, and documentation.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Default the BTCPay update payload to include `accountKeySettings` for extended public keys while omitting it for descriptors unless BTCPay requests otherwise.
  Rationale: BTCPay 2.2.1 rejects watch-only imports that include legacy fields, but still expects `accountKeySettings` to materialize addresses for tpub inputs. Descriptors succeed without the array, so the code retries with the richer payload only if BTCPay signals a validation error.
  Date/Author: 2025-02-15 / Assistant

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Key modules live under `apps/bff/src`:
- `btcpay/btcpay.payment-methods.service.ts` orchestrates Greenfield calls for configuring on-chain payment methods.
- `wallets/onchain-wallets.controller.ts` handles portal API requests to import/disable wallets.
- `wallets/onchain-wallets.service.ts` persists normalized metadata locally.
- `wallets/legacy-onchain-wallets.controller.ts` proxies BTCPay wallet endpoints that still use the BFF route space.
- Tests reside in `apps/bff/test/btcpay.payment-methods.service.spec.ts`, `apps/bff/test/onchain-wallets.e2e-spec.ts`, and `apps/bff/test/btcpay.wallets.service.spec.ts`.

BTCPay Greenfield v1 (>= 2.0) renamed the on-chain payment method to `BTC-CHAIN` and expects configuration via `config.accountDerivation` and `config.accountKeySettings`. The minimal working payload for a testnet tpub is:

    {
      "config": {
        "accountDerivation": "<TPUB>",
        "accountKeySettings": [ { "accountKey": "<TPUB>" } ],
        "isHotWallet": false
      },
      "enabled": true
    }

Sending deprecated fields such as `config.derivationScheme`, `config.accountKeyPath`, `config.rootFingerprint`, or `config.source` triggers 422 responses with messages like "Invalid account derivation" or validation errors referencing `AccountKeySettings`.

## Plan of Work

1. **Refactor BTCPay payment method service request builders.**
   - Update `UpdateOnchainPaymentMethodPayload` (and related helpers) to produce the minimal config above. Preserve internal use of `derivationScheme` as the source string but map it to `accountDerivation` in outgoing JSON. Default to omitting `accountKeySettings` and retry with `{ accountKey: <derivation> }` when BTCPay responds with 422 pointing at `AccountKeySettings`.
   - Ensure we never include `accountKeyPath`, `masterFingerprint`, or `label` unless an explicit override flag is supplied. Add a guard so the retry path only kicks in once per call.
   - Adjust `normalizePaymentMethodResponse` / `extractConfigMetadata` so config returned to callers still exposes `derivationScheme` (for compatibility) and now also surfaces the first `accountKey` for inspection.

2. **Adjust wallet controller integration.**
   - In `onchain-wallets.controller.ts`, stop passing label or master fingerprint to BTCPay, while still storing sanitized metadata locally. Accept optional `accountKeyPath` overrides but do not forward them unless a forthcoming opt-in flag is set (for now, enforce omission by not wiring it through to the service call).
   - Update the disable path to build a minimal payload based on the remote config (`accountDerivation` or existing descriptor) without reintroducing banned fields.

3. **Migrate remaining legacy endpoints.**
   - Update `legacy-onchain-wallets.controller.ts` to proxy `BTC-CHAIN` routes (`/payment-methods/BTC-CHAIN/...`) for overview and transaction listing.

4. **Tests and invariants.**
   - Revise `btcpay.payment-methods.service.spec.ts` to assert the minimal payload, verify retry behaviour on 422 with `{ path: 'AccountKeySettings' }`, and ensure normalized responses expose `config.accountKey` when BTCPay returns `accountKeySettings`.
   - Update `onchain-wallets.e2e-spec.ts` expectations (no label/masterFingerprint forwarded) and add a smoke scenario that fakes a successful tpub import using the new payload.
   - Extend `btcpay.wallets.service.spec.ts` with a regression test that ensures `/wallet/address` uses the `BTC-CHAIN` path and propagates the address string unchanged.

5. **Documentation.**
   - Update `docs/payments/btcpay-wallet-import.md` with the new minimal payload, endpoint list, and troubleshooting guidance provided in the task description.

## Concrete Steps

1. Modify `UpdateOnchainPaymentMethodPayload` types and helper builders in `btcpay.payment-methods.service.ts`. Implement retry-on-422 logic that injects `accountKeySettings` exactly once.
2. Update `OnchainPaymentMethodConfig` shape and normalization to include `accountKey` (sourced from the first account key setting or derivation string).
3. Update `onchain-wallets.controller.ts` to pass only `derivationScheme` (and optional manual override flag if required) to `updateOnchainPaymentMethod`, while persisting fingerprint/label locally as before.
4. Switch proxy paths in `legacy-onchain-wallets.controller.ts` to `BTC-CHAIN` routes.
5. Adjust and extend unit/e2e tests as outlined.
6. Refresh documentation snippet under `docs/payments/btcpay-wallet-import.md`.

## Validation and Acceptance

- Run `pnpm test --filter bff` to execute updated unit and e2e suites.
- Manually inspect the HTTP body captured in tests to confirm it matches the required minimal payload.
- Ensure all references to `/payment-methods/onchain/BTC` are removed.
- Confirm documentation renders the new payload and endpoint list.

## Idempotence and Recovery

Changes are limited to application code and tests; they can be reapplied safely. If BTCPay returns 422 for reasons other than `AccountKeySettings`, the retry logic should bubble up the upstream error unchanged. Tests reset axios mocks each run, keeping the environment clean.

## Artifacts and Notes

- Capture representative axios mock call arguments in updated tests to demonstrate the new payload structure.

## Interfaces and Dependencies

- `updateOnchainPaymentMethod(params, options)` will continue accepting `{ storeId, derivationScheme, enabled? }` but now returns void after ensuring BTCPay accepts the minimal config. Internally it builds a payload matching the new schema.
- Tests rely on axios mocks (`jest.mock('axios')`) already established in existing suites.
