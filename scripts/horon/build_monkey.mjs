/**
 * İskeletli prop hattı: Simio Monkey Dancing (Sketchfab, pepetrincado, CC BY 4.0) → oyun için hafif maymun.
 *
 *   node scripts/horon/build_monkey.mjs
 *
 * Yapılanlar (ayarlar scripts/props/props.config.json > monkey.build):
 * - Parmak ve uç kemikleri el/ayak kemiğine birleştirilir (58 → 22 kemik); skin ağırlıkları en yakın korunan atasına toplanır.
 * - cm → oyun birimi, hedef boy (W140 yüksekliğinin ~1,3 katı); köşeler ve ters bağlama matrisleri ölçeklenir.
 * - Meshoptimizer ile üçgen sayısı hedefe indirilir (köşe öznitelikleri, skin ağırlıkları dahil korunur).
 * - Doku: tek atlas, 256 px WebP, hafif stilize (PBR haritaları atılır).
 * - Animasyon: kök hareketi (kalça x/z) silinir, döngü kesiti (loop.start..loop.end) 30 fps'e örneklenir, son kare ilk kareye
 *   yumuşakça karıştırılarak dikişsiz döngü yapılır. Bekleme pozu (kollar yana açık) otomatik seçilir (extras.idleTime).
 * - Çıktı: static/props/monkey.glb (Draco yok: skin indeksleri nicemlenirse bozulur; model zaten alana yaklaşınca yüklenir).
 */
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions'
import { weld, simplify } from '@gltf-transform/functions'
import { MeshoptSimplifier } from '../../node_modules/@gltf-transform/cli/node_modules/meshoptimizer/index.module.js'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'
import * as THREE from 'three'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const config = JSON.parse(readFileSync(path.join(root, 'scripts/props/props.config.json'), 'utf8'))
const prop = config.props.find(p => p.name === 'monkey')
const cfg = prop.build

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })

const source = await io.read(path.join(root, prop.source))
const sourceRoot = source.getRoot()
const sourceSkin = sourceRoot.listSkins()[0]
const sourceJoints = sourceSkin.listJoints()
const sourcePrimitive = sourceRoot.listMeshes()[0].listPrimitives()[0]
const sourceAnimation = sourceRoot.listAnimations()[0]
const sourceIbm = sourceSkin.getInverseBindMatrices().getArray()

// 1) Korunan kemikler ve eski → yeni dizin eşlemesi
const removeRegexp = new RegExp(cfg.removeBones)
const keptIndices = []
sourceJoints.forEach((joint, i) => { if(!removeRegexp.test(joint.getName())) keptIndices.push(i) })
const sourceToKept = new Map() // eski dizin → korunan (eski) dizin; çıkarılanlar en yakın korunan ataya gider
sourceJoints.forEach((joint, i) =>
{
    let node = joint
    while(node && (!sourceJoints.includes(node) || removeRegexp.test(node.getName())))
        node = node.getParentNode()
    sourceToKept.set(i, node ? sourceJoints.indexOf(node) : 0)
})
const newIndexOf = new Map(keptIndices.map((oldIndex, newIndex) => [ oldIndex, newIndex ]))

// 2) Boy ve ölçek
const sourcePosition = sourcePrimitive.getAttribute('POSITION')
const sourceHeight = sourcePosition.getMax([])[1] - sourcePosition.getMin([])[1]
const scale = cfg.height / sourceHeight

// 3) Yeni doküman
const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('monkey')

// Kemik düğümleri (yerel TRS ölçeklenir)
const newJoints = keptIndices.map((oldIndex) =>
{
    const old = sourceJoints[oldIndex]
    const t = old.getTranslation()
    return doc.createNode(old.getName().replace('mixamorig:', '').replace(/_\d+$/, ''))
        .setTranslation([ t[0] * scale, t[1] * scale, t[2] * scale ])
        .setRotation(old.getRotation())
})
keptIndices.forEach((oldIndex, newIndex) =>
{
    const parentOld = sourceToKept.get(sourceJoints.indexOf(sourceJoints[oldIndex].getParentNode()))
    const parent = sourceJoints.includes(sourceJoints[oldIndex].getParentNode()) ? newIndexOf.get(parentOld) : undefined
    if(parent !== undefined && parent !== newIndex)
        newJoints[parent].addChild(newJoints[newIndex])
})
// _rootJoint kalktı: kök kalça (ilk kemik) sahneye
const rootBones = newJoints.filter(joint => !joint.getParentNode())
for(const bone of rootBones)
    scene.addChild(bone)

// Ters bağlama matrisleri (öteleme bileşeni ölçeklenir)
const ibm = new Float32Array(keptIndices.length * 16)
keptIndices.forEach((oldIndex, newIndex) =>
{
    for(let k = 0; k < 16; k++)
        ibm[newIndex * 16 + k] = sourceIbm[oldIndex * 16 + k]
    ibm[newIndex * 16 + 12] *= scale
    ibm[newIndex * 16 + 13] *= scale
    ibm[newIndex * 16 + 14] *= scale
})
const skin = doc.createSkin('monkey').setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer))
for(const joint of newJoints)
    skin.addJoint(joint)

