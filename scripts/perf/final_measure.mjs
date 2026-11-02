// Son kontrol performans ölçümü: production build (VITE_GAME_PUBLIC=1 ile), WebGPU ve WebGL, masaüstü 1920×1080 ve telefon 390×844, düşük/yüksek kalite.
// Ölçülenler: ilk yükleme (istek sayısı, bayt, tıklanabilir olma süresi), landing / projeler / bakkal / horon'da draw call, üçgen, kare süresi, geometri/texture sayısı.
// Bellek sızıntı testi (leak): garaj gir-çık, kalite değişimi, alan gezintisi sonrası geometri/texture sayısı.
//   VITE_GAME_PUBLIC=1 npm run build && npx vite preview --port 4181 --host 127.0.0.1 &
//   node scripts/perf/final_measure.mjs <rapor.json> [port=4181] [leak]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || 'final_perf.json'
const PORT = process.argv[3] || '4181'
const LEAK_ONLY = process.argv[4] === 'leak'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const PROFILES = {
    masaüstü: { viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, ua: null },
    telefon: { viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ua: IPHONE_UA },
}
const AREAS = [ [ 'landing', 'landing' ], [ 'projeler', 'projects' ], [ 'bakkal', 'bakkal' ], [ 'horon', 'monkey' ] ]

async function open(backend, profile, quality)
{
    const args = backend === 'webgpu' ? [ '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal' ] : [ '--ignore-gpu-blocklist', '--use-angle=metal', '--disable-features=WebGPU' ]
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push('pageerror: ' + String(e?.message ?? e).slice(0, 160)))
    page.on('console', m => { if(m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 160)) })
    if(profile.ua) await page.setUserAgent(profile.ua)
    await page.setViewport(profile.viewport)
    await page.evaluateOnNewDocument((q) => { try { localStorage.setItem('quality', q); localStorage.setItem('hintsSeen', '1') } catch(e) {} }, quality)
    const client = await page.createCDPSession()
    await client.send('Network.enable')
    const net = { requests: 0, bytes: 0 }
    client.on('Network.requestWillBeSent', () => { net.requests++ })
    client.on('Network.loadingFinished', e => { net.bytes += e.encodedDataLength })
    await page.goto(`http://127.0.0.1:${PORT}/${backend === 'webgl' ? '#webgl' : ''}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 240000 })
    const clickableMs = await page.evaluate(() => Math.round(performance.now()))
    const initial = { requests: net.requests, KB: Math.round(net.bytes / 1024) }
    await sleep(1500)
    for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
    await sleep(4000)
    await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })
    return { browser, page, errors, initial, clickableMs, net }
}

const sample = (page) => page.evaluate(async () =>
{
    const info = window.game.rendering.renderer.info
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const calls = info.render.drawCalls, triangles = info.render.triangles
    const t0 = performance.now()
    await new Promise(res => { let n = 0; const f = () => { if(++n >= 90) res(); else requestAnimationFrame(f) }; requestAnimationFrame(f) })
    return { drawCalls: calls, triangles, frameMs: +((performance.now() - t0) / 90).toFixed(2), geometries: info.memory.geometries, textures: info.memory.textures }
})

const report = { measured: new Date().toISOString(), runs: [] }
if(!LEAK_ONLY)
{
    for(const backend of [ 'webgpu', 'webgl' ])
    {
        for(const [ profileName, profile ] of Object.entries(PROFILES))
        {
            for(const quality of [ 'low', 'high' ])
            {
                const run = { backend, profile: profileName, quality }
                try
                {
                    const { browser, page, errors, initial, clickableMs, net } = await open(backend, profile, quality)
                    run.backendActual = await page.evaluate(() => window.game.rendering.renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl')
                    run.initialLoad = initial
                    run.clickableMs = clickableMs
                    run.totalAfterStart = { requests: net.requests, KB: Math.round(net.bytes / 1024) }
                    run.areas = {}
                    for(const [ label, respawn ] of AREAS)
                    {
                        await page.evaluate((name) => window.game.player.respawn(name), respawn)
                        await sleep(8000)
                        run.areas[label] = await sample(page)
                    }
                    run.errors = [ ...new Set(errors) ].slice(0, 8)
                    await browser.close()
                }
                catch(error) { run.failed = String(error).slice(0, 200) }
                report.runs.push(run)
                console.log(JSON.stringify(run))
                fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
            }
        }
    }
}

// Sızıntı testi (masaüstü, WebGPU, düşük kalite)
{
    const { browser, page, errors } = await open('webgpu', PROFILES.masaüstü, 'low')
    const count = () => page.evaluate(() => { const i = window.game.rendering.renderer.info.memory; return { geometries: i.geometries, textures: i.textures } })
    await page.evaluate(() => window.game.player.respawn('bakkal')); await sleep(8000)
    const key = async (code) => { await page.keyboard.down(code); await page.keyboard.up(code) }
    const baseline = await count()
    const rounds = []
    for(let round = 1; round <= 3; round++)
    {
        for(let i = 0; i < 3; i++)
        {
            await page.evaluate(() => window.game.world.garage.open()); await sleep(2500)
            await key('ArrowRight'); await sleep(800)
            await key('Enter'); await sleep(7000) // araç değiştirir
        }
        for(let i = 0; i < 3; i++)
        {
            await page.evaluate(() => window.game.quality.changeLevel(0)); await sleep(2500)
            await page.evaluate(() => window.game.quality.changeLevel(1)); await sleep(2500)
        }
        for(const area of [ 'landing', 'projects', 'career', 'social', 'monkey', 'bakkal' ])
        {
            await page.evaluate((a) => window.game.player.respawn(a), area); await sleep(5000)
        }
        rounds.push({ round, ...(await count()) })
    }
    report.leak = { baseline, rounds, errors: [ ...new Set(errors) ].slice(0, 6) }
    console.log(JSON.stringify(report.leak))
    await browser.close()
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
