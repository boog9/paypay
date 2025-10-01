# syntax=docker/dockerfile:1.7
FROM node:22.14.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm fetch --filter ./apps/frontend...

FROM deps AS build
COPY . .
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm install --offline --frozen-lockfile --filter ./apps/frontend...
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
