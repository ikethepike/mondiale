import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
for (const [s, name] of [['flashpoint','conflicts-drift-desktop'],['empire','empires-drift-desktop']]) {
  await page.goto(`http://127.0.0.1:3100/test-views?scenario=${s}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.interstitial')
  const info = await page.evaluate(() => ({
    pill: document.querySelector('.category-pill')?.textContent?.trim(),
    kicker: document.querySelector('.kicker')?.textContent?.trim(),
    dots: document.querySelectorAll('.conflict-drift circle').length,
    ghosts: document.querySelectorAll('.empire-drift .ghost').length,
    ripple: !!document.querySelector('.contour-ripple'),
  }))
  console.log(s, JSON.stringify(info))
  await page.evaluate(() => { const t = document.querySelector('.harness-bar, .picker, header'); if (t) t.style.visibility='hidden' })
  await page.screenshot({ path: `screenshots/${name}.png` })
}
await browser.close()
