# PayPay Monorepo

PayPay is a monorepo housing the Next.js merchant portal, NestJS BFF, and a typed SDK for interacting with the BTCPay Greenfield API.

> **BTCPay compatibility:** The stack targets BTCPay Server ≥ 2.x exclusively and interacts with the platform through the Greenfield API v1. Consult your instance's Swagger UI at `/docs` for the canonical schema and available payment method identifiers before wiring new features.

## Prerequisites
- Node.js 22.14.0 (LTS) with Corepack enabled.
- pnpm 9 (managed via Corepack).

## Install
1. `corepack enable`
2. `corepack prepare pnpm@9 --activate`
3. `pnpm install`

### Troubleshooting: ERR_PNPM_OUTDATED_LOCKFILE
This error means `pnpm-lock.yaml` is out of sync with one of the workspace manifests (for example, `apps/frontend/package.json`).

Fix:
1. Update the relevant `package.json` (add or remove `@paypay/sdk`, etc.).
2. From the monorepo root run:
   ```bash
   corepack enable
   corepack prepare pnpm@9 --activate
   pnpm -r install
   ```
3. Commit the refreshed `pnpm-lock.yaml`.

`--frozen-lockfile` is mandatory in Docker and CI. Do not disable it.

## Build
- `pnpm -r build`

## Run
- `pnpm dev` – starts the frontend and BFF in watch mode.
- `pnpm --filter bff build && pnpm --filter bff start:prod` – compile and launch the NestJS gateway locally.
- `pnpm --filter frontend dev` – run only the Next.js UI if you need a focused session.

All public BFF routes are served from the `/api` prefix. For example, `https://api.paypay.iddqd.in/api/auth/csrf` issues a CSRF token, while `https://api.paypay.iddqd.in/auth/csrf` is intentionally rejected with a `404`.

### How to verify authentication (curl)

Use the live HTTPS endpoints to validate the authentication flow end-to-end:

```bash
# CSRF (204 + X-Csrf-Token header)
curl -i -c /tmp/pp_api.txt -b /tmp/pp_api.txt \
  -H "Origin: https://paypay.iddqd.in" \
  "https://api.paypay.iddqd.in/api/auth/csrf" | egrep 'HTTP/|X-Csrf-Token'

# Login (204 + Set-Cookie)
curl -i -c /tmp/pp_api.txt -b /tmp/pp_api.txt \
  -H "Origin: https://paypay.iddqd.in" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <paste-from-response>" \
  -X POST "https://api.paypay.iddqd.in/api/auth/login" \
  --data '{"email":"<email>","password":"<pass>"}'

# Me (200)
curl -i -b /tmp/pp_api.txt \
  -H "Origin: https://paypay.iddqd.in" \
"https://api.paypay.iddqd.in/api/auth/me"
```

These requests mirror what the frontend does with `fetch(..., { credentials: 'include' })`. The BFF must reply with
`Access-Control-Allow-Credentials: true` and an explicit `Access-Control-Allow-Origin` value (never `*`) so browsers can send the
host-only cookies across origins. See https://developer.mozilla.org/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials for
the underlying CORS rules.

## Auth flow (CSRF + Cookie)
The BFF exposes a double-submit CSRF flow so browsers and CLI clients can safely reuse the same cookie jar across requests:

1. **Fetch a CSRF token:** `GET /api/auth/csrf` responds with `204 No Content`, sets the host-only cookie `__Host-pp.csrf.secret`, and exposes the derived token exclusively through the `X-Csrf-Token` response header.
2. **Authenticate:** send the token via the `X-CSRF-Token` header along with the same cookie jar to `POST /api/auth/login`. Successful authentication responds with `204 No Content` and sets the `__Host-pp.access-token` and `__Host-pp.refresh-token` cookies (both `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`).
3. **Session usage:** subsequent calls such as `GET /api/auth/me` rely solely on those cookies (no Bearer header needed). If the access token expires, call `POST /api/auth/refresh` with a fresh CSRF token; the endpoint responds with `204 No Content` after rotating tokens and verifies both the cookie-stored refresh token and the header. Missing or invalid refresh cookies produce a `401` (`Refresh token is required.` / `Refresh token is no longer valid.`), while absent headers trigger a `403 invalid csrf token`.
4. **Logout:** `POST /api/auth/logout` responds with `204 No Content`, clears all auth cookies and requires a valid CSRF token to prevent cross-site logouts.

