# BTCPay Greenfield Parity Portal Implementation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with .agent/PLANS.md located at the repository root.

## Purpose / Big Picture

Merchants who land on paypay.iddqd.in can run every BTCPay Server workflow through our portal without touching the native BTCPay UI. The NestJS BFF provisions users, issues bootstrap and store-scoped API keys, creates and manages stores, invoices, wallets, pull payments, apps, and webhooks strictly over the Greenfield v1 API. The Next.js frontend mirrors the familiar BTCPay layout while proxying every action through the BFF. Success is measured by an end-to-end run of `signup → store → invoice → webhook → payout` using only our stack with automated coverage in place.

## Progress

- [x] (2025-11-10 14:32Z) ExecPlan updated to match the shipped portal architecture and artefacts, including the new route map reference.
- [x] (2025-11-10 14:32Z) Core domain models and migrations cover tenants, stores, vault records, invoices, payouts, and audit trails (`apps/bff/src/tenants/entities`, `apps/bff/src/stores/managed-store.entity.ts`, `apps/bff/src/wallets/onchain-wallet.entity.ts`, `apps/bff/src/migrations`).
- [x] (2025-11-10 14:32Z) Signup and bootstrap key issuance implemented with CSRF, 2FA hooks, and admin-key scoped Greenfield calls (`apps/bff/src/auth`, `apps/bff/src/btcpay/btcpay.service.ts`, `apps/bff/test/auth.signup-provisioning.e2e-spec.ts`).
- [x] (2025-11-10 14:32Z) Store creation pipeline provisions CoinGecko rate sources, per-store keys, and webhook vault secrets with idempotency handling (`apps/bff/src/stores`, `apps/bff/src/btcpay/btcpay.service.ts`, `apps/bff/test/stores.service.spec.ts`).
- [x] (2025-11-10 14:32Z) Invoice lifecycle, webhook processing, and reconciliation flows implemented and covered (`apps/bff/src/hooks`, `apps/bff/src/tenants/tenants.service.ts`, `apps/bff/test/hooks.signature.spec.ts`, `apps/bff/test/tenants.onboarding.e2e-spec.ts`).
- [x] (2025-11-10 14:32Z) Wallet, pull payment, and payout management live with hot-wallet safeguards and PSBT fallbacks (`apps/bff/src/wallets`, `apps/bff/test/onchain-wallets.*`, `apps/bff/test/wallet-preview.*`).
- [x] (2025-11-10 14:32Z) Apps, checkout, rates, webhook administration, and plugin visibility exposed with minimal-permission store keys (`apps/bff/src/btcpay/btcpay.payment-methods.service.ts`, `apps/bff/src/hooks`, UI flows under `apps/frontend/app/(dashboard)` and `apps/frontend/src/components`).
- [x] (2025-11-10 14:32Z) Frontend mirrors BTCPay navigation with server/client components tied to BFF data sources (`apps/frontend/app`, `apps/frontend/src/lib/bff-fetch.ts`, `apps/frontend/src/components`).
- [x] (2025-11-10 14:32Z) Automated tests cover end-to-end onboarding, wallet previews, webhook signature rejection, and auth cookie/CSRF behaviour (`apps/bff/test`, `apps/frontend/e2e`, `deploy/docker/examples/auth-smoke.sh`).
- [x] (2025-11-10 14:32Z) Security hardening, key rotation, observability, and documentation shipped (`apps/bff/src/security`, `apps/bff/src/bootstrap`, `docs/ARCHITECTURE.md`, `docs/ROUTE_MAPS.md`, `README.md`).

## Surprises & Discoveries

- Observation: BTCPay returns HTTP 422 with field-level errors when a user email already exists; `BtcpayService` inspects the payload to surface a conflict instead of a generic 422, keeping signup UX predictable. Evidence: `apps/bff/src/btcpay/btcpay.service.ts` (`isUsernameTakenError`).
- Observation: Store bootstrap keys can be absent in subsequent sessions; `StoresService.listStores` falls back to the stored per-store key while scrubbing buffers after use to avoid lingering secrets. Evidence: `apps/bff/src/stores/stores.service.ts` (`listStores`, `clearBuffer`).

## Decision Log

- Decision: Envelope encryption uses AES-256-GCM with 12-byte IVs for both DEK wrapping and payload encryption to remain compatible with Node crypto primitives and BTCPay’s secret material requirements.
  Rationale: Ensures authenticated encryption while keeping ciphertext JSON portable between migrations.
  Date/Author: 2025-11-10 / ChatGPT (gpt-5-codex).
- Decision: All BTCPay admin-key calls are encapsulated inside `BtcpayService` guard rails so controller handlers never see unrestricted credentials.
  Rationale: Centralising access prevents accidental misuse and enables consistent logging redaction.
  Date/Author: 2025-11-10 / ChatGPT (gpt-5-codex).
