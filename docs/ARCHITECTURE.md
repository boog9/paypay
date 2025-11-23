# PayPay Architecture

This document captures the authoritative architecture for the PayPay merchant portal that fronts BTCPay Server v2.2.1 via the Greenfield v1 API. It supersedes any earlier sketches and must remain in sync with production behavior.

```mermaid
graph TD
  subgraph Frontend [Next.js 14 App Router]
    EdgeMW[Edge middleware\n(X-Request-Id)]
    UI[React UI]
    WS[WebSocket Bridge]
    EdgeMW --> UI
  end

  subgraph BFF [NestJS BFF]
    Gateway[GraphQL/REST Controllers]
    Auth[Auth & 2FA]
    Stores[Stores & Keys]
    Invoices[Invoices]
    Wallets[Wallets]
    Pulls[Pull Payments]
    Apps[Apps & Settings]
    WebhookIn[Webhook Listener]
    Redis[(Redis Cache & Pub/Sub)]
    DB[(Postgres)]
    Vault[Envelope Vault]

    Gateway --> Auth
    Gateway --> Stores
    Gateway --> Invoices
    Gateway --> Wallets
    Gateway --> Pulls
    Gateway --> Apps
    WebhookIn --> Redis
    WebhookIn --> DB
    Auth --> DB
    Stores --> DB
    Invoices --> DB
    Wallets --> DB
    Pulls --> DB
    Apps --> DB
    Stores --> Vault
    Vault --> Stores
    Redis --> WS
  end

  subgraph BTCPay [BTCPay Server]
    Greenfield[Greenfield HTTPS API]
    Webhooks[Signed Webhooks]
  end

  UI -->|HTTPS| Gateway
  Gateway -->|HTTPS| Greenfield
  Webhooks -->|BTCPAY-SIG| WebhookIn
  Redis -->|notifications| WS
```

## 1. Solution Architecture & Data Flow

**Online flow.** All interactive traffic runs Frontend → HTTPS → BFF → HTTPS → BTCPay Greenfield API (`https://<btcpay-host>/api/v1/...`). The BFF exposes GraphQL and REST endpoints backed by NestJS modules. Requests carry `X-Request-Id` generated in a Next.js middleware to enable end-to-end correlation. The BFF logs with Pino in JSON and injects `correlationId`, `merchantId`, and `btcpayStoreId` fields while redacting secrets.

**Inbound webhooks.** BTCPay sends Greenfield webhooks to a dedicated NestJS controller configured with a raw body parser. The handler recomputes the HMAC signature from the stored webhook secret and rejects payloads with invalid signatures or timestamps older than five minutes. Valid events are persisted idempotently and published via Redis Pub/Sub so the WebSocket bridge can fan out notifications to the UI.

**Multitenancy.** PayPay users map 1:1 to BTCPay users (shared email and userId). Merchant records in Postgres contain the `merchant_id` primary key and the `btcpay_user_id`. Each Store belongs to exactly one merchant; collaborators are invited through the BTCPay Greenfield user invitation flow (v2.2.1) and stored alongside role metadata in Postgres.

**Key custody.**
- The global BTCPay Admin API key lives in a hardware-backed KMS/HSM. The BFF retrieves a short-lived session token to access it and never persists the raw key.
- Store-scoped keys are envelope encrypted: a master key (`BTCPAY_MASTER_KEY`) from the environment wraps per-secret data encryption keys (DEKs). Secrets are encrypted with AES-GCM; the ciphertext, IV, auth tag, and wrapped DEK are stored in the vault table.

**Caching, retries, idempotency.**
- Redis caches idempotent GET responses (invoice list, wallet balance) for 60 seconds.
- HTTP POST requests (invoice creation, pull payments) include `Idempotency-Key` headers. The BFF stores the key in Postgres and responds consistently to replays.
- The HTTP client retries 5xx/429 responses up to three times with exponential backoff.

