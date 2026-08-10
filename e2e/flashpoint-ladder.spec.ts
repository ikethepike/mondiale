import { expect, test } from '@playwright/test'

/** Scratch verification for the flashpoint hint ladder — drives the hard-mode
 *  fixture (five rungs, `bounds` included) and reports what lands when. */
test('flashpoint: the ladder unlocks and the sketch draws', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto('/test-views?scenario=flashpoint-hard')
  const field = page.locator('.conflict-dot-field')
  await expect(field).toBeVisible({ timeout: 30_000 })

  const ladder = page.locator('.hint-ladder')
  await expect(ladder).toBeVisible({ timeout: 20_000 })

  // The box must hold its full height from the first frame — the dots are
  // pinned to the map's painted rect, so a growing stage slides the cloud.
  const firstBox = await ladder.boundingBox()
  console.log('  ladder box at start:', JSON.stringify(firstBox))
  console.log('  rungs rendered:', await page.locator('.hint-ladder .hint-chip').count())
  console.log('  rungs shown at start:', await page.locator('.hint-chip.is-shown').count())

  // Waves land over 8s (2 eras), then the lead, then a rung every 5s.
  for (const at of [10_000, 15_000, 20_000, 25_000, 30_000, 35_000]) {
    await page.waitForTimeout(at === 10_000 ? 10_000 : 5_000)
    const shown = await page.locator('.hint-chip.is-shown').count()
    const sketch = await page.locator('.conflict-dot-field .sketch').count()
    const box = await ladder.boundingBox()
    console.log(
      `  t+${at / 1000}s  shown=${shown}  sketchRings=${sketch}  boxH=${box?.height} boxY=${box?.y}`
    )
    // The reserved box must never change height as rungs arrive.
    expect(box?.height).toBe(firstBox?.height)
  }

  await page.screenshot({ path: 'e2e/.flashpoint-ladder.png', fullPage: false })
  expect(errors).toHaveLength(0)
})
