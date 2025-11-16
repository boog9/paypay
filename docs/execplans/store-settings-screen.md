# Implement store settings management via BFF and dashboard form

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Refer to `.agent/PLANS.md` for format and maintenance requirements.

## Purpose / Big Picture

Store owners currently see a placeholder page when opening the Store settings route in the PayPay portal. This work exposes BTCPay store metadata (name, website, default currency) through the NestJS BFF and renders a full settings form in the Next.js dashboard. After this change a merchant can review their BTCPay store identifier, edit descriptive fields, change the default settlement currency, and archive or delete the store directly from the portal with confirmation dialogs. Successful updates round-trip to BTCPay via the official Greenfield API, emit user feedback, and keep the local database in sync when a store is deleted.

## Progress

- [x] (2025-02-19 14:30Z) Drafted ExecPlan outlining backend endpoints, frontend UI, and associated tests.
- [x] (2025-02-19 15:05Z) Implemented BtcpayService `StoreResponse` expansion and `updateStore` helper with normalized payload handling.
- [x] (2025-02-19 15:35Z) Extended StoresService with get/update/delete helpers, temporary API key lifecycle, and entity cleanup.
- [x] (2025-02-19 15:45Z) Added store settings DTOs and wired GET/PUT/DELETE controller routes under `/api/stores/:storeId`.
- [x] (2025-02-19 16:20Z) Implemented Store settings data fetch and client form with update/delete flows, currency selector, and feedback handling.
- [x] (2025-02-19 17:05Z) Added Jest specs for StoresService store settings flows and Vitest tests covering form submit/delete interactions.
- [x] (2025-02-19 17:20Z) Ran targeted Jest (stores.service.spec.ts) and Vitest (store-settings-form.test.tsx) suites; updated Vitest config to resolve `@/` aliases for component imports.
- [x] (2025-02-19 17:30Z) Final verification complete and plan updated with outcomes.
- [x] (2025-02-20 10:00Z) Applied follow-up fixes for API key issuance wrapper, safe revocation helper, currency options, and cache bypass on store settings fetches.
- [x] (2025-02-20 12:10Z) Ensured temporary key revocation prefers key ids when available and re-ran focused backend/frontend tests.
- [x] (2025-11-16 13:13Z) Re-verified store settings flows by running stores.service.e2e/service Jest suites and the frontend StoreSettingsForm Vitest; no functional changes required.

## Surprises & Discoveries

- Observation: Vitest did not resolve the Next.js `@/` alias by default, causing new component tests to fail to import shared UI modules.
  Evidence: Vitest run initially reported "Failed to resolve import '@/components/ui/button'" until `apps/frontend/vitest.config.ts` added an alias mapping `@` to the workspace root.

## Decision Log

- Decision: Persist updated store name and currency back into `ManagedStoreEntity` after successful BTCPay updates.
  Rationale: Keeps local summaries in sync with BTCPay responses without requiring a subsequent fetch, ensuring list views render fresh metadata.
  Date/Author: 2025-02-19 / Assistant

## Outcomes & Retrospective

Backend and frontend store settings management now ship together. The BFF exposes GET/PUT/DELETE routes backed by BTCPay requests with temporary API key issuance and revocation, while the dashboard renders a functional settings form beneath the existing placeholder copy. Automated Jest and Vitest suites cover the new flows, and the Vitest configuration now resolves `@/` aliases to keep component imports consistent with the application.

## Context and Orientation

Backend components relevant to store management live under `apps/bff/src/stores`. `stores.service.ts` handles provisioning and listing stores, persisting per-store API keys in `ManagedStoreEntity` records (`apps/bff/src/stores/managed-store.entity.ts`). `stores.controller.ts` currently exposes `GET /api/stores` and `POST /api/stores` with JWT authentication via `JwtAuthGuard`. BTCPay HTTP access is encapsulated in `apps/bff/src/btcpay/btcpay.service.ts`, which already provides `getStore`, `deleteStore`, `issueStoreScopedApiKey`, and other helpers that construct Axios clients with masked error handling. Tests for store logic reside in `apps/bff/test/stores.service.spec.ts` and related controller specs.

