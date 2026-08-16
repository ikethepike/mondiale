import { defineConfig, devices } from '@playwright/test'

/**
 * The AFK-recovery repro, apart from the default config on purpose: it needs
 * FORCE_ROUND_TYPE in the server's env (round 1 must be a classic clocked
 * mode, not the natural ranking), and it must never touch port 3000 — the
 * everyday dev server. Self-contained like playwright.repro.config.ts: it
 * serves the built output on 3102 itself. Point AFK_BASE_URL at a running
 * FORCE_ROUND_TYPE=two-truths server to iterate without rebuilding.
 */
const externalServer = process.env.AFK_BASE_URL
const PORT = 3102

export default defineConfig({
  testDir: './e2e',
  testMatch: /afk-recovery\.spec\.ts/,
  timeout: 300_000,
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
          command: `exec node --env-file=.env .output/server/index.mjs`,
          url: `http://127.0.0.1:${PORT}`,
          env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            FORCE_ROUND_TYPE: 'two-truths',
          },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
})
