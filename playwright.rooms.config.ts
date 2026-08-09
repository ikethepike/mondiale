import { defineConfig, devices } from '@playwright/test'

/**
 * The real-room flows (group-scores hand-off, round start) against a
 * self-served build on 3103 — for running the room e2e suite from a worktree
 * or CI box where port 3000 belongs to the everyday dev server. The default
 * config stays the local-iteration path.
 */
const externalServer = process.env.ROOMS_BASE_URL
const PORT = 3103

export default defineConfig({
  testDir: './e2e',
  testMatch: /(group-scores-handoff|start-round)\.spec\.ts/,
  timeout: 120_000,
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
          env: { PORT: String(PORT), HOST: '127.0.0.1' },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
})
