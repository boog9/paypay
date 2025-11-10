# BTCPay Greenfield Parity Portal Implementation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with .agent/PLANS.md located at the repository root.

## Purpose / Big Picture

We need to let a PayPay portal operator onboard a merchant, mirror BTCPay Server functionality through our Next.js frontend and NestJS BFF, and orchestrate all workflows purely over the Greenfield API v1 against BTCPay Server v2.2.1 on Testnet. After this work, a merchant who signs up at paypay.iddqd.in can create their BTCPay store, issue scoped API keys, manage invoices, wallets, apps, pull payments, and configuration, and verify all state transitions from our UI without touching the native BTCPay dashboard. Success is demonstrated when a new merchant can complete the entire flow (signup → store → invoice → webhook-settled payment → refund payout) using only our portal with automated tests covering the pipeline.

## Progress

- [ ] (2025-02-14 00:00Z) Draft ExecPlan committed.
- [ ] (2025-02-14 00:00Z) Core domain models and database migrations implemented.
- [ ] (2025-02-14 00:00Z) User signup and bootstrap key issuance implemented and tested.
- [ ] (2025-02-14 00:00Z) Store creation and per-store key vault implemented and tested.
- [ ] (2025-02-14 00:00Z) Invoice lifecycle (create/list/detail/webhooks) implemented and tested.
- [ ] (2025-02-14 00:00Z) Wallet, pull payments, and payouts implemented and tested.
- [ ] (2025-02-14 00:00Z) Apps, checkout, rates, webhooks, and plugins management implemented and tested.
- [ ] (2025-02-14 00:00Z) Frontend parity screens completed with access control and error states.
- [ ] (2025-02-14 00:00Z) End-to-end test suite and observability hooks delivered.
- [ ] (2025-02-14 00:00Z) Security hardening, key rotation, and documentation completed.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: N/A.

## Decision Log

- Decision: ExecPlan created before implementation to govern BTCPay parity delivery.
  Rationale: AGENTS.md requires ExecPlans for multi-package security-critical work.
  Date/Author: 2025-02-14 / ChatGPT (gpt-5-codex).

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

The repository is a monorepo. The BFF NestJS service lives under `apps/bff`, the Next.js frontend under `apps/frontend`, infrastructure manifests under `infra/`, and shared utilities in `packages/sdk`. The security-critical API key lifecycle must store secrets envelope-encrypted using an AES-GCM data encryption key (DEK) wrapped by a master key in environment variable `BTCPAY_MASTER_KEY`. Secrets must never appear in logs. The BFF exposes REST/GraphQL endpoints (review `apps/bff/src` for modules) and integrates with Postgres (configured via Prisma or TypeORM, see `apps/bff/src/database`). The frontend uses React Server Components (App Router) and relies on API routes hitting the BFF.

Our BTCPay integration must use Greenfield API v1 with Authorization header `token <API_KEY>` and only per-store scoped permissions. Admin key usage is limited to `POST /api/v1/users` and `POST /api/v1/users/{email}/api-keys`. Bootstrap keys grant only `btcpay.store.canmodifystoresettings` with no store suffix. All store operations use keys scoped with `:<STORE_ID>` and minimal permissions. Webhooks signed with `BTCPAY-SIG` require raw-body HMAC SHA256 validation. Webhook secrets and API keys are stored in the encrypted vault. We are targeting BTCPay Server v2.2.1 in Testnet mode.

The BFF will manage user signup, store creation, key issuance, invoice orchestration, wallet functions, pull payments, apps, checkout/rates, webhooks, plugin awareness, and observability. The frontend must surface all corresponding UI sections with parity to BTCPay: Dashboard, Stores, Invoices, Wallet, Lightning, Apps, Pull Payments, Payouts, Settings (Rates/Checkout/Webhooks/Users/Roles), and Plugins. Testing must include unit tests, contract tests against mocked BTCPay responses, and end-to-end integration using a dockerised BTCPay Server 2.2.1 on Testnet.

## Plan of Work

### Milestone 1: Domain foundations and security scaffolding

We begin by defining persistent models for merchants, BTCPay users, stores, API keys, webhook endpoints, invoices, payouts, and audit logs. In `apps/bff`, update the ORM schema (Prisma or TypeORM) to capture:
- `users` table with hashed portal credentials, optional 2FA secret, and mapping to `btcpay_user_id` and `btcpay_email`.
- `bootstrap_keys` table storing encrypted bootstrap API keys with `used_at`, `expires_at`, and envelope metadata.
- `stores` table linking portal merchant to `btcpay_store_id`, plus store display data (name, default currency).
- `store_api_keys` vault table containing encrypted per-store keys and metadata about permissions.
- `webhook_endpoints`, `webhook_deliveries`, `invoices`, `invoice_events`, `pull_payments`, `payouts`, and `audit_logs` for observability.

