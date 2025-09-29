# PayPay Monorepo

PayPay is a monorepo housing the Next.js merchant portal, NestJS BFF, and a typed SDK for interacting with the BTCPay Greenfield API.

## Structure
- `apps/frontend` – Next.js 15 App Router frontend with Tailwind CSS and shadcn/ui primitives.
- `apps/bff` – NestJS BFF acting as a secure proxy/orchestrator for BTCPay Server integrations.
- `packages/sdk` – Lightweight typed client for the BTCPay Greenfield API.
- `deploy/docker` – Production-ready Docker Compose stack including Caddy, Postgres, and Redis.
- `infra/env` – Environment templates for local and production setups.
- `docs/` – Architecture and privacy references.

## Production (Docker-only)
### Prerequisites
- A host with Docker Engine and the Docker Compose plugin installed.
- Two DNS A/AAAA records pointing at the host: one for the UI (`PAYPAY_DOMAIN`) and one for the API (`PAYPAY_API_DOMAIN`).
- The ability to receive HTTPS traffic on port 443 (Caddy terminates TLS and renews certificates automatically).

### Configuration
1. Copy the environment template and edit it for your deployment:
   ```bash
   cp infra/env/.env.example infra/env/.env
   ```
2. Open `infra/env/.env` and set the required values:
   - `PAYPAY_DOMAIN` / `PAYPAY_API_DOMAIN` – public domains that end-users will visit.
   - `CADDY_ADMIN_EMAIL` – email for ACME certificate management.
  - `NEXT_PUBLIC_BFF_URL` – must be `https://<PAYPAY_API_DOMAIN>` so the frontend CSP allows calls to the BFF.
  - `NEXT_PUBLIC_API_BASE` – defaults to `/api`; adjust only if the BFF is mounted elsewhere behind your proxy.
  - `FRONTEND_ORIGIN` – must be `https://<PAYPAY_DOMAIN>` so the BFF CORS policy matches the UI.
  - `BTCPAY_URL` – base URL of your BTCPay Server instance.
  - `BTCPAY_ADMIN_API_KEY` – server-admin API key used for automated onboarding.
  - `BTCPAY_MASTER_KEY` – base64-encoded 32-byte master key for envelope encryption.
- `BTCPAY_WEBHOOK_URL` – public HTTPS endpoint for webhook deliveries (e.g. `https://$PAYPAY_API_DOMAIN/api/hooks/btcpay`).
  - `BTCPAY_HEALTH_STORE_ID` / `BTCPAY_HEALTH_API_KEY` – optional credentials for the internal BTCPay health probe.
   - `JWT_ACCESS_TOKEN_SECRET` and `JWT_REFRESH_TOKEN_SECRET` – secrets for issuing user tokens.
   - Database/cache settings (`POSTGRES_*`, `REDIS_*`) – defaults work out of the box but can be overridden.
3. From the server, build and start the stack (no Node.js or pnpm required on the host):
   ```bash
   cd deploy/docker
   docker compose up -d --build
   ```

This command builds the frontend and BFF images inside their respective containers and launches five services: Postgres, Redis, the BFF, the frontend, and Caddy. Once running, HTTPS traffic to `https://$PAYPAY_DOMAIN` serves the Next.js UI and `https://$PAYPAY_API_DOMAIN/docs` proxies the BFF Swagger UI via Caddy.

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
  openssl rand -hex 64  # JWT_ACCESS_TOKEN_SECRET
  openssl rand -hex 64  # JWT_REFRESH_TOKEN_SECRET
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
- `FRONTEND_ORIGIN=https://paypay.iddqd.in`
- `NEXT_PUBLIC_BFF_URL=https://api.paypay.iddqd.in`
- `BTCPAY_URL=https://pay.iddqd.in`
- `BTCPAY_ADMIN_API_KEY=<server-admin-api-key>`
- `BTCPAY_MASTER_KEY=<base64-32-byte-master-key>`
- `BTCPAY_WEBHOOK_URL=https://api.paypay.iddqd.in/api/hooks/btcpay`
- `TRUST_PROXY=1`
- `NODE_ENV=production`
- Add them to `deploy/docker/.env` (or your deployment-specific `.env`).

If your edge or proxy strips the `/api` prefix before reaching the BFF, configure `BTCPAY_WEBHOOK_URL` without `/api` and align the routing rules accordingly.

## BTCPay admin API key
- Create a server-admin API key in **BTCPay Server → Server Settings → Access Tokens**.
- Grant only `btcpay.server.canmanageusers`; the BFF provisions stores using temporary user-scoped API keys with `btcpay.store.canmodifystoresettings` and then replaces them with permanent store-scoped keys.
- Tenant-facing API keys are generated per store with the minimal permissions listed in the BTCPay eCommerce Integration Guide. Keys and webhook secrets are envelope encrypted and never exposed to the frontend.

## Operational Checklist
- `curl -I https://api.paypay.iddqd.in/healthz` returns **200**.
- `curl -i https://api.paypay.iddqd.in/api/auth/csrf-token` returns **200** and includes `Set-Cookie: __Host-...; Secure; SameSite=Lax; Path=/`.
