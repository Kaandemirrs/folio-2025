// Headless Chrome (WebGPU) ile oyun içi duman testi: araç değiştir, sür, ekran görüntüsü al.
//   node scripts/perf/drive_test.mjs <çıktı-klasörü> [port=4174]
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const PORT = process.argv[3] || '4174'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 300)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await new Promise(r => setTimeout(r, 2000))
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 1000)) }
await new Promise(r => setTimeout(r, 4000))
await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0); window.game.dayCycles.override.start({ progress: 0.3 }, 0) })
const results = {}
for(const id of ['dogan', 'oldSchool', 'w140'])
{
    results[id] = await page.evaluate(async (id) => {
        const g = window.game
        const ok = await g.vehicles.select(id)
        await new Promise(r => setTimeout(r, 2500))
        const pv = g.physicalVehicle
        return { ok, current: g.vehicles.currentId, y: +pv.position.y.toFixed(3), contacts: pv.wheels.inContactCount, mass: +pv.chassis.mass.toFixed(3), radius: pv.wheels.settings.radius }
    }, id)
    await page.screenshot({ path: `${OUT}/drive_${id}.png` })
}
console.log(JSON.stringify({ results, errors: [...new Set(errors)].slice(0, 8) }, null, 1))
await browser.close()
