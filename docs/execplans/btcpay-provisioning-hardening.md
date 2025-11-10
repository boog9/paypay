# Harden BTCPay provisioning key pipeline

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must comply with the repository guidance in `.agent/PLANS.md`.

## Purpose / Big Picture

We need signup flows to provision BTCPay users and API keys without violating the admin-only key issuance rules or over-granting permissions. After implementing this plan, a newly registered portal user will receive exactly one temporary "bootstrap" key scoped to store creation, the BFF will rotate immediately to a per-store key that includes store-qualified permissions, and any provisioning failure caused by an invalid admin key will surface a dedicated error. Logs will avoid leaking Authorization headers. Successful verification consists of running the existing provisioning tests and confirming the new permission sets in the responses.

## Progress

- [x] (2025-11-10 19:10Z) Drafted ExecPlan and captured scope.
- [x] (2025-11-10 19:04Z) Ensured provisioning service enforces admin key usage and surfaces dedicated 401 errors.
- [x] (2025-11-10 19:05Z) Restricted the default signup API key permissions and synchronized constants/tests.
- [x] (2025-11-10 19:05Z) Sanitized provisioning logs to avoid emitting Authorization header data.
- [x] (2025-11-10 19:05Z) Ran the BFF Jest suite covering signup provisioning and tenant onboarding paths.

## Surprises & Discoveries

- Observation: _None yet._
  Evidence: _TBD_

## Decision Log

- Decision: Adopt `BTCPAY_STORE_BOOTSTRAP_PERMISSION` as the single default permission for signup-issued keys and rely on `buildStorePermissions` for scoped keys.
  Rationale: Matches BTCPay documentation guidance for creating stores and aligns with portal security requirements.
  Date/Author: 2025-11-10 / Assistant

## Outcomes & Retrospective

- (2025-11-10) Signup provisioning now issues a single bootstrap permission, admin-key failures return an explicit Unauthorized error, and provisioning logs are sanitized. Verified by running the full BFF Jest suite.

## Context and Orientation

The NestJS BFF handles BTCPay interactions within `apps/bff/src/btcpay`. `BtcpayProvisioningService` is responsible for signup-time user creation and initial API key issuance (file: `apps/bff/src/btcpay/btcpay-provisioning.service.ts`). The constants that define permission sets live in `apps/bff/src/btcpay/btcpay.constants.ts`. Signup flows reference these defaults via `AuthService` (`apps/bff/src/auth/auth.service.ts`). Test coverage for provisioning exists in `apps/bff/test/auth.signup-provisioning.e2e-spec.ts` and tenant onboarding scenarios in `apps/bff/test/tenants.onboarding.e2e-spec.ts`. Logging currently uses Nest's logger and includes the full Axios error object, which risks leaking headers.

## Plan of Work

1. Update `BTCPAY_PORTAL_USER_PERMISSIONS` in `btcpay.constants.ts` to contain only `BTCPAY_STORE_BOOTSTRAP_PERMISSION`. Ensure any helper that needs the minimal set (for example `getDefaultPermissions`) remains coherent. Confirm that `buildBootstrapPermissions` still returns a fresh array.
2. In `BtcpayProvisioningService`, enforce admin-key usage explicitly:
   - Guard against missing admin keys by ensuring `createHttp` throws if `config.adminApiKey` is falsy (defensive redundancy) and set the `Authorization` header explicitly for each admin-only call.
   - Intercept 401 responses from user or API-key creation and throw an `UnauthorizedException` with message `BTCPay admin key invalid or missing` so the UI can present a neutral failure.
3. Sanitize logging in `BtcpayProvisioningService.raiseProvisioningError` by logging structured metadata without embedding the raw Axios error (no headers/body). Include status code, operation name, and message while omitting sensitive tokens.
4. Update tests:
   - Adjust `auth.signup-provisioning.e2e-spec.ts` expectations for the returned permissions.
   - Update any other tests or fixtures that reference `BTCPAY_PORTAL_USER_PERMISSIONS` to reflect the single-permission array and the store-scoped suffix generation.
5. Verify runtime behavior by running targeted Jest suites for provisioning (`auth.signup-provisioning.e2e-spec.ts`) and tenant onboarding. Confirm they pass and, if needed, adjust mocks to expect the new permission arrays.

## Concrete Steps

1. Edit `apps/bff/src/btcpay/btcpay.constants.ts` to redefine `BTCPAY_PORTAL_USER_PERMISSIONS` as `[BTCPAY_STORE_BOOTSTRAP_PERMISSION]` and export it as a readonly tuple. Ensure `BTCPAY_MINIMAL_PERMISSIONS` remains unchanged.
2. Modify `apps/bff/src/btcpay/btcpay-provisioning.service.ts`:
   - In `createHttp`, throw an error if `this.config.adminApiKey` is falsy before instantiating Axios, and keep the Authorization header as `token ${this.config.adminApiKey}`.
   - In `performRequest`, capture Axios errors to extract status codes; when status is 401 and the operation is either `create-user` or `create-api-key`, raise a `ProvisioningError` with message `BTCPay admin key invalid or missing`.
   - In `raiseProvisioningError`, replace the current logger invocation with a sanitized structure `{ operation, status, message }` and never include the raw error object.
3. Update `apps/bff/src/auth/auth.service.ts` if necessary so that signup uses the updated default permissions helper without assuming multiple entries.
4. Refresh tests under `apps/bff/test` that depend on the previous permission sets. Adjust fixture constants and assertions accordingly.
5. Run the following commands from the repository root:

       pnpm --filter bff exec -- jest --runInBand auth.signup-provisioning.e2e-spec.ts
       pnpm --filter bff exec -- jest --runInBand tenants.onboarding.e2e-spec.ts

   Confirm both suites pass without leaking sensitive data in test logs.

## Validation and Acceptance

Implementation is accepted when:
- Signup provisioning uses the admin API key for admin-only endpoints and surfaces a dedicated Unauthorized error when the admin key fails.
- The temporary key issued during signup only requests `btcpay.store.canmodifystoresettings`.
- Store-scoped keys continue to carry the suffixed minimal permissions.
- Logging during provisioning no longer includes raw error objects or Authorization headers.
- The specified Jest suites pass locally.

## Idempotence and Recovery

Changes are configuration-driven and additive. Re-running the provisioning flow after updates will either succeed with the correct permissions or fail fast with the new Unauthorized message if the admin key is misconfigured. Tests can be rerun safely; no migrations or irreversible operations are introduced. If the admin key remains invalid, the system clearly indicates the issue without side effects.

## Artifacts and Notes

Artifacts will include sanitized log outputs captured in future updates if unexpected failures occur. No additional artifacts are necessary at this planning stage.

## Interfaces and Dependencies

No new external dependencies are required. All HTTP calls continue to use Axios. Permission arrays must stay synchronized with BTCPay documentation: `btcpay.store.canmodifystoresettings` for bootstrap keys and the existing `BTCPAY_MINIMAL_PERMISSIONS` suffixed with `:<STORE_ID>` for store-scoped keys. Envelope encryption remains unchanged.

