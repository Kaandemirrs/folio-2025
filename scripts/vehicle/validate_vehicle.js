// Araç GLB'sini oyunun beklentilerine göre doğrular (ham veya Draco'lu GLB).
//   node scripts/vehicle/validate_vehicle.js static/vehicle/w140.glb [static/vehicle/w140-compressed.glb]
// Kontroller: zorunlu node'lar ve hiyerarşi, ad önek çakışması, UV setleri, materyal adları,
// plaka dokusu ve örnekleyici, üçgen bütçesi, bounding box.
import fs from 'node:fs'

const BUDGET = { unique: 3700, rendered: 4500 }
const TARGET = { length: 3.23, width: 1.45, height: 1.00 }
const PREFIXES = ['chassis', 'bodyPainted', 'blinkerLeft', 'blinkerRight', 'stopLights', 'backLights', 'wheelContainer', 'antenna', 'cell1', 'cell2', 'cell3', 'energy']

function readGlb(path)
{
    const b = fs.readFileSync(path)
    const jsonLength = b.readUInt32LE(12)
    return JSON.parse(b.slice(20, 20 + jsonLength).toString('utf8'))
}

const mul = (a, b) =>
{
    const o = new Array(16).fill(0)
    for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++) for(let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
    return o
}
function local(n)
{
    if(n.matrix) return n.matrix
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1]
    const [sx, sy, sz] = n.scale || [1, 1, 1]
    const [tx, ty, tz] = n.translation || [0, 0, 0]
    return [
        (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
        (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
        (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1,
    ]
}
const apply = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])

