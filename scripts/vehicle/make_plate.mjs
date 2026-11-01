// Türk plakası dokusu (256x64) üretir: beyaz zemin, siyah ince çerçeve,
// solda mavi şerit içinde beyaz "TR", ortada kalın siyah plaka metni.
//   node scripts/vehicle/make_plate.mjs [araç-id]   (varsayılan: w140; metin ve çıktı vehicles.config.json'dan)
// Çıktıyı build betikleri GLB'ye gömer.
import sharp from 'sharp'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const config = JSON.parse(readFileSync(path.join(root, 'scripts/vehicle/vehicles.config.json'), 'utf8'))
const id = process.argv[2] || 'w140'
const plate = config.vehicles[id]?.plate
if(!plate)
{
    console.error(`"${id}" vehicles.config.json içinde yok`)
    process.exit(1)
}
const out = path.join(root, plate.image)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64">
  <rect x="0" y="0" width="256" height="64" rx="7" fill="#101010"/>
  <rect x="2.5" y="2.5" width="251" height="59" rx="5" fill="#ffffff"/>
  <rect x="5" y="5" width="246" height="54" rx="3" fill="none" stroke="#101010" stroke-width="1.5"/>
  <rect x="5" y="5" width="36" height="54" rx="3" fill="#0a3a9c"/>
  <text x="23" y="44" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="21" fill="#ffffff" text-anchor="middle">TR</text>
  <text x="147" y="47" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="40" fill="#101010" text-anchor="middle" textLength="194" lengthAdjust="spacingAndGlyphs">${plate.text}</text>
</svg>`

await sharp(Buffer.from(svg)).png().toFile(out)
console.log('plaka dokusu yazıldı:', out)
