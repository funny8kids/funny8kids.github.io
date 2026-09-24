# Third tier of the meadow violet: the SAME recipe as Violet_field.glb, sampled coarser.
# The site's own LOD doctrine (Grass_Tuft 7280 verts vs Grass_field 440 verts) applied one step
# further down, because the open field is 1200 instances of a 1443-tri plant and it is 57% of the
# worst desktop frame. Nothing is deleted: flowers past the walk's near band keep the same petal
# silhouette at a coarser grid; hero-tier plants (beds, crown, visitor blooms) keep Violet_field.
#
# The generator's driver block is NOT executed, on purpose: re-running gen_violet_hf.py overwrites
# the meshopt-compressed hero GLBs with uncompressed builds (compress.sh works in place).
import os, sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen_violet_hf.py')
src = open(SRC, encoding='utf-8').read()
cut = src.index('# clean scene')
g = {'__name__': 'violet_far', '__file__': SRC}
exec(compile(src[:cut], SRC, 'exec'), g)

make_flower, export_glb, Matrix, OUT = g['make_flower'], g['export_glb'], g['Matrix'], g['OUT']

# Violet_field is authored nU=10, nV=12, eS=6, stem_segs=8. Dropping to 6/7/4/5 keeps five petals,
# the cup, the nod and the stem curve — at the far band's on-screen size (a bloom is under ~24 px)
# the removed rows are sub-pixel.
ob = make_flower("Violet_far", L=0.30, open_t=1.0, beard=False, stem_h=0.50,
                 nU=6, nV=7, eS=4, stem_segs=5)
ob.data.transform(Matrix.Translation((0, 0.52, 0)))   # base on the ground, as the field tier does
me = ob.data
me.calc_loop_triangles()
tris = len(me.loop_triangles)
colour_layers = [l.name for l in me.color_attributes]
out = os.path.join(OUT, 'Violet_far.glb')
export_glb(ob, out)
print('FAR tris=%d verts=%d colours=%s bytes=%d' % (
    tris, len(me.vertices), colour_layers, os.path.getsize(out)))
print('field tier for reference: Violet_field.glb ~1443 tris / 2908 verts')