function validate(path)
{
    const j = readGlb(path)
    const errors = [], warnings = [], info = []
    const nodes = j.nodes
    const err = (m) => errors.push(m)

    // --- hiyerarşi ---
    const parentOf = new Map()
    nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)))
    const roots = j.scenes[0].nodes
    const byName = (name, re = true) => nodes.map((n, i) => [n, i]).filter(([n]) => re ? new RegExp(`^${name}`, 'i').test(n.name) : n.name === name)

    const one = (name) =>
    {
        const m = byName(name)
        if(m.length === 0) { err(`zorunlu node yok: ${name}`); return null }
        if(m.length > 1) err(`"${name}" önekiyle birden fazla node (son eşleşen kazanır, sessiz hata): ${m.map(([n]) => n.name).join(', ')}`)
        return m[m.length - 1]
    }
    const chassis = one('chassis')
    const body = one('bodyPainted')
    const wc = one('wheelContainer')
    one('headlights') // opsiyonel ama gerekli kabul ediyoruz (hep görünür)
    const left = byName('blinkerLeft'), right = byName('blinkerRight')
    if(left.length !== right.length) err('blinkerLeft / blinkerRight çifti eksik (biri varsa diğeri de olmalı)')
    for(const n of ['stopLights', 'backLights', 'blinkerLeft', 'blinkerRight']) if(!byName(n).length) err(`zorunlu node yok: ${n}`)
    if(byName('energy').length && !(byName('cell1').length && byName('cell2').length && byName('cell3').length)) err('energy var ama cell1-3 yok (oyun çöker)')

    if(chassis && !roots.includes(chassis[1])) err('chassis kök node değil')
    if(wc && !roots.includes(wc[1])) err('wheelContainer kök node değil')
    if(wc)
    {
        const cyl = (wc[0].children || []).map(c => nodes[c]).find(n => /^wheelCylinder/i.test(n.name))
        if(!cyl) err('wheelContainer altında wheelCylinder yok')
        else
        {
            const t = cyl.translation || [0, 0, 0]
            if(Math.hypot(...t) > 1e-5) err(`wheelCylinder konumu (0,0,0) olmalı: ${t}`)
            const wheel = (cyl.children || []).map(c => nodes[c]).find(n => n.mesh !== undefined)
            if(!wheel) err('wheelCylinder altında wheel mesh yok')
        }
    }
    // ad önek çakışması (örn. bodyPaintedTrim)
    for(const p of PREFIXES)
    {
        const m = byName(p)
        if(m.length > 1 && !['blinkerLeft', 'blinkerRight'].includes(p)) err(`önek çakışması: ${p} → ${m.map(([n]) => n.name).join(', ')}`)
    }

    // --- mesh bilgileri ---
    const tri = (mi) => j.meshes[mi].primitives.reduce((t, p) => t + (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3, 0)
    let chassisTris = 0, wheelTris = 0
    const mats = new Set()
    const walk = (i, pm, inWheel, inChassis, bb) =>
    {
        const n = nodes[i]
        const m = mul(pm, local(n))
        if(n.mesh !== undefined)
        {
            const t = tri(n.mesh)
            if(inWheel) wheelTris += t
            if(inChassis) chassisTris += t
            for(const p of j.meshes[n.mesh].primitives)
            {
                if(p.material !== undefined) mats.add(j.materials[p.material].name)
                const a = j.accessors[p.attributes.POSITION]
                if(inChassis && a.min && a.max)
                    for(let c = 0; c < 8; c++)
                    {
                        const w = apply(m, [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]])
                        for(let k = 0; k < 3; k++) { bb.min[k] = Math.min(bb.min[k], w[k]); bb.max[k] = Math.max(bb.max[k], w[k]) }
                    }
            }
            // UV setleri
            const attrs = j.meshes[n.mesh].primitives[0].attributes
            if(!attrs.TEXCOORD_0) err(`${n.name}: TEXCOORD_0 yok`)
            if(!attrs.NORMAL) err(`${n.name}: NORMAL yok`)
            if(/^bodyPainted/i.test(n.name) && !attrs.TEXCOORD_1) err('bodyPainted: TEXCOORD_1 (alev boyası) yok')
        }
        for(const c of n.children || []) walk(c, m, inWheel, inChassis, bb)
    }
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    for(const r of roots)
    {
        const isWheel = wc && r === wc[1]
        walk(r, I, isWheel, !isWheel, bb)
    }

    const unique = chassisTris + wheelTris
    const rendered = chassisTris + 4 * wheelTris
    info.push(`üçgen: şasi ${chassisTris} + tekerlek ${wheelTris} → benzersiz ${unique} (≤${BUDGET.unique}), çizilen ${rendered} (≤${BUDGET.rendered})`)
    if(unique > BUDGET.unique) err(`benzersiz üçgen bütçesi aşıldı: ${unique}`)
    if(rendered > BUDGET.rendered) err(`çizilen üçgen bütçesi aşıldı: ${rendered}`)

    // --- bounding box (şasi alt ağacı; aynalar, egzoz ve plaka dahil) ---
    const size = bb.max.map((v, i) => v - bb.min[i])
    const [L, , W] = size
    const roof = bb.max[1] // zemin y=0 (node'lar dünya uzayında hesaplandı)
    info.push(`bbox (şasi): uzunluk ${L.toFixed(3)} · genişlik ${W.toFixed(3)} · zeminden tavana ${roof.toFixed(3)} (gövde alt kenarı y=${bb.min[1].toFixed(3)}) · x ${bb.min[0].toFixed(2)}…${bb.max[0].toFixed(2)}`)
    if(Math.abs(L - TARGET.length) > 0.12) err(`uzunluk hedefe uzak: ${L.toFixed(3)} (hedef ${TARGET.length} ±0.12; egzoz ucu dahil)`)
    if(W < TARGET.width - 0.05 || W > TARGET.width + 0.20) err(`genişlik hedefe uzak: ${W.toFixed(3)} (hedef ${TARGET.width}, aynalar dahil +0.20'ye kadar)`)
    if(Math.abs(roof - TARGET.height) > 0.06) err(`yükseklik hedefe uzak: ${roof.toFixed(3)} (zeminden tavana; hedef ${TARGET.height} ±0.06)`)
    if(chassis)
    {
        const y = (chassis[0].translation || [0, 0, 0])[1]
        info.push(`chassis y (dinlenme yüksekliği): ${y}`)
        if(Math.abs(y - 0.686) > 0.01) warnings.push(`chassis y 0.686 değil (Rapier ölçümü); fizik ayarı ile uyumlu mu? ${y}`)
        const ground = bb.min[1] // dünya konumu: node'lar dünya uzayında hesaplandı
        if(Math.abs(ground) > 0.5) warnings.push(`şasi alt ağacı zemini ${ground.toFixed(3)} (gövde zeminden yüksekte olması normal)`)
    }

    // --- materyaller ---
    const need = ['obsidianGradient', 'palette', 'emissiveWhiteRadialGradient', 'emissiveOrangeRadialGradient', 'licensePlate']
    for(const n of need) if(!mats.has(n)) err(`materyal yok: ${n}`)
    info.push(`materyaller: ${[...mats].join(', ')}`)
    const plate = j.materials.find(m => m.name === 'licensePlate')
    if(plate)
    {
        const ti = plate.pbrMetallicRoughness?.baseColorTexture?.index
        if(ti === undefined) err('licensePlate: baseColorTexture yok')
        else
        {
            const tex = j.textures[ti]
            const sampler = j.samplers?.[tex.sampler]
            info.push(`plaka sampler: ${JSON.stringify(sampler)}`)
            if(sampler && (sampler.magFilter === 9728 || sampler.minFilter === 9728 || sampler.minFilter === 9984)) err('plaka dokusu Nearest filtreli (Linear olmalı)')
            const im = j.images[tex.source]
            info.push(`plaka dokusu: ${im.mimeType}`)
        }
    }
    const embedded = (j.images || []).length
    info.push(`gömülü texture: ${embedded} (yalnızca plaka beklenir)`)
    if(embedded > 1) warnings.push(`${embedded} gömülü texture var; sadece plaka beklenir (palette node mute değil mi?)`)

    // --- dosya ---
    const size_bytes = fs.statSync(path).size
    info.push(`dosya: ${size_bytes} bayt${(j.extensionsUsed || []).includes('KHR_draco_mesh_compression') ? ' (Draco)' : ''}`)
    return { path, errors, warnings, info }
}

let failed = false
for(const p of process.argv.slice(2))
{
    const r = validate(p)
    console.log(`\n== ${r.path}`)
    r.info.forEach(l => console.log('  ' + l))
    r.warnings.forEach(l => console.log('  UYARI: ' + l))
    r.errors.forEach(l => console.log('  HATA: ' + l))
    console.log(r.errors.length ? `  → BAŞARISIZ (${r.errors.length} hata)` : '  → GEÇTİ')
    if(r.errors.length) failed = true
}
process.exit(failed ? 1 : 0)
