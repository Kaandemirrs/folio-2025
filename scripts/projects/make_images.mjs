// Proje görsellerini hazırlar: resources/references/projeler/*.png (16:9 afişler) → 960×540
// processed/*.png ve static/projects/images/*.ktx (ham RGBA8 sRGB KTX2 + Zstd; toktx gerekmez, make_palette.mjs ile aynı yol).
//   node scripts/projects/make_images.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
    createDefaultContainer, write,
    KHR_DF_CHANNEL_RGBSDA_ALPHA, KHR_DF_CHANNEL_RGBSDA_BLUE, KHR_DF_CHANNEL_RGBSDA_GREEN, KHR_DF_CHANNEL_RGBSDA_RED,
    KHR_DF_FLAG_ALPHA_STRAIGHT, KHR_DF_MODEL_RGBSDA, KHR_DF_PRIMARIES_BT709, KHR_DF_SAMPLE_DATATYPE_LINEAR,
    KHR_DF_TRANSFER_SRGB, KHR_SUPERCOMPRESSION_ZSTD, VK_FORMAT_R8G8B8A8_SRGB,
} from 'ktx-parse'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = path.join(root, 'resources/references/projeler')
const processed = path.join(source, 'processed')
const target = path.join(root, 'static/projects/images')

// kaynak dosya → proje görsel adı (sources/data/projects.js)
const MAP = {
    'beykentproje.png': 'beykent-1',
    'loyaltytexas.png': 'loyalty-1',
    'mobileappler.png': 'mobil-1',
    'yinego.png': 'yinego-1',
    'cvportfolio.png': 'getcvportfolio-1',
    'evimai.png': 'evimai-1',
}

fs.mkdirSync(processed, { recursive: true })
fs.mkdirSync(target, { recursive: true })

for(const [ file, name ] of Object.entries(MAP))
{
    // 1671/1672×941 ≈ 16:9: 960×540'a "cover" ile ölçeklenir (kenarlarda en çok 1 piksel kırpılır)
    const { data } = await sharp(path.join(source, file)).resize(960, 540, { fit: 'cover' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    await sharp(data, { raw: { width: 960, height: 540, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(processed, `${name}.png`))

    const container = createDefaultContainer()
    container.vkFormat = VK_FORMAT_R8G8B8A8_SRGB
    container.typeSize = 1
    container.pixelWidth = 960
    container.pixelHeight = 540
    container.pixelDepth = 0
    container.supercompressionScheme = KHR_SUPERCOMPRESSION_ZSTD
    const dfd = container.dataFormatDescriptor[0]
    dfd.colorModel = KHR_DF_MODEL_RGBSDA
    dfd.colorPrimaries = KHR_DF_PRIMARIES_BT709
    dfd.transferFunction = KHR_DF_TRANSFER_SRGB
    dfd.flags = KHR_DF_FLAG_ALPHA_STRAIGHT
    dfd.texelBlockDimension = [ 0, 0, 0, 0 ]
    dfd.bytesPlane = [ 4, 0, 0, 0, 0, 0, 0, 0 ]
    dfd.samples = [ KHR_DF_CHANNEL_RGBSDA_RED, KHR_DF_CHANNEL_RGBSDA_GREEN, KHR_DF_CHANNEL_RGBSDA_BLUE, KHR_DF_CHANNEL_RGBSDA_ALPHA | KHR_DF_SAMPLE_DATATYPE_LINEAR ]
        .map((channelType, i) => ({ bitOffset: i * 8, bitLength: 7, channelType, samplePosition: [ 0, 0, 0, 0 ], sampleLower: 0, sampleUpper: 255 }))
    const compressed = zlib.zstdCompressSync(data, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })
    container.levelCount = 1
    container.levels = [ { levelData: new Uint8Array(compressed), uncompressedByteLength: data.length } ]
    fs.writeFileSync(path.join(target, `${name}.ktx`), write(container))
    console.log(name, fs.statSync(path.join(target, `${name}.ktx`)).size, 'bayt')
}
