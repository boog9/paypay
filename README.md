# PayPay Monorepo

PayPay is a monorepo housing the Next.js merchant portal, NestJS BFF, and a typed SDK for interacting with the BTCPay Greenfield API.

## Prerequisites
- Node.js 22.14.0 (LTS) with Corepack enabled.
- pnpm 9 (managed via Corepack).

## Install
1. `corepack enable`
2. `corepack prepare pnpm@9 --activate`
3. `pnpm install`

## Build
- `pnpm -r build`

## Run
- `pnpm dev` – starts the frontend and BFF in watch mode.
- `pnpm --filter bff build && pnpm --filter bff start:prod` – compile and launch the NestJS gateway locally.
- `pnpm --filter frontend dev` – run only the Next.js UI if you need a focused session.

### One source of truth for env
Use `infra/env/.env` (private). Do not create `deploy/docker/.env`.
Template: `infra/env/.env.example`.

Run:
```bash
cd deploy/docker
./check-required-env.sh ../../infra/env/.env
docker compose --env-file ../../infra/env/.env up -d --build
```

## Health check
- The BFF exposes `GET /health` and `GET /readyz`. After starting locally or via Docker, verify readiness with `curl http://localhost:3000/health`.

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

All runtime configuration is provided via environment variables. Use a single canonical file at `infra/env/.env` (do **not** commit real secrets). An example template is at `infra/env/.env.example`.

#### Critical secrets
- `COOKIE_SECRET` — HMAC key for signed HttpOnly cookies (anti-tampering for CSRF/refresh cookies). **Min 32 bytes entropy** (recommend Base64-encoded 32 random bytes).
- `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET` — JWT signing secrets; must be different from `COOKIE_SECRET`.

Generate strong secrets (any method below is OK):
```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# or use the helper script:
scripts/gen-secrets.sh >> infra/env/.env
```

#### BTCPay integration
- `BTCPAY_SERVER_URL` — e.g. `https://pay.iddqd.in`
- `BTCPAY_ADMIN_API_KEY` — admin API key used by BFF for store provisioning & health checks
- `BTCPAY_WEBHOOK_URL` — public BFF endpoint for BTCPay webhooks, e.g. `https://api.paypay.iddqd.in/api/hooks/btcpay`
- Optional health probe: `BTCPAY_HEALTH_STORE_ID`, `BTCPAY_HEALTH_API_KEY`

#### Domains / Origins
- `PAYPAY_DOMAIN`, `PAYPAY_API_DOMAIN`, `FRONTEND_ORIGIN`, `NEXT_PUBLIC_BFF_URL`, `NEXT_PUBLIC_API_BASE`

#### Database & SMTP
- Either `DATABASE_URL` or `POSTGRES_*` (host/user/password/db)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`

#### TLS/ACME
- `CADDY_ADMIN_EMAIL` — contact email for certificate issuer

### Environment configuration (single source of truth)
Use `infra/env/.env` as the **only** source of truth for environment variables. Commit only `infra/env/.env.example` with placeholders.

Run Docker Compose with this file for interpolation and runtime injection:
```bash
cd deploy/docker
./check-required-env.sh ../../infra/env/.env
docker compose --env-file ../../infra/env/.env up -d --build
```
Each service also declares:
```yaml
env_file:
  - ../../infra/env/.env
```
so that containers receive the same values at runtime.

**Required keys** (non-exhaustive): `NEXT_PUBLIC_BFF_URL`, `NEXT_PUBLIC_API_BASE`, `CADDY_ADMIN_EMAIL`, `COOKIE_SECRET`, `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `BTCPAY_SERVER_URL`, `BTCPAY_ADMIN_API_KEY`, `BTCPAY_WEBHOOK_URL`.

Check before bringing the stack up with the helper script:
```bash
cd deploy/docker
./check-required-env.sh ../../infra/env/.env
docker compose --env-file ../../infra/env/.env up -d --build
```

## Quick start (deploy/docker)

1. `cp infra/env/.env.example infra/env/.env && vi infra/env/.env`
2. `cd deploy/docker`
3. `./check-required-env.sh ../../infra/env/.env`
4. `docker compose --env-file ../../infra/env/.env up -d --build`
5. Validate:
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
3. From the server, build and start the stack (no Node.js or pnpm required on the host):
   ```bash
   cd deploy/docker
   ./check-required-env.sh ../../infra/env/.env
   docker compose --env-file ../../infra/env/.env up -d --build
   ```

