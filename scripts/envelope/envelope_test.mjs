// Zarf ekran görüntüleri (headless Chrome): landing, projeler girişi, sosyal alan; ayrıca etkileşim (panoya kopyalama + bildirim) ve harita pini.
//   VITE_GAME_PUBLIC=1 npx vite --mode development --port 4174 &
//   node scripts/envelope/envelope_test.mjs <çıktı-klasörü> [port=4174]
import puppeteer from 'puppeteer-core'
const OUT = process.argv[2] || '.'
const PORT = process.argv[3] || '4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const context = browser.defaultBrowserContext()
await context.overridePermissions(`http://127.0.0.1:${PORT}`, [ 'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write' ])
const page = await browser.newPage()
const log = { errors: [] }
page.on('pageerror', e => log.errors.push(String(e?.message ?? e).slice(0, 300)))
page.on('console', m => { if(m.type() === 'error') log.errors.push(m.text().slice(0, 300)) })
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
await page.evaluate(() => { window.game.weather.override.start({ humidity: 0, electricField: 0, clouds: 0, wind: 0.2 }, 0); window.game.dayCycles.override.start({ progress: 0.07 }, 0) })

// 1) landing ilk ekran (doğma noktası) ve 2) projeler girişi, 3) sosyal alan (haritadaki İletişim respawn'ı)
for(const [ name, respawn ] of [ [ 'landing', 'landing' ], [ 'projects', 'projects' ], [ 'social', 'contact' ] ])
{
    await page.evaluate((respawn) => window.game.player.respawn(respawn), respawn)
    await sleep(8000)
    await page.screenshot({ path: `${OUT}/envelope_${name}.png` })
}

// Etkileşim: sosyal zarf etkileşim noktası etiketi + kopyalama (mailto'yu engelle)
log.interaction = await page.evaluate(async () =>
{
    let navigated = null
    const original = window.location.href
    const labels = window.game.interactivePoints.items.map(i => i.text ?? i.name ?? '').filter(Boolean)
    // mailto yönlendirmesini test için yakala
    const descriptor = Object.getOwnPropertyDescriptor(window.location.__proto__, 'href')
    const envelopes = window.game.world.envelopes
    return { envelopeCount: envelopes.items.length, loaded: envelopes.items.map(i => !!i.envelope), labels: labels.length }
})
await page.evaluate(() => { window.__mailto = null; history.pushState = history.pushState })
// Clipboard + bildirim: contact() içindeki mailto navigasyonunu engellemek için sayfa içinde beforeunload yerine tıklama çağrısı sonrası konumu kontrol et
await page.evaluate(() => { window.addEventListener('beforeunload', (e) => { window.__navigating = true }) })
const clipboardBefore = await page.evaluate(() => navigator.clipboard.writeText('x').then(() => 'ok'))
await page.evaluate(() => import('/Game/World/Envelopes.js').then(m => m.Envelopes.contact()))
await sleep(1500)
log.clipboard = await page.evaluate(() => navigator.clipboard.readText())
log.notification = await page.evaluate(() => document.querySelector('.notifications')?.innerText ?? '')
await page.screenshot({ path: `${OUT}/envelope_notification.png` })

// Harita pini
await page.evaluate(() => window.game.modals.open('map'))
await sleep(2500)
log.pin = await page.evaluate(() => [ ...document.querySelectorAll('.map .location .name') ].map(e => e.textContent))
await page.screenshot({ path: `${OUT}/envelope_map.png` })
console.log(JSON.stringify(log, null, 1))
await browser.close()
