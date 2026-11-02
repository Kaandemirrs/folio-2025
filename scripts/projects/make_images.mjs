// Proje görsellerini hazırlar: resources/references/projeler/*.png (16:9 afişler) → 960×540
// processed/*.png ve static/projects/images/*.ktx (KTX2, ETC1S/BasisLZ, sRGB, mip yok: görüntüleyici LinearFilter kullanır).
// toktx gerekmez: ktx2-encoder (Basis Universal wasm) devDependency'si Node'da kodlar. Bruno'nun görselleri de ETC1S idi (~60 KB).
//   node scripts/projects/make_images.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { encodeToKTX2 } from 'ktx2-encoder'

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

    const png = new Uint8Array(fs.readFileSync(path.join(processed, `${name}.png`)))
    const imageDecoder = async (buffer) =>
    {
        const decoded = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        return { data: new Uint8Array(decoded.data), width: decoded.info.width, height: decoded.info.height }
    }
    const ktx2 = await encodeToKTX2(png, { isUASTC: false, generateMipmap: false, isSetKTX2SRGBTransferFunc: true, qualityLevel: 255, imageDecoder, enableDebug: false })
    fs.writeFileSync(path.join(target, `${name}.ktx`), ktx2)
    console.log(name, fs.statSync(path.join(target, `${name}.ktx`)).size, 'bayt')
}