> The frontend always expects `204 No Content` responses from `/api/auth/login`, `/api/auth/logout`, and `/api/auth/refresh`, and immediately follows a successful login with `GET /api/auth/me` (using only cookies) to hydrate the user session.

The repository ships with a ready-to-run smoke script that performs the full flow against production:

```bash
EMAIL=user@example.com PASS='CorrectHorseBatteryStaple!' \
  deploy/docker/examples/auth-smoke.sh
```

The script stores cookies inside `${WORK:-/tmp/paypay}` so you can inspect the jar and response bodies afterwards.

Playwright-based auth flow tests expect the following environment variables when run via `pnpm --filter frontend test`:

- `PLAYWRIGHT_BFF_URL` – base URL for the BFF (`https://api.paypay.iddqd.in` in production).
- `PLAYWRIGHT_FRONTEND_ORIGIN` – frontend origin used to populate the `Origin` header (e.g. `https://paypay.iddqd.in`).
- `PLAYWRIGHT_AUTH_EMAIL` – merchant portal login used for authentication.
- `PLAYWRIGHT_AUTH_PASSWORD` – matching password for the account above.

## Secrets & Env

PayPay keeps every secret and runtime toggle in a single dotenv file: `infra/env/.env`. The template lives at `infra/env/.env.example`; copy it, fill in the values, and keep the real file out of Git (see `.gitignore`). Do **not** create `deploy/docker/.env` or any other shadow copies—the Docker stack, scripts, and CI tooling all read from `infra/env/.env` directly. The BFF Docker image ignores `.env` files whenever `NODE_ENV=production`; Docker Compose injects `infra/env/.env` through `env_file`, so there are no baked-in fallbacks inside the container.

### Minimum secret requirements

- `COOKIE_SECRET` – at least 32 characters of entropy. Base64-encoded ≥32 bytes is recommended so it can be reused across platforms.
- `CSRF_PEPPER` – Base64-encoded secret (≥32 bytes when decoded) used to HMAC CSRF tokens.
- `JWT_ACCESS_TOKEN_SECRET` – independent secret with ≥32 characters or a Base64 string representing ≥32 bytes.
- `JWT_REFRESH_TOKEN_SECRET` – another distinct secret with ≥32 characters or Base64 ≥32 bytes.
- `BTCPAY_MASTER_KEY` – **must** be Base64-encoded with exactly 32 bytes once decoded (AES-256 DEK wrapper).
- `BTCPAY_API_KEY_PEPPER` – Base64-encoded secret (≥32 bytes) used to pepper hashed bootstrap API keys.

Generate safe values with OpenSSL:

```bash
openssl rand -base64 32  # Suitable for COOKIE/JWT secrets, BTCPAY_MASTER_KEY, BTCPAY_API_KEY_PEPPER
openssl rand -base64 48  # Use for long-lived tokens such as webhook secrets if needed
```

You can also pipe the helper script into the file:

```bash
scripts/gen-secrets.sh >> infra/env/.env
```

### Runtime verification

To confirm that only Docker Compose–provided variables reach the container, inspect the environment at runtime:

```bash
docker compose run --rm --no-deps --entrypoint env bff | egrep 'JWT|COOKIE|BTCPAY|POSTGRES|FRONTEND_ORIGIN|PORT'
docker inspect "$(docker compose ps -q bff)" | jq -r '.[0].Config.Env[]' | egrep 'JWT|COOKIE|BTCPAY|POSTGRES|FRONTEND_ORIGIN|PORT'
```