On the frontend, the Store settings page is located at `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/settings/page.tsx` and currently renders a static placeholder. Shared HTTP utilities (`bffFetch`) and path builders live under `apps/frontend/lib`. UI primitives such as `Button`, `Card`, `Input`, `Select`, and toast hooks are in `apps/frontend/components/ui`. Vitest configuration uses `vitest.setup.ts`, and component tests usually live beside features under `__tests__` directories.

## Plan of Work

Describe backend changes first, then frontend, keeping database interactions and API key lifecycle aligned with the security model:

1. **BTCPay service update**: In `apps/bff/src/btcpay/btcpay.service.ts`, expand the `StoreResponse` interface to include `website` and `defaultCurrency` fields (nullable) and add an `updateStore` method that issues a PUT to `/api/v1/stores/{storeId}`. The helper must reuse `createHttp`, trim/normalize payload values, skip undefined fields, and map errors through `maskError`.

2. **DTO definitions**: Under `apps/bff/src/stores/dto/`, introduce `update-store-settings.dto.ts` exporting `UpdateStoreSettingsDto` with class-validator decorators (`IsOptional`, `IsString`, `MaxLength`, `Length`) and a `StoreSettingsDto` interface or class for responses. Export types to reuse in tests and controllers.

3. **StoresService enhancements**: Extend `apps/bff/src/stores/stores.service.ts` with `getStoreSettings`, `updateStoreSettings`, and `deleteStore` methods. Each must validate the authenticated context, locate the `ManagedStoreEntity` by `btcpayStoreId`, decrypt the stored API key when necessary, and issue BTCPay requests via `BtcpayService`. `updateStoreSettings` and `deleteStore` should mint a short-lived user API key scoped to `btcpay.store.canmodifystoresettings:{storeId}`, use it for BTCPay calls inside a try/finally, and revoke it afterward. Map BTCPay responses into `StoreSettingsDto`, normalizing blanks to defaults (`"Unnamed store"`, `null`, uppercase currency). `deleteStore` should also remove the `ManagedStoreEntity` (via repository `remove` or `delete`) and rely on cascading for related wallets.

4. **Controller routes**: In `apps/bff/src/stores/stores.controller.ts`, wire new endpoints for `GET /api/stores/:storeId`, `PUT /api/stores/:storeId`, and `DELETE /api/stores/:storeId` delegating to the service methods. Apply `@SkipThrottle()` to the GET route, return 200 for PUT, and 204 for DELETE. Import DTOs and reuse `resolveContext`.

5. **Backend tests**: Update or extend Jest specs under `apps/bff/test` to cover the new service methods. Mock `BtcpayService`, repositories, and encryption so tests verify unauthorized handling, not-found scenarios, response normalization, API key issuance/revocation, and entity deletion. Add controller tests if needed to confirm wiring and HTTP codes.

6. **Frontend data fetching**: Modify the Store settings page server component to fetch initial data via `bffFetch(storeSettingsPath(storeId))`, parse JSON into the `StoreSettingsDto` shape, and render the existing placeholder content followed by a new `<StoreSettingsForm initial={...} />`. Create `apps/frontend/lib/storePaths.ts` exporting `storeSettingsPath`.

7. **StoreSettingsForm component**: Add `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/settings/_components/StoreSettingsForm.tsx` as a client component. It should render the store ID (read-only), editable name and website inputs, a currency `<Select>` reused from onboarding (with uppercase codes), and a save button that sends a PUT via `bffFetch`. Handle optimistic state updates, disabled states, error toasts, and success toast. Include an "Additional Actions" section with Archive/Delete buttons that confirm before issuing DELETE requests; redirect to the stores list (existing route `/stores`) using `useRouter` on success.

