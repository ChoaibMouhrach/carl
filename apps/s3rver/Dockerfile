# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.5-slim
WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY src ./src

EXPOSE 4566
CMD ["bun", "run", "start"]
