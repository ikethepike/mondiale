import { expect, test } from '@playwright/test'

/**
 * The stuck-after-challenge class, asserted end to end: a classic round's
 * clock and reveal used to live only in each client's browser memory, so a
 * tab that died mid-round parked its seat in 'group-challenge' forever and
 * froze the whole table. With the server-owned classic clock, the settle
 * backstop and the scorecard cap, the room must now advance on its own.
 *
 * Runs under playwright.afk.config.ts: FORCE_ROUND_TYPE=two-truths makes
 * round 1 a clocked classic mode (25s play + 4.5s reveal hold).
 */
test('a dead tab mid-round cannot freeze the table', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const host = await hostContext.newPage()

  await host.goto('/')
  await host.getByRole('button', { name: 'Create Game' }).click()
  await host.waitForURL(/\/room\//)
  const roomUrl = host.url()
  // Arm the transition-grammar recorder before play begins (the created
  // room's URL already carries `?variant=…`).
  await host.goto(`${roomUrl}${roomUrl.includes('?') ? '&' : '?'}viewlog=1`)

  await host.locator('.input-text input').fill('Host')
  await host.getByRole('button', { name: 'Save' }).click()

  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(roomUrl)
  await guest.locator('.input-text input').fill('Guest')
  await guest.getByRole('button', { name: 'Save' }).click()

  await expect(host.getByRole('heading', { name: 'Ready to start!' })).toBeVisible()
  await host.getByRole('button', { name: 'Start Game' }).click()

  // Both seats leave the rules card; the first close stamps the round clock.
  await expect(host.getByRole('heading', { name: 'Three phases, one race' })).toBeVisible()
  await host.getByRole('button', { name: "Let's go" }).click()
  await expect(guest.getByRole('heading', { name: 'Three phases, one race' })).toBeVisible()
  await guest.getByRole('button', { name: "Let's go" }).click()

  // The forced two-truths round is live for both.
  await expect(host.locator('.claim-stage, #active-round').first()).toBeVisible({
    timeout: 20_000,
  })

  // The guest's tab dies mid-round, before answering anything.
  await guestContext.close()

  // Host answers: pick the first claim. The reveal plays (display-only) and
  // the server flips the seat to its scorecard after the kind's hold.
  await host.locator('.card-option, .claim-stage button, .stat-card').first().click()

  // The freeze this exists to catch: the round must settle the dead seat
  // (zero banked at deadline + hold + slack ≈ 36s) and the scorecard cap
  // must walk it (+45s), after which the table stages round 2 and the host
  // sees a NEW claim stage — with no client left to ask for anything.
  const closeScores = host.getByRole('button', { name: 'Close Scores' })
  await expect(closeScores).toBeVisible({ timeout: 60_000 })
  await closeScores.click()

  // First the host's own advance out of group-scores (the board mounts)…
  await expect(
    host.locator('.individual-challenge, .board3d, .board-fallback').first()
  ).toBeVisible({ timeout: 30_000 })

  // …then the real proof: round 2 (FORCE_ROUND_TYPE deals two-truths again)
  // goes live even though the dead seat never sent another event. Budget:
  // settle ≈36s after the first tutorial close + scores cap 45s + staging.
  await expect(host.locator('.claim-stage')).toBeVisible({ timeout: 150_000 })

  // The transition grammar across the whole run: the sequencing is only
  // rock solid if no view ever flashed. 'none' (no resolvable view) may
  // only open the session, a view never swaps to itself, and an A→B→A
  // bounce where B lived under half a second is a flash by definition.
  const viewLog = await host.evaluate(
    () => (window as unknown as { __viewLog?: { key: string; at: number }[] }).__viewLog ?? []
  )
  expect(viewLog.length).toBeGreaterThan(2)
  for (const [index, entry] of viewLog.entries()) {
    if (index === 0) continue
    expect(entry.key, `blank view mid-session at #${index}`).not.toBe('none')
    expect(entry.key, `self-swap at #${index}`).not.toBe(viewLog[index - 1].key)
    if (index >= 2) {
      const bounce = entry.key === viewLog[index - 2].key && entry.at - viewLog[index - 1].at < 500
      expect(
        bounce,
        `view flashed: ${viewLog[index - 2].key}→${viewLog[index - 1].key}→${entry.key}`
      ).toBe(false)
    }
  }

  await hostContext.close()
})