// Köşeler: konum ölçek, ağırlıklar kemik birleştirme
const count = sourcePosition.getCount()
const positions = new Float32Array(count * 3)
const normals = new Float32Array(count * 3)
const uvs = new Float32Array(count * 2)
const jointsArray = new Uint16Array(count * 4)
const weightsArray = new Float32Array(count * 4)
const sourceNormal = sourcePrimitive.getAttribute('NORMAL')
const sourceUv = sourcePrimitive.getAttribute('TEXCOORD_0')
const sourceJ = sourcePrimitive.getAttribute('JOINTS_0')
const sourceW = sourcePrimitive.getAttribute('WEIGHTS_0')
for(let i = 0; i < count; i++)
{
    const p = sourcePosition.getElement(i, [])
    positions.set([ p[0] * scale, p[1] * scale, p[2] * scale ], i * 3)
    normals.set(sourceNormal.getElement(i, []), i * 3)
    uvs.set(sourceUv.getElement(i, []), i * 2)

    const j = sourceJ.getElement(i, [])
    const w = sourceW.getElement(i, [])
    const merged = new Map()
    for(let k = 0; k < 4; k++)
    {
        if(w[k] <= 0)
            continue
        const target = newIndexOf.get(sourceToKept.get(j[k]))
        merged.set(target, (merged.get(target) ?? 0) + w[k])
    }
    let sum = 0
    for(const value of merged.values())
        sum += value
    let slot = 0
    for(const [ joint, weight ] of merged)
    {
        jointsArray[i * 4 + slot] = joint
        weightsArray[i * 4 + slot] = weight / sum
        slot++
    }
}

const sourceIndices = sourcePrimitive.getIndices().getArray()
const primitive = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(jointsArray).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weightsArray).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(sourceIndices)).setBuffer(buffer))

// Doku: tek atlas, küçük, stilize
const sourceTexture = sourceRoot.listMaterials()[0].getBaseColorTexture()
const webp = await sharp(Buffer.from(sourceTexture.getImage()))
    .resize(cfg.texture, cfg.texture, { kernel: 'lanczos3' })
    .blur(cfg.textureBlur)
    .modulate({ saturation: cfg.textureSaturation, brightness: cfg.textureBrightness })
    .webp({ quality: 88 })
    .toBuffer()
doc.createExtension(EXTTextureWebP).setRequired(true)
const texture = doc.createTexture('monkeyFur').setImage(new Uint8Array(webp)).setMimeType('image/webp')
const material = doc.createMaterial('monkeyFur').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(1)
primitive.setMaterial(material)

const mesh = doc.createMesh('monkey').addPrimitive(primitive)
const meshNode = doc.createNode('monkey').setMesh(mesh).setSkin(skin)
scene.addChild(meshNode)

// 4) Sadeleştirme (weld + meshopt; skin öznitelikleri köşelerle birlikte taşınır)
await MeshoptSimplifier.ready
const trianglesBefore = sourceIndices.length / 3
await doc.transform(
    weld({ tolerance: 0.0001 }),
    simplify({ simplifier: MeshoptSimplifier, ratio: cfg.triangles / trianglesBefore, error: cfg.simplifyError, lockBorder: false })
)
const finalTriangles = mesh.listPrimitives()[0].getIndices().getCount() / 3

// 5) Animasyon: örnekleme, kök hareketi silme, dikişsiz döngü
const fps = 30
const { start, end, blend } = cfg.loop
const duration = end - start
const frameCount = Math.round(duration * fps) + 1
const times = new Float32Array(frameCount).map((_, i) => i / fps)

const channelsByJoint = new Map()
for(const channel of sourceAnimation.listChannels())
{
    const node = channel.getTargetNode()
    const sourceIndex = sourceJoints.indexOf(node)
    if(sourceIndex < 0 || !newIndexOf.has(sourceIndex))
        continue
    const entry = channelsByJoint.get(sourceIndex) ?? {}
    entry[channel.getTargetPath()] = channel.getSampler()
    channelsByJoint.set(sourceIndex, entry)
}

const sample = (sampler, time, components) =>
{
    const input = sampler.getInput().getArray()
    const output = sampler.getOutput().getArray()
    let i = 0
    while(i < input.length - 2 && input[i + 1] < time)
        i++
    const span = input[i + 1] - input[i]
    const t = span > 0 ? Math.min(1, Math.max(0, (time - input[i]) / span)) : 0
    const a = output.slice(i * components, i * components + components)
    const b = output.slice((i + 1) * components, (i + 1) * components + components)
    if(components === 4)
        return new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), t).toArray()
    return a.map((value, k) => value + (b[k] - value) * t)
}

const hipsOldIndex = sourceJoints.findIndex(joint => /Hips/.test(joint.getName()))
const hipsRest = sourceJoints[hipsOldIndex].getTranslation()
const smooth = (x) => x * x * (3 - 2 * x)