If you previously built images with placeholder defaults baked into the layers, perform a cold rebuild so Docker drops every cached layer before composing new images:

```bash
cd deploy/docker
docker compose down --remove-orphans
docker rmi ghcr.io/paypay/bff:latest ghcr.io/paypay/frontend:latest 2>/dev/null || true
docker builder prune -af
docker compose build --no-cache bff frontend
docker compose up -d
```

The cache purge ensures the resulting images only contain the values provided via `infra/env/.env`. After the stack restarts, rerun the environment inspection commands above.

Rotate secrets with `openssl rand -base64 32` (48 for webhook secrets and other long-lived tokens), update `infra/env/.env`, and rebuild the stack. Never commit populated dotenv files.

### Bootstrapping Docker Compose

The Docker stack reads the same file via both `env_file` directives and the `--env-file` flag. Start everything with the Compose command so a single dotenv file powers the deployment:

```bash
cd deploy/docker
docker compose --env-file ../../infra/env/.env up -d --build
```

Optional: validate the file before launching the stack:

```bash
cd deploy/docker
./check-required-env.sh ../../infra/env/.env
```

## Health check
- The BFF exposes `GET /health` and `GET /readyz`. After starting locally or via Docker, verify readiness with `curl http://localhost:3000/health`.

### Frontend health endpoint
The frontend ships with a lightweight `GET /health` endpoint to support Docker health probes. It returns `200 OK` with `{ "ok": true }` only if the Next.js process is running, without leaking secrets or touching external services.

Check the endpoint manually inside the container:
```
docker compose exec frontend wget -qO- http://127.0.0.1:3000/health
```
Confirm the container status:
```
docker compose ps
```
The frontend service should report `running (healthy)` once the probe succeeds.

## Structure
- `apps/frontend` – Next.js 15 App Router frontend with Tailwind CSS and shadcn/ui primitives.
- `apps/bff` – NestJS BFF acting as a secure proxy/orchestrator for BTCPay Server integrations.
- Nest/TypeORM requires `reflect-metadata`; in `apps/bff` keep the package under `dependencies` and import it as the first line in `src/scripts/migrate.ts` and `src/main.ts`.
- `packages/sdk` – Lightweight typed client for the BTCPay Greenfield API.
- `deploy/docker` – Production-ready Docker Compose stack including Caddy, Postgres, and Redis.
- `infra/env` – Environment templates for local and production setups.
- `docs/` – Architecture and privacy references.

## Deployment

### Configuration & Secrets

