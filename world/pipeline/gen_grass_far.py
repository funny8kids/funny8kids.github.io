# Far tier of the sward: the SAME blade recipe as Grass_field.glb, sampled coarser.
#
# Why: hw_frame_cost prices the shipped desktop frame at 22.6 ms on this machine's Radeon 610M (and
# 1.2-1.9 ms on its RTX 5060), and fill_vs_geo says 924,000 of those 2.78 M triangles are 4200 tufts
# of a 220-tri plant — the second-heaviest thing in the garden. The site's own answer to that has
# never been to cut plants: Violet_far.glb is the same flower as Violet_field at a coarser grid, and
# this file is that doctrine applied to the grass, one step further down.
#
# What stays: 11 blades per tuft (the silhouette density IS the meadow), the width segment count nV=2
# (the cross-blade bend is what stops a tuft reading as a card), the same seed, the same colony tone
# attribute, no crown — exactly what the field tier already drops at distance.
# What goes: the length sampling along each blade, nU 5 -> 3. A far tuft covers a dozen pixels; the
# two spans removed there are the sub-pixel tip curl.
#
# The driver block of gen_undergrowth.py is NOT executed, on purpose: re-running it would overwrite
# the meshopt-compressed hero GLBs with uncompressed builds (compress.sh works in place).
import os, sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen_undergrowth.py')
src = open(SRC, encoding='utf-8').read()
cut = src.index("bpy.ops.object.select_all(action='SELECT')")
g = {'__name__': 'grass_far', '__file__': SRC}
exec(compile(src[:cut], SRC, 'exec'), g)

make_tuft, stand_up, export_glb, OUT = g['make_tuft'], g['stand_up'], g['export_glb'], g['OUT']

import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# seed=11 and N=11 are the field tier's own numbers, so this is the same tuft, not a relative.
ob = make_tuft("Grass_field_far", seed=11, N=11, nU=3, nV=2, crown=False)
stand_up(ob)
me = ob.data
me.calc_loop_triangles()
tris = len(me.loop_triangles)
out = os.path.join(OUT, 'Grass_field_far.glb')
export_glb(ob, out)
print('FAR tris=%d verts=%d bytes=%d colours=%s' % (
    tris, len(me.vertices), os.path.getsize(out), [l.name for l in me.color_attributes]))
print('field tier for reference: Grass_field.glb = 220 tris (N=11, nU=5, nV=2)')
