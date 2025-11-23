# PayPay Route Maps

This document captures the operative HTTP routes and UI entry points described in docs/ARCHITECTURE.md. It is split into the NestJS BFF endpoints (all BTCPay access must pass through here) and the mirrored Next.js App Router screens.

## BFF (NestJS) HTTP surface

The BFF applies the `/api` prefix globally in `apps/bff/src/main.ts`; health probes remain unprefixed so Docker and load balancers can call them without credentials.

### Auth & session management (`apps/bff/src/auth/auth.controller.ts`)

- `GET /api/auth/csrf` and `GET /api/auth/csrf-token` issue CSRF tokens and session cookies for double-submit defence.
- `POST /api/auth/register` provisions a portal account without hitting BTCPay, while `POST /api/auth/signup` mirrors BTCPay user creation, bootstrap key issuance, and returns masked metadata.
- `POST /api/auth/login`, `GET /api/auth/refresh`, and `POST /api/auth/logout` manage JWT cookies with per-route throttles; `GET /api/auth/me` validates sessions with `JwtAuthGuard`.

### Tenant and store orchestration (`apps/bff/src/stores/stores.controller.ts`, `apps/bff/src/tenants/tenants.controller.ts`)

- `GET /api/stores` lists stores available to the signed-in merchant using either the bootstrap key or a stored per-store key.
- `POST /api/stores` provisions a store via the bootstrap key, applies idempotency, and persists the encrypted store-scoped key and webhook secret.
- `POST /api/tenants` creates a merchant tenant record and links it to the BTCPay identity.
- `POST /api/tenants/:tenantId/stores` provisions additional stores for an existing tenant; `GET /api/tenants/:tenantId/stores` lists tenant stores and `GET /api/tenants/:tenantId/stores/:storeId` returns configuration metadata.
- `POST /api/tenants/:tenantId/invoices` proxies Greenfield invoice creation with per-store permissions.
- `POST /api/tenants/:tenantId/apikey/rotate` rotates the managed store key after verifying tenant membership.
- `DELETE /api/tenants/:tenantId/stores/:storeId` tears down store records, revokes keys, and cleans vault entries.

### Invoice routing guard (`apps/bff/src/invoices/invoices.controller.ts`)

- `GET /api/invoices` and `POST /api/invoices` intentionally throw 405 to enforce the tenant-scoped paths above.

### Webhooks (`apps/bff/src/hooks/hooks.controller.ts`)

- `POST /api/hooks/btcpay` receives Greenfield webhook deliveries, validates the `BTCPAY-SIG` header against stored secrets, and emits idempotent events.

### Wallet and payment tooling (`apps/bff/src/wallets/*.controller.ts`)

- `GET /api/stores/:storeId/wallets/btc/presence` and `GET /api/stores/:storeId/wallets/bitcoin` surface wallet setup metadata; `PUT /api/stores/:storeId/wallets/bitcoin` configures derivation schemes and `DELETE /api/stores/:storeId/wallets/bitcoin` disables the payment method.
- `POST /api/stores/:storeId/wallets/onchain/preview` runs PSBT preview logic with CSRF protection and throttling.
- `GET /api/stores/:storeId/wallets/onchain/transactions` lists transactions for on-chain wallets; helper routes under `stores/:storeId/wallets/:cryptoCode` provide overview, UTXO, address, fee rate, and transaction detail endpoints.
- Legacy compatibility routes (`GET /api/stores/:storeId/wallets/btc/transactions`, `GET /api/stores/:storeId/wallets/btc/overview`) proxy direct Greenfield responses for clients that still expect the historic path layout.
- Wallet Actions: `POST /api/stores/:storeId/wallets/btc/actions/remove` deletes the BTC on-chain payment method by issuing `DELETE /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` (via `normalizePaymentMethodId('BTC')`) with the portal-internal key holding `btcpay.store.canmodifystoresettings:<STORE_ID>`. The call removes configuration only and never returns private or extended public keys.

### Health probes (`apps/bff/src/health.controller.ts`)

- `GET /health` returns liveness, `GET /readyz` verifies database connectivity and BTCPay reachability, and `GET /internal/health/btcpay` probes BTCPay directly. These routes bypass the `/api` prefix for infrastructure checks.

## Frontend (Next.js App Router)

The App Router mirrors BTCPay navigation while forcing all data access through the BFF helpers in `apps/frontend/src/lib`.

### Global navigation and marketing

- `/` immediately redirects to `/dashboard`, providing parity with BTCPay’s default landing (`apps/frontend/app/page.tsx`).
- `/dashboard` renders the portal overview with quick links and metrics placeholders (`apps/frontend/app/(dashboard)/dashboard/page.tsx`).
- `/docs` links surface through the marketing landing page at `/`’s sibling route `/ (marketing)` (`apps/frontend/app/(marketing)/page.tsx`).

### Authentication flows

- `/sign-in` presents the login form with suspense fallbacks and CSRF-aware submission (`apps/frontend/app/(auth)/sign-in/page.tsx`).
- `/signup` renders the account creation wizard (`apps/frontend/app/(auth)/signup/page.tsx`).
- The edge health endpoint `/health` supplies a lightweight JSON response for uptime checks (`apps/frontend/app/health/route.ts`).

### Tenant and store management

- `/stores` lists stores with status badges and CTAs to create or manage them (`apps/frontend/app/(dashboard)/stores/page.tsx`).
- `/stores/[storeId]` redirects to `/stores/[storeId]/dashboard` so deep links always land on the store control surface (`apps/frontend/app/(dashboard)/stores/[storeId]/page.tsx`).
- `/stores/[storeId]/dashboard` fetches wallet presence and renders the interactive dashboard client (`apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/dashboard/page.tsx`).
- `/tenants/[tenantId]/stores` lists a tenant’s stores by calling the BFF with `bffFetch` and offers onboarding CTAs (`apps/frontend/app/tenants/[tenantId]/stores/page.tsx`).
- `/tenants/[tenantId]/stores/[storeId]/dashboard` currently renders a placeholder describing upcoming dashboard parity with BTCPay (`apps/frontend/app/tenants/[tenantId]/stores/[storeId]/dashboard/page.tsx`).
- `/dashboard/onboarding/create-store` is the client-driven store creation wizard that posts to `/api/stores` with CSRF and idempotency headers (`apps/frontend/app/(dashboard)/onboarding/create-store/page.tsx`).

### Invoices and payments

- `/invoices/new` hosts the Greenfield-backed invoice creation form and links back to health diagnostics (`apps/frontend/app/invoices/new/page.tsx`).

### Account management

- `/account/profile` exposes profile placeholders awaiting deeper integration (`apps/frontend/app/(dashboard)/account/profile/page.tsx`).
- `/account/security` highlights 2FA status and navigation to enable it (`apps/frontend/app/(dashboard)/account/security/page.tsx`).

Supporting components live under `apps/frontend/src/components`, while data fetching is centralised through `apps/frontend/src/lib/api.ts` (client) and `apps/frontend/src/lib/bff-fetch.ts` (server) to honour the BFF-only network policy.
