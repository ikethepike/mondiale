import { expect, test } from '@playwright/test'

/**
 * The scorecard is keyboard-operable end to end: the standings rows are real
 * tab stops that flip whose scorecard is shown (Enter/Space), and Close
 * Scores advances the phase from the keyboard — no pointer anywhere.
 */
test('scorecard standings and Close Scores work by keyboard alone', async ({ browser }) => {
  test.setTimeout(120_000)
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
  await expect(host.getByRole('heading', { name: 'Three phases, one race' })).toBeVisible()
  await host.getByRole('button', { name: "Let's go" }).click()
  await expect(host.locator('#active-round')).toBeVisible({ timeout: 15_000 })

  // Round 0 is always 'ranking'
  await host.getByRole('button', { name: 'Submit Ranking' }).click()

  const closeScores = host.getByRole('button', { name: 'Close Scores' })
  await expect(closeScores).toBeVisible({ timeout: 15_000 })

  // The standings rows are buttons in the tab order: focusing one and pressing
  // Enter flips the scorecard to that player. focus() on an element without
  // tabindex would silently no-op and the Enter would go nowhere — so this
  // asserts focusability and the key handler at once.
  const guestRow = host.getByRole('button', { name: /Guest/ })
  await guestRow.focus()
  await host.keyboard.press('Enter')
  await expect(host.getByText("Guest's Scorecard")).toBeVisible()

  // Back to the own card via Space on the host row.
  const hostRow = host.getByRole('button', { name: /Host/ })
  await hostRow.focus()
  await host.keyboard.press(' ')
  await expect(host.getByText('Your Scorecard')).toBeVisible()

  // Close Scores from the keyboard: the acked enter-movement-phase emit.
  await closeScores.focus()
  await host.keyboard.press('Enter')
  await expect(
    host.locator('.individual-challenge, .board3d, .board-fallback').first()
  ).toBeVisible({ timeout: 30_000 })
  await expect(host.getByRole('button', { name: 'Close Scores' })).toHaveCount(0)

  await hostContext.close()
  await guestContext.close()
})
