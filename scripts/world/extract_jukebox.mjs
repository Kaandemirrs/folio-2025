/**
 * Jukebox'ı areas.glb'den (resources/original) ayrı bir prop olarak çıkarır:
 *   node scripts/world/extract_jukebox.mjs
 * Çıktı: static/props/jukebox.glb ve jukebox-compressed.glb (Draco). Orijin = zemin merkezi, ön yüz +Z.
 * Malzemeler ada göre oyundaki ortak malzemelere bağlanır (palette, emissivePurple/OrangeRadialGradient),
 * bu yüzden GLB'de doku yok. Çarpıştırıcı ölçüsü yazdırılır (props.config.json > jukebox.colliders).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })

const source = await io.read(path.join(root, 'resources/original/areas.glb'))
const original = source.getRoot().listNodes().find(n => n.getName() === 'refJukeboxPhysicalDynamic')
const sourceMesh = original.getMesh()

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('jukebox')
const mesh = doc.createMesh('jukebox')
const materials = new Map()

// Ayağı zemine (y = 0) oturt
let minY = Infinity
for(const prim of sourceMesh.listPrimitives())
    minY = Math.min(minY, prim.getAttribute('POSITION').getMin([])[1])

for(const sp of sourceMesh.listPrimitives())
{
    const name = sp.getMaterial().getName()
    if(!materials.has(name))
        materials.set(name, doc.createMaterial(name).setDoubleSided(sp.getMaterial().getDoubleSided()))

    const prim = doc.createPrimitive().setMaterial(materials.get(name))
    for(const semantic of sp.listSemantics())
    {
        const a = sp.getAttribute(semantic)
        const array = a.getArray().slice()
        if(semantic === 'POSITION')
        {
            for(let i = 1; i < array.length; i += 3)
                array[i] -= minY
        }
        prim.setAttribute(semantic, doc.createAccessor().setType(a.getType()).setArray(array).setBuffer(buffer))
    }
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(sp.getIndices().getArray().slice()).setBuffer(buffer))
    mesh.addPrimitive(prim)
}

const node = doc.createNode('jukebox').setMesh(mesh)
scene.addChild(node)

const out = (suffix) => path.join(root, `static/props/jukebox${suffix}.glb`)
await io.write(out(''), doc)
await doc.transform(draco({ method: 'edgebreaker', quantizationVolume: 'mesh', quantizePosition: 12, quantizeNormal: 6, quantizeTexcoord: 10, quantizeColor: 2, quantizeGeneric: 2 }))
await io.write(out('-compressed'), doc)

// Çarpıştırıcı (orijinal cuboid çocuğu, ayak ofsetiyle)
const c = original.listChildren().find(n => /^cuboid/.test(n.getName()))
const t = c.getTranslation(), s = c.getScale()
console.log(JSON.stringify({
    shiftY: -minY,
    collider: { center: [ t[0], t[1] - minY, t[2] ].map(x => +x.toFixed(3)), half: s.map(x => +(x / 2).toFixed(3)) },
    materials: [ ...materials.keys() ],
    originalWorld: { yawDeg: +(2 * Math.asin(original.getRotation()[1]) * 180 / Math.PI).toFixed(1) },
}, null, 2))
