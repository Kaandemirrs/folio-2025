/**
 * Türk bayrağı dokusu: Türk Bayrağı Kanunu'ndaki oranlarla (en 1, boy 1,5) vektörden üretilir.
 *   node scripts/world/make_flag_texture.mjs
 * Hilal: dış çember çapı 1/2, iç çember çapı 0,4, iç merkez 1/16 sağa kaymış; yıldız çevrel çember çapı 1/4.
 * Renk: bayrak kırmızısı #E30A17, beyaz #FFFFFF.
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(root, 'resources/references/world/flag/turkishFlag.png')
mkdirSync(path.dirname(out), { recursive: true })

const star = (cx, cy, r) =>
{
    const points = []
    for(let i = 0; i < 5; i++)
    {
        const outer = (i * 72) * Math.PI / 180
        const inner = (i * 72 + 36) * Math.PI / 180
        points.push([ cx + Math.cos(outer) * r, cy + Math.sin(outer) * r ])
        points.push([ cx + Math.cos(inner) * r * 0.382, cy + Math.sin(inner) * r * 0.382 ])
    }
    return points.map(p => p.join(',')).join(' ')
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1.5 1" width="1536" height="1024">
  <rect width="1.5" height="1" fill="#E30A17"/>
  <circle cx="0.5" cy="0.5" r="0.25" fill="#fff"/>
  <circle cx="0.5625" cy="0.5" r="0.2" fill="#E30A17"/>
  <polygon points="${star(0.8333, 0.5, 0.125)}" fill="#fff"/>
</svg>`

await sharp(Buffer.from(svg)).resize(768, 512).png({ compressionLevel: 9 }).toFile(out)
console.log('yazıldı:', out)
