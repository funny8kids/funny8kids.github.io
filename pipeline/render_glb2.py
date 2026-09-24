import bpy, sys, os, math
from mathutils import Vector
# usage: blender -b --python render_glb2.py -- <glb> <png> <dirx,diry,dirz> [w h]
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
glb, png, dv = a[0], a[1], Vector([float(v) for v in a[2].split(',')]).normalized()
W, H = (int(a[3]), int(a[4])) if len(a) > 4 else (960, 620)
bpy.ops.import_scene.gltf(filepath=glb)
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2; size = (mx - mn).length or 1.0
cam_data = bpy.data.cameras.new("Cam"); cam_data.lens = 50
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam); bpy.context.scene.camera = cam
cam.location = ctr + dv * size * 1.45
cam.rotation_euler = (ctr - cam.location).normalized().to_track_quat('-Z', 'Y').to_euler()
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'VERTEX'
sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.film_transparent = True
sc.render.filepath = png
bpy.ops.render.render(write_still=True)
print("RENDER_OK:", os.path.exists(png), os.path.getsize(png) if os.path.exists(png) else -1, "bbox", tuple(round(v, 2) for v in mx - mn))
