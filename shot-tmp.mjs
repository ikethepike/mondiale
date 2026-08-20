import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
await page.goto('http://127.0.0.1:3100/test-views?scenario=capital-guess', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.interstitial .category-pill', { timeout: 9000 })
await page.evaluate(() => {
  const c = document.querySelector('.intro-overlay'); if (c) { c.style.opacity='1'; c.style.zIndex='9999' }
  const t = document.querySelector('.harness-bar, .picker, header'); if (t) t.style.visibility='hidden'
})
console.log(JSON.stringify(await page.evaluate(() => ({
  towers: document.querySelectorAll('.skyline-drift .tower').length,
  windows: document.querySelectorAll('.skyline-drift .window').length,
}))))
await page.screenshot({ path: 'screenshots/category-cities-skyline.png' })
await browser.close()
