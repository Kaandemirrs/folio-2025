// Giriş ekranı ek öğeleri: portre çıkartması (WebP, RGBA) ve el yazısı maskeleri (R8 KTX2, make_intro_labels.mjs ile aynı yol).
// Yazı: Amatic SC Bold (vektör yola çevrilir). Maske dokuları Intro.js'te yalnızca .r kanalı eşikle okunur (beyaz).
// Doku yoğunluğu mevcut etiketle aynı: 98,5 texel / dünya birimi (256 px = 2,6 birim); Intro.js bu değerle ölçekler.
//   node scripts/intro/make_intro_extras.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'
import {
    createDefaultContainer, write,
    VK_FORMAT_R8_UNORM, KHR_SUPERCOMPRESSION_ZSTD,
    KHR_DF_MODEL_RGBSDA, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_LINEAR, KHR_DF_FLAG_ALPHA_STRAIGHT,
    KHR_DF_CHANNEL_RGBSDA_RED,
} from 'ktx-parse'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const refs = path.join(root, 'resources/references/intro')
const out = path.join(root, 'static/intro')
const font = opentype.parse(fs.readFileSync(path.join(refs, 'AmaticSC-Bold.ttf')).buffer)

// Deterministik sözde rastgele (çizim titremesi)
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

function writeKtx(gray, W, H)
{
    const container = createDefaultContainer()
    container.vkFormat = VK_FORMAT_R8_UNORM
    container.typeSize = 1
    container.pixelWidth = W
    container.pixelHeight = H
    container.pixelDepth = 0
    container.levelCount = 1
    container.supercompressionScheme = KHR_SUPERCOMPRESSION_ZSTD
    const dfd = container.dataFormatDescriptor[0]
    dfd.colorModel = KHR_DF_MODEL_RGBSDA
    dfd.colorPrimaries = KHR_DF_PRIMARIES_BT709
    dfd.transferFunction = KHR_DF_TRANSFER_LINEAR
    dfd.flags = KHR_DF_FLAG_ALPHA_STRAIGHT
    dfd.texelBlockDimension = [0, 0, 0, 0]
    dfd.bytesPlane = [1, 0, 0, 0, 0, 0, 0, 0]
    dfd.samples = [{ bitOffset: 0, bitLength: 7, channelType: KHR_DF_CHANNEL_RGBSDA_RED, samplePosition: [0, 0, 0, 0], sampleLower: 0, sampleUpper: 255 }]
    container.levels = [{ levelData: new Uint8Array(zlib.zstdCompressSync(gray, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })), uncompressedByteLength: gray.length }]
    return write(container)
}

// Not: librsvg büyük mutlak koordinatlarda (≈ x > 170) path'i yanlış çiziyor; yazı orijinde üretilip translate ile taşınır
// Açık alt yollar (Z yok) librsvg'de kesilmeye yol açıyor: her kontur Z ile kapatılır
// Not: librsvg bu fontun harflerini rastgele kırpıyor (path/koordinat sınırı), bu yüzden metin kendi tarayıcımızla çizilir:
// opentype yolları çokgenlere düzleştirilir, sıfırdan farklı sarma kuralıyla 4x alt örneklemeyle doldurulur.
const widthOf = (str, size) => { const bb = font.getPath(str, 0, 0, size).getBoundingBox(); return { w: bb.x2 - bb.x1, left: bb.x1 } }

class Canvas
{
    constructor(W, H) { this.W = W; this.H = H; this.data = new Float32Array(W * H) }

    // Yol komutlarını (x, y piksel) kapalı çokgenlere çevirir
    static polygons(commands, dx, dy)
    {
        const polys = []
        let cur = null, px = 0, py = 0
        const q = (x0, y0, x1, y1, x, y) => { for(let t = 1; t <= 8; t++) { const u = t / 8, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; cur.push([ a * x0 + b * x1 + c * x + dx, a * y0 + b * y1 + c * y + dy ]) } }
        const cb = (x0, y0, x1, y1, x2, y2, x, y) => { for(let t = 1; t <= 10; t++) { const u = t / 10, m = 1 - u; cur.push([ m * m * m * x0 + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u * u * u * x + dx, m * m * m * y0 + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u * u * u * y + dy ]) } }
        for(const c of commands)
        {
            if(c.type === 'M') { cur = [[ c.x + dx, c.y + dy ]]; polys.push(cur); px = c.x; py = c.y }
            else if(c.type === 'L') { cur.push([ c.x + dx, c.y + dy ]); px = c.x; py = c.y }
            else if(c.type === 'Q') { q(px, py, c.x1, c.y1, c.x, c.y); px = c.x; py = c.y }
            else if(c.type === 'C') { cb(px, py, c.x1, c.y1, c.x2, c.y2, c.x, c.y); px = c.x; py = c.y }
        }
        return polys
    }

