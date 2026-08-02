# syntax=docker/dockerfile:1

# ---- Build stage ----
# node:24-alpine + bun matches the toolchain that produces a correct Nitro
# bundle. (The oven/bun image resolves deps in a layout that drops engine.io's
# `ws` transitive dep from the traced output, crashing the socket server at
# startup — so we stay on node + a pinned bun here.)
FROM node:24-alpine AS build
WORKDIR /app
# .bun-version is the single source for the Bun pin (CI reads the same file).
COPY .bun-version ./
RUN npm install -g bun@$(cat .bun-version)

# Install deps first for layer caching — only re-runs when the lockfile changes.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build the Nitro server bundle.
COPY . .
# .git is dockerignored, so the commit hash for /health comes in as a build arg
# (bun run deploy passes it).
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
# Bundling the generated country/water data needs more heap than the container
# default; 1536 started OOMing as the data grew, then 3584 did too when the
# WPP/pyramid gen files landed (2026-07-29) — the ceiling tracks data growth.
# The `build` script carries the same 5120 so a bare `bun run build` on a laptop
# (Node's own default is ~4 GB, under what the bundle needs) matches deploy.
# Kept here too: this ENV also covers anything else the image runs.
ENV NODE_OPTIONS="--max-old-space-size=5120"
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
