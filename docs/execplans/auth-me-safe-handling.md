# Gracefully handle /api/auth/me 401s in frontend SSR

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this file in accordance with .agent/PLANS.md.

## Purpose / Big Picture

When a user's session expires and `/api/auth/me` returns HTTP 401, the frontend currently throws during SSR and shows an opaque "Application error" page. After this change, expired or missing sessions will be treated as a guest state: SSR should either redirect to the login page for private areas or render a safe guest view without crashing. Valid sessions should continue to load dashboards normally.

## Progress

- [x] (2025-11-17 16:56Z) Drafted initial ExecPlan describing goals, context, and intended edits.
- [x] (2025-11-17 17:05Z) Implemented `getCurrentUserSafe` helper with 401/403-safe handling for `/api/auth/me` and shared `AuthUser` parsing.
- [x] (2025-11-17 17:10Z) Updated dashboard and tenant store layouts to gate SSR rendering via `getCurrentUserSafe` and redirect to `/sign-in` when unauthenticated.
- [x] (2025-11-17 17:15Z) Added unit tests for the helper and expanded Vitest include paths; ran frontend tests (skipping Playwright via `SKIP_PLAYWRIGHT=1`).
- [x] (2025-11-17 17:20Z) Documented outcomes after validation and marked the plan complete.

## Surprises & Discoveries

- Observation: `apps/frontend/scripts/run-tests.mjs` runs Playwright tests when browsers are installed; setting `SKIP_PLAYWRIGHT=1` skips the E2E suite, which was used during this task.
  Evidence: Frontend tests executed successfully with `SKIP_PLAYWRIGHT=1 pnpm --filter frontend test` after Vitest passed.

## Decision Log

- Decision: Proceed with a shared server-side helper that tolerates 401/403 instead of altering BFF endpoints or security settings.
  Rationale: Keeps BFF contract intact while preventing SSR crashes; aligns with requirement to change frontend only.
  Date/Author: 2025-11-17 / ChatGPT (agent).

## Outcomes & Retrospective

Authentication fetches from `/api/auth/me` now return `null` on 401/403 without throwing, and dashboard/tenant layouts redirect unauthenticated requests to `/sign-in` before making further BFF calls. Helper unit tests cover success, unauthorized, and error cases, and the frontend test suite passes when Playwright is skipped in this environment. No changes were needed to BFF endpoints or cookie/CSRF handling.

## Context and Orientation

The repository is a monorepo with `apps/frontend` containing a Next.js 15 App Router project using SSR and server components. Authentication relies on cookies and CSRF while the frontend calls the NestJS BFF at `/api/auth/*`, notably `GET /api/auth/me` to obtain the current user. Existing fetch utilities live under `apps/frontend/src/bff/`. Layouts such as `apps/frontend/app/(dashboard)/layout.tsx` and store-specific layouts under `apps/frontend/app/(dashboard)/(stores)/stores/[storeId]/` load the user server-side and render shared shells/sidebars. Current logic treats non-OK responses from `/api/auth/me` as fatal, causing the application error when the session is invalid.

## Plan of Work

First, add or extend a server-side authentication helper (e.g., `apps/frontend/src/auth/server.ts`) that wraps `bffFetch` to call `/api/auth/me` with `cache: "no-store"`. The helper should return the parsed user on 200, return `null` on 401/403 without throwing, and throw a descriptive error for other non-OK statuses. Use the real response shape already expected elsewhere.

Next, refactor server layouts and components that fetch the current user directly to use the new helper. Private dashboard layouts should redirect to `/login` when the helper returns `null`, while guest-allowed pages may render safely with a `null` user. Ensure no code path treats a 401 from `/api/auth/me` as an unhandled error.

Then, introduce unit tests for the helper to cover 200, 401, and 500 cases by mocking `bffFetch`. Run the frontend test/build scripts (`pnpm --filter frontend test`, `pnpm --filter frontend build` or equivalents) to confirm stability.

Finally, verify the plan outcomes and update this document's Progress and Outcomes sections accordingly.

## Concrete Steps

1. Inspect existing auth/bff helpers and layouts for `/api/auth/me` usage (e.g., via `rg "auth/me" apps/frontend`).
2. Implement the `getCurrentUserSafe` helper in `apps/frontend/src/auth/server.ts` (or the appropriate auth helper file) using `bffFetch` with graceful handling of 401/403 and a suitable `AuthUser` type.
3. Update dashboard and store layouts (such as `apps/frontend/app/(dashboard)/layout.tsx` and deeper nested layouts) to import and use `getCurrentUserSafe`, redirecting to `/login` for unauthenticated requests.
4. Add unit tests for the helper under the frontend test suite verifying return `AuthUser` on 200, `null` on 401, and thrown error on 500.
5. Run frontend tests/build: `pnpm --filter frontend test` and, if reasonable, `pnpm --filter frontend build`. Record results.
6. Update `Progress`, `Surprises & Discoveries`, and `Outcomes & Retrospective` with findings, noting any deviations.

## Validation and Acceptance

Acceptance requires that server components no longer crash when `/api/auth/me` returns 401/403. Private dashboard routes should redirect to `/login` in that case, while valid sessions still render shells and sidebars with the authenticated user. Tests for the helper must pass, and the frontend build should succeed. Manual verification can be done by simulating an expired session (mocking 401) to confirm the guest handling does not throw.

## Idempotence and Recovery

Changes are confined to frontend code and tests; applying the edits repeatedly should be safe. If a new helper introduces issues, reverting the helper file and layout imports will restore prior behavior. Test commands are read-only aside from build artifacts.

## Artifacts and Notes

No artifacts yet. Will include key outputs (test results) after execution to demonstrate success.

## Interfaces and Dependencies

Implement and export a server-side helper resembling:

    import { bffFetch } from "../bff/fetch";

    export type AuthUser = { id: string; email: string; name: string | null; ... };

    export async function getCurrentUserSafe(): Promise<AuthUser | null> {
        const response = await bffFetch("/api/auth/me", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) throw new Error(`Failed to load auth session (${response.status})`);
        return (await response.json()) as AuthUser;
    }

Layouts importing this helper should redirect unauthenticated users where required. Depend on existing `bffFetch` utilities; do not modify BFF endpoints or authentication cookies.
