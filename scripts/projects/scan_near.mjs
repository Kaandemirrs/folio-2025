// Verilen noktanın çevresindeki (xz yarıçapı) sahne nesnelerini (örnekli ağaç/fener/çalı dahil) listeler.
//   node scripts/projects/scan_near.mjs <x> <z> [yarıçap=7] [port=4174]
import puppeteer from 'puppeteer-core'
const [ X, Z, R = 7, PORT = 4174 ] = process.argv.slice(2).map(Number)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.game && window.game.reveal && window.game.reveal.step === 0, { timeout: 180000 })
await sleep(2000)
for(let i = 0; i < 90; i++) { const s = await page.evaluate(() => window.game.reveal.step); if(s === 2) break; if(s === 0) await page.keyboard.press('Enter'); await sleep(1000) }
await sleep(3000)
const result = await page.evaluate((x, z, r) =>
{
    const out = []
    window.game.scene.updateMatrixWorld(true)
    window.game.scene.traverse((object) =>
    {
        let chain = object.name || object.type
        for(let parent = object.parent, i = 0; parent && i < 3; parent = parent.parent, i++)
            chain += ' < ' + (parent.name || parent.type)
        const label = `${chain} (${object.geometry?.attributes?.position?.count ?? '-'}v)`
        if(object.isInstancedMesh)
        {
            const matrix = object.instanceMatrix.array
            for(let i = 0; i < object.count; i++)
            {
                const px = matrix[i * 16 + 12]
                const pz = matrix[i * 16 + 14]
                const d = Math.hypot(px - x, pz - z)
                if(d < r)
                    out.push(`${label} [inst ${i}] ${px.toFixed(1)},${pz.toFixed(1)} d=${d.toFixed(1)}`)
            }
        }
        else if(object.isMesh && object.visible)
        {
            const p = object.getWorldPosition(object.position.clone())
            const d = Math.hypot(p.x - x, p.z - z)
            if(d < r)
                out.push(`${label} ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} d=${d.toFixed(1)}`)
        }
    })
    return out
}, X, Z, R)
console.log(result.join('\n'))
await browser.close()
