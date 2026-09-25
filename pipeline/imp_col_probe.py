"""Does Blender's glTF IMPORTER hand COLOR_0 back to us unchanged?

The exporter was already measured (enc_probe.cjs: it writes the attribute value raw, no sRGB->linear).
The other half of the round trip matters just as much, because the plan is: bake her paint onto the
1.47 M-triangle source in Node, then let Blender's collapse INTERPOLATE it. If the importer silently
linearises or sRGB-encodes COLOR_0 on the way in, every dark value arrives a stop off and the mistake
is invisible in a thumbnail.

Probe: dec_col_probe.glb carries a known analytic ramp (r = x+0.5, g = -z_export+0.5, b = 0.5), so the
attribute after import can be compared against the position-derived truth in the same file.
"""
import bpy, os

SRC = r'F:\tmp_pwcheck\dec_col_probe.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
obj = [o for o in bpy.data.objects if o.type == 'MESH'][0]
me = obj.data
print('IMPORTED', obj.name, 'polys', len(me.polygons), 'verts', len(me.vertices))
print('COLOR attrs:', [(a.name, a.data_type, a.domain) for a in me.color_attributes])
attr = me.color_attributes[0]
vals = [tuple(d.color) for d in attr.data]
print('loops sampled', len(vals))

# Truth depends on the attribute's DOMAIN: CORNER gives per-loop UV-like data, POINT per vertex.
def truth(corner_loops):
    bad_raw, bad_lin, bsum, n = 0.0, 0.0, 0.0, 0
    if attr.domain == 'CORNER':
        items = [(me.vertices[me.loops[li].vertex_index].co, vals[li]) for li in range(len(me.loops))]
    else:
        items = [(v.co, vals[i]) for i, v in enumerate(me.vertices)]
    for co, c in items:
        r = min(1.0, max(0.0, co.x + 0.5))
        g = min(1.0, max(0.0, co.y + 0.5))
        bad_raw = max(bad_raw, abs(c[0] - r), abs(c[1] - g))
        lin = lambda q: q / 12.92 if q <= 0.04045 else ((q + 0.055) / 1.055) ** 2.4
        bad_lin = max(bad_lin, abs(c[0] - lin(r)), abs(c[1] - lin(g)))
        bsum += c[2]
        n += 1
    return bad_raw, bad_lin, bsum / n, n

bad_raw, bad_lin, bavg, n = truth(True)
print('domain %s over %d items' % (attr.domain, n))
print('max |imported - RAW ramp|   = %.5f' % bad_raw)
print('max |imported - s2l(ramp)|  = %.5f' % bad_lin)
print('mean imported B (glb says 0.5029) = %.5f' % bavg)
print('VERDICT', 'RAW-VALUES, IMPORTER IS VALUE-PRESERVING' if bad_raw < 0.02 else
      ('APPLIES sRGB->LINEAR' if bad_lin < 0.02 else 'NEITHER - inspect'))
print('IMP_COL_DONE')
