// areas.glb'ye gömülü İngilizce etiket dokularını Türkçe üretir:
//   projectsLabels  (218×60 PNG, beyaz maske) : DISTINCTIONS / WITH / ROLE / AT → ÖNE ÇIKANLAR / NEREDE / ROL / KURUM
//   blackboardLabels (255×256 PNG, siyah zemin): NEXT / PREV / OPEN / EXIT / Scroll → SONRAKİ / ÖNCEKİ / AÇ / ÇIKIŞ / Kaydır
// Orijinaller resources/original/areas.glb içindedir; konum, cap yüksekliği ve ikonlar orijinalden ölçülerek korunur
// (ikonlar orijinal pikselleriyle aynen kalır, yalnızca yazı alanı silinip yeniden yazılır). Yazı: Amatic SC Bold (vektör yola çevrilir).
//   node scripts/world/make_area_labels.mjs   → resources/references/world/labels/{projectsLabels,blackboardLabels}.png (2× ölçek)
//   (patch_areas.mjs bu dosyaları okuyup areas.glb ve areas-compressed.glb içine yazar)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(root, 'resources/references/world/labels')
const SCALE = 2
const CAP = 0.758 // Amatic SC cap yüksekliği / em

const font = opentype.parse(fs.readFileSync(path.join(root, 'resources/references/intro/AmaticSC-Bold.ttf')).buffer)

// Orijinal dokuları kaynak glb'den çıkar
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const doc = await io.read(path.join(root, 'resources/original/areas.glb'))
const original = (name) => doc.getRoot().listTextures().find(t => t.getName() === name).getImage()

const decode = async (buffer) =>
{
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data: new Uint8Array(data), width: info.width, height: info.height }
}

// Metni (orijinal piksel birimiyle) vektör yol olarak döner: capHeight px yükseklikte, en fazla maxWidth px genişlikte (sığmazsa küçülür)
const textPath = (text, capHeight, maxWidth) =>
{
    let size = (capHeight / CAP) * SCALE
    let bb = font.getPath(text, 0, 0, size).getBoundingBox()
    if((bb.x2 - bb.x1) > maxWidth * SCALE)
    {
        size *= maxWidth * SCALE / (bb.x2 - bb.x1)
        bb = font.getPath(text, 0, 0, size).getBoundingBox()
    }
    return { size, bb }
}

// Beyaz maske SVG'si → [0..255] kapsama (tek kanal), W×H (SCALE'li)
const rasterize = async (W, H, paths) =>
{
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${paths.map(d => `<path d="${d}" fill="#fff"/>`).join('')}</svg>`
    const { data } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const mask = new Uint8Array(W * H)
    for(let i = 0; i < W * H; i++)
        mask[i] = data[i * 4 + 3]
    return mask
}

/**
 * projectsLabels
 */
{
    const source = await decode(original('projectsLabels'))
    const W = source.width * SCALE
    const H = source.height * SCALE
    // Hücreler (orijinal px): üstte DISTINCTIONS (0-218 × 0-30), altta WITH [0,83], ROLE [83,170], AT [170,211] × 30-60 (UV'ler hücre bölmesidir)
    // cap yüksekliği 19 px (alt satır y34-52, üst satır y5-23)
    const cells = [
        { text: 'ÖNE ÇIKANLAR', x0: 0, x1: 218, baseline: 23, margin: 13 },
        { text: 'NEREDE', x0: 0, x1: 83, baseline: 52, margin: 6 },
        { text: 'ROL', x0: 83, x1: 170, baseline: 52, margin: 6 },
        { text: 'KURUM', x0: 170, x1: 211, baseline: 52, margin: 1 },
    ]
    const paths = []
    for(const cell of cells)
    {
        const { size, bb } = textPath(cell.text, 19, cell.x1 - cell.x0 - cell.margin * 2)
        const center = (cell.x0 + cell.x1) / 2 * SCALE
        paths.push(font.getPath(cell.text, center - (bb.x1 + bb.x2) / 2, cell.baseline * SCALE, size).toPathData(2))
    }
    const mask = await rasterize(W, H, paths)
    const rgba = Buffer.alloc(W * H * 4)
    for(let i = 0; i < W * H; i++)
        rgba.fill(mask[i], i * 4, i * 4 + 4) // orijinalle aynı: rgb = alfa = kapsama (beyaz, önceden çarpılmış)
    await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(out, 'projectsLabels.png'))
}

/**
 * blackboardLabels
 */
{
    const source = await decode(original('blackboardLabels'))
    const W = source.width * SCALE
    const H = source.height * SCALE

    // Orijinal pikseller (ikonlar) SCALE ile büyütülür; yazı alanları silinir, yeni yazı eklenir
    const base = await sharp(Buffer.from(source.data), { raw: { width: source.width, height: source.height, channels: 4 } }).resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer()
    // Satırlar (orijinal px): taban çizgisi, yazı için serbest sağ sınır (ikonların başladığı x), temizlenecek y aralığı
    const rows = [
        { text: 'SONRAKİ', baseline: 44, limit: 154, y0: 0, y1: 52 },
        { text: 'ÖNCEKİ', baseline: 95, limit: 122, y0: 52, y1: 102 },
        { text: 'AÇ', baseline: 144, limit: 134, y0: 102, y1: 152 },
        { text: 'ÇIKIŞ', baseline: 194, limit: 134, y0: 152, y1: 202 },
        { text: 'Kaydır', baseline: 244, limit: 168, y0: 202, y1: 256 },
    ]
    const paths = []
    for(const row of rows)
    {
        // Yazı alanını sil (sol kenardan limit'e kadar; ikonlar limit'in sağında)
        for(let y = row.y0 * SCALE; y < row.y1 * SCALE; y++)
            for(let x = 0; x < (row.limit + 1) * SCALE; x++)
            {
                const i = (y * W + x) * 4
                base[i] = base[i + 1] = base[i + 2] = 0
            }
        const { size, bb } = textPath(row.text, 35, row.limit - 6)
        paths.push(font.getPath(row.text, 2 * SCALE - bb.x1, row.baseline * SCALE, size).toPathData(2))
    }
    const mask = await rasterize(W, H, paths)
    for(let i = 0; i < W * H; i++)
    {
        const v = Math.max(base[i * 4], mask[i])
        base[i * 4] = base[i * 4 + 1] = base[i * 4 + 2] = v
        base[i * 4 + 3] = 255
    }
    await sharp(base, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(out, 'blackboardLabels.png'))
}
console.log('etiketler yazıldı:', out)
