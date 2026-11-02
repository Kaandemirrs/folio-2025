// Paylaşım görseli (static/social/share-image.png, 1200×630): oyundan gerçek ekran görüntüsü (landing, yüksek kalite, gündüz) + alt solda başlık.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/seo/make_share_image.mjs [port=4174]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('quality', 'high'); localStorage.setItem('hintsSeen', '1') } catch(e) {} })
await page.goto(`http://127.0.0.1:${process.argv[2] || 4174}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0.2 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })
// Landing: W140 harfler ve bayrak arasında
await page.evaluate(() => { window.game.physicalVehicle.moveTo({ x: 46.5, y: 4, z: 35.5 }, -0.3); window.game.view.zoom.baseRatio = 0.12; window.game.view.zoom.ratio = 0.12; window.game.view.zoom.smoothedRatio = 0.12 })
await sleep(6000)
// Başlık: sayfa içinde Amatic SC (oyunun yazı tipi) ile, alt solda okunaklı bir bantla
await page.evaluate(() =>
{
    document.querySelectorAll('.menu-trigger, .map-trigger, .hints, .js-notifications').forEach(e => { e.style.display = 'none' })
    const band = document.createElement('div')
    band.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:230px;background:linear-gradient(rgba(26,16,32,0),rgba(26,16,32,0.9));z-index:99;font-family:"Amatic SC",sans-serif;font-weight:700;color:#fff;padding:0 46px 22px;display:flex;flex-direction:column;justify-content:flex-end'
    band.innerHTML = '<div style="font-size:92px;line-height:0.95">Kaan Demir</div><div style="font-size:50px;line-height:1">Full Stack &amp; Mobil Geliştirici</div>'
    document.body.append(band)
})
await sleep(500)
const shot = await page.screenshot({ type: 'png' })
await browser.close()

const out = path.join(root, 'static/social/share-image.png')
await sharp(shot).png({ palette: true, quality: 82, compressionLevel: 9 }).toFile(out)
console.log(out, fs.statSync(out).size, 'bayt')
