---
name: verify
description: Build, launch and drive this app to observe a change working at its surface.
---

# Verifying changes in mondiale

## Build & launch

```bash
bun install --frozen-lockfile
bun run build
REDIS_PASSWORD=dev PORT=3000 node .output/server/index.mjs &
```

- The socket middleware only needs *a* redis token to boot (`REDIS_PASSWORD=dev`
  works); Upstash is only actually called on multiplayer game events
  (`redis.set/get/expire` in `lib/events/server-side.ts`).
- After a rebuild, KILL the old server first — a stale process on :3000 serves
  old HTML pointing at deleted `_nuxt` chunks (blank page, ENOENT in the log).

## Surfaces

- `/test-views` — dev harness for challenge/step Views: pick a scenario from the
  select, the stub socket prints every emitted event into `.submission`
  (truncated JSON) — the way to inspect client→server payloads without a room.
  Add missing scenarios in `pages/test-views.vue`.
- `/test-recognition`, `/test-pin-landmark` — sibling harnesses.
- Full multiplayer flow needs real Upstash credentials and two browser
  contexts (see `e2e/start-round.spec.ts`); `FORCE_INDIVIDUAL_VARIANT=<variant>`
  forces every gate to one variant.

## Driving

Playwright: browsers live at `/opt/pw-browsers`; if the project-pinned version
mismatches, launch with `executablePath: '/opt/pw-browsers/chromium'`.
Interstitials run ~3s before a round's UI appears — wait on a round selector,
not on time.
