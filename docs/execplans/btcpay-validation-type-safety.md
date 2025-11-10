# BTCPay validation error type-safety hardening

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with .agent/PLANS.md located at the repository root.

## Purpose / Big Picture

The existing BTCPay payment-method error handling relies on casting to `any` to override NestJS exception responses, and the wallet preview DTO returns raw values from class-transformer that surface as `any`. These patterns break our lint gate and weaken type guarantees around validation payloads. By introducing a strongly typed validation exception helper and tightening the DTO transforms, we keep the BFF aligned with the security posture in docs/ARCHITECTURE.md while restoring lint compliance. Success means lint passes without suppressions and behaviorally nothing regresses: validation errors still surface with sanitized payloads and DTOs still reject malformed input.

## Progress

- [x] (2025-02-14 13:45Z) ExecPlan drafted and committed.
- [x] (2025-02-14 13:55Z) Typed validation exception helper added and payment-methods service updated.
- [x] (2025-02-14 13:57Z) Wallet preview DTO transforms updated to avoid returning `any`.
- [x] (2025-02-14 14:05Z) Lint suite executed and confirmed clean.

## Surprises & Discoveries

- Observation: None encountered.
  Evidence: N/A.

## Decision Log

- Decision: Encapsulate sanitized payload handling in a dedicated exception class instead of mutating NestJS internals.
  Rationale: Keeps error contracts explicit without casting to `any`, satisfying lint while preserving API behavior.
  Date/Author: 2025-02-14 / ChatGPT (gpt-5-codex).

## Outcomes & Retrospective

(2025-02-14 14:05Z) Completed the type-safety hardening pass. Validation exceptions now rely on the dedicated helper, lint is clean, and manual review confirmed sanitized payload behavior remains unchanged. No follow-up work identified.

## Context and Orientation

`apps/bff/src/btcpay/btcpay.payment-methods.service.ts` maps BTCPay Greenfield errors into NestJS exceptions. The helper `buildValidationException` currently mutates the exception response via `(exception as any).response`. `apps/bff/src/wallets/dto/preview-onchain.dto.ts` defines validation DTOs for on-chain payout previews; its `@Transform` callbacks return the raw incoming value to allow subsequent validators to run, but doing so without type annotations leads to `any` escapes. Both areas feed API key custody and payout paths discussed in docs/ARCHITECTURE.md and therefore must preserve behavior while satisfying lint.

## Plan of Work

First, add a reusable exception class under `apps/bff/src/http` that extends `UnprocessableEntityException`, stores the sanitized payload, and overrides `getResponse()` so callers can retrieve the payload without casting. Update `buildValidationException` in `btcpay.payment-methods.service.ts` to instantiate this new class for both string and object payloads, removing any `any` casts. Ensure other call sites that expect a sanitized payload keep working.

Next, adjust the `@Transform` callbacks inside `PreviewBodyDto` so their parameter types are explicitly `unknown` and the non-string branches return `value as unknown` (or `undefined`/`null` as appropriate). This keeps validation logic intact while preventing `any` leakage.

Finally, run `pnpm lint` from the repo root to verify the eslint gate is clear. If time permits, spot-check relevant unit tests, though behavior should be unaffected.

## Concrete Steps

1. Create `apps/bff/src/http/btcpay-validation.exception.ts` exporting the specialized exception class.
2. Import and use the new class in `btcpay.payment-methods.service.ts` within `buildValidationException`.
3. Update `PreviewBodyDto` transforms in `wallets/dto/preview-onchain.dto.ts` with explicit typings and casts to avoid `any` returns.
4. From `/workspace/paypay`, run `pnpm lint`.

## Validation and Acceptance

`pnpm lint` must finish without errors or warnings related to the modified files. Manual inspection should confirm that validation error responses still carry the sanitized payloads (strings or objects) and DTO transforms still allow downstream validators to reject non-string inputs.

## Idempotence and Recovery

Changes are additive and safe to re-run. If lint fails, revisit the helper or DTO transforms, adjust typings, and re-run `pnpm lint`. No migrations or external state are touched.

## Artifacts and Notes

None yet; lint output after implementation will document success.

## Interfaces and Dependencies

The new class should look like:

    export class BtcpayValidationException<T extends string | Record<string, unknown>> extends UnprocessableEntityException {
        constructor(payload: T, options?: { cause?: Error }) { ... }
        override getResponse(): T { ... }
    }

It depends only on NestJS `UnprocessableEntityException` and must be imported where validation errors need sanitized payloads.
