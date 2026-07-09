import { expect, test, type Browser } from '@playwright/test'

/**
 * Drives a real round of each recognition challenge end to end: Nuxt server →
 * Socket.IO → Redis → the dealer in lib/challenges.ts → the View → scoring.
 *
 * Requires a server started with FORCE_ROUND_TYPE=ghost-state (or
 * no-mans-land). Round 1 is always the tutorial ranking round regardless of
 * the force hook (see `isFirstRound` in getRoundChallenge), so both tests
 * play through it to reach a forced round 2.
 */
const startGame = async (browser: Browser) => {
  const hostContext = await browser.newContext()
  const host = await hostContext.newPage()

  await host.goto('/')
  await host.getByRole('button', { name: 'Create Game' }).click()
  await host.waitForURL(/\/room\//)
  const roomUrl = host.url()

  await host.locator('.input-text input').fill('Host')
  await host.getByRole('button', { name: 'Save' }).click()

  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(roomUrl)
  await guest.locator('.input-text input').fill('Guest')
  await guest.getByRole('button', { name: 'Save' }).click()

  await expect(host.getByRole('heading', { name: 'Ready to start!' })).toBeVisible()
  await host.getByRole('button', { name: 'Start Game' }).click()

  // Both players dismiss the tutorial card.
  for (const page of [host, guest]) {
    await expect(page.getByRole('heading', { name: 'Three phases, one race' })).toBeVisible()
    await page.getByRole('button', { name: "Let's go" }).click()
  }

  return { host, guest, cleanup: () => Promise.all([hostContext.close(), guestContext.close()]) }
}

test('ghost state: flag, attributed status line, and a scoring tap', async ({ browser }) => {
  const { host, cleanup } = await startGame(browser)

  // FORCE_ROUND_TYPE beats the round-1 ranking default (`forced ?? isFirstRound`).
  await expect(host.locator('.ghost-state')).toBeVisible({ timeout: 30_000 })

  // The flag renders — sanitized and inlined, not v-html.
  await expect(host.locator('.ghost-state .flag svg')).toBeVisible({ timeout: 20_000 })

  // The pre-answer line must NOT name the claimant — that is the answer.
  await expect(host.getByText('Where on Earth is this?')).toBeVisible()
  await expect(host.locator('.ghost-state .sub')).not.toContainText(/Claimed by/i)

  // Tapping the map resolves the round.
  // Brazil: a big, unambiguous target, and never the answer to either mode.
  await host.locator('.game-map path[data-id="BR"]').click({ force: true })
  await expect(host.locator('.ghost-state h1')).toBeVisible({ timeout: 15_000 })

  // Only after the answer does the reveal name the claimant.
  await expect(host.locator('.ghost-state .sub')).toContainText(/Claimed by/i, { timeout: 10_000 })
  await expect(host.locator('.ghost-state .note').first()).toBeVisible()

  await cleanup()
})

test("no man's land: multi-select, and naming nobody is a real answer", async ({ browser }) => {
  const { host, cleanup } = await startGame(browser)

  await expect(host.locator('.no-mans-land')).toBeVisible({ timeout: 30_000 })
  await expect(host.locator('.no-mans-land h1')).not.toBeEmpty()
  await expect(host.getByText('Who claims it?')).toBeVisible()

  // With nothing selected, the button offers the terra nullius answer outright.
  await expect(host.getByRole('button', { name: 'Nobody claims it' })).toBeVisible()

  // Selecting a country turns it into a normal submit.
  // Brazil: a big, unambiguous target, and never the answer to either mode.
  await host.locator('.game-map path[data-id="BR"]').click({ force: true })
  await expect(host.locator('.no-mans-land .chips button').first()).toBeVisible()
  await host.getByRole('button', { name: 'Lock it in' }).click()

  await expect(host.locator('.no-mans-land .verdict')).toBeVisible({ timeout: 15_000 })
  await expect(host.locator('.no-mans-land .truth')).toBeVisible()

  await cleanup()
})
