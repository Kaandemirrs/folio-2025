"""
1992 Mercedes-Benz W140 aracını oyun için üretir (tekrarlanabilir).

Kaynak: resources/references/w140/mercedes_s-class.glb
        "Mercedes S-Class" — dmas (https://sketchfab.com/dmastero), CC BY 4.0
        Atıf: resources/references/w140/ATTRIBUTION.md

Yaptığı iş (Seçenek A): kaynak modeli sadeleştirir, tekerlek/ışık/cam/egzoz/plaka/amblemi yeniden kurar,
renkleri oyunun palette'ine atar ve static/vehicle/w140.glb olarak dışa aktarır.

Çalıştırma (Blender'ın Python modülü bpy ile):
    python -I scripts/vehicle/build_w140.py -- --out static/vehicle/w140.glb
Resmi Blender ile:
    Blender -b --python scripts/vehicle/build_w140.py -- --out static/vehicle/w140.glb

Koordinatlar: Blender Z-yukarı; araç +X'e bakar (glTF'te +X ileri, Y yukarı, sol = −Z).
Kaynak model: ön = +Y (Blender'da), metre. Dönüşüm T() aşağıda.
"""
import bpy
import bmesh
import math
import os
import sys
import json
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {
        'src': os.path.join(ROOT, 'resources/references/w140/mercedes_s-class.glb'),
        'out': os.path.join(ROOT, 'static/vehicle/w140.glb'),
        'plate': os.path.join(ROOT, 'resources/references/w140/licensePlate.png'),
        'paint_target': 2000,
        'stats': None,
    }
    i = 0
    while i < len(argv):
        k = argv[i].lstrip('-').replace('-', '_')
        if k in opts:
            v = argv[i + 1]
            opts[k] = int(v) if isinstance(opts[k], int) else v
            i += 2
        else:
            i += 1
    return opts


# --------------------------------------------------------------------------------------------
# Hedef ve ölçüler
# --------------------------------------------------------------------------------------------
TARGET_L, TARGET_W, TARGET_H = 3.23, 1.45, 1.00

# Kaynak model ölçüleri (metre; Bölüm 10.1)
SRC_L = 5.051          # Paint: y −2.689 … +2.362
SRC_W = 1.89           # gövde, aynasız
SRC_H = 1.461          # zeminden tavana (tavan 1.25, zemin −0.211)
SRC_GROUND = -0.211    # lastik altı
SRC_MID = -0.025       # dingil orta noktası (ön hub +1.50, arka hub −1.55)

SX = TARGET_L / SRC_L  # uzunluk
SY = TARGET_W / SRC_W  # genişlik
SZ = TARGET_H / SRC_H  # yükseklik

# Fizik (PhysicsVehicle.js ile aynı olmalı; Rapier ölçümüyle doğrulandı, VEHICLE_SPEC Bölüm 11)
HUB_X = 0.975          # wheels.settings.offset.x
HUB_Y = 0.58           # wheels.settings.offset.z (Blender'da Y)
R_PHYS = 0.27          # wheels.settings.radius
R_VIS = 0.28           # görsel yarıçap (fizik + 0.01)
REST_HEIGHT = 0.686    # "low" konumda şasi orijininin yerden yüksekliği (süspansiyon 0.416 + 0.27)
HUB_Z = R_PHYS         # dinlenme konumunda hub yüksekliği
R_ARCH = 0.305         # çamurluk kemeri yarıçapı (tekerlek 0.28 + boşluk)

# Palette hücreleri (static/palette.png; 128x4, hücre 4 px)
CELL = {
    'chrome': 4, 'trim_old': 5, 'white': 23, 'amber': 8, 'gray_blue': 0,
    'black_brown': 22, 'silver': 25, 'tire': 26, 'stop_red': 27, 'trim': 28, 'dark_chrome': 29, 'glass': 30,
}


def palette_uv(cell):
    return ((cell * 4 + 2) / 128.0, 0.5)


