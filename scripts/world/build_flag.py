"""
Türk bayrağı direği + bayrak bezi (düşük poligon).

    python -I scripts/world/build_flag.py -- --out scripts/world/.work/turkishFlag.src.glb

Kaynak: resources/references/examples/turkish_flag.glb (Sketchfab, oguxhax1929, CC BY 4.0; 244 bin üçgen).
 - Direk ve top (altın küre) kaynak modelden alınır, ağır biçimde sadeleştirilir ve palette'e atanır.
 - Bez kaynaktan alınmaz: modeldeki hâli donmuş bir pozdur ve dokusu 2:1'e gerilmiştir. Yerine 24×16 ızgara kullanılır;
   UV (u = direkten uca, v = yukarıdan aşağı) rüzgâr gölgelendiricisi (sources/Game/World/Flag.js) tarafından okunur.
 - Doku: scripts/world/make_flag_texture.mjs (resmî oranlarla vektörden).
Birim: metre, orijin = direğin tabanı (zemin), +Y yukarı. Düğümler: pole (palette), cloth (turkishFlag).
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
SRC = os.path.join(ROOT, 'resources/references/examples/turkish_flag.glb')
TEX = os.path.join(ROOT, 'resources/references/world/flag/turkishFlag.png')

CFG = json.load(open(os.path.join(ROOT, 'scripts/world/world.config.json')))['flag']
GRAY = (0.1406, 0.5)    # palette: açık gri
GOLD = (0.2656, 0.5)    # palette: altın sarısı


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'out': 'flag.glb'}
    for i in range(0, len(argv) - 1, 2):
        o[argv[i].lstrip('-')] = argv[i + 1]
    return o


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == 'MESH']


def world_mesh(ob, ratio, uv, mat):
    """Nesneyi dünya dönüşümüyle düz bir mesh'e çevirir, sadeleştirir, tek UV noktasına atar."""
    me = ob.data.copy()
    me.transform(ob.matrix_world)
    new = bpy.data.objects.new(ob.name + '_low', me)
    bpy.context.scene.collection.objects.link(new)
    bpy.context.view_layer.objects.active = new
    md = new.modifiers.new('d', 'DECIMATE')
    md.decimate_type = 'COLLAPSE'
    md.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(new.evaluated_get(dg))
    new.modifiers.clear()
    new.data = me2
    for l in list(me2.uv_layers):
        me2.uv_layers.remove(l)
    layer = me2.uv_layers.new(name='UVMap')
    for d in layer.data:
        d.uv = uv
    me2.materials.clear()
    me2.materials.append(mat)
    return new


def main():
    o = cli()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    srcs = {}
    for ob in mesh_objects():
        srcs[len(ob.data.vertices)] = ob
    palette = bpy.data.materials.new('palette')

    # Kaynak: direk 1315 köşe, top 559 (iki kelepçe 34161 köşe: bezi tutan ince detay, düşük poligonda görünmez → atlanır)
    pole_src = srcs[1315]
    ball_src = srcs[559]
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for ob in (pole_src, ball_src):
        for v in ob.bound_box:
            p = ob.matrix_world @ Vector(v)
            for i in range(3):
                mn[i], mx[i] = min(mn[i], p[i]), max(mx[i], p[i])
    height_src = mx.z - mn.z
    s = CFG['height'] / height_src
    thick = CFG['poleThickness']  # radyal kalınlaştırma (oyun ölçeğinde çok ince kalmasın)

    pole = world_mesh(pole_src, 0.07, GRAY, palette)
    ball = world_mesh(ball_src, 0.12, GOLD, palette)
    parts = [pole, ball]
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    for ob in parts:
        # Taban merkezine al, ölçekle, radyal kalınlaştır
        ob.data.transform(Matrix.Translation((-cx, -cy, -mn.z)))
        ob.data.transform(Matrix.Diagonal((s * thick, s * thick, s, 1)))

    # Birleştir
    bm = bmesh.new()
    for ob in parts:
        bm.from_mesh(ob.data)
    me = bpy.data.meshes.new('pole')
    uvl = bm.loops.layers.uv.verify()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(palette)
    pole_ob = bpy.data.objects.new('pole', me)
    bpy.context.scene.collection.objects.link(pole_ob)

    # Bez ızgarası
    nu, nv = CFG['cloth']['segments']
    w, h = CFG['cloth']['width'], CFG['cloth']['height']
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    verts = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            row.append(bm.verts.new((i / nu * w, 0, -j / nv * h + 0.0)))
        verts.append(row)
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            for loop in f.loops:
                vx = loop.vert.co.x / w
                vz = -loop.vert.co.z / h
                loop[uvl].uv = (vx, 1 - vz)   # Blender UV v yukarı; glTF'e çıkarken 1-v → v=0 üstte
    for f in bm.faces:
        f.normal_flip() if f.normal.y > 0 else None
    cme = bpy.data.meshes.new('cloth')
    bm.to_mesh(cme)
    bm.free()
    cmat = bpy.data.materials.new('turkishFlag')
    cmat.use_nodes = True
    bsdf = cmat.node_tree.nodes['Principled BSDF']
    tex = cmat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(TEX)
    cmat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    cmat.use_backface_culling = False
    cme.materials.append(cmat)
    cloth = bpy.data.objects.new('cloth', cme)
    bpy.context.scene.collection.objects.link(cloth)
    # Konum/ölçek sıfır: bez konumu gölgelendiricide (Flag.js) pivot + UV'den hesaplanır

    # Kaynağı temizle, dışa aktar
    for ob in list(bpy.data.objects):
        if ob not in (pole_ob, cloth):
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    pole_ob.select_set(True)
    cloth.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(o['out'])), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=o['out'], export_format='GLB', use_selection=True, export_yup=True, export_apply=False)
    tris = len(pole_ob.data.polygons), len(cloth.data.polygons) * 2
    print('bayrak özeti: direk üçgen', sum(len(p.vertices) - 2 for p in pole_ob.data.polygons), 'bez üçgen', tris[1])


if __name__ == '__main__':
    main()
