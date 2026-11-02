// Ses düğmesi testi: tıklayınca mute açılıp kapanır, ekran görüntüsü alınır.  node scripts/intro/sound_button_test.mjs <klasör> [port]
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e?.message ?? e)))
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${process.argv[3] || 4174}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
await page.screenshot({ path: `${process.argv[2]}/sound_on.png`, clip: { x: 1180, y: 0, width: 100, height: 200 } })
await page.click('.js-sound-trigger'); await sleep(500)
const muted = await page.evaluate(() => window.game.audio.mute.active)
await page.screenshot({ path: `${process.argv[2]}/sound_off.png`, clip: { x: 1180, y: 0, width: 100, height: 200 } })
await page.click('.js-sound-trigger'); await sleep(500)
console.log(JSON.stringify({ mutedAfterClick: muted, mutedAfterSecond: await page.evaluate(() => window.game.audio.mute.active), errors }))
await browser.close()
