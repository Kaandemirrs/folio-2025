"""
Doğan SLX (Tofaş) reçetesi: kaynak modeli oyun aracı yapısına çevirir (build_vehicle.py çağırır).

Kaynak: resources/references/examples/dogan_slx.glb — "DOGAN SLX", Filcomet, CC BY 4.0
Kaynak model: tek mesh + tek doku (gövde, iç mekân, tekerlekler karışık). Ön = Blender −Y, metre cinsinden değil (~×1,2).

Yaptığı iş:
  1. tekerlek adalarını, iç mekânı, motor bölmesini ve kaynak plakayı siler;
  2. kalan yüzeyleri doku rengine göre "boya" (bodyPainted: UV0 = yükseklik gradyanı, UV1 = yan izdüşüm)
     ve palette (common) olarak ayırır;
  3. tekerlekleri (W140 şablonu, küçültülmüş), çamurluk kemerlerini, far/stop/geri/sinyal panellerini ve plakaları kurar.
Koordinatlar oyun uzayında: x ileri, y yan (sol = +), z yukarı, zemin z=0.
"""
import bpy
import bmesh
import colorsys
import math
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_w140 as W   # Geo, make_material, build_wheel, palette_uv, CELL


def log(*a):
    print('[dogan]', *a, flush=True)


# Kaynak ölçüler (Blender uzayı; kaynak ön = −Y)
SRC_LEN = 5.17          # tampon ucundan tampon ucuna
SRC_BODY_W = 2.02       # aynasız gövde (lastik dış yüzleri dahil)
SRC_H = 1.57            # zeminden tavana
SRC_GROUND = -0.02
SRC_F_MID = 0.07        # dingil orta noktası (ileri eksende, ileri = −Y)
HUB_SRC = [(-1.585, 0.84), (-1.585, -0.84), (1.445, 0.84), (1.445, -0.84)]  # (y, x)
HUB_SRC_Z = 0.345