**Rate limiting.**
- Merchant-scoped throttling: `@nestjs/throttler` enforces 60 requests/minute per merchant.
- IP-level global limit provides edge backpressure.
- Frontend form submissions use debounce to prevent burst traffic (e.g., invoice search).
- The admin key is consumed only in background workers behind their own rate limiter.

**Observability.** OpenTelemetry spans originate in a NestJS interceptor and emit to an OTLP collector feeding Grafana Tempo. Prometheus metrics (`prom-client`) record external call latency, 429/500 counts, and webhook volumes. Logs are structured with Pino; HMAC verifications only log whether the signature was valid.

**Risk mitigations.**
- Paging, caching, and back-pressure avoid overwhelming BTCPay during bulk syncs.
- Centralized log redaction plus production-only log levels keep secrets out of logs.
- Postgres transactions wrap multi-step flows (create user → map merchant → issue key) to guarantee multi-tenant consistency.

## 2. User and Store Management

**Signup flow.**
1. Frontend issues `POST /api/auth/signup` with credentials. The BFF hashes passwords with bcrypt, stores the user record (including a TOTP secret for 2FA), and emits standard error payloads when validation fails.
2. The BFF calls `POST /api/v1/users` on BTCPay using the admin key. The generated BTCPay password is never returned to the user.
3. The BFF mints a bootstrap API key via `POST /api/v1/users/{email}/api-keys` with permission `btcpay.store.canmodifystoresettings`. The key is stored encrypted and shown masked in the UI with usage instructions.

**Store creation.** Using the bootstrap key, the BFF sends `POST /api/v1/stores` on behalf of the merchant and persists the resulting `storeId`. DTO validation (`CreateStoreDto`) enforces a minimum name length of 3, optional HTTPS `website`, and a `defaultCurrency` from a curated ISO list.

**Per-store operational key.** Administrators issue a store-bound API key with the minimal permission set:
- `btcpay.store.cancreateinvoice:<STORE_ID>`
- `btcpay.store.canviewinvoices:<STORE_ID>`
- `btcpay.store.canmodifyinvoices:<STORE_ID>`
- `btcpay.store.canmodifypaymentmethods:<STORE_ID>`
- `btcpay.store.canviewstoresettings:<STORE_ID>`
- `btcpay.store.webhooks.canmodifywebhooks:<STORE_ID>`

The key is kept solely in the BFF vault and surfaced read-only (masked) to users. External integrations use additional, least-privileged keys acquired via the `/api-keys/authorize` redirect flow.

`btcpay.store.canmodifypaymentmethods:<STORE_ID>` is required for any payment method changes, including enabling/disabling and deleting the on-chain BTC payment method. It does not grant access to extended public keys or private keys; it only authorizes configuration changes inside the specific store so flows like the "Remove wallet" action on the Bitcoin wallet settings page can succeed.

**Key rotation.** A cron worker monitors `GET /api/v1/api-keys` for expiring credentials, provisions replacements, updates the vault, and notifies merchants. Bootstrap keys expire after 24h and carry a `used_once` flag. Failed store creation triggers compensation: revoke the bootstrap key (`DELETE /api/v1/api-keys/{key}`) and mark the account as `needs_retry`. Concurrency is controlled with `SELECT ... FOR UPDATE` on the merchant row.

**Risk mitigations.** Tight TTL on bootstrap keys, compensating transactions when store creation fails, and transactional locking prevent race conditions.

## 3. Invoices

**Endpoints.** The BFF proxies to Greenfield:
- Create: `POST /api/v1/stores/{storeId}/invoices`
- Retrieve: `GET /api/v1/stores/{storeId}/invoices/{invoiceId}`
- List: `GET /api/v1/stores/{storeId}/invoices?status=Processing&skip=0&take=50`
- Mark invalid: `DELETE /api/v1/stores/{storeId}/invoices/{invoiceId}`
- Archive: `POST /api/v1/stores/{storeId}/invoices/{invoiceId}/archive`

