/**
 * areas.glb yaması: temiz kaynaktan (resources/original/) okur, adım adım düğüm siler/ekler,
 * static/areas/areas.glb (ham) ve areas-compressed.glb (Draco + KTX2) olarak yeniden yazar.
 * Aynı yama düzeni küçük referans GLB'leri (çalı, çiçek) için de geçerli: hedef başına bir adım listesi.
 *
 *   npm run world                # bpy ile harfleri üretir + yamayı uygular
 *   node scripts/world/patch_areas.mjs   # yalnızca yama (letters.glb hazırsa)
 *
 * Neden gltf-transform: bpy gidiş-dönüşü iskeletleri (Bone düğümleri) ve köşe sayılarını değiştiriyor,
 * oysa buradaki yama diğer her düğümü bayt düzeyinde olduğu gibi bırakmalı.
 */
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import sharp from 'sharp'
import {
    createDefaultContainer, write as writeKtx2,
    KHR_DF_CHANNEL_RGBSDA_ALPHA, KHR_DF_CHANNEL_RGBSDA_BLUE, KHR_DF_CHANNEL_RGBSDA_GREEN, KHR_DF_CHANNEL_RGBSDA_RED,
    KHR_DF_FLAG_ALPHA_STRAIGHT, KHR_DF_MODEL_RGBSDA, KHR_DF_PRIMARIES_BT709, KHR_DF_SAMPLE_DATATYPE_LINEAR,
    KHR_DF_TRANSFER_SRGB, KHR_SUPERCOMPRESSION_ZSTD, VK_FORMAT_R8G8B8A8_SRGB,
} from 'ktx-parse'
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

    const mesh = node.getMesh()
    node.dispose()

    // Başka düğümün kullanmadığı mesh'i ve accessor'larını da sil (yetim accessor dosyaya yazılır, Draco dışında kalır)
    const orphaned = (property) => property.listParents().every(parent => parent.propertyType === 'Root')
    if(mesh && orphaned(mesh))
    {
        const accessors = []
        for(const primitive of mesh.listPrimitives())
        {
            accessors.push(...primitive.listAttributes(), primitive.getIndices())
            primitive.dispose()
        }
        mesh.dispose()
        for(const accessor of accessors)
        {
            if(accessor && orphaned(accessor))
                accessor.dispose()
        }
    }
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


/**
 * Adım: Sosyal alan. Bruno'ya ait figürleri/heykeli ve kullanılmayan ikonları siler, kalan ikonları (sources/data/social.js)
 * yarım çemberde dengeli yeniden yerleştirir. Kaide (Cube.133) tek mesh: bağlı parçalara ayrılır, gerekmeyenler silinir,
 * kalanlar yeni açıya döndürülür; kaide çarpıştırıcıları (physicalFixed.002) aynı şekilde güncellenir.
 */
const quat = (yaw) => [ 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2) ]

// Üçgenleri konum eşleşmesiyle bağlı parçalara ayırır → { islands: [{ tris: [..], min, max }], of: Int32Array(üçgen → parça) }
const splitIslands = (prim) =>
{
    const pos = prim.getAttribute('POSITION')
    const idx = prim.getIndices().getArray()
    const key = (i) => pos.getElement(i, []).map(x => Math.round(x * 1000)).join(',')
    const parent = new Map()
    const find = (k) => { while(parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k) } return k }
    for(let i = 0; i < pos.getCount(); i++)
    {
        const k = key(i)
        if(!parent.has(k)) parent.set(k, k)
    }
    for(let t = 0; t < idx.length; t += 3)
    {
        const a = find(key(idx[t]))
        for(const o of [ 1, 2 ])
        {
            const b = find(key(idx[t + o]))
            if(a !== b) parent.set(b, a)
        }
    }
    const roots = new Map()
    const islands = []
    const of = new Int32Array(idx.length / 3)
    for(let t = 0; t < idx.length; t += 3)
    {
        const r = find(key(idx[t]))
        if(!roots.has(r))
        {
            roots.set(r, islands.length)
            islands.push({ tris: [], min: [ Infinity, Infinity, Infinity ], max: [ -Infinity, -Infinity, -Infinity ] })
        }
        const isl = islands[roots.get(r)]
        of[t / 3] = roots.get(r)
        isl.tris.push(t / 3)
        for(let o = 0; o < 3; o++)
        {
            const p = pos.getElement(idx[t + o], [])
            for(let k = 0; k < 3; k++)
            {
                isl.min[k] = Math.min(isl.min[k], p[k])
                isl.max[k] = Math.max(isl.max[k], p[k])
            }
        }
    }
    return { islands, of }
}

