# syntax=docker/dockerfile:1.7
FROM node:22.14.0-alpine AS base
ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm/store
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /workspace

FROM base AS build
ARG NEXT_PUBLIC_BFF_URL
ENV NEXT_PUBLIC_BFF_URL=$NEXT_PUBLIC_BFF_URL
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm fetch --filter ./packages/sdk... --filter ./apps/frontend...
COPY . .
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --offline --frozen-lockfile \
  --filter ./packages/sdk... --filter ./apps/frontend...
RUN pnpm --filter @paypay/sdk build
RUN pnpm --filter ./apps/frontend... build

FROM node:22.14.0-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /workspace/apps/frontend/.next/standalone ./
COPY --from=build /workspace/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /workspace/apps/frontend/public ./apps/frontend/public
USER node
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --retries=12 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health',{cache:'no-store'}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/frontend/server.js"]