DTO validation requires positive amounts (≤ 10^8 satoshis), ISO currencies, HTTPS redirect URLs, and enumerated payment methods (e.g., `BTC-LightningNetwork`). Error responses conform to `{ "error": { "code": "INVALID_INVOICE_INPUT", "fieldErrors": { ... } } }`.

**Webhook handling.** `POST /bff/webhooks/btcpay` ingests raw payloads, verifies HMAC signatures (`BTCPAY-SIG`), confirms the `storeId` matches the merchant, persists invoice statuses, and emits Redis events for downstream consumers. Supported events include `invoice_created`, `invoice_paidInFull`, `invoice_expired`, `invoice_paymentSettled`, and `invoice_refundCompleted`.

**UI behavior.**
- Invoice list with status, payment method, and date filters.
- Detail view with tabs for Transactions, Refunds, and Events.
- Actions include Mark Invalid, Issue Refund (via pull payments), and copy Checkout Links.

**Reliability strategy.** UI supplies `Idempotency-Key` headers when retrying invoice creation. A background reconciler (`GET /invoices?modifiedSince=`) heals missed events. Decimal.js (frontend) and decimal.js-light (BFF) handle currency precision.

**Risks.** Webhook drops are mitigated by reconciliation; payload spoofing is prevented by HMAC and store binding; precision issues are avoided with decimal math libraries.

## 4. Wallets (On-chain)

**Endpoints.**
- Balance: `GET /api/v1/stores/{storeId}/payment-methods/OnChain/BTC/wallet`
- Address provisioning: `POST /api/v1/stores/{storeId}/payment-methods/OnChain/BTC/wallet/addresses/unused`
- Transactions: `GET /api/v1/stores/{storeId}/payment-methods/OnChain/BTC/wallet/transactions`
- Send: `POST /api/v1/stores/{storeId}/payment-methods/OnChain/BTC/wallet/send`
- Fee rates: `GET /api/v1/stores/{storeId}/payment-methods/OnChain/BTC/wallet/feerate` (or Lightning endpoint for LN)

Setup screens display `isHotWallet` status and `derivationScheme`. Private keys are never stored—only metadata returned by Greenfield.

**Send validation.** DTO shape `{ address: string, amount: number, feeRate: number|null, allowUnconfirmed: boolean }` with pre-flight validation via `GET /wallet/onchain/address/{address}/validate`. Duplicate sends are blocked by tracking `txid` and idempotency keys. Errors return `{ "error": { "code": "BTCPAY_WALLET_SEND_FAILED", ... } }` with BTCPay status details.

**Risks.** Double spends are avoided through deduplication; sensitive wallet data remains masked; default fee guidance prevents misconfiguration.

## 5. Pull Payments and Payouts

**Endpoints.**
- Create pull payment: `POST /api/v1/stores/{storeId}/pull-payments`
- List pull payments: `GET /api/v1/stores/{storeId}/pull-payments`
- Approve claim: `POST /api/v1/stores/{storeId}/pull-payments/{pullPaymentId}/approve`
- Create payout: `POST /api/v1/stores/{storeId}/pull-payments/{pullPaymentId}/payouts`
- Batch approve/pay: `POST /api/v1/stores/{storeId}/payouts/approve` / `.../pay`

DTO validation enforces `name` (≥3 chars), positive `amount`, ISO currency, optional `claimExpiration`, and ensures requested amounts fit the remaining pull payment balance. Refunds spawn pull payments via the `refundInvoiceId` linkage.

**UI.** Merchants configure pull payments with auto-approve options, monitor claims by status, and perform batch approvals with fee previews. If no hot wallet is present, the UI blocks payout execution and suggests exporting a PSBT.

**Risks.** Concurrency is handled by transactional locking on claims; claim destinations (LNURL, Lightning address, BTC address) are validated through Greenfield endpoints.

## 6. Apps

