# syntax=docker/dockerfile:1.7
FROM node:22.14.0-alpine AS base
ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm/store
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,target=/pnpm/store \
  pnpm -w install --frozen-lockfile
RUN pnpm -w -r --filter @paypay/bff... build
RUN pnpm -w deploy -F @paypay/bff --prod /opt/app
RUN test -d /opt/app/node_modules
RUN test -f /opt/app/dist/main.js
RUN cd /opt/app && node -e "require.resolve('reflect-metadata')"

FROM node:22.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /opt/app
RUN addgroup -S app \
  && adduser -S app -G app \
  && apk add --no-cache dumb-init
USER app
COPY --chown=app:app --from=build /opt/app/ ./
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "process.exit(0)"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
