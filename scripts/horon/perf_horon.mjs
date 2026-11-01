// Horon alanının maliyeti: production build'i (VITE_GAME_PUBLIC=1) açıp maymunlar gizliyken / bekleme pozunda / dans ederken
// çizim çağrısı, üçgen ve kare süresini ölçer (high, low ve telefon profili).
//   npx vite preview --outDir <dist> --port 4175 &   node scripts/horon/perf_horon.mjs [--url http://127.0.0.1:4175/] [--out rapor.json]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def }
const URL_ = arg('url', 'http://127.0.0.1:4175/')
const OUT = arg('out', null)
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const PROFILES = [
    { name: 'masaüstü 1280×720', viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, ua: null, levels: [ 0, 1 ] },
    { name: 'telefon 390×844 @3x', viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ua: IPHONE_UA, levels: [ 1 ] },
]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function run(profile)
{
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: [ '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal' ] })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)))
    if(profile.ua) await page.setUserAgent(profile.ua)
    await page.setViewport(profile.viewport)
    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    await sleep(2000)
    for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
    await sleep(4000)
    await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0); window.game.dayCycles.override.start({ progress: 0.3 }, 0) })

    // Alana ışınla
    await page.evaluate(() => window.game.player.respawn('monkey'))
    await sleep(9000)

    const measure = () => page.evaluate(async () =>
    {
        const g = window.game
        const info = g.rendering.renderer.info
        const samples = []
        for(let i = 0; i < 5; i++)
        {
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
            samples.push({ drawCalls: info.render.drawCalls, triangles: info.render.triangles })
        }
        const t0 = performance.now()
        await new Promise(res => { let n = 0; const f = () => { if(++n >= 60) res(); else requestAnimationFrame(f) }; requestAnimationFrame(f) })
        const avg = (k) => Math.round(samples.reduce((t, s) => t + s[k], 0) / samples.length)
        return { drawCalls: avg('drawCalls'), triangles: avg('triangles'), frameMs: +((performance.now() - t0) / 60).toFixed(2), horonVisible: g.world.horon.group?.visible ?? null }
    })

    const results = []
    for(const level of profile.levels)
    {
        await page.evaluate((l) => window.game.quality.changeLevel(l), level)
        await sleep(4000)
        const horon = await page.evaluate(() => window.game.world.horon)
        const radius = await page.evaluate(() => window.game.world.horon.config.visibleRadius)

        // Maymunlar gizli (yarıçap -1): aynı kadraj, alan çizilmiyor
        await page.evaluate(() => { window.game.world.horon.forceHidden = true; window.game.world.horon.setDancing(false) })
        await sleep(1500)
        const hidden = await measure()

        // Bekleme pozu (görünür, güncelleme yok)
        await page.evaluate((r) => { window.game.world.horon.forceHidden = false }, radius)
        await sleep(2500)
        const idle = await measure()

        // Dans
        await page.evaluate(() => window.game.world.horon.setDancing(true))
        await sleep(2500)
        const dancing = await measure()
        await page.evaluate(() => window.game.world.horon.setDancing(false))

        results.push({ kalite: level === 0 ? 'high' : 'low', gizli: hidden, bekleme: idle, dans: dancing, fark: { drawCalls: dancing.drawCalls - hidden.drawCalls, triangles: dancing.triangles - hidden.triangles } })
    }
    await browser.close()
    return { profil: profile.name, results, errors: [ ...new Set(errors) ].slice(0, 5) }
}

const only = arg('profile', null)
const report = []
for(const p of PROFILES) { if(only && !p.name.startsWith(only)) continue; console.error('profil', p.name); report.push(await run(p)) }
const text = JSON.stringify(report, null, 1)
console.log(text)
if(OUT) fs.writeFileSync(OUT, text)
