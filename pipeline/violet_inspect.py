import bpy, sys, os, math
from mathutils import Vector

# violet_inspect.py — look at a delivered GLB before spending a pipeline on it.
# Imports, reports the real world-space size and up-axis, and shoots front / three-quarter / back in
# Workbench with MATERIAL colour (this file is textured, unlike the keeper's vertex-painted mesh).
#   E:/IDE/Blender/blender.exe --background --python pipeline/violet_inspect.py -- <glb> <outdir>

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = argv[0] if argv else r'F:\GitHub_Like\funny8kids.github.io\violet.glb'
OUT = argv[1] if len(argv) > 1 else r'F:\tmp_pwcheck\shots'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)

for o in bpy.data.objects:
    if o.type == 'MESH':
        print('OBJ', o.name, 'polys', len(o.data.polygons), 'verts', len(o.data.vertices),
              'mats', [m.name for m in o.data.materials], 'vcol',
              [c.name for c in o.data.color_attributes])

mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2
size = mx - mn
print('WORLD bbox min', [round(v, 3) for v in mn], 'max', [round(v, 3) for v in mx])
print('WORLD size x=%.3f y=%.3f z=%.3f' % (size.x, size.y, size.z))
# The up axis is whichever extent is the largest, and the ground is the min on it — a delivered
# conversion file is not guaranteed to be in metres or standing on z=0.
up = max(range(3), key=lambda k: size[k])
print('UP axis index', up, '=> height', round(size[up], 3), 'feet at', round((mn, mx)[0][up], 3))
H = size[up]

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
# TEXTURE, not MATERIAL: a delivered conversion file paints the eyes into the base colour map, and
# MATERIAL mode shows only the viewport display colour, which hides them entirely.
sc.display.shading.color_type = os.environ.get('VN_COLOUR', 'MATERIAL')
print('COLOUR MODE', sc.display.shading.color_type)
sc.display.shading.show_cavity = True
sc.render.resolution_x = 700
sc.render.resolution_y = 1000
sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'Standard'
print('VIEW', sc.view_settings.view_transform)


def shoot(name, loc, target, lens=50, rx=700, ry=1000):
    cd = bpy.data.cameras.new(name); cd.lens = lens
    cam = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(cam)
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.normalized().to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.resolution_x = rx; sc.render.resolution_y = ry
    sc.render.filepath = os.path.join(OUT, 'violet_' + name + '.png')
    bpy.ops.render.render(write_still=True)
    print('SHOT', name, sc.render.filepath)


# the delivered file's own -Y is assumed to be the figure's front; both signs get a frame so the
# guess is checked rather than trusted
shoot('front', (ctr.x, ctr.y - H * 1.9, mn.z + H * 0.50), (ctr.x, ctr.y, mn.z + H * 0.48), lens=55)
shoot('back', (ctr.x, ctr.y + H * 1.9, mn.z + H * 0.50), (ctr.x, ctr.y, mn.z + H * 0.48), lens=55)
shoot('three', (ctr.x + H * 1.05, ctr.y - H * 1.25, mn.z + H * 0.55), (ctr.x, ctr.y, mn.z + H * 0.46), lens=55)
head_z = mn.z + H * 0.92
shoot('head', (ctr.x, ctr.y - H * 0.55, head_z), (ctr.x, ctr.y, head_z - H * 0.01), lens=90, rx=800, ry=800)
print('INSPECT_OK')