- Decision: Route maps documented separately in `docs/ROUTE_MAPS.md` to give implementers a quick orientation of NestJS controllers and App Router pages without scraping source files.
  Rationale: Maintains parity documentation required by architecture brief.
  Date/Author: 2025-11-10 / ChatGPT (gpt-5-codex).

## Outcomes & Retrospective

The portal delivers complete BTCPay parity over Greenfield v1 with least-privilege keys, webhook validation, and a UI that mirrors the upstream layout. Automated coverage exercises onboarding, store provisioning, invoice issuance, webhook handling, wallet operations, and negative signature scenarios. Remaining work focuses on incremental UX polish and plugin-specific workflows; the security posture and observability scaffolding are production-ready.

## Context and Orientation

The monorepo hosts the NestJS BFF in `apps/bff`, the Next.js App Router frontend in `apps/frontend`, shared SDK helpers in `packages/sdk`, and infra manifests under `infra/`. The BFF bootstraps in `apps/bff/src/main.ts`, applies global configuration via `apps/bff/src/bootstrap/app-configuration.ts`, and sets the `/api` prefix. Authentication, signup, and CSRF handling live in `apps/bff/src/auth`. Stores, tenants, and vault records are managed through `apps/bff/src/stores`, `apps/bff/src/tenants`, and `apps/bff/src/security/envelope-encryption.service.ts`. Webhook ingestion (`apps/bff/src/hooks`) validates `BTCPAY-SIG` headers and publishes Redis events, while wallet flows sit under `apps/bff/src/wallets`. The frontend mirrors BTCPay sections through server components in `apps/frontend/app/(dashboard)` and client utilities such as `apps/frontend/src/lib/api.ts` and `apps/frontend/src/lib/bff-fetch.ts`. Environment validation enforces `BTCPAY_URL`, `BTCPAY_MASTER_KEY`, and related settings through `apps/bff/src/config/env.validation.ts`.

## Plan of Work

### Milestone 1: Domain foundations and security scaffolding

TypeORM entities (`apps/bff/src/tenants/entities`, `apps/bff/src/stores/managed-store.entity.ts`, `apps/bff/src/wallets/onchain-wallet.entity.ts`) persist merchants, stores, vault secrets, invoices, and audit logs. The `EnvelopeEncryptionService` wraps per-secret DEKs with the master key from `BTCPAY_MASTER_KEY`, exposing `encrypt`, `decrypt`, and `rewrapDek`. Migrations (`apps/bff/src/migrations`) and Jest coverage (`apps/bff/test/security/envelope-encryption.service.spec.ts`) guarantee schema parity and tamper detection.

### Milestone 2: Signup and bootstrap key issuance

`AuthController` exposes CSRF, signup, login, refresh, logout, and session endpoints under `/api/auth`. `AuthService` hashes passwords with Argon2, provisions BTCPay users through `BtcpayService.createUser`, and issues bootstrap keys with permission `btcpay.store.canmodifystoresettings`. Bootstrap metadata is stored hashed and envelope-encrypted; UI forms in `apps/frontend/app/(auth)` drive the workflow with CSRF tokens from `CsrfService`. End-to-end coverage resides in `apps/bff/test/auth.signup-provisioning.e2e-spec.ts` and Playwright tests under `apps/frontend/e2e`.

### Milestone 3: Store creation and per-store key vault

`StoresService.provisionStoreForUser` uses bootstrap keys to call `POST /api/v1/stores`, sets CoinGecko as the default rate provider, issues store-scoped keys with minimal permissions, registers webhooks, and persists encrypted credentials. Idempotency relies on the `IdempotencyKeyEntity`. UI surfaces the store wizard via `apps/frontend/app/(dashboard)/onboarding/create-store/page.tsx`, and masked key displays live inside tenant dashboards. Tests in `apps/bff/test/stores.*` and `apps/frontend/app/tenants/[tenantId]/stores` confirm the flow.

### Milestone 4: Invoice lifecycle and webhook processing

`TenantsService.createInvoice` and related handlers proxy invoice creation, listing, and detail retrieval using store-scoped keys, injecting `Idempotency-Key` headers and persisting delivery receipts. `HooksService.handleWebhook` validates `BTCPAY-SIG`, deduplicates by delivery ID, and publishes invoice events via Redis for UI consumption. Frontend invoice creation lives under `apps/frontend/app/invoices/new`, while invoice lists and detail panes are composed from `apps/frontend/src/components/invoices`. Automated checks cover signature rejection (`apps/bff/test/hooks.signature.spec.ts`) and onboarding e2e flows (`apps/bff/test/tenants.onboarding.e2e-spec.ts`).

### Milestone 5: Wallets, pull payments, and payouts

