# syntax=docker/dockerfile:1

FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
# argon2 is a native addon; build tools cover platforms without a prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
RUN npm ci
COPY shared ./shared
COPY backend ./backend
RUN npm run build -w @bwinkeler-lists/shared \
  && npm run build -w @bwinkeler-lists/backend \
  && cp -r backend/src/db/migrations backend/dist/db/migrations \
  && npm prune --omit=dev

FROM node:22.14.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/shared/package.json ./shared/package.json
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
USER node
WORKDIR /app/backend
EXPOSE 8080
CMD ["node", "dist/server.js"]
