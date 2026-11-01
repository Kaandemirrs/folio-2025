// Dünya değişiklikleri için headless Chrome (WebGPU) görüntü/duman testi.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &   (ya da build + preview)
//   node scripts/world/world_test.mjs <çıktı-klasörü> <senaryo[,senaryo]> [port=4174]
// Senaryolar: landing (harfler + bayrak), flagwind (rüzgâr 0 / 1), day (gündüz adayları)
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '.'
const SCENARIOS = (process.argv[3] || 'landing').split(',')
const PORT = process.argv[4] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 300)))
page.on('console', m => { if(m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })

await page.goto(`http://127.0.0.1:${PORT}/${process.env.QUALITY ? '#' + process.env.QUALITY : ''}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)

const weather = (w, progress) => page.evaluate((w, progress) =>
{
    window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: w }, 0)
    if(progress !== undefined)
        window.game.dayCycles.override.start({ progress }, 0)
}, w, progress)
const info = {}

for(const name of SCENARIOS)
{
    if(name === 'landing')
    {
        await weather(0.4, 0.07)
        await page.evaluate(() => window.game.player.respawn('landing'))
        await sleep(5000)
        await page.screenshot({ path: `${OUT}/landing_spawn.png` })
        await page.evaluate(() => window.game.player.respawn('controls'))
        await sleep(5000)
        await page.screenshot({ path: `${OUT}/landing_flag.png` })
        info.landing = await page.evaluate(() => ({ calls: window.game.rendering.renderer.info.render.calls, triangles: window.game.rendering.renderer.info.render.triangles }))
    }
    else if(name === 'day')
    {
        // Gündüz adayları: her ilerleme için üç nokta
        for(const progress of (process.env.DAYS || '0.02,0.07,0.12,0.95').split(',').map(Number))
        {
            await weather(0.15, progress)
            for(const spot of [ 'landing', 'projects', 'bakkal' ])
            {
                await page.evaluate((spot) => window.game.player.respawn(spot), spot)
                await sleep(4500)
                await page.screenshot({ path: `${OUT}/day_${progress}_${spot}.png` })
            }
        }
    }
    else if(name === 'natural')
    {
        // Gerçek saatle: gün döngüsü sabit gündüz kalıyor mu, hava durumu akıyor mu?
        await page.evaluate(() => window.game.player.respawn('landing'))
        await sleep(4000)
        info.natural = []
        for(let i = 0; i < 3; i++)
        {
            info.natural.push(await page.evaluate(() => ({ progress: +window.game.dayCycles.progress.toFixed(3), absolute: +window.game.dayCycles.absoluteProgress.toFixed(5), night: window.game.dayCycles.intervalEvents.get('night').inInterval, lightIntensity: +window.game.dayCycles.properties.lightIntensity.value.toFixed(2), wind: +window.game.weather.wind.value.toFixed(3), humidity: +window.game.weather.humidity.value.toFixed(3) })))
            await sleep(3000)
        }
        await page.screenshot({ path: `${OUT}/natural_landing.png` })
    }
    else if(name === 'social')
    {
        await weather(0.2, 0.07)
        await page.evaluate(() => window.game.player.respawn('social'))
        await sleep(6000)
        await page.screenshot({ path: `${OUT}/social_ingame.png` })
        info.social = await page.evaluate(() => window.game.interactivePoints.items.filter(i => ['X', 'GitHub', 'LinkedIn'].includes(i.name)).map(i => ({ name: i.name, x: +i.position.x.toFixed(1), z: +i.position.z.toFixed(1) })))
        // Çalı/çiçekler uzaktan yüklenir, bir de ikon halkasının merkezine yakın dur
        await page.evaluate(() => { window.game.physicalVehicle.position && 0 })
    }
    else if(name === 'topdown')
    {
        // Yukarıdan bakış (yerleşim seçmek için): TOPDOWN="ad:x:z,ad:x:z" verilen noktaları yukarıdan çeker
        await weather(0.2, 0.07)
        await page.evaluate(() => window.game.dayCycles.override.start({ progress: 0.07, fogNearRatio: 8, fogFarRatio: 12 }, 0))
        for(const spot of (process.env.TOPDOWN || 'landing:44:38').split(','))
        {
            const [ label, x, z ] = spot.split(':')
            await page.evaluate((x, z) =>
            {
                const game = window.game
                game.player.respawn('landing')
                window.__top = { x: +x, z: +z }
                if(!window.__topInstalled)
                {
                    window.__topInstalled = true
                    game.ticker.events.on('tick', () =>
                    {
                        if(!window.__top) return
                        game.view.camera.position.set(window.__top.x, 55, window.__top.z + 0.001)
                        game.view.camera.lookAt(window.__top.x, 0, window.__top.z)
                    }, 100)
                }
            }, x, z)
            await sleep(3500)
            await page.screenshot({ path: `${OUT}/top_${label}.png` })
        }
    }
    else if(name === 'markers')
    {
        // Aday konumlara geçici macenta sütunlar koyup normal kamerayla çeker.
        // MARKERS="ad:x:z:facingDeg[:respawn],..." (sütun 2,8 × 3,5 × 2; ön yüz sarı şerit)
        await weather(0.2, 0.07)
        const spots = (process.env.MARKERS || '').split(',').filter(Boolean).map(item => { const [ label, x, z, facing, respawn ] = item.split(':'); return { label, x: +x, z: +z, facing: +facing, respawn: respawn || label } })
        await page.evaluate(async (spots) =>
        {
            const url = performance.getEntriesByType('resource').map(r => r.name).find(n => /three_webgpu/.test(n))
            const THREE = await import(url)
            for(const spot of spots)
            {
                const group = new THREE.Group()
                const body = new THREE.Mesh(new THREE.BoxGeometry(2.84, 3.5, 2), new THREE.MeshBasicMaterial({ color: '#ff00ff' }))
                body.position.y = 1.75
                const front = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.1), new THREE.MeshBasicMaterial({ color: '#ffff00' }))
                front.position.set(0, 2.2, 1.05)
                group.add(body, front)
                group.position.set(spot.x, 0, spot.z)
                group.rotation.y = Math.PI / 2 - spot.facing * Math.PI / 180
                window.game.scene.add(group)
            }
        }, spots)
        for(const spot of spots)
        {
            await page.evaluate((name) => window.game.player.respawn(name), spot.respawn)
            await sleep(5000)
            await page.screenshot({ path: `${OUT}/marker_${spot.label}.png` })
        }
    }
    else if(name === 'jukebox')
    {
        await weather(0.2, 0.07)
        const map = { landing: 'landing', bakkal: 'bakkal', projects: 'projects', career: 'career', social: 'social', bowling: 'bowling' }
        info.jukebox = await page.evaluate(() => ({ count: window.game.interactivePoints.items.filter(i => i.text === 'Şarkıyı değiştir').length, placements: window.game.world.jukeboxes.config.placements.map(p => p.id) }))
        for(const [ id, respawn ] of Object.entries(map))
        {
            await page.evaluate((name) => window.game.player.respawn(name), respawn)
            await sleep(5000)
            await page.screenshot({ path: `${OUT}/jukebox_${id}.png` })
        }
    }
    else if(name === 'flagwind')
    {
        await page.evaluate(() => window.game.player.respawn('controls'))
        for(const w of [ 0, 0.4, 1 ])
        {
            await weather(w, 0.3)
            await sleep(4000)
            await page.screenshot({ path: `${OUT}/flag_wind_${w}.png`, clip: { x: 320, y: 60, width: 640, height: 420 } })
        }
    }
}
console.log(JSON.stringify({ info, errors: [...new Set(errors)].slice(0, 8) }, null, 1))
await browser.close()
