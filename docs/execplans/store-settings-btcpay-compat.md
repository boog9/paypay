# Restore store settings updates against BTCPay 2.2.1

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Refer to `.agent/PLANS.md` for format and maintenance requirements.

## Purpose / Big Picture

Merchants cannot currently save store settings from the portal because BTCPay returns errors that the BFF collapses into 502 responses. This plan realigns the store update payloads with BTCPay 2.2.1, surfaces precise 4xx errors from BTCPay to the frontend, and fixes the BTC wallet navigation link so merchants can manage wallet settings without a 404. After completion a merchant can change store metadata (name, website, default currency) successfully through the portal, see actionable error messages when BTCPay rejects a payload, and reach the BTC wallet settings screen via the navbar.

## Progress

- [x] (2025-02-21 10:10Z) Drafted ExecPlan describing backend BTCPay alignment, error propagation, frontend handling, navigation fix, and tests.
- [x] (2025-02-21 13:55Z) Aligned BFF update payload handling with BTCPay 2.2.1, adding website normalization and SDK shape updates.
- [x] (2025-02-21 14:05Z) Refined BTCPay error mapping to surface 4xx responses while keeping 5xx as Bad Gateway.
- [x] (2025-02-21 14:20Z) Updated Store settings UI messaging and wallet navigation links to use store-aware targets.
- [x] (2025-02-21 14:45Z) Added Jest e2e coverage for store update flows and Vitest coverage for frontend success/error banners.
- [x] (2025-02-21 15:17Z) Ran targeted Jest and Vitest suites; both passed.
- [x] (2025-02-21 15:25Z) Updated Outcomes & Retrospective with final results and lessons.

## Surprises & Discoveries

- Observation: The Nest Jest runner filtered out tests unless a permissive `--testPathPattern` was supplied; running with `.*` executed the full suite reliably.
  Evidence: Executing `pnpm --dir apps/bff exec jest --config jest.config.ts --runInBand --testPathPattern=.*` ran all 20 suites.

## Decision Log

- Decision: Normalize store website inputs by auto-prepending `https://` when the user omits a scheme and reject malformed URLs before hitting BTCPay.
  Rationale: BTCPay 2.x expects absolute URLs; normalizing common inputs avoids spurious 400s while keeping validation server-side and out of the frontend.
  Date/Author: 2025-02-21 / Assistant

## Outcomes & Retrospective

Updated store settings now round-trip successfully against BTCPay 2.2.1 with clearer 4xx messaging and infrastructure-specific error handling. Wallet navigation links point to the per-store BTC wallet route, and both backend e2e and frontend component tests cover success, BTCPay validation failures, and infrastructure errors. No pending follow-ups remain beyond monitoring future BTCPay schema changes.

## Context and Orientation

The portal uses a NestJS BFF (`apps/bff`) to proxy BTCPay requests and a Next.js App Router frontend (`apps/frontend`). Store settings live under `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/settings/` with a `StoreSettingsForm` client component that issues `PUT` requests to `/api/stores/:storeId`. The corresponding backend controller is `apps/bff/src/stores/stores.controller.ts`, which delegates to `StoresService` for business logic. `StoresService` constructs a temporary per-store BTCPay API key and calls `BtcpayService.updateStore` in `apps/bff/src/btcpay/btcpay.service.ts`. Error mapping currently wraps most BTCPay failures into `BadGatewayException` with the message "BTCPay request failed", masking 4xx validation details. SDK typings under `packages/sdk` include generated Greenfield shapes and may require updates for the store update payload.

## Plan of Work

Begin by reviewing BTCPay 2.2.1 Swagger for `PUT /api/v1/stores/{storeId}` to confirm accepted fields and ensure the DTO and `updateStore` payload match (expected fields: `name`, `website`, `defaultCurrency`, and updated `payoutMethod`/`payoutMethodId` naming where applicable). Update `UpdateStoreSettingsDto`, `StoresService.updateStoreSettings`, and `BtcpayService.updateStore` to send only valid fields, uppercasing currency codes. Adjust SDK types if any store payload interfaces exist so generated helpers remain accurate.

Refine `BtcpayService.maskError` to preserve BTCPay 4xx statuses/messages (sanitized) when throwing Nest exceptions while keeping 5xx/network errors mapped to `BadGatewayException`. Log only status codes and truncated bodies without secrets. Update `StoreSettingsForm` to display infrastructure failures separately from user-correctable validation/authorization errors, using the BFF message text for 4xx responses. Fix the BTC wallet navigation link in the store settings header/navbar to point to the per-store wallet route (e.g., `/stores/[storeId]/wallets/btc`).

Add backend Jest tests in `apps/bff` that mock BTCPay HTTP responses to verify a successful 200/204 flow and that a BTCPay 400 surfaces as HTTP 400 with the BFF message intact. Add a frontend RTL or Vitest test for `StoreSettingsForm` that mocks the BFF response and asserts success toast and error banner behaviors for 2xx vs 400/500 responses.

## Concrete Steps

1. Inspect BTCPay Swagger or existing SDK schemas to confirm the correct request shape for store updates. Note required/optional fields and any renamed properties in 2.x.
2. Update backend DTOs (`UpdateStoreSettingsDto`) and `BtcpayService.updateStore` payload construction to align with the confirmed schema; ensure currency normalization and optional website handling remain intact.
3. Adjust SDK typings if store update/request/response types exist so they match BTCPay 2.2.1.
4. Improve `maskError` to propagate BTCPay 4xx statuses/messages, logging sanitized details while mapping only server/network failures to 502.
5. Update `StoreSettingsForm` to branch error messaging based on status code (4xx vs 5xx) and fix the BTC wallet navigation link to the correct per-store route.
6. Add/backend tests covering successful update and BTCPay 400 passthrough using mocked HTTP clients; add frontend tests for form success/error banners with mocked fetch responses.
7. Run targeted test suites (backend Jest, frontend Vitest) and document results in Progress and Outcomes.

## Validation and Acceptance

- From the frontend, submitting the Store settings form with valid data should yield a 200 response, show a success toast, and reflect updated fields without errors. A BTCPay 400 should surface as a 400 from the BFF with the provided message and display a descriptive banner rather than a generic 502 message.
- The `PUT /api/stores/:storeId` BFF endpoint should forward BTCPay 4xx statuses unchanged while mapping BTCPay 5xx/network errors to 502, with sanitized logging and no secret leakage.
- The BTC wallet navigation link from the Store settings area should route to `/stores/{storeId}/wallets/btc` (or the existing wallet route) without a 404.
- Automated tests for backend store update flows and frontend form behaviors should pass and fail if the integration regresses.

## Idempotence and Recovery

Edits are additive and configuration-free. The updated payload normalization avoids sending undefined fields, and error handling changes are localized to the BTCPay adapter. Tests rely on mocks, so they can be re-run safely. If BTCPay rejects new fields, revert to the confirmed schema and re-run the suites.

## Artifacts and Notes

None yet.

## Interfaces and Dependencies

- `apps/bff/src/stores/dto/update-store-settings.dto.ts`: request DTO for store update payload.
- `apps/bff/src/stores/stores.service.ts`: orchestrates key issuance and calls `BtcpayService.updateStore`.
- `apps/bff/src/btcpay/btcpay.service.ts`: HTTP client to BTCPay; update payload mapping and error handling.
- `packages/sdk/src/gen/btcpay.d.ts` or related store interfaces: align with BTCPay store update schema.
- `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/settings/_components/StoreSettingsForm.tsx`: client form submission and error handling; navigation link adjustment.