// Seçilen üçgenlerden yeni (sıkıştırılmış) bir primitive içeriği üretir; transform(üçgenIslandNo, [x,y,z]) → [x,y,z], normal için rotasyon (yaw)
const rebuildPrimitive = (doc, prim, split, keep) =>
{
    const idx = prim.getIndices().getArray()
    const attrs = prim.listSemantics().map(sem => ({ sem, acc: prim.getAttribute(sem), arr: [] }))
    const map = new Map()
    const out = []
    const posAttr = prim.getAttribute('POSITION')
    const normalAttr = prim.getAttribute('NORMAL')

    for(const [ islandNo, yaw, dx, dz, cx, cz ] of keep)
    {
        const cos = Math.cos(yaw), sin = Math.sin(yaw)
        for(const t of split.islands[islandNo].tris)
        {
            for(let o = 0; o < 3; o++)
            {
                const old = idx[t * 3 + o]
                const mk = `${islandNo}:${old}`
                if(!map.has(mk))
                {
                    map.set(mk, map.size)
                    for(const a of attrs)
                    {
                        const e = a.acc.getElement(old, [])
                        if(a.sem === 'POSITION')
                        {
                            const x = e[0] - cx, z = e[2] - cz
                            e[0] = cx + x * cos + z * sin + dx
                            e[2] = cz - x * sin + z * cos + dz
                        }
                        else if(a.sem === 'NORMAL')
                        {
                            const nx = e[0], nz = e[2]
                            e[0] = nx * cos + nz * sin
                            e[2] = - nx * sin + nz * cos
                        }
                        a.arr.push(...e)
                    }
                }
                out.push(map.get(mk))
            }
        }
    }
    for(const a of attrs)
    {
        const acc = prim.getAttribute(a.sem)
        acc.setArray(new Float32Array(a.arr))
    }
    prim.getIndices().setArray(new Uint32Array(out))
}

const stepSocial = async (doc, report) =>
{
    const cfg = config.social
    const social = (await import(pathToFileURL(path.join(root, 'sources/data/social.js')).href)).default
    const slots = social.length
    const slotAngle = (slot) => Math.PI * (slot + 0.5) / slots

    // 1) Silinecek düğümler
    let removed = 0
    for(const name of cfg.remove)
    {
        const node = find(doc, name)
        if(!node)
            throw new Error(`social: ${name} bulunamadı`)
        removeNode(node)
        removed++
    }
    report.push(`social: ${removed} düğüm silindi (${cfg.remove.join(', ')})`)

    // 2) Kaide mesh'i: orijinal slot → kalacak olan
    const center = find(doc, 'refCenter').getTranslation()
    const oldSlotOf = (x, z) => Math.round(Math.atan2(-z, x) / (Math.PI / 7))
    const platform = find(doc, 'Cube.133')
    const prim = platform.getMesh().listPrimitives()[0]
    const split = splitIslands(prim)

    const keep = []
    const colliders = find(doc, 'physicalFixed.002')
    const used = []

    for(const link of social)
    {
        const iconNode = find(doc, cfg.nodes[link.name])
        const iconPos = iconNode.getTranslation()
        const oldSlot = oldSlotOf(iconPos[0] - center[0], iconPos[2] - center[2])
        const oldAngle = oldSlot * Math.PI / 7
        const newAngle = slotAngle(link.slot)
        const delta = newAngle - oldAngle   // yaw farkı (+Y etrafında)

        // Eski kaide parçası: merkezi eski halka konumunda olan
        const oldX = Math.cos(oldAngle) * cfg.radius, oldZ = - Math.sin(oldAngle) * cfg.radius
        const islandNo = split.islands.findIndex(isl =>
        {
            const cx = (isl.min[0] + isl.max[0]) / 2, cz = (isl.min[2] + isl.max[2]) / 2
            return Math.hypot(cx - oldX, cz - oldZ) < 0.2
        })
        if(islandNo < 0)
            throw new Error(`social: ${link.name} kaidesi bulunamadı (slot ${oldSlot})`)

        const isl = split.islands[islandNo]
        const newX = Math.cos(newAngle) * cfg.radius, newZ = - Math.sin(newAngle) * cfg.radius
        keep.push([ islandNo, delta, newX - oldX, newZ - oldZ, oldX, oldZ ])

        // İkon: yeni halka konumu (yükseklik ve duruş aynı)
        iconNode.setTranslation([ center[0] + newX, iconPos[1], center[2] + newZ ])

        // Kaide çarpıştırıcısı
        const collider = colliders.listChildren().find(c => /^cuboid/.test(c.getName()) && Math.hypot(c.getTranslation()[0] - oldX, c.getTranslation()[2] - oldZ) < 0.2)
        if(!collider)
            throw new Error(`social: ${link.name} kaide çarpıştırıcısı bulunamadı`)
        const t = collider.getTranslation()
        collider.setTranslation([ newX, t[1], newZ ])
        collider.setRotation(quat(newAngle))
        used.push(collider)
    }

    rebuildPrimitive(doc, prim, split, keep)

    // Kullanılmayan kaide çarpıştırıcıları ve merkez kaide gövdesi (hull)
    for(const child of colliders.listChildren())
    {
        if(!used.includes(child))
            removeNode(child)
    }

    report.push(`social: ${slots} ikon yarım çemberde yeniden yerleştirildi (açılar ${social.map(l => (slotAngle(l.slot) * 180 / Math.PI).toFixed(0) + '°').join(', ')}); kaide mesh'i ${split.islands.length} parçadan ${keep.length}'e indirildi`)
}

