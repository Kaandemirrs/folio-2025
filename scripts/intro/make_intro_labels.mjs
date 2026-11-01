// Intro ekranı etiketlerini Türkçe üretir (static/intro/*Label.png ve .ktx).
// Orijinaller (resources/references/intro/before_*.png) 256x128, beyaz/siyah maske; Intro.js sadece .r kanalını okur.
// Yazı: Amatic SC Bold (opentype.js ile vektör yola çevrilir), cap yüksekliği 47 px (orijinaldeki "START" ile aynı), iki satır, merkez x≈165.5.
// Ok ve gamepad ikonları orijinalden kırpılıp aynı yerlere konur.
//   node scripts/intro/make_intro_labels.mjs
import fs from 'node:fs'
import opentype from 'opentype.js'
import sharp from 'sharp'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import {
    createDefaultContainer, write,
    VK_FORMAT_R8_UNORM, KHR_SUPERCOMPRESSION_ZSTD,
    KHR_DF_MODEL_RGBSDA, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_LINEAR, KHR_DF_FLAG_ALPHA_STRAIGHT,
    KHR_DF_CHANNEL_RGBSDA_RED,
} from 'ktx-parse'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const refs = path.join(root, 'resources/references/intro')
const W = 256, H = 128
const FONT_SIZE = 62        // cap yüksekliği 0.758 em → 47 px
const CENTER_X = 165.5
const BASELINE = [51, 110]  // satır tabanları (orijinal: satır 1 alt = 51, satır 2 alt = 110)

const font = opentype.parse(fs.readFileSync(path.join(refs, 'AmaticSC-Bold.ttf')).buffer)
// Yazı, sistem yazı tipine bağlı kalmasın diye vektör yola çevrilir (librsvg font bulamayabiliyor)
const pathOf = (str, x, y) => font.getPath(str, x, y, FONT_SIZE).toPathData(2)
const measure = async (str) =>
{
    const bb = font.getPath(str, 0, 0, FONT_SIZE).getBoundingBox()
    return { width: bb.x2 - bb.x1, left: bb.x1 }
}
const textEl = (str, x, y) => `<path d="${pathOf(str, x, y)}" fill="#fff"/>`

const LABELS = {
    mouseKeyboard: { lines: ['TIKLA VE', 'BAŞLA'], arrow: { src: [8, 70, 84, 54], dx: 0 } },
    touch: { lines: ['DOKUN VE', 'BAŞLA'], arrow: { src: [24, 68, 84, 56], dx: -17 } },
    gamepadXbox: { lines: ["'YA BAS", 'VE BAŞLA'], icon: [193, 0, 56, 54], arrow: { src: [8, 62, 76, 62], dx: 0 } },
    gamepadPlaystation: { lines: ["'E BAS", 'VE BAŞLA'], icon: [193, 0, 56, 54], arrow: { src: [8, 62, 76, 62], dx: 0 } },
}

function writeKtx(gray)
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

for(const [name, cfg] of Object.entries(LABELS))
{
    const before = path.join(refs, `before_${name}Label.png`)
    const layers = []

    // Satır 1 (gamepad'de ikon + metin bir grup olarak ortalanır)
    const m1 = await measure(cfg.lines[0])
    let svgText = ''
    if(cfg.icon)
    {
        const iconW = cfg.icon[2] - 6, gap = 6
        const groupW = iconW + gap + m1.width
        const startX = CENTER_X - groupW / 2
        const textX = startX + iconW + gap - m1.left
        svgText += textEl(cfg.lines[0], textX, BASELINE[0])
        const icon = await sharp(before).extract({ left: cfg.icon[0], top: cfg.icon[1], width: cfg.icon[2], height: cfg.icon[3] }).toBuffer()
        layers.push({ input: icon, left: Math.round(startX - 3), top: 0, blend: 'lighten' })
    }
    else
    {
        const x1 = CENTER_X - m1.width / 2 - m1.left
        svgText += textEl(cfg.lines[0], x1, BASELINE[0])
    }
    // Satır 2
    const m2 = await measure(cfg.lines[1])
    const x2 = CENTER_X - m2.width / 2 - m2.left
    svgText += textEl(cfg.lines[1], x2, BASELINE[1])

    // Ok
    const [ax, ay, aw, ah] = cfg.arrow.src
    const arrow = await sharp(before).extract({ left: ax, top: ay, width: aw, height: ah }).toBuffer()
    layers.push({ input: arrow, left: Math.max(0, ax + cfg.arrow.dx), top: ay, blend: 'lighten' })

    const base = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${svgText}</svg>`))
        .png().toBuffer()
    const out = await sharp(base).composite(layers).removeAlpha().png().toBuffer()

    const pngPath = path.join(root, `static/intro/${name}Label.png`)
    fs.writeFileSync(pngPath, out)
    fs.copyFileSync(pngPath, path.join(refs, `after_${name}Label.png`))

    const { data } = await sharp(out).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
    fs.writeFileSync(path.join(root, `static/intro/${name}Label.ktx`), writeKtx(new Uint8Array(data)))
    console.log(name, cfg.lines.join(' / '), `satır1 ${Math.round(m1.width)}px, satır2 ${Math.round(m2.width)}px`)
}
