// Sızıntı ayrıştırma: hangi eylem geometri/texture sayısını (renderer.info.memory) sürekli artırıyor?
//   node scripts/perf/leak_bisect.mjs [port=4181]
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('quality', 'low'); localStorage.setItem('hintsSeen', '1') } catch(e) {} })
await page.goto(`http://127.0.0.1:${process.argv[2] || 4181}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 240000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
const count = () => page.evaluate(() => { const i = window.game.rendering.renderer.info.memory; return [ i.geometries, i.textures ] })
const key = async (code) => { await page.keyboard.down(code); await page.keyboard.up(code) }
const actions = {
    kalite: async () => { await page.evaluate(() => window.game.quality.changeLevel(0)); await sleep(2000); await page.evaluate(() => window.game.quality.changeLevel(1)); await sleep(2000) },
    garajSec: async () => { await page.evaluate(() => window.game.world.garage.open()); await sleep(2500); await key('ArrowRight'); await sleep(800); await key('Enter'); await sleep(7000) },
    garajCik: async () => { await page.evaluate(() => window.game.world.garage.open()); await sleep(2500); await key('ArrowRight'); await sleep(1000); await key('Escape'); await sleep(3000) },
    alanGezinti: async () => { for(const a of [ 'landing', 'projects', 'career', 'social', 'monkey', 'bakkal' ]) { await page.evaluate((n) => window.game.player.respawn(n), a); await sleep(4500) } },
}
await page.evaluate(() => window.game.player.respawn('bakkal')); await sleep(6000)
// ısınma: ilk tur lazy yüklemeleri sayar
for(const fn of Object.values(actions)) await fn()
const out = {}
for(const [ name, fn ] of Object.entries(actions))
{
    const series = [ await count() ]
    for(let i = 0; i < 3; i++) { await fn(); series.push(await count()) }
    out[name] = series.map(([ g, t ]) => `${g}/${t}`).join(' → ')
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
