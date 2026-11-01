// Production build'i headless Chrome'da (WebGPU) açıp kalite seviyeleri için çizim istatistiklerini ölçer.
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1 &
//   node scripts/perf/measure.mjs [--url http://127.0.0.1:4173/] [--out rapor.json]
// Gerekli: build'de VITE_GAME_PUBLIC=1 (window.game). Chrome yolu: CHROME_PATH (varsayılan macOS).
// Sabit koşullar: landing spawn (hareketsiz), açık hava, gün ortası; her senaryoda 5 sn bekleyip 60 kare örnekler.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def }
const URL_ = arg('url', 'http://127.0.0.1:4173/')
const OUT = arg('out', null)
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const PROFILES = [
    { name: 'masaüstü 1280×720 @1x', viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, ua: null, levels: [0, 1] },
    { name: 'telefon 390×844 @3x', viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ua: IPHONE_UA, levels: [null, 0, 1] },
]

async function run(profile)
{
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)))
    page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 200)) })
    if(profile.ua) await page.setUserAgent(profile.ua)
    await page.setViewport(profile.viewport)

    const client = await page.createCDPSession()
    await client.send('Network.enable')
    let bytes = 0
    client.on('Network.loadingFinished', e => { bytes += e.encodedDataLength })

    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.world && window.game.world.intro, { timeout: 120000 })
    // Yükleme bitti mi (intro etiketi gösterilebilir: reveal.step === 0)
    await page.waitForFunction(() => window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    await new Promise(r => setTimeout(r, 2000))
    const bytesBeforeStart = bytes
    // Başlat: intro açılış animasyonu bitince Enter ile (tıklamanın klavye eşdeğeri)
    for(let i = 0; i < 90; i++)
    {
        const step = await page.evaluate(() => window.game.reveal && window.game.reveal.step)
        if(step === 2) break
        if(step === 0) await page.keyboard.press('Enter')
        await new Promise(r => setTimeout(r, 1000))
    }
    await page.waitForFunction(() => window.game.reveal && window.game.reveal.step === 2, { timeout: 60000 })
    await new Promise(r => setTimeout(r, 6000))
    const bytesAfterReveal = bytes

    // Sabit koşullar: açık hava, gün ortası
    await page.evaluate(() =>
    {
        window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0)
        window.game.dayCycles.override.start({ progress: 0.3 }, 0)
    })

    const results = []
    for(const level of profile.levels)
    {
        if(level !== null)
            await page.evaluate((l) => window.game.quality.changeLevel(l), level)
        await new Promise(r => setTimeout(r, 5000))
        const m = await page.evaluate(async () =>
        {
            const g = window.game
            const info = g.rendering.renderer.info
            const samples = []
            for(let i = 0; i < 5; i++)
            {
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
                samples.push({ drawCalls: info.render.drawCalls, triangles: info.render.triangles })
            }
            // kare süresi (60 kare)
            const t0 = performance.now()
            await new Promise(res => { let n = 0; const f = () => { if(++n >= 60) res(); else requestAnimationFrame(f) }; requestAnimationFrame(f) })
            const frame = (performance.now() - t0) / 60
            const avg = (k) => Math.round(samples.reduce((t, s) => t + s[k], 0) / samples.length)
            const canvas = g.canvasElement
            return {
                qualityLevel: g.quality.level,
                backend: g.rendering.renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl',
                drawCalls: avg('drawCalls'), triangles: avg('triangles'),
                geometries: info.memory.geometries, textures: info.memory.textures,
                pixelRatio: g.rendering.renderer.getPixelRatio(),
                canvas: `${canvas.width}×${canvas.height}`,
                frameMs: +frame.toFixed(2),
                grassBlades: g.world.grass ? g.world.grass.count : null,
            }
        })
        results.push({ istenen: level === null ? 'otomatik (UA)' : level === 0 ? 'high (0)' : 'low (1)', ...m })
    }
    await browser.close()
    return {
        profile: profile.name, results, errors: [...new Set(errors)].slice(0, 6),
        yuklemeKB: { baslamadanOnce: Math.round(bytesBeforeStart / 1024), baslatmaSonrasi6sn: Math.round(bytesAfterReveal / 1024) },
    }
}

const report = []
for(const p of PROFILES) report.push(await run(p))
const text = JSON.stringify(report, null, 2)
console.log(text)
if(OUT) fs.writeFileSync(OUT, text)
