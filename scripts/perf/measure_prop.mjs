// Prop önünde (respawn) çizim istatistikleri: prop açık/kapalı × yüksek/düşük kalite + ekran görüntüsü.
//   VITE_GAME_PUBLIC=1 npx vite build --outDir /tmp/distpub; npx vite preview --port 4174 --outDir /tmp/distpub; node scripts/perf/measure_prop.mjs <klasör>
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const OUT = process.argv[2]
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 300)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
await page.goto('http://127.0.0.1:4174/', { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await new Promise(r => setTimeout(r, 2000))
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 1000)) }
await new Promise(r => setTimeout(r, 4000))
await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0); window.game.dayCycles.override.start({ progress: 0.3 }, 0) })
await page.evaluate(() => window.game.player.respawn('bakkal'))
await new Promise(r => setTimeout(r, 6000))
const sample = () => page.evaluate(async () => {
    const g = window.game, r = g.rendering.renderer
    const out = {}
    for(let i = 0; i < 3; i++) await new Promise(res => requestAnimationFrame(res))
    let dc = 0, tr = 0, n = 0
    for(let i = 0; i < 30; i++) { await new Promise(res => requestAnimationFrame(res)); dc += r.info.render.drawCalls; tr += r.info.render.triangles; n++ }
    return { drawCalls: Math.round(dc / n), triangles: Math.round(tr / n) }
})
const res = {}
for(const level of [0, 1])
{
    await page.evaluate(l => window.game.quality.changeLevel(l), level)
    await new Promise(r => setTimeout(r, 2500))
    await page.evaluate(() => { window.game.world.props.update = () => {}; window.game.world.props.items.forEach(i => i.group.visible = true) })
    await new Promise(r => setTimeout(r, 500))
    const on = await sample()
    if(level === 0) await page.screenshot({ path: `${OUT}/bakkal_game_high.png` })
    else await page.screenshot({ path: `${OUT}/bakkal_game_low.png` })
    await page.evaluate(() => window.game.world.props.items.forEach(i => i.group.visible = false))
    await new Promise(r => setTimeout(r, 500))
    const off = await sample()
    res[level === 0 ? 'high' : 'low'] = { with: on, without: off }
}
console.log(JSON.stringify({ res, errors: [...new Set(errors)].slice(0, 8) }, null, 1))
await browser.close()