All runtime configuration is delivered via environment variables loaded from `infra/env/.env` (see [Secrets & Env](#secrets--env) for the security policy and generation tips). The `infra/env/.env.example` template documents every supported key.

#### BTCPay integration
- `BTCPAY_SERVER_URL` — e.g. `https://pay.iddqd.in`
- `BTCPAY_ADMIN_API_KEY` — admin API key used by BFF for store provisioning & health checks
- `BTCPAY_WEBHOOK_URL` — public BFF endpoint for BTCPay webhooks, e.g. `https://paypay.iddqd.in/api/hooks/btcpay`
- Optional health probe: `BTCPAY_HEALTH_STORE_ID`, `BTCPAY_HEALTH_API_KEY`
- Wallet wizard operations issue a temporary per-store API key with only `btcpay.store.canmodifystoresettings:<STORE_ID>` permission to persist on-chain configuration and revoke it immediately after a successful save. See the [Greenfield authorization documentation](https://docs.btcpayserver.org/API/Greenfield/v1/#section/Authentication) for background.
- Payment method identifiers follow BTCPay Server ≥ 2.x conventions (`BTC-OnChain`, `BTC-LightningNetwork`, `BTC-LightningLikeLNURLPay`).

##### BTCPay on-chain status smoke test

Validate the lightweight status endpoint using a minimal per-store API key (no `includeConfig` permissions required):

```bash
# On-chain payment method status without includeConfig
curl -sS -H "Authorization: token <STORE_SCOPED_KEY>" \
  "https://<btcpay>/api/v1/stores/<STORE_ID>/payment-methods?paymentMethodId=BTC-OnChain&onlyEnabled=false"
```

#### Domains / Origins
- `PAYPAY_DOMAIN`, `PAYPAY_API_DOMAIN`, `FRONTEND_ORIGIN`, `NEXT_PUBLIC_BFF_URL`
  - `FRONTEND_ORIGIN` is the single source of truth for the browser origin. In production it must point to an HTTPS URL; the BFF will fail fast if the value is missing or uses `http://`.
  - CORS mirrors this setting exactly: requests are accepted only when the `Origin` header matches `FRONTEND_ORIGIN` (or when the header is absent for same-origin calls).

#### Database & SMTP
- Either `DATABASE_URL` or `POSTGRES_*` (host/user/password/db)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`

#### TLS/ACME
- `CADDY_ADMIN_EMAIL` — contact email for certificate issuer

### Environment configuration (single source of truth)
The Compose stack references `infra/env/.env` via `env_file` directives, and the recommended launch command injects the same file at runtime to avoid drift between build-time and runtime environments:

```bash
cd deploy/docker
docker compose --env-file ../../infra/env/.env up -d --build
```

Run `./check-required-env.sh ../../infra/env/.env` inside `deploy/docker` before the Compose command if you want to verify required keys without printing their values.

## Quick start (deploy/docker)

1. `cp infra/env/.env.example infra/env/.env && vi infra/env/.env`
2. `cd deploy/docker`
3. `docker compose --env-file ../../infra/env/.env up -d --build`
4. Validate:
   - `docker compose ps` reports all services as `running (healthy)`
   - `curl http://localhost:3000/health` returns `{"status":"ok"}`
   - `docker compose logs -n 50 caddy` has no "parsing caddyfile tokens for 'email'" error
   - `docker compose exec caddy sh -lc 'caddy validate --config /etc/caddy/Caddyfile && echo OK'`

### Git hooks

Configure the local hooks path to prevent accidentally committing `infra/env/.env`:
```bash
git config core.hooksPath .githooks
```

## Production (Docker-only)
### Prerequisites
- A host with Docker Engine and the Docker Compose plugin installed.
- Two DNS A/AAAA records pointing at the host: one for the UI (`PAYPAY_DOMAIN`) and one for the API (`PAYPAY_API_DOMAIN`).
- The ability to receive HTTPS traffic on port 443 (Caddy terminates TLS and renews certificates automatically).

### Configuration
1. Prepare `infra/env/.env` using the canonical template.
2. Review `infra/env/.env` and ensure domains, BTCPay credentials, JWT secrets, and database settings are correct for your deployment. `BTCPAY_WEBHOOK_URL` should point to the BFF webhook endpoint proxied by Caddy (default: `https://$PAYPAY_API_DOMAIN/api/hooks/btcpay`).

   > ℹ️ `FRONTEND_ORIGIN` is the only knob controlling browser origins. Keeping the value in the env file upholds the [12-factor "Config" principle](https://12factor.net/config) and guarantees a safe CORS posture: in production the BFF only allows requests when `Origin === FRONTEND_ORIGIN` (no wildcards, which is critical when cookies/credentials are involved).
3. From the server, build and start the stack (no Node.js or pnpm required on the host):
   ```bash
   cd deploy/docker
   docker compose --env-file ../../infra/env/.env up -d --build
   ```

4. Run database migrations after every deploy:
   ```bash
   docker compose exec bff sh -lc 'cd apps/bff && node dist/scripts/migrate.js'
   ```

5. Verify the schema inside Postgres:
   ```bash
   docker compose exec postgres psql -U paypay -d paypay -c '\dt'
   docker compose exec postgres psql -U paypay -d paypay -c '\d managed_stores'
   docker compose exec postgres psql -U paypay -d paypay -c '\d idempotency_keys'
   ```

   If any tables or columns are missing, rerun the migrations command above instead of applying manual SQL patches.

This command builds the frontend and BFF images inside their respective containers and launches five services: Postgres, Redis, the BFF, the frontend, and Caddy. Once running, HTTPS traffic to `https://$PAYPAY_DOMAIN` serves the Next.js UI and `https://$PAYPAY_API_DOMAIN/docs` proxies the BFF Swagger UI via Caddy.

Docker Compose sources the runtime environment for all services from `infra/env/.env` via the shared `env_file` directive in `deploy/docker/docker-compose.yml` and the explicit `--env-file ../../infra/env/.env` flag, keeping secrets in a single place.

```bash
# After `docker compose --env-file ../../infra/env/.env up -d --build`
docker compose exec bff bash -lc 'for key in BTCPAY_SERVER_URL BTCPAY_ADMIN_API_KEY BTCPAY_MASTER_KEY BTCPAY_WEBHOOK_URL; do if [[ -n ${!key:-} ]]; then echo "✅ ${key} set"; else echo "❌ ${key} missing"; fi; done'
docker compose exec bff curl -sS http://localhost:3000/health
```

## Troubleshooting

### Troubleshooting: `Module not found: Can't resolve 'axios'` during frontend build
This indicates that `apps/frontend` imports `@paypay/sdk`, which depends on `axios`, but the monorepo dependencies were not installed before the build.

Resolution:
1. Ensure that `packages/sdk/package.json` lists `"axios"` under `dependencies`.
2. Install dependencies for the entire monorepo before building:
   ```bash
   pnpm -r install --frozen-lockfile
   ```
3. For Docker builds, run `pnpm -r install` in the build stage instead of filtering only `apps/frontend`.

- Requests to `https://api.<domain>/auth/*` are not supported; use `https://api.<domain>/api/auth/*` instead so the request reachs the BFF.
- Error: `parsing caddyfile tokens for 'email'`
  - Cause: `CADDY_ADMIN_EMAIL` is missing, empty, or not passed through Docker Compose to the Caddy container.
  - Fix: populate `infra/env/.env`, ensure the `caddy` service lists it under `env_file`, and launch via `docker compose --env-file ../../infra/env/.env up -d --build`.
- Error: `required variable XYZ is missing a value`
  - Cause: Docker Compose enforces required placeholders defined with `${VAR:?message}` in `docker-compose.yml`.
  - Fix: verify the key exists in `infra/env/.env` and that the affected service lists the file under `env_file`; rerun `docker compose --env-file ../../infra/env/.env up -d --build` so Compose receives the correct values.

## Local development (optional)
Local development still uses pnpm workspaces. Install pnpm (via Corepack) and bootstrap dependencies:

```bash
corepack enable pnpm
pnpm install
pnpm dev            # pnpm -r --parallel dev
pnpm build          # pnpm -r build
```

SDK Greenfield types can be regenerated with:

```bash
pnpm --filter sdk gen:api
```

You can also spin up the Docker stack locally with the same production instructions after tailoring `infra/env/.env` to your machine.

## Secrets and Required Variables

### JWT secrets
- Used to sign access and refresh tokens.
- Generate them with:
  ```bash
  openssl rand -base64 32  # JWT_ACCESS_TOKEN_SECRET
  openssl rand -base64 32  # JWT_REFRESH_TOKEN_SECRET
  ```

### Envelope encryption master key
- Used to wrap store-scoped Data Encryption Keys (DEKs) for BTCPay API keys and webhook secrets.
- Must be Base64-encoded with **exactly** 32 bytes once decoded (AES-256 DEK wrapper).
- Generate it with:
  ```bash
  openssl rand -base64 32
  ```
- Set the result as `BTCPAY_MASTER_KEY` in the BFF environment. For longer-lived webhook secrets or idempotency keys, prefer `openssl rand -base64 48` and store them encrypted via the same DEK workflow.

### Mandatory environment variables
- Store canonical values in `infra/env/.env` (single source of truth). Compose loads them via the shared `env_file` directive and the explicit `--env-file ../../infra/env/.env` flag in the launch command, so additional dotenv files are not required.
- Domains and public URLs:
  - `PAYPAY_DOMAIN`, `PAYPAY_API_DOMAIN`
  - `FRONTEND_ORIGIN` (e.g. `https://app.example.com`)
  - `NEXT_PUBLIC_BFF_URL` (e.g. `https://api.example.com`)
  - `NEXT_PUBLIC_BFF_DEV_PROXY_ORIGIN` (optional; only when using a localhost proxy during development)
- BTCPay + auth secrets:
  - `BTCPAY_SERVER_URL`
  - `BTCPAY_ADMIN_API_KEY`
  - `BTCPAY_MASTER_KEY`
  - `BTCPAY_API_KEY_PEPPER`
  - `BTCPAY_WEBHOOK_URL`
  - `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `COOKIE_SECRET`, `CSRF_PEPPER`
- Platform services:
  - `POSTGRES_*` or `DATABASE_URL`
  - `SMTP_*`
- `TRUST_PROXY` (defaults to `loopback`; override if your proxy chain differs)
  - `NODE_ENV=production`

Example production values:

```dotenv
NEXT_PUBLIC_BFF_URL=https://api.paypay.iddqd.in
NODE_ENV=production
```

If your edge or proxy strips the `/api` prefix before reaching the BFF, configure `BTCPAY_WEBHOOK_URL` without `/api` and align the routing rules accordingly. By default, we use `https://$PAYPAY_API_DOMAIN/api/hooks/btcpay`.

## BTCPay admin API key
- Create a server-admin API key in **BTCPay Server → Server Settings → Access Tokens**.
- Grant only `btcpay.server.canmanageusers`; the BFF provisions stores using temporary user-scoped API keys with `btcpay.store.canmodifystoresettings` and then replaces them with permanent store-scoped keys.
- Tenant-facing API keys are generated per store with the minimal permissions listed in the BTCPay eCommerce Integration Guide. Keys and webhook secrets are envelope encrypted and never exposed to the frontend.

## Key lifecycle

### Roles
- **Admin API key** (`BTCPAY_ADMIN_API_KEY`) — stored in the BFF and used exclusively for privileged calls such as issuing bootstrap user keys and store-scoped keys. Every request authenticates with `Authorization: token <BTCPAY_ADMIN_API_KEY>`.
- **Bootstrap user key** — scoped to the merchant's email with the minimal permission `btcpay.store.canmodifystoresettings`. It exists only long enough to create the store (and configure the default rate source); the BFF can revoke it automatically when `REVOKE_BOOTSTRAP_AFTER_CREATE=true`.
- **Store-scoped key** — minted for a single store with the e-commerce permissions (`btcpay.store.cancreateinvoice:<STORE_ID>`, `btcpay.store.canviewinvoices:<STORE_ID>`, `btcpay.store.canmodifyinvoices:<STORE_ID>`, `btcpay.store.canviewstoresettings:<STORE_ID>`, `btcpay.store.webhooks.canmodifywebhooks:<STORE_ID>`). Stored only inside the BFF after envelope encryption and never sent to the UI.

### Flow
1. The BFF calls `POST /api/v1/users/{email}/api-keys` with `Authorization: token <BTCPAY_ADMIN_API_KEY>` to mint a bootstrap key (`label=portal-bootstrap`, permissions `['btcpay.store.canmodifystoresettings']`). The plaintext key is kept in memory just long enough to hash it with `BTCPAY_API_KEY_PEPPER` and persist the metadata in `users`.
2. Using `Authorization: token <bootstrap_key>`, the BFF creates the store via `POST /api/v1/stores` and immediately sets CoinGecko as the default rate source. No plaintext keys are logged.
3. The BFF issues a store-scoped key for the same email with `POST /api/v1/users/{email}/api-keys`, supplying the minimal permission set above. The value is encrypted with a fresh 32-byte DEK (AES-GCM) that is wrapped by `BTCPAY_MASTER_KEY` before persisting `api_key_ciphertext`, `api_key_dek_wrapped`, and `store_key_last_four` in `managed_stores`.

### Rotation & safety
- Need a new key? Issue another store-scoped key, update the ciphertext/last-four in the database, and revoke the old key via the admin API.
- Bootstrap keys are optional after provisioning; when `REVOKE_BOOTSTRAP_AFTER_CREATE=true`, the BFF revokes the temporary key as soon as the store is ready.
- Follow the Greenfield API guidance: always authenticate with `Authorization: token ...`, never expose plaintext keys or secrets in logs, and encrypt webhook secrets with the same envelope pattern.

## Operational Checklist
- `curl -I https://api.paypay.iddqd.in/health` returns **200**.
- `curl -I https://api.paypay.iddqd.in/auth/me` returns **404** (only `/api/*` is routed to the BFF).
- `curl -i https://api.paypay.iddqd.in/api/auth/csrf` returns **204** and includes `Set-Cookie: __Host-...; Secure; SameSite=Lax; Path=/` plus the `X-Csrf-Token` header.
- `curl -I https://paypay.iddqd.in/dashboard` returns **200** and serves the merchant portal shell.
- `curl -I https://paypay.iddqd.in/portal` returns **308/301** with `Location: /dashboard` for legacy clients.

Authoritative BTCPay Server references:

- [API key authorization header format](https://docs.btcpayserver.org/GreenField/v1/#section/Authentication/API-Key-Authorization)
- [Minimal store permissions for e-commerce integrations](https://docs.btcpayserver.org/GreenField/greenfield-ecommerce/)
- [Issue a user API key](https://docs.btcpayserver.org/GreenField/v1/#operation/Users_CreateUserApiKey) and [create a store](https://docs.btcpayserver.org/GreenField/v1/#operation/Stores_CreateStore)

### Автопровізія Store

End-to-end provisioning flow (reuses the authenticated session cookies):

```bash
# 1. CSRF (204 + X-Csrf-Token header)
curl -i -c /tmp/pp_api.txt -b /tmp/pp_api.txt \
  -H "Origin: https://paypay.iddqd.in" \
  "https://api.paypay.iddqd.in/api/auth/csrf" | egrep 'HTTP/|X-Csrf-Token'

# 2. Login (204 + Set-Cookie)
curl -i -c /tmp/pp_api.txt -b /tmp/pp_api.txt \
  -H "Origin: https://paypay.iddqd.in" \
  -H "Content-Type: application/json" \
  -H "X-Csrf-Token: <copy-from-step-1>" \
  -X POST "https://api.paypay.iddqd.in/api/auth/login" \
  --data '{"email":"merchant@example.com","password":"CorrectHorseBatteryStaple!"}'

# 3. Auto-provision the store (201/200 + JSON body)
curl -i -c /tmp/pp_api.txt -b /tmp/pp_api.txt \
  -H "Origin: https://paypay.iddqd.in" \
  -H "Content-Type: application/json" \
  -H "X-Csrf-Token: <copy-from-step-1>" \
  -X POST "https://api.paypay.iddqd.in/api/stores" \
  --data '{"name":"Portal QA","defaultCurrency":"USD"}'
```

Diagnostics:

- `502 Bad Gateway` → confirm BTCPay Server is reachable and the BFF holds a valid admin API key.
- `401 Unauthorized` now only means the session is missing (login cookies or CSRF token); bootstrap issuance is automatic.