/**
 * Referans GLB'lerine (çalı, çiçek) dekor ekleme. Referans düğümleri çalı için Icosphere.N (ölçek = boyut),
 * çiçek için flowers.N (küme merkezi) biçiminde; yeni düğümler listenin sonuna eklenir (eski rastgele dizi bozulmasın).
 */
const stepSocialDecor = (kind) => async (doc, report) =>
{
    const cfg = config.social
    const items = cfg.decor[kind === 'bushes' ? 'bushes' : 'flowers']
    if(!items.length)
        return

    const areas = await io.read(path.join(root, 'resources/original/areas.glb'))
    const socialNode = find(areas, 'social')
    const socialPos = socialNode.getTranslation()
    const center = find(areas, 'refCenter').getTranslation()
    const sceneNodes = doc.getRoot().listScenes()[0].listChildren()
    const template = sceneNodes[0]

    items.forEach((item, i) =>
    {
        const name = kind === 'bushes' ? `Icosphere.${900 + i}` : `flowers.${900 + i}`
        const node = doc.createNode(name)
            .setMesh(template.getMesh())
            .setTranslation([ socialPos[0] + center[0] + item.x, item.y ?? template.getTranslation()[1], socialPos[2] + center[2] + item.z ])
            .setScale([ item.scale ?? template.getScale()[0], item.scale ?? template.getScale()[1], item.scale ?? template.getScale()[2] ])
        doc.getRoot().listScenes()[0].addChild(node)
    })
    report.push(`social dekor: ${items.length} ${kind === 'bushes' ? 'çalı' : 'çiçek kümesi'} eklendi`)
}

/**
 * Adım: Bowling'deki jukebox artık ayrı prop (static/props/jukebox.glb, scripts/world/extract_jukebox.mjs); areas.glb'den silinir.
 */
const stepJukebox = async (doc, report) =>
{
    for(const name of [ 'refJukeboxPhysicalDynamic', 'refJukeboxInteractivePoint' ])
    {
        const node = find(doc, name)
        if(!node)
            throw new Error(`jukebox: ${name} bulunamadı`)
        removeNode(node)
    }
    report.push('bowling: jukebox düğümleri silindi (artık Jukeboxes.js)')
}

/**
 * Adım: Landing'deki "Kontroller" zemin sanatı (oyun kolu, telefon, gizmo, klavye plakası) kalkar; yerine
 * World/ProjectBoard.js proje panosu gelir. Kontroller menüde kalır (Menu 'controls'). Etkileşim noktası da silinir.
 */
const stepControls = async (doc, report) =>
{
    const names = [ 'gamepadPhysicalDynamic.001', 'gizmoPhysicalDynamic', 'phonePhysicalDynamic.001', 'Plane.002', 'Plane.004', 'refControlsInteractivePoint' ]
    const landing = find(doc, 'landing')
    for(const name of names)
    {
        const node = landing.listChildren().find(child => child.getName() === name)
        if(!node)
            throw new Error(`controls: ${name} bulunamadı`)
        removeNode(node)
    }
    report.push(`landing: Kontroller zemin sanatı silindi (${names.join(', ')})`)
}

/**
 * Adım: areas.glb'ye gömülü İngilizce etiket dokuları (projectsLabels, blackboardLabels) Türkçe olur.
 * Yeni görseller scripts/world/make_area_labels.mjs ile üretilir (resources/references/world/labels/*.png). Dokunun adı ve UV'leri aynı kalır,
 * yalnızca görüntü baytları değişir; -compressed.glb'de KTX2 (ham RGBA8 sRGB + Zstd, mip zinciriyle), ham glb'de PNG yazılır.
 */
const toKtx2 = async (png) =>
{
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const levels = []
    let width = info.width
    let height = info.height
    let level = data
    for(;;)
    {
        const compressed = zlib.zstdCompressSync(level, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })
        levels.push({ levelData: new Uint8Array(compressed), uncompressedByteLength: level.length })
        if(width === 1 && height === 1)
            break
        const nextWidth = Math.max(1, width >> 1)
        const nextHeight = Math.max(1, height >> 1)
        level = await sharp(level, { raw: { width, height, channels: 4 } }).resize(nextWidth, nextHeight, { kernel: 'lanczos3' }).raw().toBuffer()
        width = nextWidth
        height = nextHeight
    }

    const container = createDefaultContainer()
    container.vkFormat = VK_FORMAT_R8G8B8A8_SRGB
    container.typeSize = 1
    container.pixelWidth = info.width
    container.pixelHeight = info.height
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
    container.levelCount = levels.length
    container.levels = levels
    return writeKtx2(container)
}

