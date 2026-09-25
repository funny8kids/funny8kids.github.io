import bpy, sys, os, math
from mathutils import Vector

# keeper_portrait.py — judge the Garden Keeper as a model, not as a 192-px in-scene capture.
#
# The in-scene frame can say "she is dark and merges with the bed"; it cannot say whether the bodice
# has a waist, because at 192 px wide a 3 cm cinch is half a pixel. This imports the shipped GLB and
# renders three form studies in Workbench: full body front (proportion), head close-up (face), and a
# 3/4 (silhouette depth). Flat matcap so the shading cannot flatter or hide the shape.
#   E:/IDE/Blender/blender.exe --background --python pipeline/keeper_portrait.py -- <glb> <outdir>

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = argv[0] if argv else r'F:\GitHub_Like\funny8kids.github.io\assets\models\GardenKeeper.glb'
OUT = argv[1] if len(argv) > 1 else r'F:\tmp_pwcheck\shots'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)

mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2; h = mx.z - mn.z
print('BBOX min', [round(v, 3) for v in mn], 'max', [round(v, 3) for v in mx], 'height', round(h, 3))

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
# VERTEX, not MATERIAL: her whole face is painted in COLOR_0 (iris, pupil, catchlight, lash line, the
# nose shadow), and the file carries no material at all. Rendering MATERIAL colour turns the jury's
# subject into a grey egg and invites a verdict about features that are present. Cavity stays on so
# the relief is still readable alongside the paint.
sc.display.shading.color_type = 'VERTEX'
sc.display.shading.show_cavity = True
sc.display.shading.cavity_valley_factor = 0.6
sc.render.resolution_x = 700
sc.render.resolution_y = 1000
sc.render.image_settings.file_format = 'PNG'
# Standard, not the factory AgX. AgX is a display-organised transform that rolls highlight
# saturation to white, and this file's entire subject is a face painted in vertex colour at
# 0.86/0.71/0.63 — straight into AgX's shoulder that becomes the pale lavender slab that got the
# verdict "porcelain mask". The judgement has to be made on the colour that ships, which is the
# number stored on the vertex, so the transform has to be the identity curve.
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
print('VIEW', sc.view_settings.view_transform, sc.view_settings.look)

world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
if bg:
    bg.inputs[0].default_value = (0.92, 0.92, 0.94, 1.0)
    bg.inputs[1].default_value = 1.0


def shoot(name, loc, target, lens=60, rx=700, ry=1000):
    cd = bpy.data.cameras.new(name); cd.lens = lens
    cam = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(cam)
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.normalized().to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.resolution_x = rx; sc.render.resolution_y = ry
    sc.render.filepath = os.path.join(OUT, 'keeper_' + name + '.png')
    bpy.ops.render.render(write_still=True)
    print('SHOT', name, sc.render.filepath)


# front full body: the proportion argument — head-to-height, waist position, skirt flare
shoot('A_full', (ctr.x, ctr.y - h * 1.9, mn.z + h * 0.52), (ctr.x, ctr.y, mn.z + h * 0.50), lens=58)
# head close-up: face plane, jaw, hairline, and whether the eyes are geometry or paint
hz = mn.z + h * 0.925
shoot('B_head', (ctr.x, ctr.y - h * 0.42, hz), (ctr.x, ctr.y, hz - h * 0.012), lens=85, rx=800, ry=800)
# three-quarter: does she have any depth at all, or is she a relief
shoot('C_three', (ctr.x + h * 0.95, ctr.y - h * 1.15, mn.z + h * 0.62), (ctr.x, ctr.y, mn.z + h * 0.48), lens=58)
# profile silhouette: the cheapest test of whether the skirt and hair have shape
shoot('D_side', (ctr.x + h * 1.9, ctr.y, mn.z + h * 0.52), (ctr.x, ctr.y, mn.z + h * 0.50), lens=58)
print('PORTRAIT_OK')
