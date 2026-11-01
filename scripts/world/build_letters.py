"""
KAAN DEMİR harflerini üretir: resources/references/examples/letter/*.glb → tek GLB + ölçü JSON'u.

    python -I scripts/world/build_letters.py -- --out scripts/world/.work/letters.glb --meta scripts/world/.work/letters.json [--sheet önizleme.png]

Her harf: tek mesh'e birleştirilir, ortak eksene döndürülür (X genişlik, Z yükseklik, -Y ön yüz),
Bruno'nun harfleriyle aynı yüksekliğe ve kalınlığa getirilir, düşük poligona indirilir ve tüm yüzler
palette'in beyaz hücresine (tek UV noktası) atanır. "İ", küçük "i" modelinin gövdesi uzatılıp
noktası üste taşınarak üretilir. Düğümleri yerleştirme işi patch_areas.mjs'tedir.
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
SRC = os.path.join(ROOT, 'resources/references/examples/letter')


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'out': 'letters.glb', 'meta': 'letters.json', 'sheet': ''}
    for i in range(0, len(argv) - 1, 2):
        o[argv[i].lstrip('-')] = argv[i + 1]
    return o


def import_joined(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bm = bmesh.new()
    for ob in meshes:
        tmp = bmesh.new()
        tmp.from_mesh(ob.data)
        tmp.transform(ob.matrix_world)
        me = bpy.data.meshes.new('t')
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return bm


def bounds(bm):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for v in bm.verts:
        for i in range(3):
            mn[i] = min(mn[i], v.co[i])
            mx[i] = max(mx[i], v.co[i])
    return mn, mx


def thicken(bm, amount):
    """Düz ekstrüzyon harfin ön yüzünü dışa doğru şişirir (ince çizgili modeli kalınlaştırmak için)."""
    mn, mx = bounds(bm)
    depth = mx.y - mn.y
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    front = [f for f in bm.faces if f.normal.y < -0.9]
    back = [f for f in bm.faces if f.normal.y > 0.9]
    # Sadece ön yüzü tut, in-plane offset uygula, sonra yeniden ekstrüde et
    for f in back:
        pass
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in front], context='FACES')
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts[:], edges=bm.edges[:])
    faces = bm.faces[:]
    res = bmesh.ops.inset_region(bm, faces=faces, use_boundary=True, use_even_offset=True, thickness=-amount, depth=0)
    # inset halkası + orijinal yüzler = yeni ön yüz; tümünü ekstrüde et
    allf = bm.faces[:]
    ext = bmesh.ops.extrude_face_region(bm, geom=allf)
    verts = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def make_dotted(bm, cap):
    """Küçük 'i' (gövde + nokta) → büyük İ: gövdeyi cap yüksekliğine uzat, noktayı üste taşı."""
    mn, mx = bounds(bm)
    # adalar: bağlı bileşenler
    bm.verts.ensure_lookup_table()
    seen = set()
    islands = []
    for v in bm.verts:
        if v in seen:
            continue
        stack = [v]
        comp = []
        seen.add(v)
        while stack:
            a = stack.pop()
            comp.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b not in seen:
                    seen.add(b)
                    stack.append(b)
        islands.append(comp)
    islands.sort(key=lambda c: sum(v.co.z for v in c) / len(c))
    stem, dot = islands[0], islands[-1]
    smn = min(v.co.z for v in stem)
    smx = max(v.co.z for v in stem)
    dmn = min(v.co.z for v in dot)
    dmx = max(v.co.z for v in dot)
    gap = dmn - smx
    k = cap / (smx - smn)
    for v in stem:
        v.co.z = smn + (v.co.z - smn) * k
    shift = (smn + cap + gap) - dmn
    for v in dot:
        v.co.z += shift
    return bm, dmx - dmn + gap


def procedural(kind, L):
    """K, A, N: kaynak modeller serif/ince/yuvarlak uçlu olduğundan D-E-M-R ile aynı çizgi kalınlığında üretilir.
    Parçalar (paralelkenar/dikdörtgen) ekstrüde edilip Boolean birleşimiyle tek gövde yapılır."""
    H = L['height']
    s = L['stroke']
    ts = s * 1.08
    parts = []
    if kind == 'K':
        W = 1.42
        parts = [
            [(0, 0), (s, 0), (s, H), (0, H)],
            [(s * 0.1, 0.36 * H), (s * 0.9, 0.36 * H), (W, H), (W - ts, H)],
            [(s * 0.1, 0.64 * H), (s * 0.9, 0.64 * H), (W, 0), (W - ts, 0)],
        ]
    elif kind == 'A':
        W = 1.56
        tt = ts * 0.9
        parts = [
            [(0, 0), (ts, 0), (W / 2 + tt / 2, H), (W / 2 - tt / 2, H)],
            [(W, 0), (W - ts, 0), (W / 2 - tt / 2, H), (W / 2 + tt / 2, H)],
            [(W * 0.2, 0.17 * H), (W * 0.8, 0.17 * H), (W * 0.8, 0.17 * H + 0.15 * H), (W * 0.2, 0.17 * H + 0.15 * H)],
        ]
    elif kind == 'N':
        W = 1.32
        parts = [
            [(0, 0), (s, 0), (s, H), (0, H)],
            [(W - s, 0), (W, 0), (W, H), (W - s, H)],
            [(0, H), (ts * 1.05, H), (W, 0), (W - ts * 1.05, 0)],
        ]
    objs = []
    for k, pts in enumerate(parts):
        bm = bmesh.new()
        vs = [bm.verts.new((x, 0, z)) for x, z in pts]
        f = bm.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        vv = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, L['depth'], 0), verts=vv)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new('p%d' % k)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new('p%d' % k, me)
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    base = objs[0]
    for ob in objs[1:]:
        md = base.modifiers.new('b', 'BOOLEAN')
        md.operation = 'UNION'
        md.solver = 'EXACT'
        md.object = ob
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
        base.modifiers.clear()
        base.data = me
    for ob in objs[1:]:
        bpy.data.objects.remove(ob, do_unlink=True)
    bv = base.modifiers.new('v', 'BEVEL')
    bv.width = L['bevel']
    bv.segments = 2
    bv.limit_method = 'ANGLE'
    bv.angle_limit = math.radians(30)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.objects.remove(base, do_unlink=True)
    return bm


def finalize(bm, cfg, ch, scfg):
    L = cfg['letters']
    # yönelim
    rot = scfg.get('rotate', [0, 0, 0])
    m = Matrix.Rotation(math.radians(rot[0]), 4, 'X') @ Matrix.Rotation(math.radians(rot[1]), 4, 'Y') @ Matrix.Rotation(math.radians(rot[2]), 4, 'Z')
    bm.transform(m)
    if scfg.get('thicken'):
        mn, mx = bounds(bm)
        s = L['height'] / (mx.z - mn.z)
        bm.transform(Matrix.Scale(s, 4))
        thicken(bm, scfg['thicken'])
    mn, mx = bounds(bm)
    extra = 0.0
    if scfg.get('dotted'):
        # önce gövde+nokta toplam yüksekliğini normalize et (cap ≈ 0.78 · toplam)
        total = mx.z - mn.z
        cap = total * 0.75
        s = L['height'] / cap
        bm.transform(Matrix.Scale(s, 4))
        bm, extra = make_dotted(bm, L['height'])
        mn, mx = bounds(bm)
    else:
        s = L['height'] / (mx.z - mn.z)
        bm.transform(Matrix.Scale(s, 4))
    mn, mx = bounds(bm)
    # derinlik: sadece Y ölçeklenir
    dy = L['depth'] / (mx.y - mn.y)
    bm.transform(Matrix.Diagonal((1, dy, 1, 1)))
    mn, mx = bounds(bm)
    # orijin: x merkezi, y merkezi, z = gövde (cap) merkezi
    cz = mn.z + L['height'] / 2
    bm.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -cz))))
    return bm


L_DISSOLVE = 4


def decimate_and_export_mesh(bm, name, target, uv):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    d1 = ob.modifiers.new('d', 'DECIMATE')
    d1.decimate_type = 'DISSOLVE'
    d1.angle_limit = math.radians(L_DISSOLVE)
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = me2
    bm2 = bmesh.new()
    bm2.from_mesh(me2)
    bmesh.ops.triangulate(bm2, faces=bm2.faces[:])
    bm2.to_mesh(me2)
    bm2.free()
    tris = len(me2.polygons)
    if tris > target:
        d2 = ob.modifiers.new('c', 'DECIMATE')
        d2.decimate_type = 'COLLAPSE'
        d2.ratio = target / tris
        d2.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        me3 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        ob.data = me3
        me2 = me3
    # tek UV noktası
    for uvl in list(me2.uv_layers):
        me2.uv_layers.remove(uvl)
    layer = me2.uv_layers.new(name='UVMap')
    for d in layer.data:
        d.uv = uv
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(18))
    return ob


def main():
    o = cli()
    cfg = json.load(open(os.path.join(ROOT, 'scripts/world/world.config.json')))
    L = cfg['letters']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    meta = {}
    objs = {}
    mat = bpy.data.materials.new('palette')
    for ch, scfg in L['sources'].items():
        if scfg.get('procedural'):
            bm = procedural(scfg['procedural'], L)
        else:
            bm = import_joined(os.path.join(SRC, scfg['file']))
        bm = finalize(bm, cfg, ch, scfg)
        ob = decimate_and_export_mesh(bm, 'letter_' + ch, L['triangles'], L['uv'])
        ob.data.materials.append(mat)
        mn = Vector((1e9,) * 3)
        mx = Vector((-1e9,) * 3)
        for v in ob.data.vertices:
            for i in range(3):
                mn[i] = min(mn[i], v.co[i])
                mx[i] = max(mx[i], v.co[i])
        # glTF eksenleri: x, y=Blender z, z=-Blender y
        meta[ch] = {
            'width': mx.x - mn.x,
            'min': [mn.x, mn.z, -mx.y],
            'max': [mx.x, mx.z, -mn.y],
            'triangles': len(ob.data.polygons),
        }
        objs[ch] = ob
    os.makedirs(os.path.dirname(os.path.abspath(o['out'])), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs.values():
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=o['out'], export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='NONE')
    json.dump(meta, open(o['meta'], 'w'), indent=2, ensure_ascii=False)
    print('harf özeti:', {k: (round(v['width'], 2), v['triangles']) for k, v in meta.items()})

    if o['sheet']:
        sc = bpy.context.scene
        x = 0.0
        for ch, ob in objs.items():
            ob.location = (x + meta[ch]['width'] / 2, 0, 0)
            x += meta[ch]['width'] + 0.3
        sc.render.engine = 'BLENDER_WORKBENCH'
        sc.render.resolution_x, sc.render.resolution_y = 1800, 380
        sc.display.shading.light = 'STUDIO'
        sc.display.shading.color_type = 'SINGLE'
        w = bpy.data.worlds.new('w')
        w.color = (0.6, 0.6, 0.6)
        sc.world = w
        cd = bpy.data.cameras.new('c')
        cam = bpy.data.objects.new('c', cd)
        sc.collection.objects.link(cam)
        sc.camera = cam
        cam.location = (x / 2, -30, 0.3)
        cam.rotation_euler = (math.pi / 2, 0, 0)
        cd.type = 'ORTHO'
        cd.ortho_scale = x + 0.5
        sc.render.filepath = o['sheet']
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
