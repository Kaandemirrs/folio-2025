// palette.png ve palette.ktx'e W140 renklerini ekler.
// Hücre 4 px genişliğinde (128x4, 32 hücre). Hücre 24 ve 31'e dokunulmaz:
// areas.glb içinde bu hücrelere birkaç UV örneği düşüyor (siyah olarak kalmalı).
// KTX: toktx gerekmez; ktx-parse ile ham RGBA8 sRGB KTX2 yazılır (KTX2Loader ham formatı destekler).
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    createDefaultContainer, write,
    VK_FORMAT_R8G8B8A8_SRGB, KHR_SUPERCOMPRESSION_NONE,
    KHR_DF_MODEL_RGBSDA, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_SRGB, KHR_DF_FLAG_ALPHA_STRAIGHT,
    KHR_DF_CHANNEL_RGBSDA_RED, KHR_DF_CHANNEL_RGBSDA_GREEN, KHR_DF_CHANNEL_RGBSDA_BLUE, KHR_DF_CHANNEL_RGBSDA_ALPHA,
    KHR_DF_SAMPLE_DATATYPE_LINEAR,
} from 'ktx-parse'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// hücre -> renk (W140)
export const NEW_CELLS = {
    25: '#aeb2b8', // gümüş jant
    26: '#1a1a1c', // koyu lastik
    27: '#7a0a1c', // koyu kırmızı stop camı
    28: '#26262b', // koyu trim / plastik
    29: '#8d9096', // koyu krom (ızgara, egzoz)
    30: '#22313b', // koyu cam
}

const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

const source = path.join(root, 'resources/palette.png')
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
if(info.width !== 128 || info.height !== 4) throw new Error('beklenmeyen palette boyutu')

for(const [cell, color] of Object.entries(NEW_CELLS))
{
    const rgb = hex(color)
    for(let y = 0; y < 4; y++)
        for(let x = cell * 4; x < cell * 4 + 4; x++)
        {
            const i = (y * 128 + x) * 4
            data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255
        }
}

// PNG (resources + static)
for(const target of ['resources/palette.png', 'static/palette.png'])
    await sharp(data, { raw: { width: 128, height: 4, channels: 4 } }).png().toFile(path.join(root, target) + '.tmp').then(() => fs.renameSync(path.join(root, target) + '.tmp', path.join(root, target)))

// KTX2 (ham RGBA8 sRGB, tek seviye)
const container = createDefaultContainer()
container.vkFormat = VK_FORMAT_R8G8B8A8_SRGB
container.typeSize = 1
container.pixelWidth = 128
container.pixelHeight = 4
container.pixelDepth = 0
container.supercompressionScheme = KHR_SUPERCOMPRESSION_NONE
const dfd = container.dataFormatDescriptor[0]
dfd.colorModel = KHR_DF_MODEL_RGBSDA
dfd.colorPrimaries = KHR_DF_PRIMARIES_BT709
dfd.transferFunction = KHR_DF_TRANSFER_SRGB
dfd.flags = KHR_DF_FLAG_ALPHA_STRAIGHT
dfd.texelBlockDimension = [0, 0, 0, 0]
dfd.bytesPlane = [4, 0, 0, 0, 0, 0, 0, 0]
// bitLength KTX2 spesifikasyonuna göre "bit sayısı − 1" olarak saklanır
dfd.samples = [
    KHR_DF_CHANNEL_RGBSDA_RED, KHR_DF_CHANNEL_RGBSDA_GREEN, KHR_DF_CHANNEL_RGBSDA_BLUE,
    KHR_DF_CHANNEL_RGBSDA_ALPHA | KHR_DF_SAMPLE_DATATYPE_LINEAR,
].map((channelType, i) => ({
    bitOffset: i * 8, bitLength: 7, channelType, samplePosition: [0, 0, 0, 0], sampleLower: 0, sampleUpper: 255,
}))
container.levelCount = 1
container.levels = [{ levelData: new Uint8Array(data), uncompressedByteLength: data.length }]
fs.writeFileSync(path.join(root, 'static/palette.ktx'), write(container))
console.log('palette.png (resources + static) ve static/palette.ktx güncellendi')