Implement envelope encryption utility in `apps/bff/src/security/encryption.service.ts` using Node crypto: derive master key from Base64 env, generate 32-byte random DEK per secret, wrap with master key using AES-GCM or RSA depending on requirement (use AES-GCM with random IV, store ciphertext, auth tag, and encrypted DEK). Provide functions `encryptSecret(plain: string): EncryptedSecret` and `decryptSecret(enc: EncryptedSecret)`. Write Jest unit tests in `apps/bff/test/security/encryption.service.spec.ts` to ensure round-trip and tamper detection. Configure BFF logging to mask secrets by enhancing the existing logger (check `apps/bff/src/logger`).

Acceptance: Database migrations succeed, unit tests for encryption pass, and the application can boot with new schema (run `pnpm --filter bff migrate && pnpm --filter bff test encryption`).

### Milestone 2: Signup and bootstrap key issuance

Implement REST endpoints in BFF under `apps/bff/src/modules/auth` and `apps/bff/src/modules/btcpay`: `POST /auth/signup` and `POST /auth/login` with password hashing (argon2id) and 2FA support. On signup, create portal user, call BTCPay `POST /api/v1/users` with admin key (use HTTP client module e.g., Axios configured in `apps/bff/src/greenfield/greenfield.client.ts` with base URL and Authorization header). Generate random technical password for BTCPay user, never expose it.

After BTCPay user creation, call `POST /api/v1/users/{email}/api-keys` to issue bootstrap key with permission `btcpay.store.canmodifystoresettings`. Store encrypted key in `bootstrap_keys` table, return masked key to frontend (show last 6 chars) with instructions that it is auto-used for initial store creation. Implement TTL (24 hours) and single-use flag. Record audit log entry.

Frontend: add signup screen in `apps/frontend/app/(auth)/signup/page.tsx` and forms hitting BFF endpoints. Integrate 2FA enrollment flow (generate TOTP secret in BFF, present QR via `otpauth://` to frontend). Store session tokens via secure HttpOnly cookies using CSRF double-submit token for POSTs.

Testing: Jest unit tests for auth service, integration test mocking BTCPay responses verifying admin key used only in allowed endpoints, Playwright e2e covering signup and bootstrap key retrieval.

Acceptance: A fresh user can sign up, BTCPay user is created (visible via mocked API), bootstrap key stored encrypted, masked key displayed, and tests pass.

### Milestone 3: Store creation and per-store key vault

Implement BFF endpoint `POST /stores` that retrieves user's active bootstrap key, uses it to call `POST /api/v1/stores`, then marks bootstrap key as used and expired. Save store metadata and owner relationship in database. If call fails, provide compensating action: revoke bootstrap key via `DELETE /api/v1/api-keys/{key}` using admin key and surface error.

Implement admin service to issue per-store key: using admin key call `POST /api/v1/users/{email}/api-keys` with minimal permissions list containing store ID suffix. Encrypt and store in `store_api_keys`. Expose read-only masked key via BFF `GET /stores/:storeId/api-key`. Provide rotation endpoint to create new key, update vault, notify user (and soft-delete old key). Ensure concurrency protection using DB transactions and row-level locking.

Frontend: create store wizard pages under `apps/frontend/app/(dashboard)/stores/create`. After creation, show store dashboard with masked key and note about BFF-managed rotation.

Testing: Contract tests hitting mocked Greenfield verifying payloads, DB tests ensuring transactions commit/rollback, e2e flow from signup through store creation.

Acceptance: Merchant can create store and see masked per-store key, BFF enforces single-use bootstrap key, and tests succeed.

### Milestone 4: Invoice lifecycle and webhook processing

In BFF create invoice module: endpoints `POST /stores/:storeId/invoices`, `GET /stores/:storeId/invoices`, `GET /stores/:storeId/invoices/:invoiceId`, `DELETE /stores/:storeId/invoices/:invoiceId` (mark invalid), `POST /stores/:storeId/invoices/:invoiceId/archive`. Use per-store key via `GreenfieldService` to call respective endpoints. Accept optional `Idempotency-Key` header stored in DB to prevent duplicates. Validate DTOs using class-validator ensuring positive amounts and valid currencies.