def T(p):
    """Kaynak (Blender: x yan, y uzunluk/ön +, z yukarı) -> oyun aracı (x ön, y yan, z yukarı; zemin z=0)."""
    return Vector(((p.y - SRC_MID) * SX, -p.x * SY, (p.z - SRC_GROUND) * SZ))


def log(*a):
    print('[w140]', *a, flush=True)


# --------------------------------------------------------------------------------------------
# bmesh yardımcıları
# --------------------------------------------------------------------------------------------
def islands(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], [v]
        seen.add(v.index)
        while stack:
            c = stack.pop()
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
                    comp.append(o)
        out.append(comp)
    return out


def bbox_of(verts):
    mn = Vector((min(v.co[i] for v in verts) for i in range(3)))
    mx = Vector((max(v.co[i] for v in verts) for i in range(3)))
    return mn, mx


def delete_islands(bm, predicate):
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    doomed = []
    for comp in islands(bm):
        mn, mx = bbox_of(comp)
        if predicate(mn, mx, len(comp)):
            doomed.extend(comp)
    bmesh.ops.delete(bm, geom=doomed, context='VERTS')


def tri_count(bm):
    return sum(len(f.verts) - 2 for f in bm.faces)


def load_clean_bm(obj):
    """Özel normalleri ve kopya veriyi taşımadan, sadece dünya konumlu geometri."""
    me, mw = obj.data, obj.matrix_world
    bm = bmesh.new()
    vs = [bm.verts.new(mw @ v.co) for v in me.vertices]
    for p in me.polygons:
        try:
            bm.faces.new([vs[i] for i in p.vertices])
        except ValueError:
            pass
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    return bm


def decimate_bm(bm, target, protect_hubs=None):
    """planar dissolve -> collapse decimate (modifier ile)."""
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(5), verts=bm.verts, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    tris = tri_count(bm)
    if tris <= target:
        return bm
    me = bpy.data.meshes.new('dec')
    bm.to_mesh(me)
    obj = bpy.data.objects.new('dec', me)
    bpy.context.scene.collection.objects.link(obj)
    mod = obj.modifiers.new('d', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.005, target / tris)
    mod.use_collapse_triangulate = True
    if protect_hubs:
        vg = obj.vertex_groups.new(name='protect')
        idx = [v.index for v in me.vertices if protect_hubs(v.co)]
        if idx:
            vg.add(idx, 1.0, 'REPLACE')
            mod.vertex_group = 'protect'
            mod.vertex_group_factor = 1.0
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier='d')
    out = bmesh.new()
    out.from_mesh(obj.data)
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(me)
    bmesh.ops.dissolve_degenerate(out, dist=1e-5, edges=out.edges)
    return out


