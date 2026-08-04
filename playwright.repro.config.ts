import { defineConfig, devices } from '@playwright/test'

/**
 * The pawn-replay tests, kept apart from the default config on purpose: they
 * drive the /test harness rather than a real room, and they must not touch
 * port 3000, which is the everyday dev server (`reuseExistingServer` there
 * would hand them whatever happens to be running).
 *
 * Self-contained — it builds and serves on 3100 itself, so CI and a laptop run
 * it identically. Point REPRO_BASE_URL at an already-running server to skip
 * that and iterate against `nuxt dev` instead.
 *
 * No secrets needed: the harness passes a mock game as a prop and never opens
 * a socket, and a missing redis token only disables the socket server (see
 * server/middleware/socket.server.ts) rather than failing the boot.
 */
const externalServer = process.env.REPRO_BASE_URL
const PORT = 3100

export default defineConfig({
  testDir: './e2e',
  testMatch: /pawn-replay\.spec\.ts/,
  timeout: 120_000,
  // The suite is ~35s locally; CI cold-starts the server and runs slower.
  ...(process.env.CI ? { retries: 1, workers: 1 } : {}),
  use: {
    baseURL: externalServer ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(externalServer
    ? {}
    : {
        webServer: {
          // Serves the built output, like the default config — the thing that
          // actually ships, not a dev server with HMR in the way. `exec` so
          // the node process replaces the shell and Playwright's teardown
          // signal reaches it; without it the server outlives the run and
          // holds the port against the next one.
          command: `exec node .output/server/index.mjs`,
          url: `http://127.0.0.1:${PORT}`,
          env: { PORT: String(PORT), HOST: '127.0.0.1' },
          // Never adopt a stray server on this port: these tests assert on
          // exact tile indices, so the wrong build would fail confusingly.
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
})
