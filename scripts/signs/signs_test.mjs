// Tabela/pano/mail değişiklikleri için headless Chrome (WebGPU) görüntü testi.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/signs/signs_test.mjs <çıktı-klasörü> <senaryo[,senaryo]> [port=4174]
// Senaryolar: info (respawn/alan konumları), signs (her tabela yakınında), landing
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const SCENARIOS = (process.argv[3] || 'info').split(',')
const PORT = process.argv[4] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push((e.stack || e.message).slice(0, 500)))
page.on('console', m => { if(m.type() === 'error' || m.text().startsWith('HORON')) errors.push(m.text().slice(0, 200) + ' @ ' + JSON.stringify(m.stackTrace().slice(0, 3))) })
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: +(process.env.DSF || 1) })

await page.goto(`http://127.0.0.1:${PORT}/${process.env.QUALITY ? '#' + process.env.QUALITY : ''}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0.2 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })

const info = {}
for(const name of SCENARIOS)
{
    if(name === 'info')
    {
        info.respawns = await page.evaluate(() => [ ...window.game.respawns.items.values() ].map(r => `${r.name}: ${r.position.x.toFixed(1)}, ${r.position.z.toFixed(1)} rot ${r.rotation.toFixed(2)}`))
        info.signs = await page.evaluate(() => window.game.world.signs.items.map(i => ({ id: i.placement.id, variant: i.group.children[0].name, deg: i.object.physical.body.rotation() })))
    }
    else if(name === 'signs')
    {
        // Her tabelaya yakın bir noktadan çek
        const ids = await page.evaluate(() => window.game.world.signs.items.map(i => i.placement.id))
        for(const id of ids)
        {
            await page.evaluate((id) =>
            {
                const item = window.game.world.signs.items.find(i => i.placement.id === id)
                const p = item.object.physical.initialState.position
                const base = window.game.respawns.getByName('landing')
                const position = base.position.clone()
                for(const other of window.game.world.signs.items) window.game.objects.resetObject(other.object)
                position.set(p.x + 4.5, 4, p.z + 4.5)
                window.game.respawns.items.set('tmp', { name: 'tmp', position, rotation: 0 })
                window.game.player.respawn('tmp')
            }, id)
            await sleep(9000)

            // Tabelanın ekrandaki konumuna yakın kırpma (yazı okunabilirliği); aynı karede tam görüntü de alınır
            const screen = await page.evaluate((id) =>
            {
                const item = window.game.world.signs.items.find(i => i.placement.id === id)
                const p = item.object.physical.body.translation()
                const camera = window.game.view.camera
                const vector = camera.position.clone().set(p.x, 1.3, p.z).project(camera)
                return { x: (vector.x * 0.5 + 0.5) * window.innerWidth, y: (-vector.y * 0.5 + 0.5) * window.innerHeight }
            }, id)
            const w = 280
            const h = 200
            const clip = { x: Math.max(0, Math.min(1280 - w, screen.x - w / 2)), y: Math.max(0, Math.min(720 - h, screen.y - h / 2)), width: w, height: h }
            await page.screenshot({ path: `${OUT}/sign_${id}.png` })
            await page.screenshot({ path: `${OUT}/crop_${id}.png`, clip })
        }
    }
    else if(name === 'board')
    {
        await page.evaluate(() =>
        {
            const base = window.game.respawns.getByName('landing')
            const position = base.position.clone()
            position.set(60, 4, 38)
            window.game.respawns.items.set('tmp', { name: 'tmp', position, rotation: 0 })
            window.game.player.respawn('tmp')
        })
        await sleep(7000)
        await page.screenshot({ path: `${OUT}/board_landing.png` })
        await page.evaluate(() => window.game.world.projectBoard.viewer.open())
        await sleep(4000)
        await page.screenshot({ path: `${OUT}/board_open.png` })
        await page.keyboard.press('ArrowRight')
        await sleep(2500)
        await page.screenshot({ path: `${OUT}/board_next.png` })
        info.board = await page.evaluate(() => ({ state: window.game.world.projectBoard.viewer.state, index: window.game.world.projectBoard.viewer.navigation.index, image: window.game.world.projectBoard.viewer.imageIndex }))
        await page.keyboard.press('Escape')
        await sleep(2500)
        info.boardAfterEsc = await page.evaluate(() => window.game.world.projectBoard.viewer.state)
        await page.screenshot({ path: `${OUT}/board_closed.png` })
    }
    else if(name === 'horon')
    {
        await page.evaluate(() =>
        {
            const base = window.game.respawns.getByName('landing')
            const position = base.position.clone()
            position.set(-59.5, 4, -43.4)
            window.game.respawns.items.set('tmp', { name: 'tmp', position, rotation: Math.PI })
            window.game.player.respawn('tmp')
        })
        await sleep(9000)
        await page.screenshot({ path: `${OUT}/horon_idle.png` })
        info.horonLoaded = await page.evaluate(() => !!window.game.world.horon.loaded)
        await page.evaluate(() => window.game.world.horon.setDancing(true))
        await sleep(2500)
        await page.screenshot({ path: `${OUT}/horon_dance1.png` })
        await sleep(1700)
        await page.screenshot({ path: `${OUT}/horon_dance2.png` })
        info.horonStats = await page.evaluate(() => { const r = window.game.rendering.renderer; r.info.reset?.(); return null })
    }
    else if(name === 'projects')
    {
        await page.evaluate(() => window.game.player.respawn('projects'))
        await sleep(6000)
        await page.evaluate(() => window.game.world.areas.projects.open())
        await sleep(4000)
        await page.screenshot({ path: `${OUT}/projects_open.png` })
        await page.keyboard.press('ArrowRight')
        await sleep(2500)
        info.projects = await page.evaluate(() => { const a = window.game.world.areas.projects; return { state: a.state, index: a.navigation.index, image: a.images.index } })
        await page.screenshot({ path: `${OUT}/projects_next.png` })
        await page.keyboard.press('Escape')
        await sleep(2500)
        info.projectsAfterEsc = await page.evaluate(() => ({ state: window.game.world.areas.projects.state, menu: window.game.menu.state, modals: window.game.modals.state, filters: [ ...window.game.inputs.filters ] }))
    }
    else if(name === 'landing')
    {
        await page.evaluate(() => window.game.player.respawn('landing'))
        await sleep(5000)
        await page.screenshot({ path: `${OUT}/landing.png` })
        info.landing = await page.evaluate(() => ({ calls: window.game.rendering.renderer.info.render.calls, triangles: window.game.rendering.renderer.info.render.triangles }))
    }
    else if(name.startsWith('goto:'))
    {
        // goto:x:z:çıktı
        const [ , x, z, file ] = name.split(':')
        await page.evaluate((x, z, zoom) =>
        {
            window.game.physicalVehicle.moveTo({ x: +x, y: 4, z: +z }, 0)
            if(zoom !== undefined) { window.game.view.zoom.baseRatio = +zoom; window.game.view.zoom.ratio = +zoom; window.game.view.zoom.smoothedRatio = +zoom }
        }, x, z, process.env.ZOOM)
        await sleep(4500)
        await page.screenshot({ path: `${OUT}/${file}.png` })
    }
}
console.log(JSON.stringify({ info, errors }, null, 1))
await browser.close()
