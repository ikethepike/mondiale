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
# default, and the ceiling climbed with the data: 1536, then 3584, then 5120.
# It then went the OTHER WAY, which is the counterintuitive part — 5120 was
# itself the cause of the intermittent deploy failures.
#
# The kill was SIGKILL/139 (the kernel's OOM killer) at "Building Nuxt Nitro
# server", never V8's own "heap out of memory": the process was not exceeding
# its budget, the builder was running out of RAM underneath it. V8 only
# collects in earnest as it approaches ITS OWN limit, so a 5 GB budget on a
# smaller builder is an instruction to hoard garbage until the kernel
# intervenes. Prerendering makes it worse — that stage runs the app in-process
# and its heap is still resident when rollup starts (measured: it lifts the
# Nitro peak by ~700 MB), which is exactly the garbage a lower ceiling forces
# V8 to reclaim.
#
# Measured on this tree (peak RSS across the whole build process tree):
#   5120 → 4677 MB, 160s   ← was killed on ~3% of deploys
#   4096 → 4109 MB, 147s
#   3072 → 3519 MB, 157s   ← chosen: fits a 4 GB builder, no slower
#   2048 → real heap OOM, so the live working set is between 2 and 3 GB
# Raising this number cannot fix a SIGKILL. Lower it, or shrink the data.
# The `build` script carries the same value so a bare `bun run build` on a
# laptop matches deploy. Kept here too: this ENV also covers anything else the
# image runs.
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN bun run build

# ---- Runtime stage ----
# Nitro bundles all deps into .output/server, so the runtime needs only Node —
# no bun, no node_modules install.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Without a cap V8 sizes its heap off total machine memory, so RSS expands
# into whatever we provision (144MB on a 256MB machine became 194MB on 512MB
# with no feature change — issue #110). 256MB bounds the heap well under the
# 512MB machine while leaving room for code, sockets and the OS; live heap
# under load measured ~50MB, so the cap is generous, not tight.
ENV NODE_OPTIONS="--max-old-space-size=256"

# Run as the built-in unprivileged node user.
COPY --from=build --chown=node:node /app/.output ./.output
USER node

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
