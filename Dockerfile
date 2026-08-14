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
# default, and the ceiling has moved BOTH ways as the tree changed: 1536, then
# 3584, then 5120, then back down to 3072 — and now up again to 3584.
#
# The history matters, because the two failures look alike and want opposite
# fixes:
#
# 1. SIGKILL/139 (2026-08) — the kernel's OOM killer at "Building Nuxt Nitro
#    server". The process was NOT exceeding its budget; the builder ran out of
#    RAM underneath it. V8 only collects in earnest as it nears ITS OWN limit,
#    so a 5 GB budget on a 4 GB builder is an instruction to hoard garbage
#    until the kernel intervenes. That one was fixed by LOWERING to 3072.
#
# 2. V8's own "Ineffective mark-compacts near heap limit" (2026-08-14) — the
#    failure this value now answers. Ten consecutive deploys died here and
#    production sat 18 commits stale. This is the opposite case: the process
#    really did exhaust its own budget, and only raising it helps.
#
# Tell them apart by the error text, not by the symptom. Exit 139 with no V8
# message is the kernel; "FATAL ERROR: ... heap out of memory" is V8.
#
# Measured on this tree, peak RSS across the whole build process tree, with the
# cap passed straight to `nuxt build` (see the note on package.json below):
#   3072 → OOM at 4611 MB   ← the old value; fails outright
#   3328 → 4739 MB, exit 0  ← passes, but only 256 MB clear of the cliff
#   3584 → 4943 MB, exit 0  ← chosen
#   4096 → 4843 MB, exit 0
#   5120 → 5180 MB, exit 0
#
# Note what the numbers say: peak RSS runs ~1.4 GB ABOVE the JS heap cap. That
# gap is everything outside V8's heap — source text held by rollup, esbuild's
# own memory, sourcemaps — and it is why "4.5 MB of SVG" costs gigabytes. The
# 24 MB of TS/Vue source is transformed, held as module graph, chunked, and
# sourcemapped, several representations live at once.
#
# The builder is Depot (16 GB), not the 4 GB machine the 2026-08 note assumed,
# so 3584 is not close to any kernel limit. If this fails again as SIGKILL
# rather than a V8 message, the answer is to shrink the data, not to raise
# this.
#
# The `build` script in package.json SETS NODE_OPTIONS ITSELF, so it overrides
# whatever the caller exports — `NODE_OPTIONS=6144 bun run build` silently
# still runs at the script's value. Keep the two numbers identical, and when
# measuring a new ceiling call `npx nuxt build` directly or the experiment
# measures nothing.
ENV NODE_OPTIONS="--max-old-space-size=3584"
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