const animation = doc.createAnimation('horon')
const addChannel = (node, path, outputType, outputArray) =>
{
    const sampler = doc.createAnimationSampler()
        .setInput(doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer))
        .setOutput(doc.createAccessor().setType(outputType).setArray(outputArray).setBuffer(buffer))
        .setInterpolation('LINEAR')
    animation.addSampler(sampler)
    animation.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler))
}
const poses = [] // [kare][yeni kemik] = quaternion (bekleme pozu seçimi için)
for(let f = 0; f < frameCount; f++)
    poses.push([])
const hipsTrack = new Float32Array(frameCount * 3)

for(const [ sourceIndex, samplers ] of channelsByJoint)
{
    const newIndex = newIndexOf.get(sourceIndex)
    const node = newJoints[newIndex]
    if(!samplers.rotation)
        continue

    const rotations = new Float32Array(frameCount * 4)
    const first = sample(samplers.rotation, start, 4)
    for(let f = 0; f < frameCount; f++)
    {
        const time = start + times[f]
        let q = new THREE.Quaternion(...sample(samplers.rotation, time, 4))
        const w = f >= frameCount - 1 - Math.round(blend * fps) ? smooth((f - (frameCount - 1 - Math.round(blend * fps))) / Math.round(blend * fps)) : 0
        if(w > 0)
        {
            const target = new THREE.Quaternion(...first)
            if(q.dot(target) < 0) target.set(-target.x, -target.y, -target.z, -target.w)
            q = q.slerp(target, w)
        }
        rotations.set(q.toArray(), f * 4)
        poses[f][newIndex] = q
    }
    addChannel(node, 'rotation', 'VEC4', rotations)

    // Kalça: x/z kök hareketi silinir (dinlenme konumuna sabitlenir), yükseklik korunur ve döngüye karıştırılır
    if(sourceIndex === hipsOldIndex && samplers.translation)
    {
        const translations = new Float32Array(frameCount * 3)
        const firstT = sample(samplers.translation, start, 3)
        for(let f = 0; f < frameCount; f++)
        {
            const t = sample(samplers.translation, start + times[f], 3)
            const w = f >= frameCount - 1 - Math.round(blend * fps) ? smooth((f - (frameCount - 1 - Math.round(blend * fps))) / Math.round(blend * fps)) : 0
            const y = t[1] + (firstT[1] - t[1]) * w
            translations.set([ hipsRest[0] * scale, y * scale, hipsRest[2] * scale ], f * 3)
        }
        hipsTrack.set(translations)
        addChannel(node, 'translation', 'VEC3', translations)
    }
}

// 6) Bekleme pozu: ileri kinematikle ellerin yanal açıklığı en büyük, omuz yüksekliğine yakın kare
const fk = (frame) =>
{
    const matrices = new Map()
    const compute = (node) =>
    {
        const index = newJoints.indexOf(node)
        const local = new THREE.Matrix4()
        const t = node.getTranslation()
        const q = poses[frame][index] ?? new THREE.Quaternion(...node.getRotation())
        local.compose(new THREE.Vector3(...t), q, new THREE.Vector3(1, 1, 1))
        if(node === newJoints.find(j => /Hips/.test(j.getName())))
            local.setPosition(hipsTrack[frame * 3], hipsTrack[frame * 3 + 1], hipsTrack[frame * 3 + 2])
        const parent = node.getParentNode()
        const world = parent && matrices.has(parent) ? matrices.get(parent).clone().multiply(local) : local
        matrices.set(node, world)
        for(const child of node.listChildren())
            if(newJoints.includes(child)) compute(child)
    }
    for(const bone of rootBones)
        compute(bone)
    return matrices
}
const byName = (name) => newJoints.find(joint => joint.getName() === name)
let bestFrame = 0
let bestScore = -Infinity
for(let f = 0; f < frameCount; f++)
{
    const m = fk(f)
    const p = (name) => new THREE.Vector3().setFromMatrixPosition(m.get(byName(name)))
    const lh = p('LeftHand'), rh = p('RightHand'), ls = p('LeftArm'), rs = p('RightArm')
    const spread = Math.abs(lh.x - rh.x)
    const level = Math.abs(lh.y - ls.y) + Math.abs(rh.y - rs.y)
    const lean = Math.abs(lh.z - ls.z) + Math.abs(rh.z - rs.z)
    const score = spread - level * 0.8 - lean * 0.4
    if(score > bestScore) { bestScore = score; bestFrame = f }
}
const idleTime = times[bestFrame]
meshNode.setExtras({ idleTime, duration: times[frameCount - 1], bones: newJoints.length, height: cfg.height })

// 7) Yaz
const outDir = path.join(root, 'static/props')
mkdirSync(outDir, { recursive: true })
await io.write(path.join(outDir, 'monkey.glb'), doc)

console.log(JSON.stringify({ kemik: newJoints.length, ücgenÖnce: trianglesBefore, ücgenSonra: finalTriangles, ölçek: scale, süre: times[frameCount - 1], kare: frameCount, bekleme: { zaman: idleTime, kare: bestFrame } }, null, 1))
