# syntax=docker/dockerfile:1

# ---- Build stage ----
# node:24-alpine + bun matches the toolchain that produces a correct Nitro
# bundle. (The oven/bun image resolves deps in a layout that drops engine.io's
# `ws` transitive dep from the traced output, crashing the socket server at
# startup — so we stay on node + a pinned bun here.)
FROM node:24-alpine AS build
RUN npm install -g bun@1.3.10
WORKDIR /app

# Install deps first for layer caching — only re-runs when the lockfile changes.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build the Nitro server bundle.
COPY . .
# Bundling the generated country/water data needs more heap than the container
# default; 1536 started OOMing as the data grew, so give the Nitro build room.
ENV NODE_OPTIONS="--max-old-space-size=3584"
RUN bun run build

# ---- Runtime stage ----
# Nitro bundles all deps into .output/server, so the runtime needs only Node —
# no bun, no node_modules install.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Run as the built-in unprivileged node user.
COPY --from=build --chown=node:node /app/.output ./.output
USER node

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
