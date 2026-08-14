# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @oynk/shared build
RUN pnpm --filter @oynk/api build
RUN pnpm --filter @oynk/api deploy --prod --legacy /out
RUN mkdir -p /out/dist/db/migrations && cp apps/api/src/db/migrations/*.sql /out/dist/db/migrations/

# ---- runtime stage ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out ./

EXPOSE 4020

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4020/api/health || exit 1

CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