Merchants manage PoS, Crowdfund, Pay Button, and other BTCPay apps through:
- List: `GET /api/v1/stores/{storeId}/apps`
- Create: `POST /api/v1/stores/{storeId}/apps`
- Update: `PUT /api/v1/stores/{storeId}/apps/{appId}`
- Public URL: `GET /api/v1/apps/{appId}`

UI pages show cards with status (Enabled/Hidden), public URLs, and JSON configuration editors with Zod schema validation. Destructive actions require explicit confirmation and 2FA. Throttling and audit logs mitigate mass app creation.

## 7. Rates, Checkout, Webhooks, and Plugins

**Rates.** `GET/PUT /api/v1/stores/{storeId}/rates/configuration` manage price sources (CoinGecko, Kraken, custom scripts) with validation for primary sources, fallbacks, spreads (0–100%), and refresh intervals. Alerts trigger if rates are stale beyond five minutes.

**Checkout.** `GET/PUT /api/v1/stores/{storeId}/checkout` adjusts payment tolerances, default payment methods, redirect behavior, and appearance. DTOs enforce boolean flags and whitelisted payment method arrays.

**Webhooks.** CRUD endpoints handle webhook definitions. Secrets are generated in the BFF, envelope encrypted, and stored alongside metadata. Delivery retries call `POST /api/v1/stores/{storeId}/webhooks/{id}/deliveries/{deliveryId}/retry`. Timestamp tolerance and HMAC verification block replay attacks.

**Plugins.** `GET /api/v1/server/plugins` lists installed plugins. Administrative UI (restricted to portal admins) can invoke `POST /api/v1/server/plugins/install` / `.../uninstall`. Operations run during maintenance windows with health checks to avoid downtime.

## 8. UI Parity with BTCPay

The Next.js frontend mirrors core BTCPay surfaces:
- **Dashboard** (`/dashboard`): Recent invoice metrics using `GET /invoices?take=5` and wallet balance endpoints.
- **Stores** (`/stores`): Store list and creation flows leveraging store APIs.
- **Invoices** (`/stores/:id/invoices`): Full CRUD and status updates.
- **Wallet** (`/stores/:id/wallet`): Balances, transactions, send forms.
- **Lightning** (`/stores/:id/lightning`): Lightning payment method metadata.
- **Apps** (`/stores/:id/apps`): App management via Section 6 endpoints.
- **Pull Payments & Payouts** (`/stores/:id/pull-payments`, `/stores/:id/payouts`).
- **Settings**: Rates, Checkout, Webhooks, future Users/Roles.
- **Plugins** (`/admin/plugins`): Admin-only view.

All UI states cover loading, empty, error (formatted with the BFF error contract), and success banners. API keys and secrets appear masked with optional manual refresh triggers that bypass cache (`cache: 'no-store'`). React Query maintains canonical cache with background refetch and manual "Refresh from BTCPay" affordances.

## 9. Testing and Observability

**Unit tests.** Jest validates BFF services (user management, invoice orchestration, webhook verification) and DTO validation logic.

**Contract tests.** Pact-style suites ensure BFF ↔ BTCPay compatibility using mocked Greenfield responses. Webhook signature tests assert HMAC handling over raw bodies.

**Integration tests.** Docker Compose spins up BTCPay 2.2.1 (Testnet), Postgres, Redis, and the PayPay stack. End-to-end scenarios cover signup → user creation → bootstrap key issuance → store creation → per-store key → invoice creation → webhook simulation → refund via pull payment. Fixtures reproduce real Greenfield payloads.

**Monitoring.** SLOs target >99% success rate for critical endpoints and <500 ms latency. PagerDuty alerts on 5xx spikes or webhook failure rates >5%. OpenTelemetry traces and Prometheus metrics provide runtime insights.

**Risks.** Flaky integration tests are controlled with deterministic data and retry-aware assertions; coverage thresholds (≥80%) protect critical services.

## 10. Migrations and Release Management

