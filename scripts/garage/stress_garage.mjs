// Garaj stres testi (headless Chrome, WebGPU): hızlı gezinme, yükleme sırasında seçim, Esc yarışları, gir-çık, Konami vb.
// Her senaryodan sonra durum sağlık kontrolü yapılır; sorun varsa senaryo "FAIL" yazılır.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/garage/stress_garage.mjs [senaryo,senaryo...|all] [port=4174]
import puppeteer from 'puppeteer-core'

const WANTED = (process.argv[2] || 'all').split(',')
const PORT = process.argv[3] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
let page = null
let errors = []

// Sayfayı açıp girişi geçer, araç yükleme kancasını kurar. Takılan bir senaryodan sonra yeniden çağrılır (temiz başlangıç)
const boot = async () =>
{
    if(page)
        await page.close()
    page = await browser.newPage()
    page.on('pageerror', e => errors.push('pageerror: ' + String(e?.message ?? e).slice(0, 200)))
    page.on('console', m => { if(m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)) })
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
    await sleep(2000)
    for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
    await sleep(3000)
    await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0.2 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })

    // kare sayacı (donma tespiti)
    await page.evaluate(() => { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick) }; tick() })

    // Araç GLB yüklemesini yavaşlatma / başarısız kılma kancası (window.__vehicleLoad = 'normal' | 'slow' | 'fail')
    await page.evaluate(() =>
    {
        window.__vehicleLoad = 'normal'
        const loader = window.game.resourcesLoader.getLoader('gltf')
        const original = loader.load.bind(loader)
        loader.load = (url, onLoad, onProgress, onError) =>
        {
            if(/vehicle\//.test(url) && window.__vehicleLoad === 'fail')
            {
                setTimeout(() => onError?.(new Error('simulated network failure')), 800)
                return
            }
            if(/vehicle\//.test(url) && window.__vehicleLoad === 'slow')
            {
                setTimeout(() => original(url, onLoad, onProgress, onError), 4000)
                return
            }
            return original(url, onLoad, onProgress, onError)
        }
    })
}
await boot()

const key = async (code, delay = 0) => { await page.keyboard.down(code); if(delay) await sleep(delay); await page.keyboard.up(code) }
const garage = (fn, ...args) => page.evaluate(fn, ...args)

// Araç dosyalarını önbellekten silerek "soğuk yükleme" benzetir
const coldCache = () => page.evaluate(() => { window.game.vehicles.loadings?.clear(); for(const key of [ ...window.game.resourcesLoader.cache.keys() ]) if(/vehicle\//.test(key) || /vehicles?\//.test(key)) window.game.resourcesLoader.cache.delete(key) })

const resetWorld = async () =>
{
    // sağlıklı başlangıç: sürülen araç w140, garaj kapalı, bakkal respawn'ı
    await page.evaluate(async () =>
    {
        const game = window.game
        if(game.vehicles.currentId !== 'w140') await game.vehicles.select('w140')
        game.player.respawn('bakkal')
    })
    await sleep(7000)
}

const health = () => page.evaluate(() =>
{
    const game = window.game
    const garage = game.world.garage
    const problems = []
    if(garage.state !== 1) problems.push(`garage.state=${garage.state} (CLOSED=1 bekleniyordu)`)
    if(game.inputs.filters.has('cinematic')) problems.push('girdi filtresi "cinematic" takılı')
    if(!game.inputs.filters.has('wandering')) problems.push('girdi filtresi "wandering" yok')
    if(game.view.cinematic.active) problems.push('kamera sinematikte kaldı')
    if(!game.physicalVehicle.chassis.physical.body.isEnabled()) problems.push('araç fiziği kapalı (body disabled)')
    if(!game.world.visualVehicle.parts.chassis.visible) problems.push('araç görseli gizli')
    if(game.player.state !== 1) problems.push(`player.state=${game.player.state}`)
    if(game.vehicles.switching) problems.push('vehicles.switching takılı')
    if(game.overlay.progress.value > 0.01 || game.overlay.mesh.visible) problems.push(`overlay açık (progress ${game.overlay.progress.value.toFixed(2)})`)
    if(garage.showcase.group.visible) problems.push('vitrin hâlâ görünür')
    if(garage.parking.loading) problems.push('park yeri yüklemesi takılı')
    const parked = garage.getParkedVehicle().id
    if(!garage.parking.far && garage.parking.vehicleId && garage.parking.vehicleId !== parked) problems.push(`park yerindeki araç yanlış (${garage.parking.vehicleId}, beklenen ${parked})`)
    const speedReady = game.physicalVehicle.chassis.physical.body.translation().y > -5
    if(!speedReady) problems.push('araç dünyadan düştü')
    return { problems, state: { garage: garage.state, current: game.vehicles.currentId, parked: garage.parking.vehicleId, filters: [ ...game.inputs.filters ] } }
})

const scenarios = {
    // Açılır açılmaz sağ/sol'a art arda basma (yükleme sürerken)
    async rapidArrows()
    {
        await coldCache()
        await garage(() => window.game.world.garage.open())
        await sleep(300)
        for(let i = 0; i < 30; i++) await key(i % 3 === 2 ? 'ArrowLeft' : 'ArrowRight')
        await sleep(2500)
        await key('Escape')
    },
    // Araç yüklenirken "Sür" (Enter) — farklı araç, soğuk önbellek
    async selectWhileLoading()
    {
        await coldCache()
        await garage(() => window.game.world.garage.open())
        await sleep(1700)
        await key('ArrowRight')
        await key('Enter')
    },
    // Aynı aracı seçme
    async selectSame()
    {
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        await key('Enter')
    },
    // Seçimden hemen sonra Esc ve tekrar Esc
    async escAfterSelect()
    {
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        await key('ArrowRight')
        await sleep(800)
        await key('Enter')
        await sleep(100)
        await key('Escape')
        await key('Escape')
    },
    // Garaja hızlı gir-çık (API + Esc, 120 ms aralık). Menü açılması (Esc, garaj kapanırken) takılma sayılmaz: sonda menü kapatılır
    // (sağlık kontrolü menüyü de arar)
    async fastInOut()
    {
        for(let i = 0; i < 12; i++)
        {
            await garage(() => window.game.world.garage.open())
            await sleep(120)
            // Garaj tamamen kapalıyken Esc oyunun tasarımı gereği duraklatma menüsünü açar; yalnızca garaj açık/açılıyor/kapanıyorken bas
            if(await garage(() => window.game.world.garage.state !== 1))
                await key('Escape')
            await sleep(120)
        }
    },
    // Garaja hızlı gir-çık, etkileşim tuşuyla (açılırken Enter/Esc yarışı)
    async enterExitKeys()
    {
        for(let i = 0; i < 8; i++)
        {
            await garage(() => window.game.world.garage.open())
            await key('Enter')
            await key('Escape')
            await sleep(60)
        }
    },
    // Park yerindeki araca çarpmışken değiştirme
    async crashedIntoParked()
    {
        await garage(() =>
        {
            const g = window.game.world.garage
            window.game.physicalVehicle.moveTo({ x: g.positions.parking.x + 1.2, y: 2.5, z: g.positions.parking.z }, 0)
        })
        await sleep(2500)
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        await key('ArrowRight')
        await sleep(900)
        await key('Enter')
    },
    // Konami ile araç değiştirme, ardından garaj
    async konamiThenGarage()
    {
        for(const code of [ 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA' ]) await key(code)
        await sleep(400)
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        await key('ArrowRight')
        await sleep(800)
        await key('Enter')
    },
    // Garaj açıkken Konami (araç değişimi gezinme sırasında)
    async konamiWhileOpen()
    {
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        for(const code of [ 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA' ]) await key(code)
        await sleep(1500)
        await key('Escape')
    },
    // Yavaş ağ: sonraki araç 4 sn geç yüklenir, bu arada Esc / sağ-sol / tekrar Enter
    async slowNetworkSelect()
    {
        await coldCache()
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        await garage(() => { window.__vehicleLoad = 'slow' })
        await key('ArrowRight')
        await sleep(300)
        await key('Enter')
        await sleep(500)
        await key('Enter')
        await key('Escape')
        await sleep(6000)
        await garage(() => { window.__vehicleLoad = 'normal' })
    },
    // Ağ hatası: araç dosyaları yüklenemez (önden yükleme dahil); sonra ağ düzelir ve tekrar denenir
    async loadFailure()
    {
        await coldCache()
        await garage(() => { window.__vehicleLoad = 'fail' })
        await garage(() => window.game.world.garage.open())
        await sleep(1800)
        await key('ArrowRight')
        await sleep(1500)
        await key('Enter') // başarısız olmalı, garaj OPEN'a dönmeli
        await sleep(2500)
        console.log('  [loadFailure] hata sonrası', JSON.stringify(await garage(() => ({ state: window.game.world.garage.state, current: window.game.vehicles.currentId, switching: window.game.vehicles.switching }))))
        await garage(() => { window.__vehicleLoad = 'normal' })
        await key('Enter') // ağ düzeldi: yeniden deneme başarılı olmalı
        await sleep(500)
    },
    // Konami art arda, soğuk önbellek (park yeri güncellemesi yarışı)
    async konamiTwiceCold()
    {
        await coldCache()
        await garage(() => window.__vehicleLoad = 'slow')
        for(let n = 0; n < 2; n++)
        {
            for(const code of [ 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA' ]) await key(code)
            await sleep(500)
        }
        await sleep(9000)
        await garage(() => { window.__vehicleLoad = 'normal' })
    },
    // Üç aracı art arda seçip park yerini gözlemle (Doğan ⇄ W140 ⇄ Old School)
    async cycleVehicles()
    {
        for(let i = 0; i < 4; i++)
        {
            await garage(() => window.game.world.garage.open())
            await sleep(1800)
            await key('ArrowRight')
            await sleep(700)
            await key('Enter')
            await sleep(7000)
        }
    },
}

const summary = []
for(const name of Object.keys(scenarios))
{
    if(!WANTED.includes('all') && !WANTED.includes(name))
        continue

    await resetWorld()
    errors = []
    const framesBefore = await page.evaluate(() => window.__frames)
    const startedAt = Date.now()
    await scenarios[name]()
    await sleep(9000)
    const result = await health()
    const frames = (await page.evaluate(() => window.__frames)) - framesBefore
    const fps = frames / ((Date.now() - startedAt) / 1000)
    if(fps < 5) result.problems.push(`kare hızı çok düşük (${fps.toFixed(1)} fps)`)
    if(errors.length) result.problems.push(...errors.map(e => 'konsol: ' + e))
    summary.push({ name, ok: result.problems.length === 0, ...result })
    const failed = result.problems.length > 0
    console.log(`${failed ? 'FAIL' : 'ok  '} ${name}`, result.problems.length ? JSON.stringify(result.problems) : '', JSON.stringify(result.state))
    if(failed)
        await boot() // takılan durum sonraki senaryoyu bozmasın
}
console.log(`\n${summary.filter(s => s.ok).length}/${summary.length} senaryo sağlam`)
await browser.close()
