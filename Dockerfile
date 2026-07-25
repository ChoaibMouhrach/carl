# syntax=docker/dockerfile:1.7

#SETUP
FROM oven/bun:1.3.5 AS install
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY apps/front/package.json apps/front/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --ignore-scripts


#BUILD
FROM install AS build
WORKDIR /app

COPY . .

RUN bun run check:env
RUN --mount=type=cache,target=/app/.turbo,sharing=locked \
    bun run build


#FINAL
FROM oven/bun:1.3.5-slim AS runtime
WORKDIR /app/apps/server

COPY --from=build /app/.env /app/.env
COPY --from=build /app/apps/server/dist/saas-template /app/apps/server/saas-template
COPY --from=build /app/apps/server/drizzle /app/apps/server/drizzle
COPY --from=build /app/apps/client/dist /app/apps/server/client
COPY --from=build /app/apps/front/out /app/apps/server/front

#RUN
EXPOSE 3000
CMD ["./saas-template"]
