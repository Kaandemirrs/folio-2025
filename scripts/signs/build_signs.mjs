/**
 * Tabela modelini (resources/stylized_wood_signs.glb, Pasindu.Anjana, CC BY 4.0) oyuna uyarlar:
 *   node scripts/signs/build_signs.mjs
 * - Düğüm dönüşleri/ölçekleri köşelere pişirilir (Sketchfab dışa aktarımı Z-yukarı), ön yüz +Z, direk tabanı y = 0.
 * - Dört varyant tek GLB'de: signPlank (tek tahta, kaynakta sign1), signDouble (iki tahta, sign2), signRight (sağa ok, sign3)
 *   ve signLeft (sign3'ün yatay yansıması; kaynaktaki 'sola ok' tahtası yalnızca hafif sivri olduğu için net bir sol ok bu şekilde elde edildi).
 *   Hepsi aynı 'signWood' malzemesini paylaşır.
 * - Yalnızca temel renk dokusu kalır (256 px WebP); normal/ORM dokuları atılır (oyunun kendi aydınlatması var).
 * - Çıktı: static/props/signs.glb ve signs-compressed.glb (Draco). Yazı tahtalara çalışma anında çizilir (World/Signs.js).
 * Ölçü: HEIGHT çıktı yüksekliği (W140 yüksekliği ≈ 1,5 → ×1,2 ≈ 1,8).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions'
import { draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HEIGHT = 1.8
const TEXTURE_SIZE = 256
// [ kaynak düğüm, çıktı adı, x'te yansıt ]
const VARIANTS = [ [ 'sign1__0', 'signPlank', false ], [ 'sign2__0', 'signDouble', false ], [ 'sign3__0', 'signRight', false ], [ 'sign3__0', 'signLeft', true ] ]

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })

const source = await io.read(path.join(root, 'resources/stylized_wood_signs.glb'))
const sourceNodes = source.getRoot().listNodes().filter(node => node.getMesh())
const baseColor = source.getRoot().listMaterials()[0].getBaseColorTexture()

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('signs')

// Doku: 256 px WebP
const webp = await sharp(Buffer.from(baseColor.getImage())).resize(TEXTURE_SIZE, TEXTURE_SIZE).webp({ quality: 85 }).toBuffer()
const texture = doc.createTexture('signWoodColor').setImage(new Uint8Array(webp)).setMimeType('image/webp')
doc.createExtension(EXTTextureWebP).setRequired(true)
const material = doc.createMaterial('signWood')
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(1)

let scale = null
const report = {}
for(const [ sourceName, variant, mirror ] of VARIANTS)
{
    const node = sourceNodes.find(n => n.getName() === sourceName)
    const sourcePrimitive = node.getMesh().listPrimitives()[0]
    const position = sourcePrimitive.getAttribute('POSITION')
    const normal = sourcePrimitive.getAttribute('NORMAL')
    const uv = sourcePrimitive.getAttribute('TEXCOORD_0')
    const indices = sourcePrimitive.getIndices()

    // Z (yükseklik) kaynakta -0,03 … 1,69; model yerelinde (x, y, z) → (x, z, -y)
    let minZ = Infinity
    let maxZ = -Infinity
    for(let i = 0; i < position.getCount(); i++)
    {
        const z = position.getElement(i, [])[2]
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
    }
    scale ??= HEIGHT / (maxZ - minZ)

    const positions = new Float32Array(position.getCount() * 3)
    const normals = new Float32Array(position.getCount() * 3)
    const uvs = new Float32Array(position.getCount() * 2)
    for(let i = 0; i < position.getCount(); i++)
    {
        const p = position.getElement(i, [])
        const n = normal.getElement(i, [])
        const t = uv.getElement(i, [])
        positions.set([ (mirror ? -p[0] : p[0]) * scale, (p[2] - minZ) * scale, -p[1] * scale ], i * 3)
        normals.set([ mirror ? -n[0] : n[0], n[2], -n[1] ], i * 3)
        uvs.set(t, i * 2)
    }

    // Yansıtma sargı yönünü ters çevirir
    const flipped = indices.getArray().slice()
    if(mirror)
    {
        for(let i = 0; i < flipped.length; i += 3)
        {
            const swap = flipped[i + 1]
            flipped[i + 1] = flipped[i + 2]
            flipped[i + 2] = swap
        }
    }

    const primitive = doc.createPrimitive()
        .setMaterial(material)
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(flipped).setBuffer(buffer))
    const mesh = doc.createMesh(variant).addPrimitive(primitive)
    scene.addChild(doc.createNode(variant).setMesh(mesh))

    // Rapor: tahta ön yüzü (en büyük z) ve kutu
    const min = [ Infinity, Infinity, Infinity ]
    const max = [ -Infinity, -Infinity, -Infinity ]
    for(let i = 0; i < position.getCount(); i++)
        for(let k = 0; k < 3; k++)
        {
            min[k] = Math.min(min[k], positions[i * 3 + k])
            max[k] = Math.max(max[k], positions[i * 3 + k])
        }
    report[variant] = { min: min.map(v => +v.toFixed(3)), max: max.map(v => +v.toFixed(3)), triangles: indices.getCount() / 3 }
}

const out = (suffix) => path.join(root, `static/props/signs${suffix}.glb`)
await io.write(out(''), doc)
await doc.transform(draco({ method: 'edgebreaker' }))
await io.write(out('-compressed'), doc)

console.log('ölçek', scale.toFixed(4))
console.log(JSON.stringify(report, null, 1))
