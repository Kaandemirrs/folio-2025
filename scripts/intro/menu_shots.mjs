// Menü sekmesi ekran görüntüleri (Ana Sayfa, Ayarlar, ...).
//   node scripts/intro/menu_shots.mjs <çıktı-klasörü> [sekme,sekme...] [port=4174]
import puppeteer from 'puppeteer-core'
const OUT = process.argv[2] || '.'
const TABS = (process.argv[3] || 'home,options').split(',')
const PORT = process.argv[4] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
for(const tab of TABS)
{
    await page.evaluate((tab) => window.game.menu.open(tab), tab)
    await sleep(2500)
    await page.screenshot({ path: `${OUT}/menu_${tab}.png` })
}
await browser.close()
