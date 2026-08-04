import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // The pawn-replay repro drives the /test harness against a hand-started dev
  // server on 3100+ (port 3000 is the everyday dev server, and this config
  // would reuse it). It runs from playwright.repro.config.ts instead.
  testIgnore: /pawn-replay\.spec\.ts/,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node --env-file=.env .output/server/index.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
