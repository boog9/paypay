# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

FROM base AS deps
COPY package.json pnpm-lock.yaml* .npmrc* ./
COPY pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN corepack enable pnpm && pnpm install --recursive --ignore-scripts

FROM deps AS build
COPY . .
RUN corepack enable pnpm \
  && pnpm --filter sdk... build \
  && pnpm --filter frontend... build

FROM base AS runner
USER app
COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/frontend/server.js"]
