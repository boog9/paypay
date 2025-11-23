# BTCPay per-store key permissions for wallet removal

This ExecPlan is a living document maintained per .agent/PLANS.md. Update every section as work proceeds.

## Purpose / Big Picture

Ensure the portal's per-store BTCPay API keys advertise the correct store-scoped permissions for the "Remove wallet" action on the Bitcoin wallet settings page. The goal is to rely on `btcpay.store.canmodifystoresettings:<STORE_ID>` (already present on the portal-internal key) rather than introducing extra permissions, while keeping the key pipeline and security posture intact.

## Progress

- [x] (2025-01-29 10:00Z) Drafted initial ExecPlan describing goal, context, and intended changes.
- [x] (2025-11-23 17:56Z) Re-evaluated wallet removal needs and confirmed the portal-internal store key already includes `btcpay.store.canmodifystoresettings:<STORE_ID>` sufficient for deleting the BTC payment method.
- [x] (2025-11-23 17:57Z) Cleaned up documentation and related exec plans to remove the outdated `btcpay.store.canmodifypaymentmethods` requirement.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Continue using the portal-internal store key with `btcpay.store.canmodifystoresettings:<STORE_ID>` (plus invoice/view/webhook permissions) for wallet actions; do not introduce `btcpay.store.canmodifypaymentmethods` because BTCPay 2.2.1 authorizes payment method deletion via store settings.
  Rationale: Avoids over-scoping keys while keeping the documented permission set aligned with what BTCPay enforces for deleting the BTC payment method.
  Date/Author: 2025-11-23 / Assistant

## Outcomes & Retrospective

Confirmed the per-store minimal permissions (create/view/modify invoices, modify/view store settings, modify webhooks) already cover deleting the BTC payment method via the "Remove wallet" action. Documentation now reflects the store-settings requirement and no longer references `btcpay.store.canmodifypaymentmethods` for wallet removal.

## Context and Orientation

The repository is a monorepo with the BFF (NestJS) under apps/bff and documentation under docs/. BTCPay integration code lives in apps/bff/src/btcpay with helpers/constants defining permission sets for generated API keys. Per-store keys are created by the BFF using the admin API key on behalf of each user and already carry:
- `btcpay.store.cancreateinvoice:<STORE_ID>`
- `btcpay.store.canviewinvoices:<STORE_ID>`
- `btcpay.store.canmodifyinvoices:<STORE_ID>`
- `btcpay.store.canmodifystoresettings:<STORE_ID>`
- `btcpay.store.canviewstoresettings:<STORE_ID>`
- `btcpay.store.webhooks.canmodifywebhooks:<STORE_ID>`

The "Remove wallet" action calls a BFF endpoint that deletes the on-chain BTC payment method using `DELETE /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN`. The goal is to document that the existing store-settings permission is sufficient and avoid suggesting extra permissions.

Key files to inspect include:
- apps/bff BTCPay integration services or utilities that assemble permission arrays for per-store keys (e.g., BTCPAY_MINIMAL_PERMISSIONS).
- Tests validating key creation requests or permission constants under apps/bff/test or similar directories.
- Documentation in docs/ describing API key pipelines and required permissions, plus .agent/execplans/bitcoin-wallet-settings.md if it lists required permissions for the wallet settings page.

## Plan of Work

1. Audit per-store key creation logic in the BFF to ensure the minimal permission list remains limited to invoices, store settings (modify/view), and webhook modification without adding payment-method-specific scopes.
2. Verify tests or fixtures that assert permission sets remain accurate with `btcpay.store.canmodifystoresettings:<STORE_ID>` as the authority for deleting BTC payment methods.
3. Revise documentation that explains the key issuance pipeline and wallet actions to remove references to `btcpay.store.canmodifypaymentmethods` and highlight the normalized delete endpoint using the existing portal-internal key.
4. Run relevant test suites to confirm no regressions and update this plan's Progress, Decision Log, and Outcomes sections accordingly.

## Concrete Steps

- Work from repository root `/workspace/paypay`.
- Inspect apps/bff BTCPay key generation utilities to ensure permission constants stay minimal and store-scoped.
- Update or add unit tests under apps/bff or shared test directories to assert the expected store permissions (including store settings) without extra scopes.
- Update documentation under docs/ and the existing wallet settings ExecPlan as needed.
- Run targeted tests (e.g., `pnpm test --filter bff` or specific package tests) to validate changes.

## Validation and Acceptance

- Generating a per-store key for a given STORE_ID produces a permissions array containing invoice create/view/modify, store settings modify/view, and webhook modification entries—no extra payment-method scope—and continues to authorize BTC payment method deletion.
- The BFF can successfully call the remove-wallet BTCPay endpoint using the per-store key without 400 errors (authorized by `btcpay.store.canmodifystoresettings:<STORE_ID>`).
- Unit tests covering permission generation (where present) pass and confirm the expected permission set.
- Documentation reflects the store-settings requirement and clarifies that removal deletes configuration only, not wallet secrets.

## Idempotence and Recovery

Changes are limited to permission lists, tests, and docs. Re-running tests is safe. If issues arise, revert the changes or remove the new permission addition from the per-store key definition while leaving the broader pipeline untouched.

## Artifacts and Notes

Pending implementation; will add test outputs or key diffs after execution.

## Interfaces and Dependencies

- BTCPay Greenfield API v1 user API key creation endpoint: `POST /api/v1/users/{email}/api-keys` with permissions array.
- BFF helper/constant defining per-store minimal permissions used when creating internal keys.
