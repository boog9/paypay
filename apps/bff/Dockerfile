# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && pnpm config set store-dir /pnpm/store
WORKDIR /opt/app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --filter bff... --prod --frozen-lockfile

FROM base AS build
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter bff... build

FROM base AS runtime
WORKDIR /opt/app
COPY --from=deps /opt/app/node_modules ./node_modules
COPY --from=deps /pnpm/store /pnpm/store
COPY --from=deps /opt/app/package.json ./
COPY --from=deps /opt/app/pnpm-lock.yaml ./
COPY --from=deps /opt/app/pnpm-workspace.yaml ./
COPY --from=deps /opt/app/apps/bff/package.json ./apps/bff/package.json
COPY --from=build /opt/app/apps/bff/dist ./dist
COPY apps/bff/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]
