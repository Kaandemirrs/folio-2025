"""
Tekrar kullanılabilir prop hattı (bpy): yüksek poligonlu kaynak modeli oyun için hazırlar.

  kaynağı aç -> istenmeyen parçaları sil / kırp -> parça başına decimate -> hepsini tek mesh'te birleştir
  -> yeni UV (atlas) -> orijinal malzemelerden (yüksek poligon) alçak poligona tek atlas dokuya BAKE (ışıksız renk)
  -> zemin merkezine al, tabanı y=0 yap, ölçekle -> GLB (PNG doku; WebP + Draco build.mjs'te)

Çalıştırma (genelde `npm run prop -- <ad>` ile):
    python -I scripts/props/build_prop.py -- --prop bakkal --out static/props/bakkal.src.glb --atlas /tmp/bakkal_atlas.png

Config: scripts/props/props.config.json
"""
import bpy
import bmesh
import json
import math
import os
import re
import sys
from collections import defaultdict
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def log(*a):
    print('[prop]', *a, flush=True)


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'config': os.path.join(ROOT, 'scripts/props/props.config.json'), 'prop': None, 'out': None, 'atlas': None, 'meta': None}
    for i in range(0, len(argv) - 1, 2):
        o[argv[i].lstrip('-')] = argv[i + 1]
    return o


# glTF (x sağ, y yukarı, z ön)  <->  Blender (x, -z, y)
def gl_to_bl(v):
    return Vector((v[0], -v[2], v[1]))


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def mat_name(obj):
    return obj.data.materials[0].name if obj.data.materials and obj.data.materials[0] else ''


# --------------------------------------------------------------------------------------------
# Kırpma: kaynak (glTF) koordinatlarında kutu sınırları
# --------------------------------------------------------------------------------------------
def clip_object(obj, clip):
    """clip: {xMin,xMax,yMin,yMax,zMin,zMax} (glTF metre). Sınırın dışında kalan geometri silinir."""
    if not clip:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    planes = []   # (nokta, dış yönü gösteren normal) Blender uzayında
    gl = {'x': 0, 'y': 1, 'z': 2}
    for key, val in clip.items():
        axis = key[0]
        is_min = key.endswith('Min')
        p_gl = [0, 0, 0]
        p_gl[gl[axis]] = val
        n_gl = [0, 0, 0]
        n_gl[gl[axis]] = -1 if is_min else 1   # dış yön: min sınırın altı / max sınırın üstü
        planes.append((gl_to_bl(p_gl), gl_to_bl(n_gl)))
    for point, normal in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=point, plane_no=normal, clear_outer=False, clear_inner=False)
        cut = res['geom_cut']
        # normal yönündeki (dış) tarafı sil
        doomed = [v for v in bm.verts if (v.co - point).dot(normal) > 1e-6]
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.transform(obj.matrix_world.inverted())
    bm.to_mesh(obj.data)
    bm.free()


# --------------------------------------------------------------------------------------------
# Decimate
# --------------------------------------------------------------------------------------------
def decimate(obj, target):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(3), verts=bm.verts, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    tris = tri_count(obj)
    if tris <= target:
        return tris
    mod = obj.modifiers.new('d', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.0005, target / tris)
    mod.use_collapse_triangulate = True
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier='d')
    return tri_count(obj)


