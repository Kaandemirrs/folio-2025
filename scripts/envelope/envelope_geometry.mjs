// Zarf modeli (kendi modelimiz; Sketchfab modeli kullanılmıyor). Bu makinede bpy/Blender yok: geometri doğrudan kodla üretilir
// (kutu + üçgen prizmalar + sekizgen mühür, ≈110 üçgen) ve iki yerde kullanılır:
//   1) scripts/envelope/build_envelope.mjs → static/props/envelope.glb (landing ve projeler girişindeki zarflar)
//   2) scripts/world/patch_areas.mjs → areas.glb'deki sosyal alan ikon halkasında Bruno'nun posta ikonunun yerine
// Ölçüler: genişlik 1.5, yükseklik 1.05, kalınlık 0.2; merkez orijinde, ön yüz +Z. Parçalar renklerine göre ayrı döner (name: body/flap/trim/seal).
export const ENVELOPE = { width: 1.5, height: 1.05, depth: 0.2 }

// Düz renk: palette.png hücresi (areas.glb 'palette' malzemesi) ve glb için baseColor
export const COLORS = {
    body: { cell: 19, hex: '#c30e3a' }, // koyu kırmızı gövde
    flap: { cell: 1, hex: '#ebd1a3' },  // krem kapak ve katlar
    trim: { cell: 1, hex: '#ebd1a3' },  // krem çerçeve
    seal: { cell: 8, hex: '#e4a90c' },  // altın mühür
}

// Yardımcı: düz yüzlü çokgen listesi → { positions, normals, indices }
class Mesh
{
    constructor() { this.positions = []; this.normals = []; this.indices = [] }

    // Üçgen (saat yönünün tersi, dışa dönük normal hesaplanır)
    tri(a, b, c)
    {
        const u = [ b[0] - a[0], b[1] - a[1], b[2] - a[2] ]
        const v = [ c[0] - a[0], c[1] - a[1], c[2] - a[2] ]
        let n = [ u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0] ]
        const l = Math.hypot(...n) || 1
        n = n.map(x => x / l)
        const base = this.positions.length / 3
        for(const p of [ a, b, c ])
        {
            this.positions.push(...p)
            this.normals.push(...n)
        }
        this.indices.push(base, base + 1, base + 2)
    }

    quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d) }

    // Eksen hizalı kutu: merkez, boyut
    box(cx, cy, cz, w, h, d)
    {
        const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2
        this.quad([ x0, y0, z1 ], [ x1, y0, z1 ], [ x1, y1, z1 ], [ x0, y1, z1 ]) // ön
        this.quad([ x1, y0, z0 ], [ x0, y0, z0 ], [ x0, y1, z0 ], [ x1, y1, z0 ]) // arka
        this.quad([ x0, y0, z0 ], [ x0, y0, z1 ], [ x0, y1, z1 ], [ x0, y1, z0 ]) // sol
        this.quad([ x1, y0, z1 ], [ x1, y0, z0 ], [ x1, y1, z0 ], [ x1, y1, z1 ]) // sağ
        this.quad([ x0, y1, z1 ], [ x1, y1, z1 ], [ x1, y1, z0 ], [ x0, y1, z0 ]) // üst
        this.quad([ x0, y0, z0 ], [ x1, y0, z0 ], [ x1, y0, z1 ], [ x0, y0, z1 ]) // alt
    }

    // Ön yüzü +Z olan üçgen prizma (üçgen köşeleri xy düzleminde, kalınlık z0..z1)
    prism(points, z0, z1)
    {
        const [ a, b, c ] = points
        this.tri([ a[0], a[1], z1 ], [ b[0], b[1], z1 ], [ c[0], c[1], z1 ])
        this.tri([ c[0], c[1], z0 ], [ b[0], b[1], z0 ], [ a[0], a[1], z0 ])
        for(const [ p, q ] of [ [ a, b ], [ b, c ], [ c, a ] ])
            this.quad([ p[0], p[1], z0 ], [ q[0], q[1], z0 ], [ q[0], q[1], z1 ], [ p[0], p[1], z1 ])
    }

    // Z ekseninde sekizgen silindir (mühür)
    seal(cx, cy, radius, z0, z1, sides = 8)
    {
        for(let i = 0; i < sides; i++)
        {
            const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2
            const p0 = [ cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius ]
            const p1 = [ cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius ]
            this.tri([ cx, cy, z1 ], [ p0[0], p0[1], z1 ], [ p1[0], p1[1], z1 ])
            this.tri([ cx, cy, z0 ], [ p1[0], p1[1], z0 ], [ p0[0], p0[1], z0 ])
            this.quad([ p0[0], p0[1], z0 ], [ p1[0], p1[1], z0 ], [ p1[0], p1[1], z1 ], [ p0[0], p0[1], z1 ])
        }
    }
}

export function buildEnvelope()
{
    const { width: W, height: H, depth: D } = ENVELOPE
    const hw = W / 2, hh = H / 2, hd = D / 2
    const parts = {}

    // Gövde (kırmızı)
    parts.body = new Mesh()
    parts.body.box(0, 0, 0, W, H, D)

    // Kapak (krem): üst kenardan ortaya inen üçgen. Gövdenin geri kalanı kırmızı görünür; alt çapraz katlar ince krem şeritler
    parts.flap = new Mesh()
    const t0 = hd, t1 = hd + 0.035
    parts.flap.prism([ [ - hw, hh ], [ hw, hh ], [ 0, - 0.02 ] ], t0, t1 + 0.02)
    const seam = 0.035 // alt katların ince çizgileri (köşelerden merkeze)
    parts.flap.prism([ [ - hw, - hh ], [ - hw + seam, - hh ], [ - 0.01, - 0.17 ] ], t0, t1)
    parts.flap.prism([ [ hw - seam, - hh ], [ hw, - hh ], [ 0.01, - 0.17 ] ], t0, t1)

    // Çerçeve (krem, ince kenar şeridi)
    parts.trim = new Mesh()
    const e = 0.06
    parts.trim.box(0, hh - e / 2, hd + 0.01, W, e, 0.02)
    parts.trim.box(0, - hh + e / 2, hd + 0.01, W, e, 0.02)
    parts.trim.box(- hw + e / 2, 0, hd + 0.01, e, H - 2 * e, 0.02)
    parts.trim.box(hw - e / 2, 0, hd + 0.01, e, H - 2 * e, 0.02)

    // Mühür (altın)
    parts.seal = new Mesh()
    parts.seal.seal(0, - 0.02, 0.13, hd + 0.045, hd + 0.095)

    return parts
}

export function countTriangles(parts)
{
    return Object.values(parts).reduce((sum, mesh) => sum + mesh.indices.length / 3, 0)
}
