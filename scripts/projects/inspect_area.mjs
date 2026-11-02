// Projeler alanındaki yerleşim bilgisi (dünya konumları/boyutlar) ve ekran görüntüleri.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/projects/inspect_area.mjs <çıktı-klasörü> [info|shots|shot:<indeks>] [port]
// Not: dosya-üstü varsayılan görünüm 1280×720; PHONE=1 → 390×844 dikey telefon.
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const MODE = process.argv[3] || 'info'
const PORT = process.argv[4] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const phone = !!process.env.PHONE
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push((e.stack || e.message).slice(0, 500)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0.2 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })
await page.evaluate(() => window.game.player.respawn('projects'))
await sleep(6000)

if(MODE === 'info')
{
    const info = await page.evaluate(() =>
    {
        const area = window.game.world.areas.projects
        const out = {}
        const box = (o) => { const b = new o.constructor.prototype.constructor().isObject3D ? null : null; return b }
        for(const [ name, items ] of area.references.items)
        {
            out[name] = items.map(o =>
            {
                const p = o.getWorldPosition(o.position.clone())
                const q = o.getWorldQuaternion(o.quaternion.clone())
                const e = new o.rotation.constructor().setFromQuaternion(q, 'YXZ')
                return `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} rotYXZ ${e.x.toFixed(2)},${e.y.toFixed(2)},${e.z.toFixed(2)} scale ${o.scale.x.toFixed(2)},${o.scale.y.toFixed(2)},${o.scale.z.toFixed(2)}`
            })
        }
        out.cinematic = { position: area.cinematic.position.toArray(), target: area.cinematic.target.toArray() }
        return out
    })
    console.log(JSON.stringify(info, null, 1))
}
else
{
    const count = await page.evaluate(() => window.game.world.areas.projects.navigation && 6)
    const indices = MODE.startsWith('shot:') ? [ +MODE.split(':')[1] ] : [ 0, 1, 2, 3, 4, 5 ]
    await page.evaluate(() => window.game.world.areas.projects.open())
    await sleep(4500)
    for(const index of indices)
    {
        await page.evaluate((index) => window.game.world.areas.projects.changeProject(index, 2, true), index)
        await sleep(4500)
        await page.screenshot({ path: `${OUT}/projects_${phone ? 'phone_' : ''}${index}.png` })
    }
}
console.log('errors', JSON.stringify(errors))
await browser.close()