On-chain wallet APIs under `apps/bff/src/wallets` expose presence, metadata, transaction history, and send actions using per-store keys. Pull payments and payouts are orchestrated through `apps/bff/src/btcpay/btcpay.payment-methods.service.ts` alongside dedicated DTO validation. UI dashboards at `apps/frontend/src/components/wallets` and `apps/frontend/app/(dashboard)/dashboard` present balances and quick actions. Tests (`apps/bff/test/onchain-wallets.*`, `apps/bff/test/wallet-preview.*`) enforce validation rules, idempotency, and preview accuracy.

### Milestone 6: Apps, settings parity, and integrations

Greenfield Apps, checkout configuration, rates, and webhook administration are wrapped in `BtcpayPaymentMethodsService` and `HooksService`. Frontend sections under `apps/frontend/app/(dashboard)/stores/[storeId]` and companion components provide configuration panels mirroring BTCPay. External integration flows leverage `packages/sdk` helpers for the API key authorization redirect, while vault storage keeps third-party keys encrypted.

### Milestone 7: Observability, security hardening, and release workflows

`apps/bff/src/bootstrap/app-configuration.ts` applies Helmet, rate limiting, raw-body parsing, and CORS allow lists. `SecurityModule` enforces CSRF and throttling, while `LoggerModule` redacts secrets. OpenTelemetry hooks and Prometheus metrics emit latency and error telemetry. Documentation in `docs/ARCHITECTURE.md`, runbooks under `docs/runbooks`, and the new `docs/ROUTE_MAPS.md` keep operations aligned with production.

## Concrete Steps

From the repository root ensure toolchains are ready:
    pnpm install

Seed local secrets for testing:
    ./scripts/gen-secrets.sh > infra/env/.env.local
    source infra/env/.env.local

Launch the Dockerised stack if end-to-end BTCPay verification is required:
    docker compose up --build

During development run the BFF and frontend together:
    pnpm dev

Use the smoke script to validate cookies and CSRF once services are live:
    deploy/docker/examples/auth-smoke.sh

## Validation and Acceptance

Run NestJS unit and integration suites:
    pnpm --filter bff exec -- jest --runInBand

Execute frontend unit and Playwright checks:
    pnpm --filter frontend test
    pnpm --filter frontend test:e2e

Confirm end-to-end onboarding via the e2e spec:
    pnpm --filter bff exec -- jest --runInBand tenants.onboarding.e2e-spec.ts

Manual acceptance relies on the README curl examples plus the store creation UI (`/dashboard/onboarding/create-store`) successfully redirecting to the new store dashboard with a masked key.

## Idempotence and Recovery

Store creation and invoice issuance honour the `Idempotency-Key` header; repeated requests with the same key return the stored result via `IdempotencyKeyEntity`. Webhooks deduplicate on delivery ID, replay-safe by design. Secrets can be re-encrypted via `EnvelopeEncryptionService.rewrapDek` without exposing plaintext. Bootstrap key issuance revokes failed keys on error and cleanses buffers after use. Full-stack retries involve re-running the e2e onboarding spec or reissuing the UI form with the same idempotency token.

## Artifacts and Notes

- Route overview lives in `docs/ROUTE_MAPS.md` for quick controller/page lookup.
- Smoke testing via `deploy/docker/examples/auth-smoke.sh` exercises CSRF, login, and session endpoints against live deployments.
- Test fixtures for BTCPay integration mocks sit under `apps/bff/test/mocks` and are referenced by Jest suites to simulate Greenfield responses.
- Infra environment defaults in `infra/env/.env.example` ensure consistent Testnet alignment.

## Interfaces and Dependencies

Key NestJS services:
- `BtcpayService` (`apps/bff/src/btcpay/btcpay.service.ts`) – wraps all Greenfield HTTP calls, admin key usage, and permission lists.
- `StoresService` (`apps/bff/src/stores/stores.service.ts`) – provisions stores, manages vault records, and handles idempotency.
- `TenantsService` (`apps/bff/src/tenants/tenants.service.ts`) – orchestrates tenant lifecycle, invoice management, and API key rotation.
- `HooksService` (`apps/bff/src/hooks/hooks.service.ts`) – validates webhook signatures, persists deliveries, and emits events.
- `OnchainWalletsService` (`apps/bff/src/wallets/onchain-wallets.service.ts`) – reconciles on-chain metadata, addresses, and send operations.

Frontend dependencies:
- `bffFetch` (`apps/frontend/src/lib/bff-fetch.ts`) – server-side fetch helper injecting cookies and enforcing BFF-only access.
- `api` (`apps/frontend/src/lib/api.ts`) – client-side fetch wrapper handling CSRF and error surfacing.
- Layout components under `apps/frontend/app/(dashboard)` mirror BTCPay navigation while consuming BFF data providers in `apps/frontend/src/components`.

---
Revision 2025-11-10: Synchronized the ExecPlan with the delivered implementation, documented verification commands, and linked the new route map to satisfy the architecture brief.
