import bpy, sys, os, math
from mathutils import Vector
# usage: blender -b --python render_glb.py -- <glb> <png> [elev_deg]
bpy.ops.wm.read_factory_settings(use_empty=True)
glb, png = sys.argv[-2], sys.argv[-1]
bpy.ops.import_scene.gltf(filepath=glb)
mn=Vector((1e9,)*3); mx=Vector((-1e9,)*3)
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        for c in o.bound_box:
            w=o.matrix_world@Vector(c); mn=Vector(map(min,mn,w)); mx=Vector(map(max,mx,w))
ctr=(mn+mx)/2; size=(mx-mn).length or 1.0
cam_data=bpy.data.cameras.new("Cam"); cam=bpy.data.objects.new("Cam",cam_data)
bpy.context.collection.objects.link(cam); bpy.context.scene.camera=cam
d=size*1.35
dirv=Vector((0.30,-0.34,0.89)).normalized()
cam.location=ctr+dirv*d
cam.rotation_euler=(ctr-cam.location).normalized().to_track_quat('-Z','Y').to_euler()
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'
ok=False
for ct in ('VERTEX','COLOR','TEXTURE'):
    try:
        sc.display.shading.color_type=ct; ok=True; print("ct:",ct); break
    except Exception as ex: pass
try: sc.display.shading.light='STUDIO'
except Exception as ex: print("light:",ex)
sc.render.resolution_x=640; sc.render.resolution_y=640
sc.render.film_transparent=True
sc.render.filepath=png
bpy.ops.render.render(write_still=True)
print("RENDER_OK:", os.path.exists(png), os.path.getsize(png) if os.path.exists(png) else -1)
