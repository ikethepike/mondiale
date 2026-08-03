import { expect, test } from '@playwright/test'
import type { PawnTraceEntry } from '~~/lib/board3d/use-pawn-movement'

/**
 * The board must only ever animate the walk a pawn has LEFT — never ground it
 * already covered. The pawns are three.js objects inside a canvas, so this
 * reads the mover's own trace (what it was ASKED to do) rather than pixels.
 *
 * The sequence under test is the one that misbehaves in play: the board
 * unmounts for a challenge view, the gate resolves while it is gone, and the
 * remount replays from the mover's cross-mount display memory.
 */

const readTrace = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __pawnTrace: PawnTraceEntry[] }).__pawnTrace ?? [])

/** Install the trace sink before any app script runs, and reset it per test. */
const armTrace = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __pawnTrace: unknown[] }).__pawnTrace = []
  })
}

const P1 = 'mock-player-1'

/** Drive the harness to a pawn parked on the gate, board hidden. */
const walkAndHide = async (page: import('@playwright/test').Page) => {
  await page.goto('/test')
  await expect(page.locator('.replay-controls')).toBeVisible({ timeout: 20_000 })
  // The board build + fly-in settles before the walk, so the pawn is placed
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2500)

  await page.getByRole('button', { name: 'Walk P1 to gate' }).click()
  // Let the hop queue drain — the pawn must be SEEN at the gate for the
  // display memory to record it (that memory is the suspected culprit).
  await page.waitForTimeout(3000)

  await page.getByRole('button', { name: 'Hide board' }).click()
  await expect(page.locator('.board3d canvas')).toBeHidden()
}

test('a lost gate does not replay the walk on remount', async ({ page }) => {
  await armTrace(page)
  await walkAndHide(page)

  await page.getByRole('button', { name: 'Lose gate (hidden)' }).click()

  // Everything from here is the remount's doing
  await page.evaluate(() => {
    ;(window as unknown as { __pawnTrace: unknown[] }).__pawnTrace = []
  })
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(4000)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  lost-gate remount trace:', JSON.stringify(trace))

  // A lost gate leaves nothing to walk: the pawn belongs at gate − 1, placed,
  // not walked to. Any hop here is the board re-animating settled ground.
  const hops = trace.filter(entry => entry.fn === 'hop')
  expect(hops, `remount animated ${hops.length} hop(s) after a lost gate`).toHaveLength(0)

  // `restore` reports the RAW remembered tile (here the gate the pawn lost),
  // so a `from` ahead of `to` is expected — what matters is that the pawn is
  // put down on its true tile rather than reappearing on the gate it lost.
  const restored = trace.find(entry => entry.fn === 'restore')
  const placements = trace.filter(entry => entry.fn === 'place')
  expect(placements.at(-1)?.to, 'the pawn must be placed on its true tile').toBe(restored?.to)
})

test('a failed gate cuts progress off at the gate', async ({ page }) => {
  await armTrace(page)
  await walkAndHide(page)

  // The mock's walk runs PAST the gate: losing it forfeits that tail. The
  // board must not render a single tile of it — not the gate, not beyond.
  // The pawn is parked on the gate right now, so that IS the gate tile.
  const trailingPlacement = (await readTrace(page))
    .filter(entry => entry.playerId === P1 && (entry.fn === 'place' || entry.fn === 'hop'))
    .at(-1)?.to
  expect(trailingPlacement, 'harness should have parked the pawn on the gate').toBeGreaterThan(0)
  const gateTile = trailingPlacement as number

  await page.getByRole('button', { name: 'Lose gate (hidden)' }).click()
  await page.evaluate(() => {
    ;(window as unknown as { __pawnTrace: unknown[] }).__pawnTrace = []
  })
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(4000)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  forfeit trace:', JSON.stringify(trace))

  // Every tile the board put the pawn on must be short of the gate it lost.
  const rendered = trace
    .filter(entry => entry.fn === 'place' || entry.fn === 'hop')
    .map(entry => entry.to)
  expect(rendered.length, 'the pawn should have been placed').toBeGreaterThan(0)
  expect(
    Math.max(...rendered),
    'the board walked past a gate the player failed'
  ).toBeLessThan(gateTile)
})

test('a won gate still replays its leap forward', async ({ page }) => {
  await armTrace(page)
  await walkAndHide(page)

  await page.getByRole('button', { name: 'Win gate (hidden)' }).click()

  await page.evaluate(() => {
    ;(window as unknown as { __pawnTrace: unknown[] }).__pawnTrace = []
  })
  await page.getByRole('button', { name: 'Show board' }).click()
  await expect(page.locator('.board3d canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(4000)

  const trace = (await readTrace(page)).filter(entry => entry.playerId === P1)
  console.log('  won-gate remount trace:', JSON.stringify(trace))

  // The leap is EARNED movement the player never saw — it must still play out.
  // This is the behaviour any fix must not regress.
  const hops = trace.filter(entry => entry.fn === 'hop')
  expect(hops.length, 'the win leap should replay as visible hops').toBeGreaterThan(0)
  for (const hop of hops) {
    expect(hop.to, 'the leap replay must run forward').toBeGreaterThan(hop.from ?? -1)
  }
})
