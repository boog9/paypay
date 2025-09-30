# syntax=docker/dockerfile:1.7

########################
# Base image with pnpm
########################
FROM node:22-alpine AS base
ARG PNPM_VERSION=9.15.4
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm config set store-dir /pnpm/store
WORKDIR /opt/app

########################
# Fetch dependencies into the store
########################
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/bff/package.json apps/bff/package.json
RUN pnpm fetch --filter ./packages/sdk... --filter ./apps/bff... --frozen-lockfile

########################
# Install dependencies for build using the prefetched store
########################
FROM base AS deps-build
COPY --from=fetch /pnpm/store /pnpm/store
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/bff/package.json apps/bff/package.json
RUN pnpm -r \
  --filter ./packages/sdk... \
  --filter ./apps/bff... \
  install --offline --frozen-lockfile

########################
# Build the packages
########################
FROM deps-build AS build
COPY packages/sdk ./packages/sdk
COPY apps/bff ./apps/bff
RUN pnpm --filter ./packages/sdk... build \
 && pnpm --filter ./apps/bff... build

########################
# Prepare production bundle for the BFF
########################
FROM build AS deploy
RUN pnpm --filter ./apps/bff... --prod deploy /out

########################
# Runtime image
########################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /opt/app
RUN addgroup -S app \
  && adduser -S app -G app \
  && apk add --no-cache dumb-init
USER app
COPY --chown=app:app --from=deploy /out/*/ ./
COPY --chown=app:app --from=build /opt/app/apps/bff/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