const stepLabels = async (doc, report) =>
{
    for(const name of [ 'projectsLabels', 'blackboardLabels' ])
    {
        const texture = doc.getRoot().listTextures().find(item => item.getName() === name)
        if(!texture)
            throw new Error(`labels: ${name} dokusu bulunamadı`)

        const png = readFileSync(path.join(root, `resources/references/world/labels/${name}.png`))
        if(texture.getMimeType() === 'image/ktx2')
            texture.setImage(await toKtx2(png))
        else
            texture.setImage(new Uint8Array(png)).setMimeType('image/png')
        report.push(`${name}: Türkçe etiket dokusu (${texture.getMimeType()})`)
    }
}

/**
 * Adım: Projeler alanındaki "öne çıkanlar" masasından Bruno'nun ödül objeleri (awwwards, cssda, fwa) kalkar.
 * refDistinctions düğümü yerinde kalır; ProjectsArea.js her projenin highlights listesi için ahşap levhaları burada kurar.
 */
const stepDistinctions = async (doc, report) =>
{
    const group = find(doc, 'refDistinctions')
    for(const name of [ 'awwwards', 'cssda', 'fwa' ])
    {
        const node = group.listChildren().find(child => child.getName() === name)
        if(!node)
            throw new Error(`distinctions: ${name} bulunamadı`)
        removeNode(node)
    }
    report.push('projects: Bruno ödül objeleri silindi (awwwards, cssda, fwa)')
}

/**
 * Adım: Kariyer alanındaki Bruno'nun zaman çizelgesi kalkar: renkli zemin çizgileri (Plane.018/022/035/048/049), taş levhalı çizgiler
 * (refLine ×6: IRL TEACHER, UZIK, FREELANCER, HETIC… etiketleri careerText düğümlerinde) ve yıl göstergesi (refYear).
 * Alan bölgesi (refZoneBounding.001 / refZoneFrustum.001) yerinde kalır; pano World/CareerBoard.js ile kodda kurulur.
 */
const stepCareer = async (doc, report) =>
{
    const career = find(doc, 'career')
    const targets = career.listChildren().filter(child => /^(Plane\.(018|022|035|048|049)|refLine(\.\d+)?|refYear)$/.test(child.getName()))
    if(targets.length !== 12)
        throw new Error(`career: 12 düğüm bekleniyordu, ${targets.length} bulundu`)

    for(const node of targets)
        removeNode(node)

    report.push(`career: zaman çizelgesi silindi (${targets.map(node => node.getName()).join(', ')})`)
}

// Hedef başına adımlar. Her hedefin kaynağı resources/original/<ad>.glb ve <ad>-compressed.glb
const TARGETS = [
    { original: 'areas', out: 'static/areas/areas', steps: [ stepLetters, stepSocial, stepJukebox, stepControls, stepLabels, stepDistinctions, stepCareer ] },
    { original: 'bushesReferences', out: 'static/bushes/bushesReferences', steps: [ stepSocialDecor('bushes') ] },
    { original: 'flowersReferences', out: 'static/flowers/flowersReferences', steps: [ stepSocialDecor('flowers') ] },
]

/**
 * Çalıştır
 */
const run = async (input, output, compressed, steps) =>
{
    const doc = await io.read(input)
    const report = []
    for(const step of (process.env.WORLD_STEPS === 'none' ? [] : steps.filter(step => !process.env.WORLD_ONLY || process.env.WORLD_ONLY.split(',').includes(step.name))))
        await step(doc, report)

    // Yetim mesh/accessor temizliği. Malzeme ve dokulara dokunulmaz (kod bunları ada göre arıyor).
    if(report.length === 0)
        return report // bu hedefte değişiklik yok: dosyaya dokunma

    // İki geçiş: önce yetim mesh'ler, sonra onların artık yetim kalan accessor'ları
    for(let pass = 0; pass < 2; pass++)
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

const outDir = process.env.WORLD_OUT_DIR
for(const target of TARGETS)
{
    for(const compressed of [ false, true ])
    {
        const suffix = compressed ? '-compressed.glb' : '.glb'
        const input = path.join(root, `resources/original/${target.original}${suffix}`)
        const output = outDir ? path.join(outDir, path.basename(target.out) + suffix) : path.resolve(root, target.out + suffix)
        const report = await run(input, output, compressed, target.steps)
        console.log(`${path.relative(root, output)}\n  ${report.join('\n  ')}`)
    }
}
