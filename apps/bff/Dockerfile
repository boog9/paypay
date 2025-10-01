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
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm fetch --filter ./packages/sdk...
RUN pnpm fetch --filter ./apps/bff...
RUN pnpm fetch --prod --filter ./apps/bff...
COPY . .
## Ensure dependencies for the SDK and BFF are installed prior to building
RUN pnpm install --offline --frozen-lockfile \
      --filter ./packages/sdk... \
      --filter ./apps/bff...
RUN pnpm --filter ./packages/sdk... build
RUN pnpm --filter ./apps/bff... build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /workspace
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm fetch --prod --filter ./apps/bff...
COPY --from=build /workspace/apps/bff/dist ./apps/bff/dist
COPY --from=build /workspace/apps/bff/package.json ./apps/bff/package.json
COPY --from=build /workspace/apps/bff/nest-cli.json ./apps/bff/nest-cli.json
COPY --from=build /workspace/packages ./packages
RUN pnpm install --offline --prod --filter ./apps/bff... --frozen-lockfile
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD \
  node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node","apps/bff/dist/main.js"]