def run(cfg, opts):
    size = cfg['size']
    SX, SY, SZ = size['length'] / SRC_LEN, size['width'] / SRC_BODY_W, size['height'] / SRC_H
    hub = cfg['hub']
    REST = cfg['restHeight']
    HUB_Z = hub['radiusPhysical']
    R_VIS = hub['radiusVisual']

    def T(p):
        return Vector(((-p.y - SRC_F_MID) * SX, p.x * SY, (p.z - SRC_GROUND) * SZ))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(W.ROOT, cfg['source']))
    obj = next(o for o in bpy.data.objects if o.type == 'MESH')
    img = next(n.image for n in obj.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
    IW, IH = img.size
    pixels = list(img.pixels)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    uv = bm.loops.layers.uv.active

    def sample(u, v):
        x = min(IW - 1, max(0, int(u * IW)))
        y = min(IH - 1, max(0, int(v * IH)))
        i = (y * IW + x) * 4
        return pixels[i:i + 3]

    def face_uv(f):
        n = len(f.loops)
        return (sum(l[uv].uv[0] for l in f.loops) / n, sum(l[uv].uv[1] for l in f.loops) / n)

    # --- 1) silinecekler -------------------------------------------------------------
    # bağlı yüzey adaları
    seen, islands_ = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        st, group = [f], []
        seen.add(f.index)
        while st:
            c = st.pop()
            group.append(c)
            for e in c.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        st.append(g)
        islands_.append(group)

    drop = set()
    wheel_faces = 0
    for group in islands_:
        vs = {v for f in group for v in f.verts}
        mn = Vector((min(v.co[i] for v in vs) for i in range(3)))
        mx = Vector((max(v.co[i] for v in vs) for i in range(3)))
        c = (mn + mx) / 2
        for hy, hx in HUB_SRC:
            if (mx.y - mn.y) < 0.85 and (mx.z - mn.z) < 0.85 and abs(c.y - hy) < 0.45 and abs(c.z - HUB_SRC_Z) < 0.45 and abs(c.x - hx) < 0.3:
                drop.update(f.index for f in group)
                wheel_faces += len(group)
                break
    interior = plate_src = 0
    for f in bm.faces:
        u, v = face_uv(f)
        if u < 0.73 and v > 0.30:          # iç mekân + motor bölmesi dokusu
            drop.add(f.index)
            interior += 1
        elif 0.46 <= u <= 0.62 and 0.025 <= v <= 0.095:   # kaynak plaka
            drop.add(f.index)
            plate_src += 1
    log(f'silinen: tekerlek {wheel_faces}, iç mekân/motor {interior}, kaynak plaka {plate_src} yüz')
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in drop], context='FACES_ONLY')

    # --- 2) sınıflandırma ------------------------------------------------------------
    palette_cells = W.CELL
    paint_faces, palette_faces = [], []   # (face, cell)
    front_lamp, rear_lamp = [], []

    def is_red(c):
        r, g, b = c
        return r > 0.06 and r > 1.25 * max(g, b)

    for f in bm.faces:
        u, v = face_uv(f)
        col = sample(u, v)
        h, s, val = colorsys.rgb_to_hsv(*col)
        cen = T(sum((x.co for x in f.verts), Vector()) / len(f.verts))
        n = f.normal
        gx, gz = cen.x, cen.z
        if is_red(col):
            # arka lamba bölgesi (koyu kırmızı lensler boyaya karışmasın)
            if gx < -size['length'] * 0.47 and 0.52 * size['height'] / 0.945 < gz < 0.80 * size['height'] / 0.945 * 0.945:
                palette_faces.append((f, palette_cells['stop_red']))
            else:
                paint_faces.append(f)
            continue
        if val < 0.16:
            cell = palette_cells['glass'] if gz > 0.57 * size['height'] / 0.945 * 0.945 and abs(n.z) > 0.2 or gz > 0.62 else palette_cells['black_brown']
        elif s < 0.3 and val < 0.55:
            cell = palette_cells['trim']
        elif s < 0.3:
            cell = palette_cells['chrome'] if val < 0.8 else palette_cells['white']
        elif 0.05 <= h < 0.2:
            cell = palette_cells['amber']
        else:
            cell = palette_cells['gray_blue']
        palette_faces.append((f, cell))

    log(f'boya {len(paint_faces)} yüz, palette {len(palette_faces)} yüz')

    # --- 3) çıktı geometrileri -------------------------------------------------------
    body = W.Geo(('UVMap', 'UVMap.001'))
    common = W.Geo()
    zs = [T(f.verts[0].co).z for f in paint_faces]
    z0, z1 = min(zs), max(zs)
    ys = [T(v.co).x for f in paint_faces for v in f.verts]
    x0, x1 = min(ys), max(ys)

    def emit(geo, face, uvs_fn):
        pts = [T(v.co) for v in face.verts]
        n = Vector((0, 0, 0))
        for i in range(len(pts)):
            n += pts[i].cross(pts[(i + 1) % len(pts)])
        nn = T(face.verts[0].co) * 0  # placeholder
        # kaynak normali oyun uzayına: ileri/yan eksenler eşlenir
        sn = Vector((-face.normal.y * SX, face.normal.x * SY, face.normal.z * SZ))
        sn = Vector((-face.normal.y / SX, face.normal.x / SY, face.normal.z / SZ))
        geo.face(pts, uvs_fn(pts), normal=sn)

    def body_uvs(pts):
        lay0, lay1 = [], []
        for p in pts:
            h = min(1.0, max(0.0, (p.z - z0) / (z1 - z0)))
            u = min(1.0, max(0.0, (p.x - x0) / (x1 - x0)))
            lay0.append((u, h))
            lay1.append((u, 0.09 + 0.91 * h))
        return [lay0, lay1]

    for f in paint_faces:
        emit(body, f, body_uvs)
    for f, cell in palette_faces:
        emit(common, f, lambda pts, cell=cell: [[W.palette_uv(cell)] * len(pts)])
    bm.free()
    body.bm.normal_update()
    bmesh.ops.remove_doubles(body.bm, verts=body.bm.verts, dist=0.0008)
    bmesh.ops.remove_doubles(common.bm, verts=common.bm.verts, dist=0.0008)
    body.set_shading(40)
    common.set_shading(40)

    # kemerler ve egzoz
    for hx in (hub['x'], -hub['x']):
        for sgn in (1, -1):
            common.arch_liner(hx, sgn, palette_cells['trim'], R_VIS + 0.025, HUB_Z, y0=hub['y'] - 0.14, y1=hub['y'] + 0.12)
    rear_x = min(v.co.x for v in body.bm.verts)
    common.cylinder_x(rear_x + 0.10, rear_x - 0.015, -0.34, 0.13, 0.03, 8, palette_cells['dark_chrome'])
    body_tris, common_tris = body.tris(), common.tris()

    # --- ışıklar (kaynak yüzeyin hemen önüne/arkasına panel) -------------------------
    # ön/arka yüzey x'i: ilgili bölgedeki kaynak gövdenin ucu
    def surface_x(front, y0, y1, z0, z1):
        """Verilen dikdörtgendeki (|y|, z) gövde köşelerinin en ön (veya en arka) x'i."""
        xs = [v.co.x for geo in (body, common) for v in geo.bm.verts if y0 <= abs(v.co.y) <= y1 and z0 <= v.co.z <= z1]
        return (max(xs) if front else min(xs)) if xs else 0.0

    head, stop, back, blink = W.Geo(), W.Geo(), W.Geo(), {1: W.Geo(), -1: W.Geo()}
    hx_f = surface_x(True, 0.2, 0.6, 0.30, 0.50)
    hx_r = surface_x(False, 0.2, 0.5, 0.36, 0.48)
    front_face_x, rear_face_x = hx_f - 0.012, hx_r + 0.012
    for sgn in (1, -1):
        ya, yb = sorted((0.27 * sgn, 0.50 * sgn))
        head.quad_x(front_face_x + 0.006, ya, yb, 0.35, 0.46, 1)
        by0, by1 = sorted((0.505 * sgn, 0.565 * sgn))
        blink[sgn].quad_x(front_face_x + 0.010, by0, by1, 0.35, 0.46, 1)
        ya, yb = sorted((0.23 * sgn, 0.47 * sgn))
        stop.quad_x(rear_face_x - 0.008, ya, yb, 0.40, 0.46, -1)
        ya, yb = sorted((0.31 * sgn, 0.39 * sgn))
        back.quad_x(rear_face_x - 0.010, ya, yb, 0.375, 0.40, -1)
        blink[sgn].quad_x(rear_face_x - 0.012, ya, yb, 0.405, 0.44, -1)

    # --- plakalar ------------------------------------------------------------------
    PW, PH = 0.30, 0.075

    def plate(front):
        g = W.Geo()
        if front:
            x, z, ys_, facing = front_face_x + 0.004, 0.20, (-PW / 2, PW / 2), 1
        else:
            x, z, ys_, facing = rear_face_x - 0.004, 0.40, (PW / 2, -PW / 2), -1
        pts = [Vector((x, ys_[0], z - PH / 2)), Vector((x, ys_[1], z - PH / 2)), Vector((x, ys_[1], z + PH / 2)), Vector((x, ys_[0], z + PH / 2))]
        g.face(pts, [[(0, 0), (1, 0), (1, 1), (0, 1)]], normal=Vector((facing, 0, 0)))
        return g

    # --- materyaller ve sahne --------------------------------------------------------
    mat_paint = W.make_material('obsidianGradient', (0.04, 0.04, 0.05))
    mat_palette = W.make_material('palette', (0.5, 0.5, 0.5))
    mat_white = W.make_material('emissiveWhiteRadialGradient', (1, 1, 1))
    mat_orange = W.make_material('emissiveOrangeRadialGradient', (1, 0.17, 0))
    mat_plate = W.make_material('licensePlateDogan', (1, 1, 1)  # ad araca özel: oyunda materyaller ada göre paylaşılır
                                  , image_path=os.path.join(W.ROOT, cfg['plate']['image']))

    chassis = bpy.data.objects.new('chassis', None)
    bpy.context.scene.collection.objects.link(chassis)
    chassis.location = (0, 0, REST)
    bpy.context.view_layer.update()
    objs = [chassis]
    objs.append(body.to_object('bodyPainted', mat_paint, chassis))
    objs.append(common.to_object('common', mat_palette, chassis))
    h_t, s_t, b_t = head.tris(), stop.tris(), back.tris()
    bl_t = sum(blink[s].tris() for s in (1, -1))
    objs.append(head.to_object('headlights', mat_white, chassis))
    objs.append(stop.to_object('stopLights', mat_orange, chassis))
    objs.append(back.to_object('backLights', mat_orange, chassis))
    objs.append(blink[1].to_object('blinkerLeft', mat_orange, chassis))
    objs.append(blink[-1].to_object('blinkerRight', mat_orange, chassis))
    objs.append(plate(True).to_object('licensePlateFront', mat_plate, chassis))
    objs.append(plate(False).to_object('licensePlateRear', mat_plate, chassis))

    wc = bpy.data.objects.new('wheelContainer', None)
    bpy.context.scene.collection.objects.link(wc)
    wc.location = (hub['x'], hub['y'], HUB_Z)
    bpy.context.view_layer.update()
    wcyl = bpy.data.objects.new('wheelCylinder', None)
    bpy.context.scene.collection.objects.link(wcyl)
    wcyl.parent = wc
    W.R_VIS = 0.28                      # şablon W140 ölçüsünde kurulur, sonra küçültülür
    wheel_geo = W.build_wheel()
    kscale = R_VIS / 0.28
    for v in wheel_geo.bm.verts:
        v.co *= kscale
    wheel_tris = wheel_geo.tris()
    wheel = wheel_geo.to_object('wheel', mat_palette)
    wheel.parent = wcyl
    objs += [wc, wcyl, wheel]

    unique = body_tris + common_tris + h_t + s_t + b_t + bl_t + 4 + wheel_tris
    rendered = unique - wheel_tris + 4 * wheel_tris
    log(f'bodyPainted {body_tris} · common {common_tris} · ışık {h_t + s_t + b_t + bl_t} · plaka 4 · tekerlek {wheel_tris}')
    log(f'BENZERSİZ {unique} · ÇİZİLEN {rendered}')

    out = opts['out']
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT',
                              export_normals=True, export_texcoords=True, export_extras=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_draco_mesh_compression_enable=False, use_selection=True)
    log('yazıldı:', out, os.path.getsize(out), 'bayt')
