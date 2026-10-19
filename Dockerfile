# syntax=docker/dockerfile:1.7

#SETUP
FROM oven/bun:1.3.5 AS install
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY apps/e2e/package.json apps/e2e/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --ignore-scripts


#BUILD
# No environment is needed (or baked in) here: every value is read at runtime.
FROM install AS build
WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/app/.turbo,sharing=locked \
    bun run build


#FINAL
FROM oven/bun:1.3.5-slim AS runtime
WORKDIR /app/apps/server

ENV NODE_ENV=production

COPY --from=build /app/apps/server/dist/carl /app/apps/server/carl
COPY --from=build /app/apps/server/drizzle /app/apps/server/drizzle
COPY --from=build /app/apps/client/dist /app/apps/server/client

RUN chown -R bun:bun /app
USER bun

#RUN
# Configuration (database, redis, secrets, URLs...) is provided by the
# platform's environment variables when the container starts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD bun -e 'const res = await fetch("http://localhost:" + process.env.API_PORT + "/health"); process.exit(res.ok ? 0 : 1)'

CMD ["./carl"]
