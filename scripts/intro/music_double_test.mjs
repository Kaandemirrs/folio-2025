// Müzik çift çalma testi: blur/focus ve horon duraklat/devam sonrası aynı şarkının çalan örnek sayısı 1 olmalı.
//   node scripts/intro/music_double_test.mjs [port]
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${process.argv[2] || 4174}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(6000)
const count = () => page.evaluate(() => { const p = window.game.audio.playlist; return p.songs.map(s => s.sound._sounds.filter(x => !x._paused && !x._ended).length) })
const out = { start: await count() }
for(let i = 0; i < 3; i++) { await page.evaluate(() => { window.dispatchEvent(new Event('blur')) }); await sleep(300); await page.evaluate(() => { window.dispatchEvent(new Event('focus')) }); await sleep(300) }
out.afterBlurFocus = await count()
await page.evaluate(() => { const p = window.game.audio.playlist; p.suspend() }); await sleep(300)
await page.evaluate(() => window.game.audio.playlist.resume()); await sleep(300)
await page.evaluate(() => { window.game.audio.playlist.suspend(); window.game.audio.playlist.resume() }); await sleep(1500)
out.afterSuspendResume = await count()
console.log(JSON.stringify(out))
await browser.close()
