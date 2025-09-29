# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /opt/app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --filter bff... --prod --frozen-lockfile

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter bff... build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /opt/app
COPY --from=build /opt/app/apps/bff/dist ./dist
COPY --from=deps /opt/app/node_modules ./node_modules
COPY apps/bff/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
