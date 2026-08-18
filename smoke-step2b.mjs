import puppeteer from 'puppeteer-core'
const URL = 'http://127.0.0.1:4173/media-intelligence-platform/'
const out = {}
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] })

async function scenario(name, width, height, { zoomTo = null, grayscale = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('.nav-tab', { timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2000))
  // Graph tab
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.nav-tab')]
    const g = tabs.find((t) => /Graph/.test(t.textContent))
    g.click()
  })
  await new Promise((r) => setTimeout(r, 2000))
  if (width < 700) {
    // Mobile enters via the ranked hub list; open the top hub's subgraph.
    await page.waitForSelector('.hub-item', { timeout: 30000 })
    await page.click('.hub-item')
    await page.waitForSelector('.graph-canvas', { timeout: 30000 })
    await new Promise((r) => setTimeout(r, 4000))
  }
  await new Promise((r) => setTimeout(r, 4000)) // layout + settle + relax
  if (zoomTo) {
    await page.waitForSelector('.graph-canvas', { timeout: 30000 })
    // Adaptive: press '+' until cards render (zoom >= CARD_ZOOM_MIN) or zoomTo cap.
    for (let i = 0; i < zoomTo; i++) {
      await page.evaluate(() => {
        const canvas = document.querySelector('.graph-canvas')
        canvas.focus()
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
      })
      await new Promise((r) => setTimeout(r, 1200))
      const n = await page.evaluate(() => document.querySelectorAll('.graph-card').length)
      if (n > 0) break
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  const stats = await page.evaluate(() => ({
    cards: document.querySelectorAll('.graph-card').length,
    regionLabels: [...document.querySelectorAll('.graph-region-label')].map((e) => e.textContent),
    badges: [...document.querySelectorAll('.graph-region-badge')].map((e) => e.textContent),
    cardSample: [...document.querySelectorAll('.graph-card')].slice(0, 3).map((c) => ({
      name: c.querySelector('.graph-card-name')?.textContent,
      date: c.querySelector('.graph-card-date')?.textContent ?? null,
      type: c.querySelector('.graph-card-type')?.textContent,
      icon: !!c.querySelector('.graph-card-icon svg'),
    })),
    consoleErrors: window.__errs ?? [],
  }))
  if (grayscale) await page.evaluate(() => { document.documentElement.style.filter = 'grayscale(1)' })
  await page.screenshot({ path: `/tmp/smoke/${name}.png` })
  out[name] = stats
  await page.close()
}

await scenario('desktop-focused-default', 1440, 900)
await scenario('mobile-390-default', 390, 844)
await scenario('mobile-390-zoomed', 390, 844, { zoomTo: 10 })
await scenario('desktop-focused-grayscale', 1440, 900, { grayscale: true })
await scenario('desktop-focused-zoomed', 1440, 900, { zoomTo: 4 })
await scenario('desktop-focused-zoomed-grayscale', 1440, 900, { zoomTo: 4, grayscale: true })
await browser.close()
console.log(JSON.stringify(out, null, 2))
