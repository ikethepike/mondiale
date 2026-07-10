import { expect, test } from '@playwright/test'

/**
 * Plays round 1 past the group-scores hand-off — the spot where a live room
 * once froze for good — and asserts the pawn walk delivers the player onward.
 */
test('round 1 advances past group-scores into the walk and gate', async ({ browser }) => {
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

  // Submit the ranking as-is (round 0 is always 'ranking')
  await host.getByRole('button', { name: 'Submit Ranking' }).click()

  // Scores screen (the server scored the submission and built the move plan)
  const closeScores = host.getByRole('button', { name: 'Close Scores' })
  await expect(closeScores).toBeVisible({ timeout: 15_000 })
  await closeScores.click()

  // The hand-off that froze prod: board mounts, emits enter-movement-phase
  // (now acked), server walks the pawn and lands on the gate tile. Zero
  // points means no walk and movement-summary instead — accept either proof
  // that the phase advanced past group-scores.
  await expect(
    host.locator('.individual-challenge, .board3d, .board-fallback').first()
  ).toBeVisible({ timeout: 30_000 })
  await expect(host.getByRole('button', { name: 'Close Scores' })).toHaveCount(0)

  await hostContext.close()
  await guestContext.close()
})

/**
 * Incident repro (prod room grain-citizen-thou): the Continue click lands in
 * a disconnect gap. socket.io buffers the emit and flushes it on reconnect
 * BEFORE the app's re-join — the old unbound gate silently dropped it and the
 * room froze forever. With handshake binding + ack/retry it must recover.
 */
test('Continue click during a disconnect gap still advances the round', async ({ browser }) => {
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
  await host.getByRole('button', { name: 'Submit Ranking' }).click()

  const closeScores = host.getByRole('button', { name: 'Close Scores' })
  await expect(closeScores).toBeVisible({ timeout: 15_000 })

  // Sever the connection, click Continue into the gap, then restore.
  await hostContext.setOffline(true)
  await closeScores.click()
  await host.waitForTimeout(4_000)
  await hostContext.setOffline(false)

  // The event must survive the reconnect: board or gate appears, scores gone.
  // Generous window: setOffline doesn't reset the established WebSocket, so
  // socket.io only notices the dead transport after ping timeout (~45s); a
  // real server restart resets TCP and reconnects in ~1s.
  await expect(host.locator('.individual-challenge, .board3d, .board-fallback').first()).toBeVisible({
    timeout: 90_000,
  })
  await expect(host.getByRole('button', { name: 'Close Scores' })).toHaveCount(0)

  await hostContext.close()
  await guestContext.close()
})