This command builds the frontend and BFF images inside their respective containers and launches five services: Postgres, Redis, the BFF, the frontend, and Caddy. Once running, HTTPS traffic to `https://$PAYPAY_DOMAIN` serves the Next.js UI and `https://$PAYPAY_API_DOMAIN/docs` proxies the BFF Swagger UI via Caddy.

Docker Compose sources the runtime environment for all services from `infra/env/.env` via the shared `env_file` directive in `deploy/docker/docker-compose.yml` and the `--env-file` flag, keeping secrets in a single place.

```bash
# After `docker compose up -d --build`
docker compose exec bff env | egrep 'BTCPAY_(SERVER_URL|ADMIN_API_KEY|MASTER_KEY|WEBHOOK_URL)'
docker compose exec bff curl -sS http://localhost:3000/health
```

## Troubleshooting

- Error: `parsing caddyfile tokens for 'email'`
  - Cause: `CADDY_ADMIN_EMAIL` is missing, empty, or not passed through Docker Compose to the Caddy container.
  - Fix: populate `infra/env/.env`, ensure the `caddy` service lists it under `env_file`, and invoke Compose with `--env-file ../../infra/env/.env`.
- Error: `required variable XYZ is missing a value`
  - Cause: Docker Compose enforces required placeholders defined with `${VAR:?message}` in `docker-compose.yml`.
  - Fix: verify the key exists in `infra/env/.env` and that the affected service lists the file under `env_file` while Compose is invoked with `--env-file ../../infra/env/.env`.

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
  openssl rand -hex 32  # JWT_ACCESS_TOKEN_SECRET
  openssl rand -hex 32  # JWT_REFRESH_TOKEN_SECRET
  ```

### Envelope encryption master key
- Used to wrap store-scoped Data Encryption Keys (DEKs) for BTCPay API keys and webhook secrets.
- Must be a 256-bit value encoded in base64.
- Generate it with:
  ```bash
  openssl rand -base64 32
  ```
- Set the result as `BTCPAY_MASTER_KEY` in the BFF environment.

### Mandatory environment variables
- Store canonical values in `infra/env/.env` (single source of truth). Compose loads them via the shared `env_file` directive and the `--env-file` flag, so additional dotenv files are not required.
- Domains and public URLs:
  - `PAYPAY_DOMAIN`, `PAYPAY_API_DOMAIN`
  - `FRONTEND_ORIGIN` (e.g. `https://app.example.com`)
  - `NEXT_PUBLIC_BFF_URL` (e.g. `https://api.example.com`), `NEXT_PUBLIC_API_BASE` (e.g. `https://api.example.com/api`)
- BTCPay + auth secrets:
  - `BTCPAY_SERVER_URL`
  - `BTCPAY_ADMIN_API_KEY`
  - `BTCPAY_MASTER_KEY`
  - `BTCPAY_WEBHOOK_URL`
  - `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `COOKIE_SECRET`
- Platform services:
  - `POSTGRES_*` or `DATABASE_URL`
  - `SMTP_*`
  - `TRUST_PROXY` (override if your proxy chain differs)
  - `NODE_ENV=production`

If your edge or proxy strips the `/api` prefix before reaching the BFF, configure `BTCPAY_WEBHOOK_URL` without `/api` and align the routing rules accordingly. By default, we use `https://$PAYPAY_API_DOMAIN/api/hooks/btcpay`.

## BTCPay admin API key
- Create a server-admin API key in **BTCPay Server → Server Settings → Access Tokens**.
- Grant only `btcpay.server.canmanageusers`; the BFF provisions stores using temporary user-scoped API keys with `btcpay.store.canmodifystoresettings` and then replaces them with permanent store-scoped keys.
- Tenant-facing API keys are generated per store with the minimal permissions listed in the BTCPay eCommerce Integration Guide. Keys and webhook secrets are envelope encrypted and never exposed to the frontend.

## Operational Checklist
- `curl -I https://api.paypay.iddqd.in/healthz` returns **200**.
- `curl -i https://api.paypay.iddqd.in/api/auth/csrf-token` returns **200** and includes `Set-Cookie: __Host-...; Secure; SameSite=Lax; Path=/`.
