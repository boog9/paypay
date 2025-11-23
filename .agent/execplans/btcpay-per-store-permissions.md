# BTCPay per-store key permissions for wallet removal

This ExecPlan is a living document maintained per .agent/PLANS.md. Update every section as work proceeds.

## Purpose / Big Picture

Ensure the portal's per-store BTCPay API keys include the payment method modification permission required for the "Remove wallet" action on the Bitcoin wallet settings page. After implementing this change, the BFF will be able to delete the on-chain BTC payment method using BTCPay's Greenfield API without 400 errors while keeping the existing key pipeline and security posture intact.

## Progress

- [x] (2025-01-29 10:00Z) Drafted initial ExecPlan describing goal, context, and intended changes.
- [x] (2025-11-23 17:30Z) Added payment-method modification permission to per-store key builders.
- [x] (2025-11-23 17:45Z) Updated unit/e2e tests to assert the expanded permission set.
- [x] (2025-11-23 17:55Z) Refreshed documentation and wallet-settings ExecPlan with the new requirement.
- [x] (2025-11-23 18:00Z) Ran BFF Jest suite to validate changes and captured outcomes.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Reuse `BTCPAY_MINIMAL_PERMISSIONS` for internal store-scoped keys and append `btcpay.store.canmodifypaymentmethods` rather than introducing a new constant, because all current consumers require payment-method mutations and bootstrap/admin scopes remain unchanged.
  Rationale: Keeps the per-store permission source of truth singular while avoiding over-scoping bootstrap/admin keys.
  Date/Author: 2025-11-23 / Assistant

## Outcomes & Retrospective

Added `btcpay.store.canmodifypaymentmethods:<STORE_ID>` to the per-store minimal permissions, ensuring wallet removal and other payment-method operations succeed with store-scoped keys. Updated tests confirm the permission is requested during key issuance, and documentation now lists and explains the new requirement. BFF Jest suite passes with the expanded permission set.

## Context and Orientation

The repository is a monorepo with the BFF (NestJS) under apps/bff and documentation under docs/. BTCPay integration code lives in apps/bff/src/btcpay with helpers/constants defining permission sets for generated API keys. Per-store keys are created by the BFF using the admin API key on behalf of each user. The "Remove wallet" action calls a BFF endpoint that deletes the on-chain BTC payment method and currently fails because the store-scoped key lacks `btcpay.store.canmodifypaymentmethods:<STORE_ID>`.

Key files to inspect include:
- apps/bff BTCPay integration services or utilities that assemble permission arrays for per-store keys (e.g., BTCPAY_MINIMAL_PERMISSIONS).
- Tests validating key creation requests or permission constants under apps/bff/test or similar directories.
- Documentation in docs/ describing API key pipelines and required permissions, plus .agent/execplans/bitcoin-wallet-settings.md if it lists required permissions for the wallet settings page.

## Plan of Work

1. Locate the per-store key creation logic in the BFF. Identify the constant or function assembling the minimal permission list. Add `btcpay.store.canmodifypaymentmethods:<STORE_ID>` to the internal store-scoped permission set. If the existing minimal constant is shared with contexts that must remain mutation-limited, introduce a new constant specific to internal per-store keys and use it in the key issuance flow.
2. Update or add unit tests to verify the generated permission list includes the new payment-method modification permission alongside the existing store-scoped permissions.
3. Revise documentation that explains the key issuance pipeline and sample permission lists to include the new permission and its purpose (enabling payment method operations such as removing the on-chain wallet without exposing keys). Update .agent/execplans/bitcoin-wallet-settings.md if it enumerates required permissions for the wallet settings actions.
4. Run relevant test suites to confirm the change and update this plan's Progress, Decision Log, and Outcomes sections accordingly.

## Concrete Steps

- Work from repository root `/workspace/paypay`.
- Inspect apps/bff BTCPay key generation utilities to adjust permission constants and usage.
- Modify or add unit tests under apps/bff or shared test directories to assert the new permission.
- Update documentation under docs/ and the existing wallet settings ExecPlan as needed.
- Run targeted tests (e.g., `pnpm test --filter bff` or specific package tests) to validate changes.

## Validation and Acceptance

- Generating a per-store key for a given STORE_ID produces a permissions array containing all prior entries plus `btcpay.store.canmodifypaymentmethods:<STORE_ID>`.
- The BFF can successfully call the remove-wallet BTCPay endpoint using the per-store key without 400 errors (covered by permission addition).
- Unit tests covering permission generation pass and confirm the new permission is present.
- Documentation reflects the updated permission requirement and clarifies security boundaries (no exposure of xpubs/private keys).

## Idempotence and Recovery

Changes are limited to permission lists, tests, and docs. Re-running tests is safe. If issues arise, revert the changes or remove the new permission addition from the per-store key definition while leaving the broader pipeline untouched.

## Artifacts and Notes

Pending implementation; will add test outputs or key diffs after execution.

## Interfaces and Dependencies

- BTCPay Greenfield API v1 user API key creation endpoint: `POST /api/v1/users/{email}/api-keys` with permissions array.
- BFF helper/constant defining per-store minimal permissions used when creating internal keys.
