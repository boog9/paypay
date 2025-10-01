# syntax=docker/dockerfile:1.7
FROM node:22.14.0-alpine AS base
ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm/store
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm fetch \
      --filter ./packages/sdk... \
      --filter ./apps/bff...
COPY . .
## Ensure dependencies for the SDK and BFF are installed prior to building
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm install --offline --frozen-lockfile \
      --filter ./packages/sdk... \
      --filter ./apps/bff...
RUN pnpm --filter @paypay/sdk build
RUN pnpm --filter ./apps/bff... build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /workspace
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/sdk/package.json packages/sdk/package.json
# Ensure runtime dependencies for the BFF and SDK are cached for offline installs
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm fetch --prod \
      --filter ./apps/bff... \
      --filter @paypay/sdk
COPY --from=build /workspace/apps/bff/dist ./apps/bff/dist
COPY --from=build /workspace/apps/bff/package.json ./apps/bff/package.json
COPY --from=build /workspace/apps/bff/nest-cli.json ./apps/bff/nest-cli.json
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/bff/docker-entrypoint.sh /usr/local/bin/bff-entrypoint.sh
RUN chmod +x /usr/local/bin/bff-entrypoint.sh
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm install \
      --offline --prod --frozen-lockfile --filter ./apps/bff...
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD \
  node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["bff-entrypoint.sh"]
