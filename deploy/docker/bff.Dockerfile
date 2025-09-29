# syntax=docker/dockerfile:1.6

########################
# Base with pnpm
########################
FROM node:22-alpine AS base
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /work

########################
# Fetch (prepare lock + store)
########################
FROM base AS fetch
# copy just the manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bff/package.json apps/bff/
COPY packages/sdk/package.json packages/sdk/
# 1) refresh lockfile with current manifests
RUN pnpm -w --filter ./packages/sdk... --filter ./apps/bff... install --lockfile-only
# 2) prefetch to store (no node_modules yet)
RUN pnpm fetch --frozen-lockfile

########################
# Deps for build (dev+prod)
########################
FROM fetch AS deps-build
# now copy the whole repo
COPY . .
# ensure we use the refreshed lockfile from fetch
COPY --from=fetch /work/pnpm-lock.yaml pnpm-lock.yaml
# install dev+prod deps only for sdk + bff workspaces (offline)
RUN pnpm -r \
  --filter ./packages/sdk... \
  --filter ./apps/bff... \
  install --offline --frozen-lockfile

########################
# Build SDK then BFF
########################
FROM deps-build AS build
RUN pnpm --filter ./packages/sdk... build \
 && pnpm --filter ./apps/bff... build

########################
# Prod deps bundle (self-contained)
########################
FROM fetch AS deps-prod
# prod store only
RUN pnpm fetch --prod --frozen-lockfile
# bring compiled artefacts so deploy packages built output where needed
COPY --from=build /work/packages/sdk/dist packages/sdk/dist
COPY --from=build /work/apps/bff/dist apps/bff/dist
# produce a deployable package for BFF (+ its deps) into /out/<name>
RUN pnpm --filter ./apps/bff... --prod deploy /out

########################
# Runtime
########################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /opt/app

# non-root
RUN addgroup -S app && adduser -S app -G app
USER app

# copy packaged prod deps and compiled dist
COPY --chown=app:app --from=deps-prod /out/bff/ ./
COPY --chown=app:app --from=build     /work/apps/bff/dist ./dist

# early fail if reflect-metadata is missing
RUN node -e "require('reflect-metadata'); console.log('reflect-metadata present')"

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

CMD ["node","dist/main.js"]
