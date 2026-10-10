import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * The playtest client (e2e/playtest.spec.ts): whole games played by browser
 * seats beside server bots, checked against the server's own record through
 * `/debug/rooms`. Never on port 3000 — the everyday dev server. Point
 * PLAYTEST_BASE_URL (+ PLAYTEST_DEBUG_TOKEN, and PLAYTEST_SERVER_LOG when its
 * stdout is reachable) at a running server to iterate without rebuilding.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // CI supplies the redis credentials through the environment.
}

const externalServer = process.env.PLAYTEST_BASE_URL
const PORT = Number(process.env.PLAYTEST_PORT ?? 3110)

// Workers inherit the runner's environment, so a token minted here reaches
// both the server it boots and every spec process.
if (!externalServer) {
  process.env.PLAYTEST_DEBUG_TOKEN ??= `playtest-${randomUUID()}`
  process.env.PLAYTEST_SERVER_LOG ??= path.resolve(
    process.env.PLAYTEST_OUT ?? 'test-results/playtest',
    `server-${PORT}.log`
  )
  fs.mkdirSync(path.dirname(process.env.PLAYTEST_SERVER_LOG), { recursive: true })
}
const envFile = fs.existsSync('.env') ? '--env-file=.env ' : ''
// Software WebGL renders the board at ~1fps, and GSAP's lag smoothing then
// stretches a 0.35s fade to ~10s: a genuinely stale screen the auditor reports.
// Play on the Mac's GPU; where there is none (CI), take the 2D board fallback.
const chromiumGraphics =
  process.platform === 'darwin'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--disable-webgl']

export default defineConfig({
  testDir: './e2e',
  testMatch: /playtest\.spec\.ts/,
  // Playwright empties its output dir on every run: each run gets its own, so
  // two passes (CI) or two matrix cells never wipe each other's results.
  outputDir: path.join(process.env.PLAYTEST_OUT ?? 'test-results/playtest', '.playwright'),
  fullyParallel: true,
  workers: Number(process.env.PLAYTEST_ROOMS ?? 1),
  use: {
    baseURL: externalServer ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
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
            launchOptions: {
              args: ['--autoplay-policy=no-user-gesture-required', ...chromiumGraphics],
            },
          },
        },
  ],
  ...(externalServer
    ? {}
    : {
        webServer: {
          command: `exec node ${envFile}.output/server/index.mjs >> "${process.env.PLAYTEST_SERVER_LOG}" 2>&1`,
          url: `http://127.0.0.1:${PORT}`,
          env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            NUXT_DEBUG_TOKEN: process.env.PLAYTEST_DEBUG_TOKEN!,
          },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
})
