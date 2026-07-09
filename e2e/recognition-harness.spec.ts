import { expect, test } from '@playwright/test'

/**
 * Smoke test for the dev harness at /test-recognition: both recognition Views
 * render, the map is clickable, and the real scoring functions run behind a
 * stub socket.
 */
test('harness: ghost state renders, scores and reveals', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto('/test-recognition')
  await expect(page.locator('.controls')).toBeVisible({ timeout: 15_000 })

  // The interstitial runs a ~3.2s timeline before the round starts.
  await expect(page.locator('.ghost-state .flag svg')).toBeVisible({ timeout: 20_000 })
  // Pre-answer the sub-line describes the place, never the claimant.
  await expect(page.locator('.ghost-state .sub')).not.toContainText(/Claimed by/i)

  await page.locator('.game-map path[data-id="BR"]').click()
  // The reveal names it, and only now says who claims it.
  await expect(page.locator('.ghost-state .sub')).toContainText(/Claimed by Moldova/i, {
    timeout: 10_000,
  })
  await expect(page.locator('.submission')).toBeVisible({ timeout: 10_000 })
  console.log(
    '  ghost:',
    (await page.locator('.submission').textContent())?.replace(/\s+/g, ' ').trim()
  )
  console.log(
    '  reveal:',
    (await page.locator('.ghost-state .note').first().textContent())?.replace(/\s+/g, ' ').trim()
  )

  expect(errors).toHaveLength(0)
})

test('harness: bir tawil scores full marks for naming nobody', async ({ page }) => {
  await page.goto('/test-recognition')
  // Wait for the harness to deal its first round before switching modes.
  await expect(page.locator('.ghost-state')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: "No Man's Land" }).click()
  await expect(page.locator('.no-mans-land h1')).toContainText(/Bir Tawil/i, { timeout: 25_000 })
  await expect(page.getByRole('button', { name: 'Nobody claims it' })).toBeVisible({
    timeout: 20_000,
  })

  await page.getByRole('button', { name: 'Nobody claims it' }).click()
  await expect(page.locator('.submission')).toBeVisible({ timeout: 10_000 })
  const text = (await page.locator('.submission').textContent())?.replace(/\s+/g, ' ').trim()
  console.log('  bir tawil:', text)
  // Naming nobody against a territory nobody claims is a perfect answer.
  expect(text).toMatch(/scored 21 \/ 21/)
})
