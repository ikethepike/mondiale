import { defineConfig, devices } from '@playwright/test'

/**
 * The playtest client (e2e/playtest.spec.ts): whole games played by browser
 * seats beside server bots, with a freeze detector reading the server's own
 * record from redis. Never on port 3000 — the everyday dev server. Point
 * PLAYTEST_BASE_URL at a running server (and PLAYTEST_SERVER_LOG at its
 * stdout) to iterate without rebuilding.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // CI supplies the redis credentials through the environment.
}

const externalServer = process.env.PLAYTEST_BASE_URL
const PORT = 3110

export default defineConfig({
  testDir: './e2e',
  testMatch: /playtest\.spec\.ts/,
  fullyParallel: true,
  workers: Number(process.env.PLAYTEST_ROOMS ?? 1),
  use: {
    baseURL: externalServer ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  // One engine per run (PLAYTEST_BROWSER=webkit for the Safari pass): every
  // room is a full game, so running both by default doubles a long run.
  projects: [
    process.env.PLAYTEST_BROWSER === 'webkit'
      ? { name: 'webkit', use: { ...devices['Desktop Safari'] } }
      : {
          name: 'chromium',
          use: {
            ...devices['Desktop Chrome'],
            launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
          },
        },
  ],
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
