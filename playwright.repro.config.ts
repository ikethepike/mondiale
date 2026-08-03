import { defineConfig, devices } from '@playwright/test'

/**
 * Pawn-replay repro runs against a dev server the developer starts on 3100+
 * (port 3000 is the everyday dev server and the default config would reuse or
 * rebuild it). No webServer block: bring your own with
 * `npx nuxt dev --port 3100`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /pawn-replay\.spec\.ts/,
  timeout: 120_000,
  use: {
    baseURL: process.env.REPRO_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
