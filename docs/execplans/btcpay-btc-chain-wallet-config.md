# Migrate BTC watch-only flows to BTCPay 2.x wallet preview & config

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Refer to `.agent/PLANS.md` for format and maintenance requirements.

## Purpose / Big Picture

Portal operators need to preview and save Bitcoin on-chain wallet configurations against BTCPay Server v2.2.1 without receiving HTTP 422 responses. After following this plan, the BFF will call the normalized `BTC-CHAIN` routes for preview, generate, and save operations, accept descriptor and tpub inputs via dedicated DTOs, surface actionable validation errors, and persist configurations through the Greenfield API. The frontend wizard will expose two explicit modes—descriptor preview and tpub import—so users can preview addresses and store configs in accordance with BTCPay 2.x expectations. Successful completion is verified by exercising the BFF endpoints (preview and save) and observing `GET …/payment-methods?includeConfig=true` returning the saved configuration.

## Progress

- [x] (2025-02-15 15:30Z) Drafted ExecPlan outlining backend and frontend migration to BTCPay 2.x wallet endpoints.
- [ ] Implement BFF service/controller changes and DTO validation for descriptor vs tpub inputs.
- [ ] Update unit and e2e tests for the new preview/save flows and error mapping.
- [ ] Redesign frontend wizard to support descriptor preview and tpub import modes, wired to the updated BFF routes.
- [ ] Run test suites and document validation evidence. Finalize retrospective.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Represent BTCPay watch-only configuration in BFF DTOs as `{ tpub, rootFingerprint, accountKeyPath }` and surface descriptor preview separately to avoid mixing schema requirements.
  Rationale: BTCPay 2.x distinguishes between GET descriptor preview (descriptor + `m/` path) and POST config preview/save (tpub + fingerprint + relative path). Keeping DTOs distinct prevents invalid payload combinations that previously triggered 422 responses.
  Date/Author: 2025-02-15 / Assistant

## Outcomes & Retrospective

- Pending.

## Context and Orientation

The NestJS BFF under `apps/bff/src` brokers all BTCPay interactions:
- `btcpay/btcpay.payment-methods.service.ts` builds HTTP requests to the Greenfield API for previewing (`/wallet/preview`), generating, and saving on-chain payment methods.
- `wallets/wallet-preview.controller.ts` and `wallets/wallet-preview.service.ts` expose `/api/stores/:id/wallets/onchain/preview` to the frontend. They currently treat descriptors and extended keys interchangeably and call legacy preview payloads.
- `wallets/onchain-wallets.controller.ts` handles `PUT /api/stores/:id/wallets/bitcoin` to persist configs using `BtcpayPaymentMethodsService.updateOnchainPaymentMethod`.
- DTOs for these flows live under `apps/bff/src/wallets/dto/` and enforce validation rules.
- Tests covering these behaviors are located in `apps/bff/test/btcpay.payment-methods.service.spec.ts`, `apps/bff/test/wallet-preview.service.spec.ts`, and `apps/bff/test/onchain-wallets.e2e-spec.ts`.

The Next.js frontend under `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/wizard/page.tsx` renders the wallet connection wizard and currently posts a single derivation payload to preview and save. End-to-end tests for the wizard live in `apps/frontend/e2e/wallet-wizard.spec.ts`.

BTCPay Greenfield API v1 (BTCPay Server ≥2.0) normalizes the Bitcoin on-chain payment method identifier to `BTC-CHAIN`. Preview endpoints expect either a descriptor via GET query parameters (`derivationScheme`, `accountKeyPath` with `m/` prefix) or a watch-only config via POST body (`config.accountDerivation`, `config.accountKeySettings[0]`). Persisting the config requires `PUT /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` with the same config object. Error responses with status 422 indicate validation failures that should be surfaced to clients as `400 Bad Request` with actionable messages.

## Plan of Work

1. **Refactor BtcpayPaymentMethodsService to target normalized endpoints and payloads.**
   - Hardcode the on-chain payment method to `BTC-CHAIN` and update helper methods to construct URLs under `/api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` for preview (GET+POST), generate, and save requests.
   - Replace `buildPreviewRequestBody` to emit `{ config: { … } }` payloads only when handling tpub previews; descriptor previews should use query parameters and GET requests. Introduce dedicated methods `previewWithDescriptor`, `previewWithTpub`, and `saveOnchain` returning plain `{ addresses: … }` or config responses.
   - Ensure `getOnchainConfig` queries `/payment-methods?includeConfig=true` and normalizes the config to expose stored tpub metadata.
   - Map BTCPay 422 responses to `BadRequestException` with curated messages covering missing config, invalid derivation strategy, or malformed account key settings.

2. **Introduce DTOs for descriptor preview and tpub config, update controllers accordingly.**
   - Add `OnchainPreviewDescriptorDto` and `OnchainConfigDto` under `apps/bff/src/wallets/dto/` with class-validator rules enforcing required fields (`derivationScheme` + `accountKeyPath` with `m/` prefix, or `tpub` + `rootFingerprint` + `accountKeyPath` without `m/`).
   - Update `wallet-preview.controller.ts` to accept a union payload: if `derivationScheme` is present, call `BtcpayPaymentMethodsService.previewWithDescriptor`; if `tpub` inputs exist, call `previewWithTpub`; otherwise reject with `BadRequestException` describing required fields.
   - Adjust `wallet-preview.service.ts` (or replace usage) to simply forward to the new service methods, removing legacy descriptor sanitization logic that attempted to auto-derive descriptors.
   - Modify `onchain-wallets.controller.ts` to accept `OnchainConfigDto`, assemble the BTCPay config via `saveOnchain`, and persist metadata locally using the normalized DTO values.

