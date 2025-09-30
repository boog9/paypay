# syntax=docker/dockerfile:1.7
FROM node:22.14.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PNPM_STORE_PATH=/pnpm/store
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /opt/app

FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,target=/pnpm/store \
  pnpm fetch --filter ./packages/sdk... --filter ./apps/bff... --frozen-lockfile

FROM base AS deps-build
COPY --from=fetch /pnpm/store /pnpm/store
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/bff/package.json apps/bff/package.json
RUN pnpm -r \
  --filter ./packages/sdk... \
  --filter ./apps/bff... \
  install --offline --frozen-lockfile

FROM deps-build AS build
COPY packages/sdk ./packages/sdk
COPY apps/bff ./apps/bff
RUN pnpm --filter ./packages/sdk... build \
 && pnpm --filter ./apps/bff... build

FROM build AS deploy
RUN rm -rf /out && mkdir -p /out
RUN pnpm --filter ./apps/bff... --prod \
    --node-linker=hoisted --shamefully-hoist \
    deploy /out

FROM node:22.14.0-alpine AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS="--require reflect-metadata"
WORKDIR /opt/app
RUN addgroup -S app \
  && adduser -S app -G app \
  && apk add --no-cache dumb-init
USER app
COPY --chown=app:app --from=deploy /out/*/ ./
COPY --chown=app:app --from=build /opt/app/apps/bff/dist ./dist
RUN test -d node_modules
RUN RESOLVED=$(node -p "require.resolve('reflect-metadata')") \
  && printf "%s\n" "$RESOLVED" > /opt/app/.resolved-reflect
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