**Compatibility.** The team tracks BTCPay 2.2.x release notes (e.g., `amountPaid` field changes) and pins PayPay to stable versions. The BFF exposes versioned APIs (`/v1`) with feature flags for new webhook types.

**Database migrations.** Managed via Prisma or TypeORM with pre-deploy dry runs and zero-downtime patterns (add nullable columns, backfill, switch).

**Key lifecycle.** Feature flags orchestrate key rotations with dual storage of old/new secrets until cutover. Store deletion triggers cascading key revocations.

**Deployments.** Canary releases route 10% of traffic before full rollout. Rollbacks revert to the previous Docker tag in a single command.

**Risks.** Contract tests guard against upstream breaking changes. Migration strategies prevent downtime.

## 11. Security Deep Dive

- **Webhook signatures:** Raw body middleware feeds `crypto.createHmac('sha256', secret)`; comparison uses constant-time checks. Rejects return HTTP 401.
- **Envelope encryption:** The environment master key wraps random DEKs. Stored payloads include ciphertext, IV, auth tag, and encrypted DEK. Master key rotation re-wraps DEKs without re-encrypting plaintext secrets.
- **CORS/CSRF/Helmet:** CORS allow-list includes `paypay.iddqd.in` and staging domains. NestJS CSRF middleware enforces a double-submit cookie strategy. Helmet configures CSP and HSTS.
- **Authentication hardening:** Argon2id or bcrypt hashes passwords; 2FA is required for sensitive settings; rate limiting and CAPTCHAs defend against brute force.
- **Secret handling:** UI masks secrets (e.g., `****ABCD`), requires re-auth (WebAuthn) before copying, and never logs secret material.
- **Audit logging:** Immutable logs capture all key lifecycle events. Insider threats are mitigated through restricted access and monitoring.

## 12. Delivery Timeline (Two-week Increments)

1. **Increment 1 (Weeks 1–2):** Ship `/auth/signup`, `/auth/login`, `/stores/bootstrap`, DTO validation, BTCPay user creation, bootstrap key issuance, E2E signup test, and documentation. Acceptance: user registers and sees a masked bootstrap key.
2. **Increment 2 (Weeks 3–4):** Implement `/stores` create/list, envelope vault, and admin key workflows. Acceptance: store created and key available read-only.
3. **Increment 3 (Weeks 5–6):** Deliver invoice CRUD, webhook endpoint with HMAC, Redis events, dashboard UI, and associated tests. Acceptance: invoice created and updated via webhook in UI.
4. **Increment 4 (Weeks 7–8):** Complete wallet summaries, send flow, pull payments, and refund integration with tests. Acceptance: merchant issues a refund via pull payment.
5. **Increment 5 (Weeks 9–10):** Implement Apps CRUD, Checkout settings, Rates configuration, schema validation, and snapshot UI tests. Acceptance: merchant tweaks checkout appearance and creates a PoS app.
6. **Increment 6 (Weeks 11–12):** Build webhook management, external API key authorization flow, and plugin listings with admin controls. Acceptance: merchant creates a webhook and completes an external integration handshake.
7. **Increment 7 (Weeks 13–14):** Add observability (OTel, Prometheus), hardening (rate limiting, CSRF, 2FA enforcement, key rotation tooling), and run load tests. Acceptance: metrics flow correctly and security checklist passes.

## Reference Materials

- BTCPay architecture overview: https://docs.btcpayserver.org/Architecture/
- Greenfield API reference v1: https://docs.btcpayserver.org/API/Greenfield/v1/
- API key authorization flow: https://docs.btcpayserver.org/API/Greenfield/v1/#tag/API-Keys/operation/AuthorizeApiKey
- Webhook signature specification: https://docs.btcpayserver.org/API/Greenfield/v1/#section/Webhooks
- BTCPay release notes: https://github.com/btcpayserver/btcpayserver/releases
- UI parity walkthrough: https://docs.btcpayserver.org/Walkthrough/
