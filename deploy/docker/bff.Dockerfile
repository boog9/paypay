# syntax=docker/dockerfile:1.6

########################
# Base with pnpm
########################
FROM node:22-alpine AS base
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /work

# Copy manifests so pnpm can resolve the graph
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bff/package.json apps/bff/
COPY packages/sdk/package.json packages/sdk/

########################
# Fetch (lockfile cache)
########################
FROM base AS fetch
# Pull everything (dev+prod) for compilation
RUN pnpm fetch --frozen-lockfile

########################
# Deps for build (dev+prod)
########################
FROM fetch AS deps-build
COPY . .
# Install only required workspaces (BFF and SDK) with dev+prod deps
RUN pnpm -r \
  --filter ./packages/sdk... \
  --filter ./apps/bff... \
  install --offline --frozen-lockfile

########################
# Build BFF
########################
FROM deps-build AS build
RUN pnpm --filter ./apps/bff... build

########################
# Prod deps only (prune)
########################
FROM base AS deps-prod
# Fetch prod deps separately to keep runtime lean
RUN pnpm fetch --prod --frozen-lockfile
COPY . .
RUN pnpm -r \
  --filter ./packages/sdk... \
  --filter ./apps/bff... \
  install --offline --prod --frozen-lockfile

########################
# Runtime
########################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /opt/app

# Hardened runtime user
RUN addgroup -S app && adduser -S app -G app
USER app

# Prod dependencies and build artefacts
COPY --chown=app:app --from=deps-prod /work/apps/bff/node_modules ./node_modules
COPY --chown=app:app --from=build     /work/apps/bff/dist         ./dist
COPY --chown=app:app --from=deps-prod /work/apps/bff/package.json ./package.json

# Early failure if reflect-metadata is missing
RUN node -e "require('reflect-metadata'); console.log('reflect-metadata present')"

# Healthcheck keeps consistent with internal expectations
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

CMD ["node","dist/main.js"]
