// Harita görselini (static/ui/map/map-day.png/.webp, 1024×1024) mevcut dünyadan üstten (neredeyse ortografik) render eder.
// Eşleme Map.js worldToMap ile aynı: u = x/192 + 0.5, v = z/192 + 0.5 (terrain.size = 192), yani kare x,z ∈ [-96, 96]; görüntü yukarısı = −z.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/map/render_map.mjs <çıktı.png> [port=4174]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const OUT = process.argv[2] || 'map.png'
const PORT = process.argv[3] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 })
page.on('pageerror', e => console.log('pageerror', String(e?.message ?? e).slice(0, 200)))
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('quality', 'high'); localStorage.setItem('hintsSeen', '1') } catch(e) {} })
await page.goto(`http://127.0.0.1:${PORT}/#skip`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)

await page.evaluate(() =>
{
    const game = window.game
    game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0 }, 0)
    game.dayCycles.override.start({ progress: 0.07 }, 0)
    document.querySelectorAll('.game > *:not(canvas)').forEach(e => { e.style.display = 'none' })
    const H = 2600
    const fov = 2 * Math.atan(96 / H) * 180 / Math.PI
    game.ticker.events.on('tick', () =>
    {
        // Kameranın görebildiği her şey çizilsin: görünürlük dörtgeni ve sis genişletilir
        for(const q of game.view.optimalArea.quad2) { q.offseted.set(0, 0) }
        const quad = game.view.optimalArea.quad2
        quad[0].offseted.set(-200, -200); quad[1].offseted.set(200, -200); quad[2].offseted.set(200, 200); quad[3].offseted.set(-200, 200)
        game.fog.near.value = 1e6
        game.fog.far.value = 2e6
        // Zemin ve su yüzeyi normalde kamerayı izleyen küçük bir karedir: haritayı kaplayacak şekilde büyütülür
        for(const mesh of [ game.world.floor.mesh, game.world.waterSurface.mesh ])
        {
            mesh.scale.set(4, 1, 4)
            mesh.position.x = 0
            mesh.position.z = 0
        }
        // Arka plan: haritanın koyu mavi-gri zemini
        game.fog.colorA.value.set('#2b3350')
        game.fog.colorB.value.set('#2b3350')
        const camera = game.view.camera
        camera.fov = fov
        camera.near = 100
        camera.far = 6000
        camera.position.set(0, H, 0)
        camera.up.set(0, 0, -1)
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld(true)
    }, 996)
})
await sleep(8000)
const shot = await page.screenshot({ type: 'png' })
await browser.close()

// Rötuş: oyundaki çimen kılları ve yol malzemesi uzaktan koyu kalır. terrain.png (kırmızı = yol/döşeme, yeşil = çim, mavi = su; Map.js ile aynı
// uv eşlemesi) maskesiyle çim alanları zeytin yeşiline, çok koyu yol yüzeyi kahverengi-griye çekilir; ışık/gölge varyasyonu korunur.
const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const terrain = await sharp(path.join(root, 'static/terrain/terrain.png')).resize(info.width, info.height).removeAlpha().raw().toBuffer()
const mix = (a, b, t) => a + (b - a) * t
for(let i = 0; i < info.width * info.height; i++)
{
    const o = i * 3
    const r = data[o], g = data[o + 1], b = data[o + 2]
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
    const tr = terrain[o] / 255, tg = terrain[o + 1] / 255, tb = terrain[o + 2] / 255
    if(lum < 0.42 && tg > 0.55 && tr < 0.45 && tb < 0.45)
    {
        // çim: koyu kahve → zeytin yeşili (parlaklık varyasyonu korunur)
        const k = 0.65 + lum * 1.1
        const t = Math.min(1, (0.42 - lum) / 0.2) * 0.9
        data[o] = mix(r, 118 * k, t); data[o + 1] = mix(g, 142 * k, t); data[o + 2] = mix(b, 62 * k, t)
    }
    else if(lum < 0.14 && tr > 0.6)
    {
        // asfalt: mor-siyah → sıcak koyu gri
        const k = 0.8 + lum * 2
        data[o] = mix(r, 78 * k, 0.9); data[o + 1] = mix(g, 68 * k, 0.9); data[o + 2] = mix(b, 58 * k, 0.9)
    }
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(OUT)
console.log('yazıldı:', OUT)
