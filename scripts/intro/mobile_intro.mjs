// Giriş ekranı düzeni ve başlatma dokunması testi (headless Chrome, dokunmatik mod).
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/intro/mobile_intro.mjs <çıktı-klasörü> <GxY>[,<GxY>...] [mod=shot|tap|tapnear] [port=4174]
//   shot    : yalnızca ekran görüntüsü; tap: etiketin ortasına dokun; tapnear: etiket kutusunun dış kenarına yakın (cömert alan) dokun
//   Başlangıç durumu: step 0 (etiket görünür). tap/tapnear sonrasında step 1'e geçmesi beklenir.
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const SIZES = (process.argv[3] || '390x844').split(',')
const MODE = process.argv[4] || 'shot'
const PORT = process.argv[5] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const results = []
for(const size of SIZES)
{
    const [ width, height ] = size.split('x').map(Number)
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message.slice(0, 300)))
    const desktop = !!process.env.DESKTOP // DESKTOP=1: fare + klavye düzeni, tıklama testi
    await page.setViewport(desktop ? { width, height } : { width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    if(!desktop)
        await page.evaluate(() => window.game.inputs.updateMode(3))
    await sleep(6000)
    await page.screenshot({ path: `${OUT}/intro_${size}.png` })

    // Etiketin ekrandaki kutusu (hit düzlemi) ve ses düğmesi
    const info = await page.evaluate(() =>
    {
        const intro = window.game.world.intro
        const camera = window.game.view.camera
        const toScreen = (v) => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight } }
        const hit = intro.startHit || intro.text.mesh
        hit.updateWorldMatrix(true, false)
        const p = hit.geometry.attributes.position
        const corners = []
        for(const i of [ 0, 1, 2, 3 ]) corners.push(toScreen(hit.localToWorld(new hit.position.constructor().fromBufferAttribute(p, i))))
        const xs = corners.map(c => c.x), ys = corners.map(c => c.y)
        const sound = toScreen(intro.soundButton.intersect.shape.center)
        return { box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, sound, labelCenter: toScreen(intro.label.position) }
    })
    const w = info.box.x1 - info.box.x0
    const h = info.box.y1 - info.box.y0
    const result = { size, box: { w: Math.round(w), h: Math.round(h), ...info.box }, sound: info.sound, errors }
    if(MODE === 'tap' || MODE === 'tapnear')
    {
        const point = MODE === 'tap' ? { x: (info.box.x0 + info.box.x1) / 2, y: (info.box.y0 + info.box.y1) / 2 } : { x: info.box.x0 + w * 0.06, y: info.box.y0 + h * 0.1 }
        if(desktop)
        {
            await page.mouse.move(point.x, point.y)
            await sleep(300)
            await page.mouse.down()
            await sleep(100) // gerçek tıklamadaki basılı kalma süresi: rayCursor 'start' ile 'end' arasında kare geçmeli
            await page.mouse.up()
        }
        else
            await page.touchscreen.tap(point.x, point.y)
        await sleep(2500)
        result.tap = point
        result.stepAfter = await page.evaluate(() => window.game.reveal.step)
    }
    results.push(result)
    await page.close()
}
console.log(JSON.stringify(results, null, 1))
await browser.close()
