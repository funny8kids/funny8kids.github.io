import bpy, sys, os, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-2])
mn=Vector((1e9,)*3); mx=Vector((-1e9,)*3)
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        for c in o.bound_box:
            w=o.matrix_world@Vector(c); mn=Vector(map(min,mn,w)); mx=Vector(map(max,mx,w))
ctr=(mn+mx)/2; size=(mx-mn).length or 1.0
cam_data=bpy.data.cameras.new("Cam"); cam=bpy.data.objects.new("Cam",cam_data)
bpy.context.collection.objects.link(cam); bpy.context.scene.camera=cam
d=size*1.4; cam.location=(ctr.x+d*0.8, ctr.y-d*0.9, ctr.z+d*0.6)
cam.rotation_euler=(ctr-cam.location).normalized().to_track_quat('-Z','Y').to_euler()
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'
sc.render.resolution_x=400; sc.render.resolution_y=400
sc.render.filepath=sys.argv[-1]
bpy.ops.render.render(write_still=True)
print("RENDER_OK:", os.path.exists(sys.argv[-1]), os.path.getsize(sys.argv[-1]) if os.path.exists(sys.argv[-1]) else -1)
