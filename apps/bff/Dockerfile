# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

FROM base AS deps
COPY package.json pnpm-lock.yaml* .npmrc* ./
COPY pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN corepack enable pnpm && pnpm install --recursive --ignore-scripts

FROM deps AS build
COPY . .
RUN corepack enable pnpm \
  && pnpm --filter sdk... build \
  && pnpm --filter bff... build \
  && pnpm --filter bff deploy --prod /opt/app

FROM base AS runner
USER app
WORKDIR /opt/app
COPY --from=build /opt/app ./
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/main.js"]
