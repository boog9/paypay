# syntax=docker/dockerfile:1.7
FROM node:22.14.0-alpine AS base
ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm/store
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

# --- deps: install only what BFF needs (включно з workspace-залежностями)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/bff/package.json apps/bff/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm fetch --filter ./apps/bff...
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install -r --filter ./apps/bff... --offline --frozen-lockfile

# --- build + deploy (формуємо самодостатнє дерево без розірваних workspace-лінків)
FROM deps AS build
COPY apps ./apps
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm -w -r --filter ./apps/bff... build \
 && pnpm -w deploy -F ./apps/bff --prod /opt/app

# --- runtime image (мінімум, без dev-залежностей)
FROM node:22.14.0-alpine AS runner
ENV NODE_ENV=production
WORKDIR /opt/app
COPY --from=build /opt/app/ ./
ENV PORT=3000
EXPOSE 3000
# безпечніше не запускати як root
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--require","reflect-metadata","dist/main.js"]
