// Garaj akışı duman testi (headless Chrome, WebGPU): park yeri, garaj açma, gezinme, seçme, yenileyince hatırlama.
//   node scripts/perf/garage_test.mjs <çıktı-klasörü> [port=4174]
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const PORT = process.argv[3] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 300)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })

async function start()
{
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    await sleep(2000)
    for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
    await sleep(3000)
    await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0); window.game.dayCycles.override.start({ progress: 0.3 }, 0) })
}
const info = () => page.evaluate(() => ({ current: window.game.vehicles.currentId, garage: window.game.world.garage.state, parked: window.game.world.garage.parking.vehicleId, y: +window.game.physicalVehicle.position.y.toFixed(2) }))
const log = {}

await start()
await page.evaluate(() => window.game.player.respawn('bakkal'))
await sleep(5000)
log.afterRespawn = await info()
await page.screenshot({ path: `${OUT}/garage_1_park.png` })

await page.evaluate(() => window.game.world.garage.open())
await sleep(4000)
log.open = await info()
await page.screenshot({ path: `${OUT}/garage_2_open_${log.open.current}.png` })

await page.keyboard.press('ArrowRight')
await sleep(2500)
await page.screenshot({ path: `${OUT}/garage_3_next.png` })
log.candidate = await page.evaluate(() => window.game.world.garage.candidate)

await page.keyboard.press('Enter')
await sleep(5000)
log.afterSelect = await info()
await page.screenshot({ path: `${OUT}/garage_4_selected.png` })
log.storage = await page.evaluate(() => localStorage.getItem('vehicle'))

// Yenile: seçim hatırlanmalı
await start()
log.afterReload = await info()

// Esc ile iptal
await page.evaluate(() => window.game.player.respawn('bakkal'))
await sleep(4000)
await page.evaluate(() => window.game.world.garage.open())
await sleep(3000)
await page.keyboard.press('Escape')
await sleep(3500)
log.afterEsc = await info()

console.log(JSON.stringify({ log, errors: [...new Set(errors)].slice(0, 8) }, null, 1))
await browser.close()
