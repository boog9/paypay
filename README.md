# PayPay Monorepo

PayPay is a monorepo housing the Next.js merchant portal, NestJS BFF, and a typed SDK for interacting with the BTCPay Greenfield API.

## Structure
- `apps/frontend` – Next.js 15 App Router frontend with Tailwind CSS and shadcn/ui primitives.
- `apps/bff` – NestJS BFF acting as a secure proxy/orchestrator for BTCPay Server integrations.
- `packages/sdk` – Lightweight typed client for the BTCPay Greenfield API.
- `deploy/docker` – Production-ready Docker Compose stack including Caddy, Postgres, and Redis.
- `infra/env` – Environment templates for local and production setups.
- `docs/` – Architecture and privacy references.

## Environment layout

The stack uses two complementary dotenv files:

### 1. `deploy/docker/.env` (public Compose variables)
- Loaded automatically by `docker compose` for variable substitution.
- Safe to commit with example values; contains only public data such as domains and browser-facing URLs.
- Populate it from the template:
  ```bash
  cp deploy/docker/.env.example deploy/docker/.env
  ```
- Required keys:
  - `PAYPAY_DOMAIN`, `PAYPAY_API_DOMAIN`
  - `NEXT_PUBLIC_BFF_URL`, `NEXT_PUBLIC_API_BASE`
  - `FRONTEND_ORIGIN`
  - `CADDY_ADMIN_EMAIL`
  - Keep these values in sync with the corresponding entries in `infra/env/.env`.

### 2. `infra/env/.env` (secrets + runtime configuration)
- **Single source of truth** for private configuration shared across services.
- Mounted into containers via the `env_file` directive in `deploy/docker/docker-compose.yml`.
- Create it from the example and keep it out of Git:
  ```bash
  cp infra/env/.env.example infra/env/.env
  ```
- Fill every value before production. Leave optional entries blank if you do not use that integration.
- Public values such as `FRONTEND_ORIGIN` and `NEXT_PUBLIC_*` should match the contents of `deploy/docker/.env` so Compose
  validation and runtime configuration stay aligned.

### Generating sensitive values
- JWT signing keys (used by the BFF):
  ```bash
  openssl rand -hex 32  # JWT_ACCESS_TOKEN_SECRET
  openssl rand -hex 32  # JWT_REFRESH_TOKEN_SECRET
  ```
- BTCPay envelope master key (used to wrap store secrets):
  ```bash
  openssl rand -base64 32  # BTCPAY_MASTER_KEY
  ```

## Configuration (Docker/Caddy)

- **CADDY_ADMIN_EMAIL** (Required) – Used by the Caddy global options block to register the ACME account and receive renewal
  notices. Caddy fails to start when the value is missing.
- Set the value in `deploy/docker/.env`; Docker Compose passes it through to the Caddy container.
- Security: never commit the real `infra/env/.env` file. Keep production secrets outside of version control and distribute them
  via your secret management workflow.
- Note: Docker Compose V2 no longer requires a top-level `version` field; removing it silences the deprecation warning.

## Quick start (deploy/docker)

1. `cp deploy/docker/.env.example deploy/docker/.env && vi deploy/docker/.env`
2. `cp infra/env/.env.example infra/env/.env && vi infra/env/.env`
3. `cd deploy/docker`
4. `docker compose up -d --build`
5. Validate:
   - `docker compose logs -n 50 caddy` has no "parsing caddyfile tokens for 'email'" error
   - `docker compose exec caddy sh -lc 'caddy validate --config /etc/caddy/Caddyfile && echo OK'`

## Production (Docker-only)
### Prerequisites
- A host with Docker Engine and the Docker Compose plugin installed.
- Two DNS A/AAAA records pointing at the host: one for the UI (`PAYPAY_DOMAIN`) and one for the API (`PAYPAY_API_DOMAIN`).
- The ability to receive HTTPS traffic on port 443 (Caddy terminates TLS and renews certificates automatically).

### Configuration
1. Prepare `deploy/docker/.env` and `infra/env/.env` using the templates described above.
2. Review `infra/env/.env` and ensure domains, BTCPay credentials, JWT secrets, and database settings are correct for your deployment. `BTCPAY_WEBHOOK_URL` should point to the BFF webhook endpoint proxied by Caddy (default: `https://$PAYPAY_API_DOMAIN/api/hooks/btcpay`).
3. From the server, build and start the stack (no Node.js or pnpm required on the host):
   ```bash
   cd deploy/docker
   docker compose up -d --build
   ```

This command builds the frontend and BFF images inside their respective containers and launches five services: Postgres, Redis, the BFF, the frontend, and Caddy. Once running, HTTPS traffic to `https://$PAYPAY_DOMAIN` serves the Next.js UI and `https://$PAYPAY_API_DOMAIN/docs` proxies the BFF Swagger UI via Caddy.

Docker Compose sources the runtime environment for all services from `infra/env/.env` via the shared `env_file` directive in `deploy/docker/docker-compose.yml`, keeping secrets in a single place.

```bash
# After `docker compose up -d --build`
docker compose exec bff env | egrep 'BTCPAY_(SERVER_URL|ADMIN_API_KEY|MASTER_KEY|WEBHOOK_URL)'
docker compose exec bff curl -sS http://localhost:3000/health
```

## Troubleshooting

- Error: `parsing caddyfile tokens for 'email'`
  - Cause: `CADDY_ADMIN_EMAIL` is missing, empty, or not passed through Docker Compose to the Caddy container.
  - Fix: populate `deploy/docker/.env` and ensure the `caddy` service includes the `.env` file and `environment` entry in
    `deploy/docker/docker-compose.yml`.
- Error: `required variable XYZ is missing a value`
  - Cause: Docker Compose enforces required placeholders defined with `${VAR:?message}` in `docker-compose.yml`.
  - Fix: verify the key exists in the appropriate dotenv file (`deploy/docker/.env` for public values, `infra/env/.env` for
    secrets) and that the affected service lists the file under `env_file`.

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
- Public (place in `deploy/docker/.env`):
  - `PAYPAY_DOMAIN`, `PAYPAY_API_DOMAIN`
  - `FRONTEND_ORIGIN`
  - `NEXT_PUBLIC_BFF_URL`, `NEXT_PUBLIC_API_BASE`
- Private (place in `infra/env/.env`):
  - `BTCPAY_SERVER_URL`
  - `BTCPAY_ADMIN_API_KEY`
  - `BTCPAY_MASTER_KEY`
  - `BTCPAY_WEBHOOK_URL`
  - `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`
  - `POSTGRES_*` or `DATABASE_URL`
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
