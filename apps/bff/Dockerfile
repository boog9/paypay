# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm fetch

FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline \
  && pnpm -r build \
  && pnpm --filter bff deploy --prod /opt/app

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /opt/app
COPY --from=build /opt/app ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
