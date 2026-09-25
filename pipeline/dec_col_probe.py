"""Does Blender's DECIMATE carry a COLOR attribute through a collapse?

This decides the architecture for Violet's paint. The delivered atlas is a per-triangle mosaic, so any
read that walks a UV neighbourhood samples foreign surface (proved three times over this session: the
disc sampler turned her navy jacket warm grey, i.e. `sleeve is navy` fails on the NO-LIFT build too).
The only read that is correct by construction is a point sample inside each SOURCE triangle, which
requires baking at full resolution and letting the collapse interpolate the vertex colours.

But that only works if decimation preserves colour at all. If it drops it, or if it drops it silently
and leaves a constant attribute behind, the whole plan dies here instead of 40 minutes later.
"""
import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=60, size=1)
obj = bpy.context.active_object
me = obj.data

# A colour the collapse cannot fake: pure horizontal ramp in R, pure vertical in G, B constant. If
# decimation returns anything but that ramp we know it is re-deriving colour rather than interpolating.
attr = me.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')
for poly in me.polygons:
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index]
        r = (v.co.x + 0.5)
        g = (v.co.y + 0.5)
        attr.data[li].color = (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), 0.5, 1.0)

mod = obj.modifiers.new('dec', 'DECIMATE')
mod.ratio = 0.05
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
print('DECIMATED tris=%d verts=%d' % (len(obj.data.polygons), len(obj.data.vertices)))

me = obj.data
names = [a.name for a in me.color_attributes]
print('ATTRS after decimate:', names)
assert names == ['Col'], 'decimation dropped the colour attribute'
a = me.color_attributes['Col']
vals = [tuple(round(c, 3) for c in d.color) for d in a.data]
uniq = set(vals)
print('distinct loop colours: %d of %d loops' % (len(uniq), len(vals)))
mn = [min(v[i] for v in vals) for i in range(3)]
mx = [max(v[i] for v in vals) for i in range(3)]
print('channel range min', mn, 'max', mx)
assert len(uniq) > 200, 'colour collapsed to a constant -> not interpolated'
assert mx[0] > 0.9 and mn[0] < 0.1 and mx[1] > 0.9 and mn[1] < 0.1, 'ramp destroyed'

# Does it survive a glTF round trip as COLOR_0?
bpy.ops.export_scene.gltf(filepath=r'F:\tmp_pwcheck\dec_col_probe.glb', export_format='GLB',
                          use_selection=True, export_yup=True)
print('DEC_COL_OK wrote glb')

import struct, json


def read_glb(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    ln = struct.unpack('<I', data[12:16])[0]
    js = json.loads(data[20:20 + ln].decode('utf8'))
    for mesh in js['meshes']:
        for p in mesh['primitives']:
            print('PRIM attrs', sorted(p['attributes'].keys()))
            for k, v in sorted(p['attributes'].items()):
                acc = js['accessors'][v]
                print('   ', k, acc['type'], acc['componentType'], 'count', acc['count'])


read_glb(r'F:\tmp_pwcheck\dec_col_probe.glb')
print('DEC_COL_PROBE_DONE')