Implement webhook receiver at `POST /greenfield/webhooks` using raw-body middleware. Verify `BTCPAY-SIG` header by computing HMAC SHA256 with stored webhook secret. Reject mismatches with 401. On valid events, upsert invoice status in DB, append event row, push to Redis Pub/Sub for frontend notifications. Manage event types `invoice_created`, `invoice_processing`, `invoice_paidInFull`, `invoice_expired`, `invoice_refundCompleted`. Provide manual reconciliation job hitting `GET /api/v1/stores/{storeId}/invoices?modifiedSince=` to catch missed events.

Frontend: invoice list, detail, and status components using React Query fetching from BFF. Provide create invoice modal with currency selector, payment method toggles, redirect URL field, and show checkout link. Implement real-time updates via SSE or WebSocket bridging Redis channel.

Testing: Unit tests for webhook HMAC, integration tests creating invoice and simulating webhook payloads, e2e verifying UI updates after event.

Acceptance: Merchant can create invoice, see it in list, receive webhook event updating status to Paid after simulated payment, and archive or invalidate invoice with audit log.

### Milestone 5: Wallets, pull payments, payouts, and refunds

Implement wallet module in BFF for on-chain BTC operations: endpoints to fetch balance (`GET /payment-methods/OnChain/BTC/wallet`), request new address, list transactions, and send payments. Validate addresses using `GET /wallet/onchain/address/{address}/validate` before sending. Support optional fee rate input with recommended fallback. Ensure send operations use per-store key and record transaction intent to prevent duplicates via idempotency tokens.

Implement pull payments module for refunds/payouts: support `POST /stores/:storeId/pull-payments`, list claims, approve/deny, create payouts, and batch pay. Integrate with wallet send to allow hot wallet payouts and PSBT export for cold wallets. Tie refunds to invoices by creating pull payment referencing `refundInvoiceId`. Provide UI flows for refund creation and payout approval.

Frontend: wallet dashboard with balance card, transaction table, send modal requiring 2FA re-auth, and pull payments tab showing claims with actions. Add forms to create refund from invoice detail page. Provide notifications and state transitions.

Testing: Unit tests for wallet service validations, integration tests mocking BTCPay responses, e2e scenario: create invoice, mark as paid via webhook, initiate refund, approve payout, verify status transitions.

Acceptance: Merchant can view wallet status, generate address, send funds, create pull payments for refunds, and complete payout (hot wallet simulated) entirely via portal with tests passing.

### Milestone 6: Apps, settings parity, and integrations

Add BFF modules for Apps (`GET/POST/PUT /stores/:storeId/apps`), Checkout settings (`GET/PUT /stores/:storeId/checkout`), Rates (`GET/PUT /stores/:storeId/rates/configuration`), Webhooks management (`GET/POST/PUT/DELETE /stores/:storeId/webhooks`, delivery retry endpoints), and plugin visibility (`GET /api/v1/server/plugins`). Ensure payload validation and encryption of webhook secrets. Expose authorize URL builder for external integrations redirecting to Greenfield `/api-keys/authorize` with selective stores. Store authorized external keys in encrypted vault with minimal permissions.

Frontend: Mirror BTCPay navigation with sections for Apps, Checkout, Rates, Webhooks, External Integrations, and Plugins. Provide forms with inline validation, read-only secrets, and status badges. Add confirmation dialogs for destructive actions requiring 2FA. Ensure plugin install actions are limited to admins.

Testing: Unit tests for DTO validation, integration tests for settings updates, Playwright coverage for UI flows adjusting checkout style, creating PoS app, adding webhook, and authorizing external integration with mocked callback.

Acceptance: Merchant can configure apps, checkout, rates, and webhooks from our UI, see plugin status, and tests confirm functionality.

### Milestone 7: Observability, security hardening, and release workflows

Implement OpenTelemetry tracing for BFF HTTP handlers and Greenfield client, exporting to configured collector. Add Prometheus metrics for request latency, external API errors, webhook failures, and key rotations. Enhance rate limiting with NestJS throttler plus IP-based guard. Enforce CSRF protection, strict CORS allow-list, Helmet security headers, and global 2FA enforcement for critical operations. Implement key rotation job and store deletion cleanup (revoking keys via BTCPay). Add audit logging for all sensitive actions.

Frontend: integrate request-id propagation via headers, show security prompts for sensitive operations, and ensure secrets are masked with reveal requiring re-auth (WebAuthn or password + 2FA).

Testing: Add automated tests for security middleware, run load tests (k6) to verify rate limiting, and integration test covering key rotation and webhook signature rejection on tampering. Update documentation under `docs/` describing operations runbook and security posture.

Acceptance: Observability dashboards show metrics/traces when running local stack, security tests pass, and documentation covers operational and security procedures.

