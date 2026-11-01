"""
areas.glb içinden bir bölgeyi oyunun kamera açısından (ortografik) render eder (Workbench).

    python -I scripts/world/render_area.py -- <glb> <çıktı.png> <x> <y> <z> <ortho_ölçek>

x, y, z glTF dünya koordinatları (merkez), ölçek dünya birimi cinsinden görünür genişlik.
"""
import bpy,sys,math
from mathutils import Vector
argv=sys.argv[sys.argv.index('--')+1:]
src,out=argv[0],argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene
sc.render.engine='BLENDER_WORKBENCH'
sc.render.resolution_x,sc.render.resolution_y=1600,900
w=bpy.data.worlds.new('w');w.color=(0.62,0.7,0.62);sc.world=w
sh=sc.display.shading;sh.light='STUDIO';sh.color_type='TEXTURE';sh.show_object_outline=False
# merkez çevresindeki kutunun dışını gizle (kutu: ortho ölçeğinin yarısı + pay)
CX,CZ=float(argv[2]),float(argv[4]);HX=HZ=float(argv[5])*0.9
keep=[]
for ob in bpy.data.objects:
    if ob.type=='MESH':
        wp=ob.matrix_world.translation
        # glTF (49,3,38) -> blender (49,-38,3)
        if abs(wp.x-CX)<HX and abs(wp.y+CZ)<HZ: pass
        else: ob.hide_render=True
ctr=Vector((float(argv[2]),-float(argv[4]),float(argv[3])))
cd=bpy.data.cameras.new('c');cam=bpy.data.objects.new('c',cd);sc.collection.objects.link(cam);sc.camera=cam
dirv=Vector((1,-1,1.35)).normalized()   # gltf (1,1.35,1)
cam.location=ctr+dirv*60
cam.rotation_euler=(-dirv).to_track_quat('-Z','Y').to_euler()
cd.type='ORTHO';cd.ortho_scale=float(argv[5]);cd.clip_end=500
sc.render.filepath=out
bpy.ops.render.render(write_still=True)