def join(objs, name):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(object=objs[0], active_object=objs[0], selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# --------------------------------------------------------------------------------------------
# Malzemeleri ışıksız emission'a çevir (bake için)
# --------------------------------------------------------------------------------------------
def normalize_materials():
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        img_node = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        color = m.diffuse_color[:]
        emi = next((n for n in nt.nodes if n.type == 'EMISSION'), None)
        if emi:
            color = tuple(emi.inputs['Color'].default_value)
        uv_name = None
        if img_node:
            for l in nt.links:
                if l.to_node == img_node and l.from_node.type == 'UVMAP':
                    uv_name = l.from_node.uv_map
        image, interp = (img_node.image, img_node.interpolation) if img_node else (None, 'Linear')
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        if image:
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = image
            tex.interpolation = 'Linear'
            tex.extension = 'REPEAT'
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = uv_name or 'UVMap'
            nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
            nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = color


# --------------------------------------------------------------------------------------------
def set_sharp(obj, deg):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    lim = math.radians(deg)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            n0, n1 = e.link_faces[0].normal, e.link_faces[1].normal
            e.smooth = n0.length > 0 and n1.length > 0 and n0.angle(n1) < lim
        else:
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(obj.data)
    bm.free()


def unwrap_part(obj, mode='smart'):
    """Parçayı kendi 0..1 UV kutusunda aç ve paketle (daha sonra atlas bölgesine taşınır)."""
    me = obj.data
    for n in list(me.uv_layers.keys()):
        me.uv_layers.remove(me.uv_layers[n])
    me.uv_layers.new(name='Atlas')
    me.uv_layers['Atlas'].active = True
    if mode == 'front':   # cepheyi dik izdüşümle düzlemsel aç (UV = x, yükseklik; metre); yan/üst yüzler ayrı adalar
        layer = me.uv_layers['Atlas']
        side = []
        for poly in me.polygons:
            facing = poly.normal.y < -0.5   # Blender'da cephe -Y'ye bakar
            if not facing:
                side.append(poly.index)
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                layer.data[li].uv = (co.x, co.z)
        if side:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='DESELECT')
            bpy.ops.object.mode_set(mode='OBJECT')
            for i in side:
                me.polygons[i].select = True
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.003, scale_to_bounds=False)
            bpy.ops.object.mode_set(mode='OBJECT')
            layer = me.uv_layers['Atlas']
            sideset = set(side)
            for poly in me.polygons:
                if poly.index in sideset:
                    for li in poly.loop_indices:
                        layer.data[li].uv = (layer.data[li].uv[0] + 200.0, layer.data[li].uv[1])
        return
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(89), island_margin=0.003, area_weight=0.6, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def layout_rects(items, x, y, w, h, out):
    """items: [(id, ağırlık)]; dikdörtgeni ağırlıkla orantılı bölgelere böler (ikili bölme)."""
    if len(items) == 1:
        out[items[0][0]] = (x, y, w, h)
        return
    items = sorted(items, key=lambda t: -t[1])
    total = sum(t[1] for t in items)
    left, acc = [], 0.0
    for it in items:
        if acc + it[1] / 2 <= total / 2 or not left:
            left.append(it)
            acc += it[1]
        else:
            break
    right = items[len(left):]
    if not right:
        right = [left.pop()]
        acc -= right[0][1]
    frac = acc / total
    if w >= h:
        layout_rects(left, x, y, w * frac, h, out)
        layout_rects(right, x + w * frac, y, w * (1 - frac), h, out)
    else:
        layout_rects(left, x, y, w, h * frac, out)
        layout_rects(right, x, y + h * frac, w, h * (1 - frac), out)


def place_in_atlas(lows):
    """Her parçanın UV'sini ağırlığın karekökü kadar büyüt (doku yoğunluğu), sonra hepsini birlikte paketle (en-boy oranı korunur)."""
    for o in lows:
        k = math.sqrt(max(0.01, o.get('uvWeight', 1.0)))
        for d in o.data.uv_layers['Atlas'].data:
            d.uv = (d.uv[0] * k, d.uv[1] * k)