3. **Update backend tests to cover new flows and error handling.**
   - Extend `btcpay.payment-methods.service.spec.ts` to assert correct GET vs POST invocations, payload shapes, and 422 → 400 mapping with specific messages.
   - Adjust `wallet-preview.service.spec.ts` (or replace with controller-level tests) to verify descriptor and tpub branches, including validation of missing fields.
   - Refresh `onchain-wallets.e2e-spec.ts` to mock BTCPay preview/save endpoints and ensure the BFF returns address previews, propagates error messages, and saves config via PUT.

4. **Revise the frontend wizard to support dual modes and new API contract.**
   - Split the UI into two tabs or toggles: “Descriptor preview” (derivation scheme + `m/` account path, preview only) and “Import wallet (tpub)” (tpub, fingerprint, account key path). Wire buttons to POST the correct payload shape to `/api/stores/:id/wallets/onchain/preview`.
   - Gate the “Confirm and save” action behind tpub import; when in descriptor mode, disable or replace the save button with guidance.
   - Update preview parsing to handle the new `{ addresses: […] }` response shape (without store metadata if simplified by BFF).
   - Display stored config fetched via `GET /api/v1/stores/{storeId}/payment-methods?includeConfig=true` or reuse existing BFF endpoint that exposes the saved tpub.
   - Adjust Playwright `wallet-wizard.spec.ts` mocks and expectations for the new payloads and UI flow.

5. **Validation and hardening.**
   - Ensure BFF logs do not include secret payloads during error handling (respecting existing logging strategy).
   - Confirm CSRF guard remains enforced on preview/save routes and that Authorization headers continue using store-scoped API keys.

## Concrete Steps

1. Update `apps/bff/src/btcpay/btcpay.payment-methods.service.ts`:
   - Introduce helper methods for descriptor/tpub preview and saving with `BTC-CHAIN` endpoints and payloads, including error translators.
   - Adjust existing callers to reuse these helpers.
2. Add new DTOs in `apps/bff/src/wallets/dto/` and refactor `wallet-preview.controller.ts` and `wallet-preview.service.ts` to route inputs to the appropriate preview helper.
3. Replace `UpdateBitcoinWalletDto` usage in `onchain-wallets.controller.ts` with the new config DTO and call `saveOnchain`. Update metadata persistence to store `tpub`, fingerprint, and account path as needed.
4. Modify backend unit/e2e tests under `apps/bff/test/` to reflect the new behavior, including mocks for GET/POST preview and PUT save.
5. Update `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/wallets/btc/wizard/page.tsx` to render descriptor vs tpub modes and issue the new request bodies. Adjust supporting utilities, validation schema, and API handlers as required. Refresh frontend tests/mocks (`apps/frontend/e2e/wallet-wizard.spec.ts`).
6. Run `pnpm test --filter bff` and frontend tests (`pnpm --filter frontend test` or targeted Vitest/Playwright commands) to verify coverage.

## Validation and Acceptance

- From the repo root, run `pnpm test --filter bff` and ensure all BFF unit/e2e tests pass, covering descriptor and tpub preview/save cases.
- Run `pnpm --filter frontend test` (or at minimum Playwright `pnpm --filter frontend exec playwright test wallet-wizard.spec.ts`) to validate the updated wizard flow.
- Manually verify via mocked responses that `POST /api/stores/:id/wallets/onchain/preview` returns addresses for both descriptor (GET) and tpub (POST) inputs, and `PUT /api/stores/:id/wallets/onchain` persists config, after which a mocked `GET …/payment-methods?includeConfig=true` reflects the saved tpub.

## Idempotence and Recovery

The changes are additive and can be re-run safely. HTTP mocks in tests isolate BTCPay dependencies, so rerunning tests resets state. If BTCPay returns non-validation 4xx/5xx errors, the new error translator propagates actionable messages while maintaining existing retry semantics.

## Artifacts and Notes

- Capture axios mock expectations in tests to document the exact URLs and payloads used for descriptor vs tpub flows.
- Record representative Playwright snapshots (if applicable) showing the two wizard modes and disabled save action for descriptor preview.

## Interfaces and Dependencies

- `BtcpayPaymentMethodsService` must expose:
    - `previewWithDescriptor(storeId: string, dto: OnchainPreviewDescriptorDto): Promise<{ addresses: { address: string }[] }>`
    - `previewWithTpub(storeId: string, dto: OnchainConfigDto): Promise<{ addresses: { address: string }[] }>`
    - `saveOnchain(storeId: string, dto: OnchainConfigDto): Promise<unknown>`
- `wallet-preview.controller.ts` should inspect the request body and delegate to the appropriate service method.
- `onchain-wallets.controller.ts` must call `saveOnchain` and then update the local `OnchainWalletsService` with the normalized config.
- Frontend wizard must POST payloads that satisfy the new DTOs and handle responses limited to address arrays.