    fill(polys)
    {
        const SS = 4
        const edges = []
        for(const poly of polys)
        {
            for(let i = 0; i < poly.length; i++)
            {
                const a = poly[i], b = poly[(i + 1) % poly.length]
                if(a[1] !== b[1]) edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], dir: 1 } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], dir: -1 })
            }
        }
        for(let row = 0; row < this.H * SS; row++)
        {
            const y = (row + 0.5) / SS
            const hits = []
            for(const e of edges) if(y >= e.y0 && y < e.y1) hits.push([ e.x0 + (y - e.y0) / (e.y1 - e.y0) * (e.x1 - e.x0), e.dir ])
            if(!hits.length) continue
            hits.sort((p, q2) => p[0] - q2[0])
            let wind = 0
            for(let k = 0; k < hits.length - 1; k++)
            {
                wind += hits[k][1]
                if(wind === 0) continue
                const xa = Math.max(0, hits[k][0]), xb = Math.min(this.W, hits[k + 1][0])
                for(let x = Math.floor(xa); x < Math.ceil(xb); x++)
                    this.data[Math.floor(row / SS) * this.W + x] += (Math.min(x + 1, xb) - Math.max(x, xa)) / SS
            }
        }
    }

    text(str, cx, baseline, size)
    {
        const m = widthOf(str, size)
        this.fill(Canvas.polygons(font.getPath(str, 0, 0, size).commands, cx - m.w / 2 - m.left, baseline))
    }

    // Yuvarlak uçlu kalın çizgi (bir Bezier boyunca daire damgaları)
    stroke(points, radius)
    {
        const SS = 4
        for(const [ x, y ] of points)
        {
            for(let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++)
                for(let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++)
                {
                    if(xx < 0 || yy < 0 || xx >= this.W || yy >= this.H) continue
                    let cov = 0
                    for(let sy = 0; sy < SS; sy++) for(let sx = 0; sx < SS; sx++) { const ex = xx + (sx + 0.5) / SS - x, ey = yy + (sy + 0.5) / SS - y; if(ex * ex + ey * ey <= radius * radius) cov++ }
                    this.data[yy * this.W + xx] = Math.max(this.data[yy * this.W + xx], cov / (SS * SS))
                }
        }
    }

    // Elle çizilmiş gibi eğri ok
    arrow(x0, y0, x1, y1, bend, radius = 3)
    {
        const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2 - bend
        const pts = []
        for(let t = 0; t <= 1; t += 0.01) pts.push([ (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1 ])
        const dx = x1 - mx, dy = y1 - my, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len
        const head = 17
        for(const s of [ 0.5, -0.5 ])
            for(let t = 0; t <= 1; t += 0.05)
                pts.push([ x1 - t * head * (ux * Math.cos(s) - uy * Math.sin(s)), y1 - t * head * (uy * Math.cos(s) + ux * Math.sin(s)) ])
        this.stroke(pts, radius)
    }

    toGray() { return Uint8Array.from(this.data, v => Math.round(Math.min(1, v) * 255)) }
}

async function saveMask(name, canvas)
{
    const gray = canvas.toGray()
    const png = await sharp(Buffer.from(gray), { raw: { width: canvas.W, height: canvas.H, channels: 1 } }).png().toBuffer()
    fs.writeFileSync(path.join(refs, `after_${name}.png`), png)
    fs.writeFileSync(path.join(out, `${name}.ktx`), writeKtx(gray, canvas.W, canvas.H))
    console.log(name, `${canvas.W}x${canvas.H}`, fs.statSync(path.join(out, `${name}.ktx`)).size, 'bayt')
}

// --- Başlık, alt başlık, hoş geldin ---
{
    const c = new Canvas(768, 192); c.text('KAAN DEMİR', 384, 160, 150); await saveMask('titleLabel', c)
}
{
    const c = new Canvas(640, 192); c.text('Full Stack & SaaS Mühendisi', 320, 70, 70); c.text('Portfolyoma hoş geldin', 320, 160, 84); await saveMask('subtitleLabel', c)
}
// --- "bu benim" notu + ok ---
{
    const c = new Canvas(320, 128); c.text('bu benim', 112, 100, 76); c.arrow(236, 72, 296, 20, 12); await saveMask('noteLabel', c)
}
// --- Yükleme metinleri ve rakam şeridi (0-9 ve %, 48x96 hücre) ---
{
    const c = new Canvas(512, 96); c.text('Dünya yükleniyor...', 256, 74, 76); await saveMask('loadingLabel', c)
}
{
    const c = new Canvas(512, 96); c.text('Son rötuşlar...', 256, 74, 76); await saveMask('finishingLabel', c)
}
{
    const cell = 48, glyphs = '0123456789%'
    const c = new Canvas(cell * glyphs.length, 96)
    ;[...glyphs].forEach((g, i) => c.text(g, i * cell + cell / 2, 74, 76))
    await saveMask('digitsLabel', c)
}

// --- Portre çıkartması ---
// Kaynak 305x305 RGBA, köşeleri şeffaf mavi daire (siyah çerçeveli). Şeffaf olduğu için dış kenara el çizimi beyaz kontur eklenir.
const source = path.join(root, 'resources/portprofile.png')
fs.copyFileSync(source, path.join(refs, 'portrait_source.png'))
{
    const S = 512, P = 420                       // doku ve portre boyutu
    const portrait = await sharp(source).resize(P, P).toBuffer()
    const R = P / 2 + 4                          // dairenin yarıçapı + kenar
    const border = 26
    const pts = []
    const n = 64
    const phase = [rnd() * 6, rnd() * 6, rnd() * 6]
    for(let i = 0; i < n; i++)
    {
        const t = i / n * Math.PI * 2
        const wobble = Math.sin(t * 3 + phase[0]) * 2.2 + Math.sin(t * 5 + phase[1]) * 1.5 + Math.sin(t * 9 + phase[2]) * 0.8
        const r = R + border + wobble
        pts.push(`${(S / 2 + Math.cos(t) * r).toFixed(1)},${(S / 2 + Math.sin(t) * r).toFixed(1)}`)
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><polygon points="${pts.join(' ')}" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`
    const sticker = await sharp(Buffer.from(svg)).png().toBuffer()
    const result = await sharp(sticker).composite([{ input: portrait, left: (S - P) / 2, top: (S - P) / 2 }]).webp({ quality: 88, alphaQuality: 95 }).toBuffer()
    fs.writeFileSync(path.join(out, 'portrait.webp'), result)
    fs.writeFileSync(path.join(refs, 'portrait.webp'), result)
    console.log('portrait.webp', S + 'x' + S, result.length, 'bayt')
}