def pack_all(low):
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    low.data.uv_layers['Atlas'].active = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def main():
    o = cli()
    cfg = json.load(open(o['config'], encoding='utf8'))
    prop = next(p for p in cfg['props'] if p['name'] == o['prop'])
    src = os.path.join(ROOT, prop['source'])
    out = o['out'] or os.path.join(ROOT, f"static/props/{prop['name']}.src.glb")
    atlas_path = o['atlas'] or os.path.join('/tmp', f"{prop['name']}_atlas.png")
    size = int(prop.get('texture', 1024))
    scale = float(prop.get('scale', 1.0))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [x for x in bpy.data.objects if x.type == 'MESH']
    total_src = sum(tri_count(m) for m in meshes)
    log(f'kaynak: {len(meshes)} mesh, {total_src} üçgen')
    for m in meshes:   # dünya dönüşümünü geometriye göm
        m.data.transform(m.matrix_world)
        m.parent = None
        m.matrix_world.identity()
    for e in [x for x in bpy.data.objects if x.type != 'MESH']:
        bpy.data.objects.remove(e, do_unlink=True)

    normalize_materials()

    # ----- silinecekler -----
    removed = 0
    for rule in prop.get('remove', []):
        for m in list(bpy.data.objects):
            if m.type != 'MESH':
                continue
            if 'material' in rule and mat_name(m) != rule['material']:
                continue
            if 'name' in rule and not re.search(rule['name'], m.name):
                continue
            bpy.data.objects.remove(m, do_unlink=True)
            removed += 1
    log(f'{removed} mesh silindi')

    # ----- parçalar: kırp, (birleştir), yüksek poligon kopyasını al -----
    highs, lows, report = [], [], []
    for part in prop['parts']:
        group = [m for m in bpy.data.objects if m.type == 'MESH' and re.fullmatch(part['match'].get('material', '.*'), mat_name(m))
                 and re.search(part['match'].get('name', ''), m.name) and not m.name.startswith(('HIGH_', 'LOW_'))]
        if not group:
            log('UYARI: eşleşme yok', part['match'])
            continue
        base = group[0]
        if len(group) > 1:
            base = join(group, group[0].name)
        base.name = 'PART_' + part['match'].get('material', 'x')
        clip_object(base, part.get('clip'))
        if not base.data.polygons:
            bpy.data.objects.remove(base, do_unlink=True)
            continue
        high = base.copy()
        high.data = base.data.copy()
        high.name = 'HIGH_' + base.name
        bpy.context.scene.collection.objects.link(high)
        before = tri_count(base)
        after = decimate(base, int(part['triangles']))
        base.name = 'LOW_' + base.name
        base['uvWeight'] = float(part.get('uvWeight', 1.0))
        unwrap_part(base, part.get('uv', 'smart'))
        report.append((part.get('note', base.name), before, after))
        highs.append(high)
        lows.append(base)
    for note, b, a in report:
        log(f'  {note}: {b} -> {a}')
    low_tris = sum(a for _, _, a in report)
    log(f'alçak poligon toplam: {low_tris} (hedef ≤ {prop["triangles"]})')

    place_in_atlas(lows)
    high = join(highs, 'HIGH') if len(highs) > 1 else highs[0]
    low = join(lows, 'LOW') if len(lows) > 1 else lows[0]
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    pack_all(low)

    atlas = bpy.data.images.new('atlas', size, size, alpha=False)
    atlas.colorspace_settings.name = 'sRGB'
    low.data.materials.clear()
    mat = bpy.data.materials.new('prop_' + prop['name'])
    mat.use_nodes = True
    low.data.materials.append(mat)
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = atlas
    mat.node_tree.nodes.active = tex

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    for ob in bpy.data.objects:
        ob.select_set(False)
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    log(f'bake {size}x{size} (yüksek poligon {tri_count(high)} üçgen)...')
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=float(prop.get('bakeDistance', 0.25)),
                        max_ray_distance=float(prop.get('bakeDistance', 0.25)) * 2, margin=8, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    atlas.filepath_raw = atlas_path
    atlas.file_format = 'PNG'
    atlas.save()
    log('atlas:', atlas_path)

    # ----- yüksek poligonu at, malzemeyi son hâline getir -----
    bpy.data.objects.remove(high, do_unlink=True)
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out_n = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Metallic'].default_value = 0
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(atlas_path)
    t.interpolation = 'Linear'
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out_n.inputs['Surface'])

    # ----- zemin merkezine al, tabanı y=0, döndür, ölçekle -----
    low.data.transform(low.matrix_world)   # nesne dönüşümü varsa köşelere işle
    low.matrix_world = Matrix.Identity(4)
    bm = bmesh.new()
    bm.from_mesh(low.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')   # yüzeyi olmayan serseri köşeler (sınırı bozar)
    mn = Vector((min(v.co[i] for v in bm.verts) for i in range(3)))
    mx = Vector((max(v.co[i] for v in bm.verts) for i in range(3)))
    # Blender: x, y(= -gl z), z(= gl y)
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    rot = math.radians(float(prop.get('rotationY', 0)))
    for v in bm.verts:
        p = Vector((v.co.x - cx, v.co.y - cy, v.co.z - mn.z))
        c, s = math.cos(rot), math.sin(rot)
        p = Vector((p.x * c - p.y * s, p.x * s + p.y * c, p.z))
        v.co = p * scale
    bm.to_mesh(low.data)
    bm.free()
    set_sharp(low, 35)
    low.name = prop['name']
    low.data.name = prop['name']

    final_tris = tri_count(low)
    mn = Vector((min(v.co[i] for v in low.data.vertices) for i in range(3)))
    mx = Vector((max(v.co[i] for v in low.data.vertices) for i in range(3)))
    # oyun (glTF) eksenlerine çevir: x, y = blender z, z = -blender y
    bb = {'min': [mn.x, mn.z, -mx.y], 'max': [mx.x, mx.z, -mn.y]}
    size_gl = [bb['max'][i] - bb['min'][i] for i in range(3)]
    log(f'ÇIKTI {final_tris} üçgen; boyut (x,y,z) = {[round(v, 3) for v in size_gl]} oyun birimi; bbox {bb}')
    if o['meta']:
        json.dump({'triangles': final_tris, 'sourceTriangles': total_src, 'bbox': bb, 'size': size_gl, 'parts': [{'note': n, 'before': b, 'after': a} for n, b, a in report]},
                  open(o['meta'], 'w'), indent=2)

    # ----- dışa aktar -----
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT',
                              export_normals=True, export_texcoords=True, export_extras=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_image_format='AUTO', use_selection=True)
    log('yazıldı:', out, os.path.getsize(out), 'bayt')
    if final_tris > int(prop['triangles']):
        log('UYARI: üçgen bütçesi aşıldı')
        sys.exit(2)


if __name__ == '__main__':
    main()
