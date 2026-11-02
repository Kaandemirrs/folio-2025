// Varsayılan kamera açısında ekran-sağ vektörünü (xz düzlemi) yazdırır: ProjectBoard kaydırması bundan hesaplanır.
//   node scripts/projects/camera_right.mjs [port=4174]
import puppeteer from 'puppeteer-core'
const PORT = process.argv[2] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
console.log(JSON.stringify(await page.evaluate(() =>
{
    const camera = window.game.view.camera
    camera.updateMatrixWorld(true)
    const right = camera.position.clone().set(1, 0, 0).transformDirection(camera.matrixWorld)
    const forward = camera.position.clone().set(0, 0, -1).transformDirection(camera.matrixWorld)
    const flat = (v) => { const l = Math.hypot(v.x, v.z); return [ +(v.x / l).toFixed(4), +(v.z / l).toFixed(4) ] }
    return { rightXZ: flat(right), forwardXZ: flat(forward), rightRaw: right.toArray(), position: camera.position.toArray() }
})))
await browser.close()
