"""
Bir GLB'yi Workbench ile dört yönden render eder (ön, sağ, arka, üst) + 3/4 görünüm.

    python -I scripts/props/render_prop.py -- --glb x.glb --out klasör --tag after
"""
import bpy
import math
import os
import sys
from mathutils import Vector


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'glb': None, 'out': '.', 'tag': 'after', 'only': ''}
    for i in range(0, len(argv) - 1, 2):
        o[argv[i].lstrip('-')] = argv[i + 1]
    return o


def main():
    o = cli()
    os.makedirs(o['out'], exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=o['glb'])
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 1400, 900
    w = bpy.data.worlds.new('w')
    w.color = (0.62, 0.66, 0.70)
    sc.world = w
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_object_outline = 'FLAT', 'TEXTURE', False

    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for v in ob.bound_box:
            p = ob.matrix_world @ Vector(v)
            for i in range(3):
                mn[i], mx[i] = min(mn[i], p[i]), max(mx[i], p[i])
    c, size = (mn + mx) / 2, mx - mn
    cd = bpy.data.cameras.new('c')
    cam = bpy.data.objects.new('c', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    views = {
        'front': ((0, -1, 0), size.x, size.z, 'ORTHO'),
        'back': ((0, 1, 0), size.x, size.z, 'ORTHO'),
        'right': ((1, 0, 0), size.y, size.z, 'ORTHO'),
        'top': ((0, 0, 1), size.x, size.y, 'ORTHO'),
        'three_quarter': ((-0.9, -1.1, 0.8), max(size) * 1.2, max(size) * 1.2, 'ORTHO'),
    }
    only = [x for x in o['only'].split(',') if x]
    for name, (d, a, b, typ) in views.items():
        if only and name not in only:
            continue
        dv = Vector(d).normalized()
        cam.location = c + dv * 40
        cd.type = typ
        cam.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
        if name == 'top':
            cam.rotation_euler = (0, 0, 0)
        cd.ortho_scale = max(a * 1.05, b * 1.05 * 1400 / 900)
        sc.render.filepath = os.path.join(o['out'], f"{o['tag']}_{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
