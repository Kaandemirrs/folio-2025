// Haritayı açıp pinlerle ekran görüntüsü alır.  node scripts/map/map_pins_shot.mjs <çıktı.png> [port]
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 1100 })
await page.goto(`http://127.0.0.1:${process.argv[3] || 4174}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
await page.evaluate(() => window.game.modals.open('map'))
await sleep(3000)
await page.screenshot({ path: process.argv[2] })
await browser.close()
