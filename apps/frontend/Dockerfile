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
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "const http=require('http');const req=http.request({hostname:'127.0.0.1',port:3000,path:'/health',timeout:2000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.end()"
CMD ["node", "apps/frontend/server.js"]
