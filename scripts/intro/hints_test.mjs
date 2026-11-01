// İpucu akışı testi (headless Chrome): metinler, mod değişimi, menüde gizlenme, tek seferlik gösterim, tekrar göster.
//   node scripts/intro/hints_test.mjs <url> <çıktı-öneki>
import puppeteer from 'puppeteer-core'
const [ , , URL_, PREFIX = '/tmp/hints' ] = process.argv
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const errors = []
async function open()
{
    const page = await browser.newPage()
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)))
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(URL_, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    await sleep(1500)
    for(let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
    await sleep(1500)
    return page
}
const state = (page) => page.evaluate(() => ({ step: window.game.hints.step, text: document.querySelector('.js-hints-text').textContent, visible: document.querySelector('.js-hints').classList.contains('is-visible') }))
const log = {}
let page = await open()
await sleep(3500)
log.drive = await state(page)
await page.screenshot({ path: `${PREFIX}_drive.png` })
// Mod değişimi: gamepad ve dokunmatik
await page.evaluate(() => window.game.inputs.updateMode(2)); log.gamepad = await state(page)
await page.evaluate(() => window.game.inputs.updateMode(3)); log.touch = await state(page)
await page.evaluate(() => window.game.inputs.updateMode(1)); log.keyboard = await state(page)
// Menü açıkken gizli
await page.evaluate(() => window.game.menu.open()); await sleep(900); log.menuOpen = await state(page)
await page.evaluate(() => window.game.menu.close()); await sleep(900)
// Sürüş mesafesi → etkileşim → harita
await page.evaluate(() => { const p = window.game.physicalVehicle.position; window.game.hints.startPosition.set(p.x - 40, p.y, p.z) }); await sleep(500)
log.interact = await state(page); await page.screenshot({ path: `${PREFIX}_interact.png` })
await page.evaluate(() => window.game.hints.next()); await sleep(600)
log.map = await state(page); await page.screenshot({ path: `${PREFIX}_map.png` })
await page.evaluate(() => { window.game.hints.elapsed = 99 }); await sleep(500)
log.done = await state(page)
log.stored = await page.evaluate(() => localStorage.getItem('hintsSeen'))
await page.close()
// İkinci ziyaret: gösterilmemeli
page = await open(); log.secondVisit = await state(page)
await page.evaluate(() => { document.querySelector('.js-hints-replay').click() }); await sleep(1200)
log.replay = await state(page)
console.log(JSON.stringify({ log, errors: [...new Set(errors)].slice(0, 5) }, null, 1))
await browser.close()
