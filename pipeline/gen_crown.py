# Regenerates world/assets/models/FinaleCrown.glb — the hero violet crown that blooms from the
# keeper's signature in the finale (「墨即花园」: the written words flower). It was authored by hand
# in Blender (a single vertex-coloured mesh: 5-petal forward-facing violet face, yellow throat/eye,
# one stem behind the bloom, two small basal leaves), so this script rebuilds that exact accepted
# geometry from FinaleCrown_mesh.json rather than re-deriving it — the JSON is the frozen authored
# state, and running this reproduces the shipped asset deterministically.
#
# The mesh is authored along Blender +Z (the pipeline's up-axis law), 1 unit tall, base at the origin.
# export_yup=True converts it to glTF Y-up on the way out, matching how it was first exported.
#
# After running this, compress the result — FinaleCrown uses a per-vertex colour gradient, so it must
# keep 16-bit COLOR_0 exactly like WritingDesk (see compress.sh); the 8-bit default bands the throat.
#
#   blender --background --python world/pipeline/gen_crown.py
import bpy, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'FinaleCrown_mesh.json')
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets', 'models', 'FinaleCrown.glb'))

d = json.load(open(SRC, 'r'))
verts, cols, tris = d['verts'], d['cols'], d['tris']

me = bpy.data.meshes.new(d['name'])
me.from_pydata(verts, [], [tuple(t) for t in tris])
me.update()

ca = me.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
for i, c in enumerate(cols):
    ca.data[i].color = c

obj = bpy.data.objects.new(d['name'], me)
bpy.context.collection.objects.link(obj)

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True)
print('FinaleCrown wrote', OUT, len(verts), 'verts', len(tris), 'tris')