# --------------------------------------------------------------------------------------------
# Çıktı geometrisi (UV katmanlı bmesh)
# --------------------------------------------------------------------------------------------
class Geo:
    def __init__(self, uv_layers=('UVMap',)):
        self.bm = bmesh.new()
        self.uv = [self.bm.loops.layers.uv.new(n) for n in uv_layers]

    def _orient(self, f, normal):
        if normal is not None:
            f.normal_update()
            if f.normal.dot(normal) < 0:
                f.normal_flip()

    def face(self, coords, uvs, normal=None, share=None):
        """coords: Vector listesi; uvs: katman başına [(u,v), ...] (coords ile aynı sırada)."""
        vs = [self.bm.verts.new(c) for c in coords]
        f = self.bm.faces.new(vs)
        for li, layer_uvs in enumerate(uvs):
            for loop, uv in zip(f.loops, layer_uvs):
                loop[self.uv[li]].uv = uv
        self._orient(f, normal)
        return f

    def add_mesh_palette(self, src_bm, cell, cell_fn=None):
        """Sadeleştirilmiş kaynak bmesh'ini palette hücresiyle ekler (köşeler paylaşılır)."""
        vmap = {v.index: self.bm.verts.new(v.co) for v in src_bm.verts}
        for f in src_bm.faces:
            try:
                nf = self.bm.faces.new([vmap[v.index] for v in f.verts])
            except ValueError:
                continue
            c = cell_fn(f) if cell_fn else cell
            for li in range(len(self.uv)):
                for loop in nf.loops:
                    loop[self.uv[li]].uv = palette_uv(c)

    def box(self, mn, mx, cell=None, emissive=False):
        x0, y0, z0 = mn
        x1, y1, z1 = mx
        c = [Vector(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                 (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        quad_uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
        center = (Vector(mn) + Vector(mx)) * 0.5
        for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)):
            pts = [c[i] for i in idx]
            fc = sum(pts, Vector()) / 4
            uvs = quad_uv if emissive else [palette_uv(cell)] * 4
            self.face(pts, [uvs], normal=(fc - center))

    def quad_x(self, x, y0, y1, z0, z1, facing):
        """+X (facing=1) veya −X (facing=-1) bakan, 0..1 UV'li emissive panel."""
        pts = [Vector((x, y0, z0)), Vector((x, y1, z0)), Vector((x, y1, z1)), Vector((x, y0, z1))]
        self.face(pts, [[(0, 0), (1, 0), (1, 1), (0, 1)]], normal=Vector((facing, 0, 0)))

    def star(self, center, radius, inner, thickness, cell):
        """+X'e bakan üç köşeli yıldız levha (Y-Z düzleminde)."""
        cx, cy, cz = center
        ring = []
        for i in range(6):
            ang = math.radians(90 + i * 60)
            rad = radius if i % 2 == 0 else inner
            ring.append((cy + rad * math.cos(ang), cz + rad * math.sin(ang)))
        uv = palette_uv(cell)
        for side, x in ((1, cx + thickness / 2), (-1, cx - thickness / 2)):
            for i in range(6):
                a, b = ring[i], ring[(i + 1) % 6]
                self.face([Vector((x, cy, cz)), Vector((x, a[0], a[1])), Vector((x, b[0], b[1]))], [[uv] * 3],
                          normal=Vector((side, 0, 0)))
        for i in range(6):
            a, b = ring[i], ring[(i + 1) % 6]
            pts = [Vector((cx - thickness / 2, a[0], a[1])), Vector((cx + thickness / 2, a[0], a[1])),
                   Vector((cx + thickness / 2, b[0], b[1])), Vector((cx - thickness / 2, b[0], b[1]))]
            mid = Vector((cx, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
            self.face(pts, [[uv] * 4], normal=(mid - Vector(center)))

    def cylinder_x(self, x0, x1, y, z, radius, sides, cell):
        uv = palette_uv(cell)
        rings = []
        for x in (x0, x1):
            rings.append([Vector((x, y + radius * math.cos(2 * math.pi * k / sides), z + radius * math.sin(2 * math.pi * k / sides)))
                          for k in range(sides)])
        for k in range(sides):
            k2 = (k + 1) % sides
            pts = [rings[0][k], rings[0][k2], rings[1][k2], rings[1][k]]
            mid = (pts[0] + pts[2]) / 2
            self.face(pts, [[uv] * 4], normal=Vector((0, mid.y - y, mid.z - z)))
        for ring, nx in ((rings[0], -1 if x0 < x1 else 1), (rings[1], 1 if x0 < x1 else -1)):
            for k in range(1, sides - 1):
                self.face([ring[0], ring[k], ring[k + 1]], [[uv] * 3], normal=Vector((nx, 0, 0)))

    def arch_liner(self, hx, sgn, cell, radius, hub_z, y0=0.40, y1=0.70, segs=8):
        """Tekerlek kemeri için koyu iç çamurluk (üst yarım silindir + iç duvar); gövdede kemer açıkken zemin görünmesin."""
        uv = palette_uv(cell)
        ya, yb = y0 * sgn, y1 * sgn
        pts = [(hx + radius * math.cos(math.pi * k / segs), hub_z + radius * math.sin(math.pi * k / segs)) for k in range(segs + 1)]
        for k in range(segs):
            (x0, z0), (x1, z1) = pts[k], pts[k + 1]
            quad = [Vector((x0, ya, z0)), Vector((x1, ya, z1)), Vector((x1, yb, z1)), Vector((x0, yb, z0))]
            mid = sum(quad, Vector()) / 4
            self.face(quad, [[uv] * 4], normal=Vector((hx - mid.x, 0, hub_z - mid.z)))
            self.face([Vector((hx, ya, hub_z)), Vector((x0, ya, z0)), Vector((x1, ya, z1))], [[uv] * 3],
                      normal=Vector((0, -sgn, 0)))

    def set_shading(self, sharp_deg):
        lim = math.radians(sharp_deg)
        self.bm.normal_update()
        for e in self.bm.edges:
            if len(e.link_faces) == 2:
                e.smooth = e.link_faces[0].normal.angle(e.link_faces[1].normal) < lim
            else:
                e.smooth = False
        for f in self.bm.faces:
            f.smooth = True

    def tris(self):
        return tri_count(self.bm)

    def to_object(self, name, material, parent=None):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        me.materials.append(material)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        if parent:
            obj.parent = parent
            obj.matrix_parent_inverse = parent.matrix_world.inverted()
        self.bm.free()
        return obj


# --------------------------------------------------------------------------------------------
# Materyaller (ad önemli: oyun materyali adıyla yeniden kuruyor, Materials.js)
# --------------------------------------------------------------------------------------------
def make_material(name, color, image_path=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 1
    if image_path:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(image_path)
        tex.interpolation = 'Linear'   # plaka: Linear (Nearest değil)
        tex.extension = 'CLIP'
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


# --------------------------------------------------------------------------------------------
# Tekerlek (14 kenar, düz "Gullideckel" kapaklı jant)
# --------------------------------------------------------------------------------------------
def build_wheel(sides=14):
    """Orijin = hub. Dönüş ekseni Blender Y; jant yüzü +Y'ye (oyunda −Z) bakar."""
    g = Geo()
    HW = 0.095  # yarı genişlik (gövde genişliği ölçeğine uygun ≈ 0.19)
    R = R_VIS

    def ring(a, r):
        return [Vector((r * math.cos(2 * math.pi * k / sides), a, r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]

    def band(r0, r1, cell, normal_fn):
        for k in range(sides):
            k2 = (k + 1) % sides
            pts = [r0[k], r0[k2], r1[k2], r1[k]]
            fc = sum(pts, Vector()) / 4
            g.face(pts, [[palette_uv(cell)] * 4], normal=normal_fn(fc))

    def fan(center, rg, cell, normal):
        for k in range(sides):
            g.face([center, rg[k], rg[(k + 1) % sides]], [[palette_uv(cell)] * 3], normal=normal)

    # Lastik profili (a, r)
    prof = [(-HW, 0.17), (-HW, 0.235), (-HW * 0.68, R), (HW * 0.68, R), (HW, 0.235), (HW, 0.17)]
    rings = [ring(a, r) for a, r in prof]
    tire_center = Vector((0, 0, 0))
    for i in range(len(rings) - 1):
        band(rings[i], rings[i + 1], CELL['tire'],
             lambda fc, i=i: (fc - Vector((0, fc.y, 0))) if i in (1, 2, 3) else Vector((0, 1 if fc.y > 0 else -1, 0)))
    # Jant kenar dudağı (koni) ve düz kapak (Gullideckel)
    lip_in = ring(HW, 0.17)
    lip_out = ring(HW - 0.011, 0.145)
    band(lip_in, lip_out, CELL['chrome'], lambda fc: Vector((0, 1, 0)))
    disc_r = ring(HW - 0.011, 0.145)
    disc_in = ring(HW - 0.011, 0.052)
    band(disc_r, disc_in, CELL['silver'], lambda fc: Vector((0, 1, 0)))
    cap_base = ring(HW - 0.011, 0.052)
    cap_top = ring(HW - 0.001, 0.036)
    band(cap_base, cap_top, CELL['chrome'], lambda fc: Vector((0, 1, 0)))
    fan(Vector((0, HW - 0.001, 0)), cap_top, CELL['chrome'], Vector((0, 1, 0)))
    # Yedi ince havalandırma yuvası (koyu)
    for k in range(7):
        ang = 2 * math.pi * k / 7
        ca, sa = math.cos(ang), math.sin(ang)
        c0, c1 = 0.090, 0.128
        w = 0.011
        a_y = HW - 0.0105
        p = [Vector((c0 * ca - w * sa, a_y, c0 * sa + w * ca)), Vector((c1 * ca - w * sa, a_y, c1 * sa + w * ca)),
             Vector((c1 * ca + w * sa, a_y, c1 * sa - w * ca)), Vector((c0 * ca + w * sa, a_y, c0 * sa - w * ca))]
        g.face(p, [[palette_uv(CELL['tire'])] * 4], normal=Vector((0, 1, 0)))
    g.set_shading(40)
    return g


# --------------------------------------------------------------------------------------------
# Ana akış
# --------------------------------------------------------------------------------------------
def main():
    opts = cli()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=opts['src'])
    src_by_mat = {o.data.materials[0].name: o for o in bpy.data.objects if o.type == 'MESH' and o.data.materials}

    hubs_src = [(sx, sy) for sx in (1, -1) for sy in (1.50, -1.55)]   # kaynak uzayında tekerlek merkezleri (x, y)

    def near_hub(co, radius=0.55):
        for sx, sy in hubs_src:
            if abs(co.x) > 0.5 and (co.x * sx) > 0 and math.hypot(co.y - sy, co.z - 0.13) < radius:
                return True
        return False

    # Ayna %20 küçülür (kaynak uzayında, mafsal kapı kenarında)
    def shrink_mirrors(bm):
        for v in bm.verts:
            c = v.co
            if abs(c.x) > 0.86 and 0.25 < c.y < 0.65 and 0.65 < c.z < 0.95:
                s = 1 if c.x > 0 else -1
                pivot = Vector((s * 0.86, 0.43, 0.79))
                v.co = pivot + (c - pivot) * 0.8

    # ----- gövde grupları -----
    spec = {
        'Paint': dict(min_island=0.15, target=opts['paint_target']),
        'Chrome': dict(min_island=0.07, target=380),
        'Plastic': dict(min_island=0.10, target=260,
                        drop=lambda mn, mx, n: (mx.x - mn.x) < 0.05 and (mx.y - mn.y) < 0.05 and (mx.z - mn.z) > 0.10),  # anten
        'Rubber': dict(min_island=0.10, target=90),
        'Black': dict(min_island=0.06, target=70),
        'Window_Glass': dict(min_island=0.2, target=120),
        'Chrome_Mirror': dict(min_island=0.0, target=30),
    }
    parts = {}
    for name, sp in spec.items():
        bm = load_clean_bm(src_by_mat[name])
        shrink_mirrors(bm)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()

        def pred(mn, mx, n, sp=sp):
            diag = (mx - mn).length
            if diag < sp['min_island']:
                return True
            return bool(sp.get('drop') and sp['drop'](mn, mx, n))
        delete_islands(bm, pred)
        raw = tri_count(bm)
        bm = decimate_bm(bm, sp['target'])
        # oyun uzayına
        for v in bm.verts:
            v.co = T(v.co)
        parts[name] = bm
        log(f'{name}: {raw} -> {tri_count(bm)} üçgen')

    # Kaynak ışık/lens kutuları için sınırlar (oyun uzayı)
    def side_bbox(mat_name):
        bm = load_clean_bm(src_by_mat[mat_name])
        out = {}
        for sgn in (1, -1):
            pts = [T(v.co) for v in bm.verts if (T(v.co).y > 0) == (sgn > 0)]
            out[sgn] = (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
                        Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))
        bm.free()
        return out

    head = side_bbox('Glass_Headlights')
    tail_red = side_bbox('Glass_Taillights_Red')
    tail_amber = side_bbox('Glass_Taillights_Amber')
    reverse = side_bbox('Reverselights')

    # Çamurluk kemerlerini tekerlek 0.28 için minimal genişlet (gövdeyi yükseltmeden)
    def push_arches(bm):
        pushed = 0
        for v in bm.verts:
            if not (0.30 <= abs(v.co.y) <= 0.80):
                continue
            for hx in (HUB_X, -HUB_X):
                dx, dz = v.co.x - hx, v.co.z - HUB_Z
                if dz < -0.10:
                    continue
                d = math.hypot(dx, dz)
                if 1e-6 < d < R_ARCH:
                    k = R_ARCH / d
                    v.co.x = hx + dx * k
                    v.co.z = HUB_Z + dz * k
                    pushed += 1
        return pushed

    for name in ('Paint', 'Chrome', 'Plastic', 'Rubber', 'Black'):
        n = push_arches(parts[name])
        log(f'kemer: {name} {n} köşe itildi')

    # ----- bodyPainted -----
    paint = parts['Paint']
    zs = [v.co.z for v in paint.verts]
    xs = [v.co.x for v in paint.verts]
    zmin, zmax, xmin, xmax = min(zs), max(zs), min(xs), max(xs)
    body = Geo(('UVMap', 'UVMap.001'))
    vmap = {v.index: body.bm.verts.new(v.co) for v in paint.verts}
    for f in paint.faces:
        try:
            nf = body.bm.faces.new([vmap[v.index] for v in f.verts])
        except ValueError:
            continue
        for loop in nf.loops:
            c = loop.vert.co
            h = (c.z - zmin) / (zmax - zmin)
            u = (c.x - xmin) / (xmax - xmin)
            loop[body.uv[0]].uv = (u, h)                  # UV0: V = yükseklik (gradyan; alt 0, üst 1)
            loop[body.uv[1]].uv = (u, 0.09 + 0.91 * h)    # UV1: yan projeksiyon (alev boyası)
    body.set_shading(40)
    body_tris = body.tris()

    # ----- common (boyasız parçalar) -----
    common = Geo()
    def chrome_cell(f):
        c = sum((v.co for v in f.verts), Vector()) / len(f.verts)
        if c.x > 1.40 and abs(c.y) < 0.40:
            return CELL['dark_chrome']                                   # ızgara
        for hx in (HUB_X, -HUB_X):
            if abs(c.y) > 0.30 and math.hypot(c.x - hx, c.z - HUB_Z) < 0.50:
                return CELL['trim']                                      # kemer çevresi: parlak krom yerine koyu trim
        return CELL['chrome']
    common.add_mesh_palette(parts['Chrome'], CELL['chrome'], cell_fn=chrome_cell)
    common.add_mesh_palette(parts['Plastic'], CELL['trim'])
    common.add_mesh_palette(parts['Rubber'], CELL['black_brown'])
    common.add_mesh_palette(parts['Black'], CELL['black_brown'])
    common.add_mesh_palette(parts['Window_Glass'], CELL['glass'])
    common.add_mesh_palette(parts['Chrome_Mirror'], CELL['gray_blue'])

    # arka stop camları (koyu kırmızı) + arka sinyal camları (amber) + geri vites camı (beyaz)
    for sgn in (1, -1):
        mn, mx = tail_red[sgn]
        common.box(mn, mx, cell=CELL['stop_red'])
        mn, mx = tail_amber[sgn]
        common.box(mn, mx, cell=CELL['amber'])
        mn, mx = reverse[sgn]
        common.box(mn, mx, cell=CELL['white'])

    # çift arka egzoz (tampon altı)
    rear_x = min(v.co.x for v in paint.verts)
    for sgn in (1, -1):
        common.cylinder_x(rear_x + 0.38, rear_x - 0.025, 0.40 * sgn, 0.20, 0.034, 8, CELL['dark_chrome'])

    # amblemler: kaput üstü dik yıldız + ızgara yıldızı (palette krom)
    hood_star = T(Vector((0, 2.155, 0.64)))
    common.star((hood_star.x, 0, hood_star.z + 0.025), 0.05, 0.019, 0.010, CELL['chrome'])
    common.box((hood_star.x - 0.006, -0.006, hood_star.z - 0.045), (hood_star.x + 0.006, 0.006, hood_star.z - 0.005), cell=CELL['chrome'])
    grille_star = T(Vector((0, 2.237, 0.435)))
    common.star((grille_star.x + 0.006, 0, grille_star.z), 0.035, 0.013, 0.008, CELL['chrome'])
    for hx in (HUB_X, -HUB_X):
        for sgn in (1, -1):
            common.arch_liner(hx, sgn, CELL['trim'], R_ARCH, HUB_Z)
    common.set_shading(40)
    common_tris = common.tris()

    # ----- ışıklar -----
    mat_obsidian = make_material('obsidianGradient', (0.04, 0.04, 0.05))
    mat_palette = make_material('palette', (0.5, 0.5, 0.5))
    mat_white = make_material('emissiveWhiteRadialGradient', (1, 1, 1))
    mat_orange = make_material('emissiveOrangeRadialGradient', (1, 0.17, 0))
    mat_plate = make_material('licensePlate', (1, 1, 1), image_path=opts['plate'])

    headlights = Geo()
    blinker = {1: Geo(), -1: Geo()}   # +1: y>0 = sol (oyunda −Z)
    for sgn in (1, -1):
        mn, mx = head[sgn]
        depth = min(0.09, mx.x - mn.x)
        w = mx.y - mn.y
        outer = 0.22 * w
        if sgn > 0:
            hy0, hy1 = mn.y, mx.y - outer - 0.004
            by0, by1 = mx.y - outer, mx.y
        else:
            hy0, hy1 = mn.y + outer + 0.004, mx.y
            by0, by1 = mn.y, mn.y + outer
        headlights.box((mx.x - depth, hy0, mn.z), (mx.x + 0.004, hy1, mx.z), emissive=True)
        h = mx.z - mn.z
        blinker[sgn].quad_x(mx.x + 0.010, by0, by1, mn.z + 0.12 * h, mn.z + 0.52 * h, 1)
        # arka sinyal paneli (amber camın arkasında)
        amn, amx = tail_amber[sgn]
        blinker[sgn].quad_x(amn.x - 0.012, amn.y, amx.y, amn.z, amx.z, -1)

    stop = Geo()
    back = Geo()
    for sgn in (1, -1):
        mn, mx = tail_red[sgn]
        stop.quad_x(mn.x - 0.012, mn.y + 0.01, mx.y - 0.01, mn.z + 0.01, mx.z - 0.01, -1)
        rmn, rmx = reverse[sgn]
        cy = (rmn.y + rmx.y) / 2
        hw = max((rmx.y - rmn.y) / 2, 0.05)
        cz = (rmn.z + rmx.z) / 2
        hh = max((rmx.z - rmn.z) / 2, 0.018)
        back.quad_x(rmn.x - 0.012, cy - hw, cy + hw, cz - hh, cz + hh, -1)

    # plakalar (ön/arka ayrı küçük mesh; 256x64 doku, 4:1)
    PW, PH = 0.34, 0.085

    def plate(front):
        g = Geo()
        if front:
            x = T(Vector((0, 2.362, 0))).x + 0.004
            z = T(Vector((0, 0, 0.177))).z
            ys = (-PW / 2, PW / 2)            # izleyici (öne bakan) sağı = +Y
            facing = 1
        else:
            x = T(Vector((0, -2.62, 0))).x - 0.004
            z = T(Vector((0, 0, 0.60))).z
            ys = (PW / 2, -PW / 2)            # arkadan bakınca sağ = −Y
            facing = -1
        pts = [Vector((x, ys[0], z - PH / 2)), Vector((x, ys[1], z - PH / 2)), Vector((x, ys[1], z + PH / 2)), Vector((x, ys[0], z + PH / 2))]
        g.face(pts, [[(0, 0), (1, 0), (1, 1), (0, 1)]], normal=Vector((facing, 0, 0)))
        return g

    # ----- sahne nesneleri -----
    chassis = bpy.data.objects.new('chassis', None)
    bpy.context.scene.collection.objects.link(chassis)
    chassis.location = (0, 0, REST_HEIGHT)
    bpy.context.view_layer.update()

    objs = [chassis]
    objs.append(body.to_object('bodyPainted', mat_obsidian, chassis))
    objs.append(common.to_object('common', mat_palette, chassis))
    h_tris = headlights.tris()
    objs.append(headlights.to_object('headlights', mat_white, chassis))
    s_tris = stop.tris()
    objs.append(stop.to_object('stopLights', mat_orange, chassis))
    b_tris = back.tris()
    objs.append(back.to_object('backLights', mat_orange, chassis))
    bl_tris = sum(blinker[s].tris() for s in (1, -1))
    objs.append(blinker[1].to_object('blinkerLeft', mat_orange, chassis))
    objs.append(blinker[-1].to_object('blinkerRight', mat_orange, chassis))
    pf, pr = plate(True), plate(False)
    objs.append(pf.to_object('licensePlateFront', mat_plate, chassis))
    objs.append(pr.to_object('licensePlateRear', mat_plate, chassis))

    # tekerlek (sağ-ön şablon; oyun 4 kez klonlar, konumu her kare ezer)
    wc = bpy.data.objects.new('wheelContainer', None)
    bpy.context.scene.collection.objects.link(wc)
    wc.location = (HUB_X, HUB_Y, HUB_Z)
    bpy.context.view_layer.update()
    wcyl = bpy.data.objects.new('wheelCylinder', None)
    bpy.context.scene.collection.objects.link(wcyl)
    wcyl.parent = wc            # yerel konum (0,0,0): hub'da
    wheel_geo = build_wheel()
    wheel_tris = wheel_geo.tris()
    wheel = wheel_geo.to_object('wheel', mat_palette)
    wheel.parent = wcyl         # yerel konum (0,0,0); geometri hub etrafında
    objs += [wc, wcyl, wheel]

    unique = body_tris + common_tris + h_tris + s_tris + b_tris + bl_tris + 4 + wheel_tris
    rendered = unique - wheel_tris + 4 * wheel_tris
    log(f'bodyPainted {body_tris} · common {common_tris} · ışıklar {h_tris + s_tris + b_tris + bl_tris} · plaka 4 · tekerlek {wheel_tris}')
    log(f'BENZERSİZ {unique} (≤3700) · ÇİZİLEN {rendered} (≤4500)')
    stats = {'bodyPainted': body_tris, 'common': common_tris, 'lights': h_tris + s_tris + b_tris + bl_tris,
             'plates': 4, 'wheel': wheel_tris, 'unique': unique, 'rendered': rendered}
    if opts['stats']:
        with open(opts['stats'], 'w') as fh:
            json.dump(stats, fh)

    # ----- dışa aktar -----
    os.makedirs(os.path.dirname(opts['out']), exist_ok=True)
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=opts['out'],
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_normals=True,
        export_texcoords=True,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_draco_mesh_compression_enable=False,
        use_selection=True,
    )
    log('yazıldı:', opts['out'], os.path.getsize(opts['out']), 'bayt')
    if unique > 3700 or rendered > 4500:
        log('UYARI: üçgen bütçesi aşıldı')
        sys.exit(2)


if __name__ == '__main__':
    main()
