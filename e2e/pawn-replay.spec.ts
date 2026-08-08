import { expect, test } from '@playwright/test'
import type { PawnTraceEntry } from '~~/lib/board3d/use-pawn-movement'

/**
 * The board must only ever animate the walk a pawn has LEFT — never ground it
 * already covered. The pawns are three.js objects inside a canvas, so this
 * reads the mover's own trace (what it was ASKED to do) rather than pixels.
 *
 * The lifecycle under test is the persistent stage's: the board HIDES for a
 * challenge view (active=false holds the position watcher), the gate resolves
 * while it is hidden, and the show-time sync pass replays what is owed. The
 * hard remount (context loss) is the one path that places at truth instead.
 */

const readTrace = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __pawnTrace: PawnTraceEntry[] }).__pawnTrace ?? [])

/** Install the trace sink before any app script runs, and reset it per test. */
const armTrace = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __pawnTrace: unknown[] }).__pawnTrace = []
  })
}

const resetTrace = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    ;(window as unknown as { __pawnTrace: unknown[] }).__pawnTrace = []
  })

const P1 = 'mock-player-1'

/** Where the board has actually put the pawn, or undefined if not yet placed. */
const shownTile = async (page: import('@playwright/test').Page) =>
  (await readTrace(page))
    .filter(entry => entry.playerId === P1 && (entry.fn === 'place' || entry.fn === 'hop'))
    .at(-1)?.to

/**
 * Wait for the pawn to actually settle rather than for a fixed duration:
 * hop chains are paced by the mover, so a wall-clock guess is either slow or
 * flaky. Polls until the shown tile stops changing.
 */
const waitForPawnToSettle = async (page: import('@playwright/test').Page) => {
  let previous: number | undefined
  let stable = 0
  await expect
    .poll(
      async () => {
        const current = await shownTile(page)
        stable = current !== undefined && current === previous ? stable + 1 : 0
        previous = current
        // Three consecutive identical reads: the hop queue has drained
        return stable >= 3
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(true)
  return previous
}

/** Drive the harness to a pawn parked against the gate, board hidden. */
const walkAndHide = async (page: import('@playwright/test').Page) => {
  await page.goto('/test')
  await expect(page.locator('.replay-controls')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await waitForPawnToSettle(page)

  await page.getByRole('button', { name: 'Walk P1 to gate' }).click()
  // The pawn parks at its STOP tile (server truth, pressed toward the gate) —
  // capture where the board actually shows it before hiding.
  const stopTile = await waitForPawnToSettle(page)

  await page.getByRole('button', { name: 'Hide board' }).click()
  await expect(page.locator('.board3d canvas')).toBeHidden()
  return stopTile as number
}

test('movement banked while hidden replays as visible hops on show', async ({ page }) => {
  await armTrace(page)
  await page.goto('/test')
  await expect(page.locator('.replay-controls')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await waitForPawnToSettle(page)

  // A fresh walk dealt while the stage is up, then hidden mid-walk: the hold
  // banks the steps, the show-time sync pass owes them back as hops.
  await page.getByRole('button', { name: 'Deal new walk' }).click()
  await page.getByRole('button', { name: 'Hop P1 +1' }).click()
  await waitForPawnToSettle(page)

  await page.getByRole('button', { name: 'Hide board' }).click()
  await expect(page.locator('.board3d canvas')).toBeHidden()

  // Server walks the pawn on while the board is away
  await page.getByRole('button', { name: 'Hop P1 +3' }).click()
  await resetTrace(page)
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await waitForPawnToSettle(page)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  hidden-walk trace:', JSON.stringify(trace))

  const hops = trace.filter(entry => entry.fn === 'hop')
  expect(hops.length, 'movement banked while hidden was swallowed').toBeGreaterThan(0)
  for (const hop of hops) {
    expect(hop.to, 'the replay must run forward').toBeGreaterThan(hop.from ?? -1)
  }
})

test('a lost gate leaves the pawn at its stop tile with nothing to replay', async ({ page }) => {
  await armTrace(page)
  const stopTile = await walkAndHide(page)

  await page.getByRole('button', { name: 'Lose gate (hidden)' }).click()

  // Everything from here is the show's doing
  await resetTrace(page)
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })

  // A lost gate leaves nothing to walk: the pawn already stands at its stop
  // tile (server truth — the on-gate fiction is dead), so the show may not
  // animate a single hop, forward or back.
  await page.waitForTimeout(2_000)
  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  lost-gate show trace:', JSON.stringify(trace))

  const hops = trace.filter(entry => entry.fn === 'hop')
  expect(hops, `show animated ${hops.length} hop(s) after a lost gate`).toHaveLength(0)

  // And nothing may have moved it off the stop tile.
  const rendered = trace
    .filter(entry => entry.fn === 'place' || entry.fn === 'hop')
    .map(entry => entry.to)
  for (const tile of rendered) {
    expect(tile, 'the pawn must stay on its stop tile').toBe(stopTile)
  }
})

test('a failed gate never renders the forfeited stretch', async ({ page }) => {
  await armTrace(page)
  // The mock's walk runs PAST the gate: losing it forfeits that tail. The
  // pawn parks at the stop tile (gate − 1); the gate and everything beyond
  // must never be rendered.
  const stopTile = await walkAndHide(page)

  await page.getByRole('button', { name: 'Lose gate (hidden)' }).click()
  await resetTrace(page)
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2_000)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  forfeit trace:', JSON.stringify(trace))

  const rendered = trace
    .filter(entry => entry.fn === 'place' || entry.fn === 'hop')
    .map(entry => entry.to)
  for (const tile of rendered) {
    expect(tile, 'the board rendered forfeited ground past the stop tile').toBeLessThanOrEqual(
      stopTile
    )
  }
})

test('a won gate still replays its leap forward', async ({ page }) => {
  await armTrace(page)
  await walkAndHide(page)

  await page.getByRole('button', { name: 'Win gate (hidden)' }).click()

  await resetTrace(page)
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await waitForPawnToSettle(page)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  won-gate show trace:', JSON.stringify(trace))

  // The leap is EARNED movement the player never saw — it must still play out.
  const hops = trace.filter(entry => entry.fn === 'hop')
  expect(hops.length, 'the win leap should replay as visible hops').toBeGreaterThan(0)
  for (const hop of hops) {
    expect(hop.to, 'the leap replay must run forward').toBeGreaterThan(hop.from ?? -1)
  }
})

test('a hard remount places at truth with no replay', async ({ page }) => {
  await armTrace(page)
  await page.goto('/test')
  await expect(page.locator('.replay-controls')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await waitForPawnToSettle(page)

  await page.getByRole('button', { name: 'Walk P1 to gate' }).click()
  const stopTile = await waitForPawnToSettle(page)

  // Context loss: the epoch remount rebuilds the scene from scratch.
  await resetTrace(page)
  await page.getByRole('button', { name: 'Remount board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await waitForPawnToSettle(page)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  remount trace:', JSON.stringify(trace))

  const hops = trace.filter(entry => entry.fn === 'hop')
  expect(hops, 'a hard remount must not re-animate covered ground').toHaveLength(0)
  const placements = trace.filter(entry => entry.fn === 'place')
  expect(placements.at(-1)?.to, 'the pawn must be placed on its true tile').toBe(stopTile)
})
