"""
W140 GLB'sini Blender Workbench ile render eder (yan, ön, arka, 3/4 + plaka yakın planı).
Palette ve gradyan boya gerçek oyundaki gibi gösterilir; tekerlek şablonu 4 kez kopyalanır.

    python -I scripts/vehicle/render_w140.py -- --glb static/vehicle/w140.glb --out resources/references/w140/renders --tag after_w140
"""
import bpy
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'glb': os.path.join(ROOT, 'static/vehicle/w140.glb'),
         'out': os.path.join(ROOT, 'resources/references/w140/renders'),
         'tag': 'after_w140', 'only': '', 'lights': 'off'}
    for i in range(0, len(argv) - 1, 2):
        o[argv[i].lstrip('-')] = argv[i + 1]
    return o


def tex_material(obj_mat, image_path, interpolation='Closest'):
    nt = obj_mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE':
            nt.nodes.remove(n)
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(image_path)
    t.interpolation = interpolation
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])


def main():
    o = cli()
    os.makedirs(o['out'], exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=o['glb'])

    # Palette ve gradyan dokuları
    grad = os.path.join('/tmp', 'obsidian_gradient.png')
    img = bpy.data.images.new('obsidian_gradient', 1, 16, alpha=False)
    px = []
    top, bot = (0x34 / 255, 0x34 / 255, 0x3b / 255), (0x0c / 255, 0x0c / 255, 0x0f / 255)
    for row in range(16):   # Blender görüntüsü alttan başlar
        t = row / 15.0      # 0 = alt, 1 = üst
        c = [bot[i] + (top[i] - bot[i]) * t for i in range(3)]
        px += [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1]
    img.pixels = px
    img.filepath_raw = grad
    img.file_format = 'PNG'
    img.save()

    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        if m.name.startswith('palette'):
            tex_material(m, os.path.join(ROOT, 'static/palette.png'))
        elif m.name.startswith('obsidianGradient'):
            tex_material(m, grad, 'Linear')
        elif m.name.startswith('emissiveWhite'):
            m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
        elif m.name.startswith('emissiveOrange'):
            m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0.2, 0.02, 1)

    # Tekerlek şablonunu 4 kez
    wc = bpy.data.objects.get('wheelContainer')
    if wc:
        kids = [c for c in wc.children_recursive]
        for sx in (1, -1):
            for sy in (1, -1):
                if sx == 1 and sy == 1:
                    continue
                dup_root = bpy.data.objects.new(f'wc_{sx}_{sy}', None)
                bpy.context.scene.collection.objects.link(dup_root)
                dup_root.location = (wc.location.x * sx, wc.location.y * sy, wc.location.z)
                if sy < 0:
                    dup_root.rotation_euler = (0, 0, math.pi)
                for k in kids:
                    if k.type == 'MESH':
                        d = k.copy()
                        d.data = k.data
                        bpy.context.scene.collection.objects.link(d)
                        d.parent = dup_root
                        d.location = (0, 0, 0)

    if o['lights'] != 'on':   # oyunda stop/geri/sinyal panelleri varsayılan gizli
        for name in ('stopLights', 'backLights', 'blinkerLeft', 'blinkerRight'):
            ob = bpy.data.objects.get(name)
            if ob:
                ob.hide_render = True

    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 1200, 700
    w = bpy.data.worlds.new('w')
    w.color = (0.62, 0.66, 0.70)
    sc.world = w
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'TEXTURE'
    sh.show_cavity = False
    sh.show_object_outline = True
    sh.object_outline_color = (0, 0, 0)
    sh.show_shadows = True

    cam_data = bpy.data.cameras.new('c')
    cam = bpy.data.objects.new('c', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cfg = {
        'side': ((0, -9, 0.55), (0, 0, 0.5), 'ORTHO', 4.6),
        'front': ((9, 0, 0.6), (0, 0, 0.5), 'ORTHO', 2.6),
        'rear': ((-9, 0, 0.6), (0, 0, 0.5), 'ORTHO', 2.6),
        'three_quarter': ((4.6, -4.6, 2.2), (0, 0, 0.45), 'PERSP', None),
        'plate_rear': ((-4, 0, 0.56), (-1.66, 0, 0.56), 'ORTHO', 0.7),
        'plate_front': ((4, 0, 0.30), (1.53, 0, 0.30), 'ORTHO', 0.7),
        'wheel': ((0, -3.0, 0.4), (0.975, -0.58, 0.3), 'ORTHO', 0.9),
        'top': ((0, 0, 8), (0, 0, 0.4), 'ORTHO', 4.2),
        'arch': ((2.6, -2.2, 0.9), (1.0, -0.7, 0.4), 'PERSP', None),
    }
    only = [x for x in o['only'].split(',') if x]
    for name, (pos, look, typ, scale) in cfg.items():
        if only and name not in only:
            continue
        cam.location = pos
        cam_data.type = typ
        if scale:
            cam_data.ortho_scale = scale
        cam_data.lens = 45
        d = Vector(look) - Vector(pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(o['out'], f"{o['tag']}_{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