8. **Frontend tests**: Add Vitest tests colocated under a `__tests__` folder next to the form (e.g., `_components/__tests__/store-settings-form.test.tsx`). Use React Testing Library with mocked `bffFetch` (or fetch) to assert initial rendering, successful submit invoking PUT with trimmed payload, and delete buttons calling DELETE and router navigation after confirmation. Mock `useRouter`, `useToast`, and `window.confirm` as needed.

9. **Styling and accessibility**: Ensure the new form matches existing design tokens (Tailwind classes), groups fields with headings, and sets appropriate `aria` attributes and button states. Keep the original info box and copy.

10. **Validation**: Run targeted backend Jest suites (`pnpm --filter bff test -- stores.service.spec.ts` etc.) and frontend Vitest suites for the new tests. Document commands and note any skipped checks (e.g., Playwright due to missing browsers).

## Concrete Steps

1. Edit `apps/bff/src/btcpay/btcpay.service.ts` to adjust interfaces and add `updateStore`.
2. Create `apps/bff/src/stores/dto/update-store-settings.dto.ts` with request/response DTOs.
3. Update `apps/bff/src/stores/stores.service.ts` with the new service methods and supporting helpers if required.
4. Extend `apps/bff/src/stores/stores.controller.ts` to add GET/PUT/DELETE routes.
5. Amend or create Jest tests under `apps/bff/test` covering the new service/controller logic.
6. Add `apps/frontend/lib/storePaths.ts` exporting `storeSettingsPath` and adjust existing imports if necessary.
7. Update the Store settings page server component to fetch data and render the new form.
8. Implement the `StoreSettingsForm` client component with form state, API calls, and additional actions.
9. Write Vitest tests for the form interactions under `_components/__tests__`.
10. Execute backend/frontend test commands, record results in this plan, and ensure linting/types pass if required by CI scripts.

## Validation and Acceptance

The feature is complete when:
- Authenticated requests to `GET /api/stores/{storeId}` return `StoreSettingsDto` for stores owned by the user and `401/404` otherwise.
- `PUT /api/stores/{storeId}` updates the BTCPay store, returns normalized settings, and revokes temporary API keys even on failure.
- `DELETE /api/stores/{storeId}` removes the store in BTCPay, revokes the issued key, and deletes the `ManagedStoreEntity` record.
- The Next.js Store settings page shows the original placeholder content plus a functional form that persists changes and handles Archive/Delete actions with confirmation and redirect.
- Jest and Vitest tests covering the new backend/frontend logic pass, demonstrating error handling and state updates.

## Idempotence and Recovery

The operations are additive, reusing existing tables and BTCPay APIs. Re-running the feature setup is safe because PUT requests overwrite store metadata and DELETE operations remove the associated entity while cascading related records. Failures during update/delete still revoke temporary API keys and clear secrets from memory, preventing leakage. To rollback, revert the Git commits and redeploy; no migrations are introduced.

## Artifacts and Notes

- Backend: `pnpm --filter bff exec jest -- --runTestsByPath test/stores.service.spec.ts` (pass)
- Backend: `pnpm --filter bff exec jest -- --runTestsByPath test/stores.service.spec.ts test/stores.e2e-spec.ts` (pass)
- Frontend: `pnpm --filter frontend exec vitest run "app/(dashboard)/(stores)/stores/[storeId]/settings/_components/__tests__/store-settings-form.test.tsx"` (pass)

## Interfaces and Dependencies

- Backend relies on `EnvelopeEncryptionService` for decrypting stored API keys, `BtcpayService` for HTTP calls (`createHttp`, `getStore`, new `updateStore`, existing `deleteStore`, `issueUserApiKey`, `revokeUserApiKey`, `resolveBaseUrl`).
- Frontend depends on `bffFetch` for authenticated API calls, the design system components in `apps/frontend/components/ui`, and Next.js router/toast hooks for user feedback.
- Tests use Jest for backend (`@nestjs/testing` patterns in existing specs) and Vitest with React Testing Library for frontend forms.
