# Bitcoin wallet settings read-only view via BTCPay Greenfield

This ExecPlan is a living document maintained per .agent/PLANS.md. Update every section as work proceeds.

## Purpose / Big Picture

Deliver a read-only "Bitcoin wallet settings" page that shows whether an on-chain BTC payment method is connected and exposes only non-sensitive descriptor metadata (status, label, account fingerprint, account key path). Extended public keys and full derivation schemes must never be sent to the frontend.

## Progress

- [x] (2025-01-21 10:50Z) Created initial ExecPlan with scope, context, and steps.
- [x] (2025-01-21 11:20Z) Implemented BFF service method for safe on-chain wallet settings plus controller endpoint and unit tests.
- [x] (2025-01-21 11:50Z) Wired frontend data loader/helper to the new BFF endpoint and added unit coverage.
- [x] (2025-01-21 12:05Z) Rendered wallet settings read-only UI with loading/error/empty states plus component tests.
- [x] (2025-01-21 12:20Z) Ran targeted BFF and frontend test suites; remaining retrospective to finalize at completion.
- [x] (2025-11-18 10:12Z) Adjusted wallet settings panel to surface error alerts even when data is missing and added coverage.

## Surprises & Discoveries

- Vitest could not resolve long relative paths for shared UI components during panel rendering tests; switching to the existing
  `@/components/*` alias fixed module resolution without altering runtime behavior.

## Decision Log

- Decision: Use existing btcpay.payment-methods.service for on-chain wallet settings integration to stay consistent with wallet presence/transactions patterns.
  Rationale: This service already handles payment method ID normalization, BTCPay host/key resolution, and sensitive data masking.
  Date/Author: 2025-01-21 / Assistant

## Outcomes & Retrospective

Implemented a read-only Bitcoin wallet settings flow that sources safe on-chain payment method fields from BTCPay via the BFF,
exposes a dedicated endpoint, and renders descriptor data in the dashboard with banner/error handling. Added unit coverage for
the new service method, controller wiring, data loader, and UI panel. Remaining follow-up: keep an eye on BTCPay API surface
changes for the legacy on-chain endpoint naming.

## Context and Orientation

Repository structure is a monorepo with BFF (NestJS) under apps/bff and frontend (Next.js App Router) under apps/frontend. BTCPay integration resides in apps/bff/src/btcpay/*. Frontend store-specific routes live under apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc.

Current relevant files:
- apps/bff/src/btcpay/btcpay.payment-methods.service.ts: handles on-chain payment method configs, updates, and previews using BTCPay API with key handling and error masking.
- apps/bff/src/wallets/wallets.controller.ts & wallets.service.ts (if present): existing wallet overview/transactions endpoints to mirror for routing/auth patterns.
- apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/settings/page.tsx: existing placeholder page with banner and card scaffolding for Bitcoin wallet settings.
- apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence.ts: helper to detect on-chain wallet presence; useful for error/404 handling patterns.
- apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/transactions/*: examples of data loaders and UI state handling for wallet pages.
- apps/frontend/e2e/wallet-settings.spec.ts: end-to-end expectations around the wallet settings page layout.
- BTCPay store-scoped keys must include `btcpay.store.canmodifypaymentmethods:<STORE_ID>` to support payment method actions like the "Remove wallet" button. This permission covers enabling/disabling or deleting on-chain payment methods without exposing xpubs or private keys.

Tech stack expectations:
- BFF must use BTCPay store-scoped API keys via Authorization: token <KEY> and never expose secrets. Error logs should avoid sensitive payloads.
- Frontend uses fetch helpers with Next.js data fetching (SSR/route loaders) and tailwind-based UI components already present on the settings page.

## Plan of Work

Explain edits sequentially so a new contributor can follow:
1. Extend btcpay.payment-methods.service.ts with a safe model (SafeOnChainWalletSettings) and method getOnChainPaymentMethodSettings(storeId, cryptoCode='BTC'). Reuse existing store/apiKey resolution helpers, normalize payment method IDs for compatibility with BTCPay 2.x, call Greenfield endpoints, and map only non-sensitive fields (enabled, label, accountKeyPath, masterFingerprint). Do not surface derivation schemes or account keys. Return NotFound on 404 and avoid logging secrets.
2. Add a new controller route (e.g., GET /api/stores/:storeId/wallets/bitcoin/onchain/settings) within the wallets or stores domain. Apply existing auth/guards. On success, return SafeOnChainWalletSettings plus hasOnChainPaymentMethod=true; on BTCPay 404, propagate 404 to clients with hasOnChainPaymentMethod=false.
3. Write unit tests for the new controller/service using Nest testing utilities and HTTP mocks to confirm sensitive fields are stripped and 404 handling works.
4. On the frontend, create a data helper (e.g., _lib/get-wallet-settings.ts) that fetches the new BFF endpoint for a given storeId. Define BitcoinWalletSettingsViewModel with hasOnChainPaymentMethod and safe fields (enabled, label, accountKeyPath, masterFingerprint). Map 404 to hasOnChainPaymentMethod=false.
5. Update the Bitcoin wallet settings page to use the helper, display loading/error states, and render a read-only card showing status, master fingerprint, account key path, and label. Show the yellow banner when hasOnChainPaymentMethod is false or payment method disabled. Omit any actionable buttons. Reuse existing UI components/patterns from other wallet pages.
6. Add frontend tests (React Testing Library) covering: (a) connected wallet shows descriptor fields and hides banner; (b) missing wallet shows banner/empty state; (c) error state displays alert.
7. Run relevant test suites (targeted unit tests and frontend tests) and summarize results.

## Concrete Steps

- Work in repository root /workspace/paypay.
- Implement service and controller changes under apps/bff, then add corresponding tests with `pnpm test --filter bff` or targeted package script if available.
- Implement frontend helper and page rendering under apps/frontend; run frontend tests with `pnpm test --filter frontend` or specific commands per package.json. Use existing test patterns from transactions/settings pages.
- After passing tests, commit changes and prepare PR message per repository workflow.

## Validation and Acceptance

- API: Calling GET /api/stores/:storeId/wallets/bitcoin/onchain/settings for a store with a configured on-chain BTC payment method returns JSON with enabled, label, accountKeyPath, masterFingerprint, and hasOnChainPaymentMethod=true, without derivation schemes or account keys. If the payment method is absent, the endpoint responds 404.
- Frontend: Navigating to the Bitcoin wallet settings route displays a banner when no on-chain payment method is configured; otherwise shows a read-only view with status, label, account key path, and master fingerprint. No mutation actions are present.
- Tests: New BFF and frontend tests pass and demonstrate masking of secrets and correct state rendering.

## Idempotence and Recovery

Changes are additive and configuration-driven. Re-running tests or starting servers should be safe. If BTCPay responses change, service gracefully handles missing fields and maps 404 to NotFound without exposing secrets. Roll back by reverting commits.

## Artifacts and Notes

Pending implementation; include key test outputs and noteworthy diffs here after work is done.

## Interfaces and Dependencies

- BTCPay Greenfield API v1 endpoints:
  - GET /api/v1/stores/{storeId}/payment-methods/onchain/{cryptoCode} for on-chain payment method settings.
- New interface SafeOnChainWalletSettings in btcpay.payment-methods.service.ts capturing enabled, label, accountKeyPath, masterFingerprint.
- Frontend view model BitcoinWalletSettingsViewModel mirroring safe fields plus hasOnChainPaymentMethod flag.
