# PayPay Monorepo

PayPay is a monorepo housing the Next.js merchant portal, NestJS BFF, and a typed SDK for interacting with the BTCPay Greenfield API.

## Structure
- `apps/frontend` – Next.js 15 App Router frontend with Tailwind CSS and shadcn/ui primitives.
- `apps/bff` – NestJS BFF acting as a secure proxy/orchestrator for BTCPay Server integrations.
- `packages/sdk` – Lightweight typed client for the BTCPay Greenfield API.
- `deploy/docker` – Production-like Docker Compose stack including Caddy, Postgres, and Redis.
- `infra/env` – Environment templates for local and production setups.
- `docs/` – Architecture and privacy references.

## Environment
Environment templates live in `infra/env`. Copy them into workspace-specific files before running the stack:

```bash
# Frontend (Next.js)
cp infra/env/.env.frontend.example apps/frontend/.env.local

# BFF (NestJS)
cp infra/env/.env.bff.example apps/bff/.env

# SDK scripts or local tooling
cp infra/env/.env.sdk.example packages/sdk/.env
```

For Docker Compose deployments copy the templates to `.env.frontend` and `.env.bff` in `infra/env/` so that `docker compose` can load them via `env_file`.

## Getting Started
```bash
corepack enable pnpm
pnpm install
pnpm dev            # pnpm -r --parallel dev
pnpm build          # pnpm -r build
```

Generate Greenfield types:

```bash
pnpm --filter sdk gen:api
```

The Docker setup can be launched with:
```bash
cd deploy/docker
docker compose up -d --build
```

Health probes are exposed at `https://localhost/healthz` and invoice creation is proxied via `https://localhost/api/invoices`.
