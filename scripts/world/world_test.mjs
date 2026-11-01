// Dünya değişiklikleri için headless Chrome (WebGPU) görüntü/duman testi.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &   (ya da build + preview)
//   node scripts/world/world_test.mjs <çıktı-klasörü> <senaryo[,senaryo]> [port=4174]
// Senaryolar: landing (harfler + bayrak), flagwind (rüzgâr 0 / 1), day (gündüz adayları)
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const SCENARIOS = (process.argv[3] || 'landing').split(',')
const PORT = process.argv[4] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 300)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })

await page.goto(`http://127.0.0.1:${PORT}/${process.env.QUALITY ? '#' + process.env.QUALITY : ''}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)

const weather = (w, progress) => page.evaluate((w, progress) =>
{
    window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: w }, 0)
    if(progress !== undefined)
        window.game.dayCycles.override.start({ progress }, 0)
}, w, progress)
const info = {}

for(const name of SCENARIOS)
{
    if(name === 'landing')
    {
        await weather(0.4, 0.3)
        await page.evaluate(() => window.game.player.respawn('landing'))
        await sleep(5000)
        await page.screenshot({ path: `${OUT}/landing_spawn.png` })
        await page.evaluate(() => window.game.player.respawn('controls'))
        await sleep(5000)
        await page.screenshot({ path: `${OUT}/landing_flag.png` })
        info.landing = await page.evaluate(() => ({ calls: window.game.rendering.renderer.info.render.calls, triangles: window.game.rendering.renderer.info.render.triangles }))
    }
    else if(name === 'flagwind')
    {
        await page.evaluate(() => window.game.player.respawn('controls'))
        for(const w of [ 0, 0.4, 1 ])
        {
            await weather(w, 0.3)
            await sleep(4000)
            await page.screenshot({ path: `${OUT}/flag_wind_${w}.png`, clip: { x: 320, y: 60, width: 640, height: 420 } })
        }
    }
}
console.log(JSON.stringify({ info, errors: [...new Set(errors)].slice(0, 8) }, null, 1))
await browser.close()
