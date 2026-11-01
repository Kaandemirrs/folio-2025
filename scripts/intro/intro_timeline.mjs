// Giriş zaman çizelgesi ve ekran görüntüleri (headless Chrome, WebGPU).
//   node scripts/intro/intro_timeline.mjs <url> <çıktı-öneki> [profil: desktop|narrow|phone] [kalite: 0|1]
// Ölçülenler (sayfa gezinmesinden itibaren ms): ilk intro, yükleme halkası %100, reveal step 0 (tıklanabilir), etiket görünür.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const [ , , URL_, PREFIX = '/tmp/intro', PROFILE = 'desktop' ] = process.argv
const PROFILES = {
    desktop: { width: 1280, height: 720, deviceScaleFactor: 1 },
    narrow: { width: 1200, height: 900, deviceScaleFactor: 1 },
    phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 200)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await page.setViewport(PROFILES[PROFILE])
if(PROFILE === 'phone') await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')

const t0 = Date.now()
await page.goto(URL_, { waitUntil: 'domcontentloaded' })
const marks = {}
let shot = 0
const state = () => page.evaluate(() =>
{
    const g = window.game
    const intro = g && g.world && g.world.intro
    return {
        intro: !!intro,
        progress: intro ? +intro.circle.progress.toFixed(3) : null,
        smoothed: intro ? +intro.circle.smoothedProgress.value.toFixed(3) : null,
        step: g && g.reveal ? g.reveal.step : null,
        label: !!(intro && intro.label && intro.label.scale.x > 0.9 && intro.text),
        loadingText: intro && intro.loading ? intro.loading.state : null,
        clickable: !!(g && g.reveal && g.reveal.clickable),
    }
})
for(let i = 0; i < 1200; i++)
{
    const t = Date.now() - t0
    let s = null
    try { s = await state() } catch(e) { await sleep(50); continue }
    if(s.intro && marks.intro === undefined) marks.intro = t
    if(s.progress >= 1 && marks.progress100 === undefined) marks.progress100 = t
    if(s.smoothed >= 0.99 && marks.ring100 === undefined) marks.ring100 = t
    if(s.step === 0 && marks.step0 === undefined) marks.step0 = t
    if(s.clickable && marks.clickable === undefined) marks.clickable = t
    if(s.label && marks.label === undefined) { marks.label = t; await sleep(3800); await page.screenshot({ path: `${PREFIX}_ready.png` }); break }
    if(s.intro && s.progress > 0.3 && shot === 0) { shot = 1; await page.screenshot({ path: `${PREFIX}_loading.png` }) }
    await sleep(50)
}
console.log(JSON.stringify({ profile: PROFILE, marks, errors: [...new Set(errors)].slice(0, 5) }))
await browser.close()
