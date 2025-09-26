# PayPay Monorepo

PayPay is a monorepo housing the Next.js merchant portal, NestJS BFF, and a typed SDK for interacting with the BTCPay Greenfield API.

## Structure
- `apps/frontend` – Next.js 14 App Router frontend with Tailwind CSS and shadcn/ui primitives.
- `apps/bff` – NestJS BFF acting as a secure proxy/orchestrator for BTCPay Server integrations.
- `packages/sdk` – Lightweight typed client for the BTCPay Greenfield API.
- `deploy/docker` – Production-like Docker Compose stack including Caddy, Postgres, and Redis.
- `infra/env` – Environment templates for local and production setups.
- `docs/` – Architecture and privacy references.

## Getting Started
```bash
corepack enable pnpm
pnpm install
pnpm --filter sdk... build
pnpm --filter bff... build
pnpm --filter frontend... dev
```

The Docker setup can be launched with:
```bash
cd deploy/docker
docker compose up -d --build
```

Run database migrations:
```bash
cd apps/bff
pnpm migration:run
```
