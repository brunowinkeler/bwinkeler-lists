# syntax=docker/dockerfile:1

FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
# The workspace lockfile installs every workspace's dependencies (including the
# backend's native argon2), so build tools are needed here too.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY shared ./shared
COPY frontend ./frontend
RUN npm run build -w @bwinkeler-lists/shared \
  && npm run build -w @bwinkeler-lists/frontend

FROM caddy:2-alpine AS runtime
COPY frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
