import { expect, test } from '@playwright/test'

/**
 * Smoke test for the full game-start flow: create a room, have a second
 * player join (the host cannot start alone), start the game and verify a
 * round is generated and rendered. This exercises the Nuxt server, the
 * Socket.IO round-trip, Redis persistence and challenge generation from
 * the generated country data.
 */
test('host can create a game and start a round with a second player', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const host = await hostContext.newPage()

  // Create a room from the landing page
  await host.goto('/')
  await host.getByRole('button', { name: 'Create Game' }).click()
  await host.waitForURL(/\/room\//)
  const roomUrl = host.url()

  // Host sets up their player
  await expect(host.getByRole('heading', { name: 'Created game!' })).toBeVisible()
  await host.locator('.input-text input').fill('Host')
  await host.getByRole('button', { name: 'Save' }).click()
  await expect(host.getByRole('heading', { name: "It's a bit lonely here..." })).toBeVisible()

  // A second player joins and sets up their player
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(roomUrl)
  await guest.locator('.input-text input').fill('Guest')
  await guest.getByRole('button', { name: 'Save' }).click()

  // With everyone ready, the host starts the game
  await expect(host.getByRole('heading', { name: 'Ready to start!' })).toBeVisible()
  const startButton = host.getByRole('button', { name: 'Start Game' })
  await expect(startButton).toBeEnabled()
  await startButton.click()

  // The round begins: both players see the tutorial
  await expect(host.getByRole('heading', { name: 'Three phases, one race' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Three phases, one race' })).toBeVisible()

  // Closing the tutorial reveals the group challenge built from country data
  await host.getByRole('button', { name: "Let's go" }).click()
  await expect(host.locator('#active-round')).toBeVisible()
  await expect(host.locator('#question h1')).not.toBeEmpty()
  expect(await host.locator('#active-round .country').count()).toBeGreaterThan(0)

  await hostContext.close()
  await guestContext.close()
})
