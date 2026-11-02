// Kariyer panosu testi (headless Chrome): uzaktan görünüm, inceleme modu (sinematik), Esc ile dönüş, mobil modal + pinch-zoom.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/career/career_test.mjs <çıktı-klasörü> [port=4174]
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const PORT = process.argv[3] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const log = {}

const boot = async (viewport) =>
{
    const page = await browser.newPage()
    page.on('pageerror', e => (log.errors ??= []).push(String(e?.message ?? e).slice(0, 300)))
    page.on('console', m => { if(m.type() === 'error') (log.errors ??= []).push(m.text().slice(0, 300)) })
    await page.setViewport(viewport)
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    await sleep(2000)
    for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
    await sleep(3000)
    await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0.2 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })
    return page
}
const board = (page, fn) => page.evaluate(fn)

// Masaüstü
{
    const page = await boot({ width: 1280, height: 720 })
    await page.evaluate(() => window.game.player.respawn('career'))
    await sleep(8000)
    await page.screenshot({ path: `${OUT}/career_far.png` })
    log.desktopBefore = await board(page, () => ({ state: window.game.world.areas.career.board.state, useModal: window.game.world.areas.career.board.useModal, areas: [ ...window.game.achievements.groups.get('areas').progress ] }))
    await board(page, () => window.game.world.areas.career.board.open())
    await sleep(4500)
    await page.screenshot({ path: `${OUT}/career_open.png` })
    log.desktopOpen = await board(page, () => ({ state: window.game.world.areas.career.board.state, cinematic: window.game.view.cinematic.active, filters: [ ...window.game.inputs.filters ] }))
    await page.keyboard.press('Escape')
    await sleep(3000)
    log.desktopClosed = await board(page, () => ({ state: window.game.world.areas.career.board.state, cinematic: window.game.view.cinematic.active, filters: [ ...window.game.inputs.filters ], menu: window.game.menu.state }))
    await page.close()
}

// Mobil dikey (dokunmatik): modal
{
    const page = await boot({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.evaluate(() => window.game.inputs.updateMode(3))
    await page.evaluate(() => window.game.player.respawn('career'))
    await sleep(8000)
    await board(page, () => window.game.world.areas.career.board.open())
    await sleep(1500)
    await page.screenshot({ path: `${OUT}/career_modal_phone.png` })
    // pinch: iki işaretçiyle uzaklaştır
    log.phoneModal = await page.evaluate(async () =>
    {
        const element = document.querySelector('.js-career-modal')
        const fire = (type, id, x, y) => element.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }))
        fire('pointerdown', 1, 150, 420); fire('pointerdown', 2, 240, 420)
        for(let i = 1; i <= 10; i++) { fire('pointermove', 1, 150 - i * 8, 420); fire('pointermove', 2, 240 + i * 8, 420); await new Promise(r => setTimeout(r, 16)) }
        fire('pointerup', 1, 70, 420); fire('pointerup', 2, 320, 420)
        const transform = document.querySelector('.js-career-image').style.transform
        return { open: !element.hidden, transform, state: window.game.world.areas.career.board.state }
    })
    await sleep(300)
    await page.screenshot({ path: `${OUT}/career_modal_phone_zoom.png` })
    await page.evaluate(() => document.querySelector('.js-career-close').click())
    await sleep(2500)
    log.phoneClosed = await board(page, () => ({ state: window.game.world.areas.career.board.state, hidden: document.querySelector('.js-career-modal').hidden, filters: [ ...window.game.inputs.filters ] }))
    await page.close()
}
console.log(JSON.stringify(log, null, 1))
await browser.close()
