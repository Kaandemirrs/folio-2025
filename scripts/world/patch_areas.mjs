/**
 * areas.glb yaması: temiz kaynaktan (resources/original/) okur, adım adım düğüm siler/ekler,
 * static/areas/areas.glb (ham) ve areas-compressed.glb (Draco + KTX2) olarak yeniden yazar.
 *
 *   npm run world                # bpy ile harfleri üretir + yamayı uygular
 *   node scripts/world/patch_areas.mjs   # yalnızca yama (letters.glb hazırsa)
 *
 * Neden gltf-transform: bpy gidiş-dönüşü iskeletleri (Bone düğümleri) ve köşe sayılarını değiştiriyor,
 * oysa buradaki yama diğer her düğümü bayt düzeyinde olduğu gibi bırakmalı.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { draco, prune } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const config = JSON.parse(readFileSync(path.join(root, 'scripts/world/world.config.json'), 'utf8'))
const work = path.join(root, 'scripts/world/.work')

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
    })

/**
 * Yardımcılar
 */
const find = (doc, name) => doc.getRoot().listNodes().find(n => n.getName() === name)
const findAll = (doc, regex) => doc.getRoot().listNodes().filter(n => regex.test(n.getName()))

// Düğümü ve tüm alt düğümlerini siler (mesh/accessor artıkları sonda temizlenir)
const removeNode = (node) =>
{
    for(const child of node.listChildren())
        removeNode(child)
    node.dispose()
}

const copyMesh = (doc, sourceMesh, material) =>
{
    const buffer = doc.getRoot().listBuffers()[0]
    const mesh = doc.createMesh(sourceMesh.getName())
    for(const sp of sourceMesh.listPrimitives())
    {
        const prim = doc.createPrimitive()
        for(const semantic of sp.listSemantics())
        {
            const a = sp.getAttribute(semantic)
            prim.setAttribute(semantic, doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer))
        }
        const i = sp.getIndices()
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(i.getArray().slice()).setBuffer(buffer))
        prim.setMaterial(material)
        mesh.addPrimitive(prim)
    }
    return mesh
}

const loadAsset = async (file) => io.read(file)

/**
 * Adım: Landing yazısı (BRUNO SIMON → KAAN DEMİR)
 */
const stepLetters = async (doc, report) =>
{
    const cfg = config.letters
    const old = findAll(doc, /^refLettersPhysicalDynamic/)
    for(const n of old)
        removeNode(n)
    report.push(`landing: ${old.length} Bruno harfi silindi`)

    const landing = find(doc, 'landing')
    const palette = doc.getRoot().listMaterials().find(m => m.getName() === 'palette')
    const assetFile = path.join(work, 'letters.glb')
    const meta = JSON.parse(readFileSync(path.join(work, 'letters.json'), 'utf8'))
    const asset = await loadAsset(assetFile)

    // Harf dizisi (boşluk dahil) ve ilerleme
    const chars = [...cfg.text]
    const items = []
    let cursor = 0
    for(const ch of chars)
    {
        if(ch === ' ')
        {
            cursor += cfg.wordGap - cfg.gap
            continue
        }
        const m = meta[ch]
        items.push({ ch, m, center: cursor + m.width / 2 })
        cursor += m.width + cfg.gap
    }
    const total = cursor - cfg.gap
    const angle = cfg.angleDeg * Math.PI / 180
    const dir = [ Math.cos(angle), -Math.sin(angle) ]
    const quat = [ 0, Math.sin(angle / 2), 0, Math.cos(angle / 2) ]
    const groundY = -2.5278496742248535

    let triangles = 0
    items.forEach((item, i) =>
    {
        const s = item.center - total / 2
        const node = doc.createNode(`refLettersPhysicalDynamic.${String(10 + i).padStart(3, '0')}`)
            .setTranslation([ cfg.center.x + dir[0] * s, groundY, cfg.center.z + dir[1] * s ])
            .setRotation(quat)
            .setExtras({ mass: cfg.mass })
        const sourceNode = asset.getRoot().listNodes().find(n => n.getName() === `letter_${item.ch}`)
        node.setMesh(copyMesh(doc, sourceNode.getMesh(), palette))
        triangles += item.m.triangles

        // Collider: yazı kutusu (orijinaldeki gibi cuboid çocuk, ölçek = tam boyut)
        const size = [ item.m.max[0] - item.m.min[0], item.m.max[1] - item.m.min[1] ]
        const ctr = [ (item.m.max[0] + item.m.min[0]) / 2, (item.m.max[1] + item.m.min[1]) / 2 ]
        const cuboid = doc.createNode(`cuboid.${230 + i}`)
            .setTranslation([ ctr[0], ctr[1], 0 ])
            .setScale([ size[0] * 0.99, size[1], cfg.colliderDepth ])
        node.addChild(cuboid)
        landing.addChild(node)
    })
    report.push(`landing: ${items.length} harf eklendi (${triangles} üçgen, toplam uzunluk ${total.toFixed(2)})`)
}

const STEPS = [
    stepLetters,
]

/**
 * Çalıştır
 */
const run = async (input, output, compressed) =>
{
    const doc = await io.read(input)
    const report = []
    for(const step of (process.env.WORLD_STEPS === 'none' ? [] : STEPS))
        await step(doc, report)

    // Yetim mesh/accessor temizliği. Malzeme ve dokulara dokunulmaz (kod bunları ada göre arıyor).
    await doc.transform(prune({ propertyTypes: [ PropertyType.MESH, PropertyType.ACCESSOR ], keepLeaves: true, keepAttributes: true, keepIndices: true }))

    if(compressed)
    {
        await doc.transform(draco({
            method: 'edgebreaker',
            quantizationVolume: 'mesh',
            quantizePosition: 12,
            quantizeNormal: 6,
            quantizeTexcoord: 6,
            quantizeColor: 2,
            quantizeGeneric: 2,
        }))
    }
    await io.write(output, doc)
    return report
}

for(const [ input, output, compressed ] of [
    [ 'resources/original/areas.glb', process.env.WORLD_OUT_DIR ? `${process.env.WORLD_OUT_DIR}/areas.glb` : 'static/areas/areas.glb', false ],
    [ 'resources/original/areas-compressed.glb', process.env.WORLD_OUT_DIR ? `${process.env.WORLD_OUT_DIR}/areas-compressed.glb` : 'static/areas/areas-compressed.glb', true ],
])
{
    const report = await run(path.join(root, input), path.resolve(root, output), compressed)
    console.log(`${output}\n  ${report.join('\n  ')}`)
}
