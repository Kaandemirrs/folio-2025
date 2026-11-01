// Türk plakası dokusu (256x64) üretir: beyaz zemin, siyah ince çerçeve,
// solda mavi şerit içinde beyaz "TR", ortada kalın siyah "33 AK 661".
// Çıktı: resources/references/w140/licensePlate.png (build_w140.py bunu GLB'ye gömer)
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = path.join(root, 'resources/references/w140/licensePlate.png')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64">
  <rect x="0" y="0" width="256" height="64" rx="7" fill="#101010"/>
  <rect x="2.5" y="2.5" width="251" height="59" rx="5" fill="#ffffff"/>
  <rect x="5" y="5" width="246" height="54" rx="3" fill="none" stroke="#101010" stroke-width="1.5"/>
  <rect x="5" y="5" width="36" height="54" rx="3" fill="#0a3a9c"/>
  <text x="23" y="44" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="21" fill="#ffffff" text-anchor="middle">TR</text>
  <text x="147" y="47" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="40" fill="#101010" text-anchor="middle" textLength="194" lengthAdjust="spacingAndGlyphs">33 AK 661</text>
</svg>`

await sharp(Buffer.from(svg)).png().toFile(out)
console.log('plaka dokusu yazıldı:', out)
