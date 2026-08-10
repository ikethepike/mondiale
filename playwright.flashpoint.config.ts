import { defineConfig, devices } from '@playwright/test'

/** Scratch config for the flashpoint ladder check — drives a hand-started dev
 *  server on 3100 (never 3000, the everyday dev server). Delete with the spec. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /flashpoint-ladder\.spec\.ts/,
  timeout: 120_000,
  use: {
    baseURL: process.env.REPRO_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
