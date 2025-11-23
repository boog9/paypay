# Implement BTC Receive UX and BFF endpoints

This ExecPlan is a living document. Maintain it according to .agent/PLANS.md.

## Purpose / Big Picture

Enable merchants to view and generate BTC on-chain receive addresses within the dashboard, mirroring BTCPay Server’s Receive UX while keeping API keys confined to the BFF. After implementation, a user can open Bitcoin → Receive, view the next receive address or BIP21 link with QR, copy it, generate a new address, and inspect reserved addresses backed by official BTCPay Greenfield wallet endpoints.

## Progress

- [x] (2024-06-06 00:00Z) Drafted ExecPlan outlining BFF endpoints, frontend UI/UX, hooks, and tests for BTC Receive.
- [x] (2024-06-06 01:00Z) Implemented BFF wallet service methods for next receive address and reserved addresses using Greenfield endpoints with error masking.
- [x] (2024-06-06 01:05Z) Exposed receive endpoints in BitcoinWalletActionsController with guard and parameter handling.
- [x] (2024-06-06 01:40Z) Built frontend Receive page UI (Address/Link toggle, QR, copy, labels placeholder, generate and reserved views) using new hooks.
- [x] (2024-06-06 01:40Z) Implemented hooks for fetching next address and reserved addresses with loading/error handling.
- [x] (2024-06-06 01:50Z) Added tests for Receive component interactions and data loading.
- [x] (2024-06-06 02:10Z) Ran frontend test suite with targeted receive coverage (full suite has existing flaky wallet-actions-menu test).

## Surprises & Discoveries

- None yet.

## Decision Log

- None yet.

## Outcomes & Retrospective

- To be filled after implementation and validation.

## Context and Orientation

Repository is a monorepo with BFF (NestJS) in apps/bff and frontend (Next.js/React) in apps/frontend. Wallet interactions live under apps/bff/src/btcpay and apps/bff/src/wallets. Frontend wallet pages under apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets. Existing wallet hooks likely under apps/frontend/lib or similar (review existing Send/Transactions hooks for patterns). We must use BTCPay Greenfield v1 Store On-Chain Wallets endpoints to fetch/generate receive addresses and list reserved addresses, using store-scoped API keys already available via ManagedStoreEntity and BtcpayService. Error handling uses maskError utility mapping BTCPay HTTP status codes to Nest exceptions. Frontend uses React Query (or similar) for data fetching; mirror existing hook approach. No API keys or secrets may leak to frontend.

## Plan of Work

Expand btcpay.wallets.service.ts with interfaces and methods for receive: getNextReceiveAddress handling optional forceGenerate flag, mapping Greenfield response to address/paymentLink/reservedAt/isPayjoinEnabled fields, and listReservedAddresses returning address listings. Use BtcpayService HTTP client and maskError. Extend bitcoin-wallet-actions.controller.ts to add receive/next and receive/reserved GET routes leveraging existing guards/store resolution and new service methods, normalizing walletCode and parsing query params with defaults. On frontend, replace placeholder receive page with client component that displays header, Address/Link toggle, QR code derived from address/paymentLink, copy controls, labels placeholder, generate button calling forceGenerate, and Reserved Addresses view/table toggled via state or navigation. Implement hooks useBtcReceiveAddress and useBtcReservedAddresses following existing wallet hook patterns and calling new BFF endpoints. Add UI states for loading/error/no-wallet (404) and auth errors. Provide basic tests for component rendering, toggle behavior, data fetch, and generate action invocation.

## Concrete Steps

1. Inspect existing BtcpayWalletsService, error handling, and controller patterns in apps/bff to align with current conventions.
2. Implement interface and methods in apps/bff/src/btcpay/btcpay.wallets.service.ts for getNextReceiveAddress and listReservedAddresses using Greenfield Store On-Chain Wallet endpoints (get address, list addresses). Map response fields and use maskError for errors.
3. Update apps/bff/src/wallets/bitcoin-wallet-actions.controller.ts to add GET /receive/next and /receive/reserved endpoints with guards, store resolution, walletCode normalization, and query parsing (forceGenerate, take default 25, skip default 0). Return shaped JSON as specified.
4. Identify frontend hook patterns (likely in apps/frontend/lib/hooks or similar). Add hooks useBtcReceiveAddress and useBtcReservedAddresses that call the new BFF routes and expose loading/error/refetch.
5. Replace placeholder receive page in apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/receive with real UI using a client component. Include Address/Link toggle, QR code (reuse existing QR component if available or lightweight dependency), copy buttons, labels placeholder select (disabled), generate another address button (forceGenerate), and Reserved Addresses view/table with loading/empty/error states and navigation between current/reserved views.
6. Add frontend tests for Receive component verifying header render, loading behavior, toggle changes displayed text, and generate button triggers fetch/mock client. Include reserved addresses loading where applicable.
7. Run lint/tests (e.g., pnpm lint/test) or targeted commands to ensure consistency.

## Validation and Acceptance

- BFF endpoints return mapped address and reserved address data without leaking secrets; getNextReceiveAddress supports forceGenerate=true to reserve a new address. Masked errors behave consistently (401/403→Unauthorized, 404→NotFound).
- Frontend Receive page loads next address on mount, displays QR and address/payment link with copy actions, toggles between Address and Link, supports generating another address to refresh data, and navigates to reserved addresses view showing a table or empty state with retry handling.
- Tests for Receive component pass, demonstrating header, toggle, data fetch, and generate action behaviors. Repository lint/tests succeed.

## Idempotence and Recovery

Changes are additive. Re-running service methods or hooks is safe as they are read actions; forceGenerate explicitly requests a new address. If an endpoint call fails, maskError ensures consistent exceptions; frontend shows error states with retry/refetch. Git changes can be reset via git checkout if needed.

## Artifacts and Notes

None yet.

## Interfaces and Dependencies

- apps/bff/src/btcpay/btcpay.wallets.service.ts: add interface { address: string; paymentLink: string; reservedAt?: string; isPayjoinEnabled?: boolean } and methods getNextReceiveAddress(options: { store: ManagedStoreEntity; walletCode: string; forceGenerate?: boolean }) and listReservedAddresses(options: { store: ManagedStoreEntity; walletCode: string; take?: number; skip?: number }). Use BtcpayService client, Greenfield Store On-Chain Wallet endpoints (get address, list addresses), map fields, and maskError.
- apps/bff/src/wallets/bitcoin-wallet-actions.controller.ts: add GET receive/next and receive/reserved routes returning mapped data, using existing guards and store resolution.
- Frontend hooks (path matching existing wallet hooks) useBtcReceiveAddress(storeId) and useBtcReservedAddresses(storeId, opts) calling new endpoints.
- Frontend Receive page components under apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/receive: render UI with toggle, QR (use existing QR component or lightweight addition), copy buttons, labels placeholder, generate, reserved addresses view/table.
- Tests under frontend test suite (e.g., apps/frontend/__tests__ or similar) covering UI interactions and fetches.
