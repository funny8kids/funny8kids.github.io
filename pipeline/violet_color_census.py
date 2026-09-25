import bpy, os, sys

"""Where does the navy go?

The band report in violet_weld_cut.py samples z-bands AFTER fit(), and fit() re-origins each emitted
mesh by its own bounding box. A cut that leaves a spike below the hem therefore slides every band onto
different anatomy, so "arm navy 70% vs 31%" across two cuts is not an apples-to-apples reading. This
probe measures whole-mesh colour shares, which no amount of re-scaling can move:

  navy   : B > R + 0.03   (her jacket, the single most identifying colour she has)
  skin   : R > B + 0.05 and R > 0.55
  dark   : luma < 0.20    (gloves, hair outline, boots)
  bright : luma > 0.75    (chemise, paper, face highlight)

If a cut keeps its navy *fraction* but loses navy *mean*, the paint was averaged away. If the
fraction itself falls, the outer jacket shell was collapsed away and no recolouring can bring it back
- that would be a geometry loss, and the fix belongs in what is protected, not in what is painted.
"""

FILES = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
import mathutils
print('kdtree module members:', [m for m in dir(mathutils.kdtree) if not m.startswith('_')])

for path in FILES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not ms:
        print('%-46s EMPTY MESH (nothing to measure)' % os.path.basename(path))
        continue
    me = ms[0].data
    ca = me.color_attributes[0]
    n = navy = bright = dark = 0
    sr = sb = 0.0
    for p in me.polygons:
        c = ca.data[p.loop_start].color
        r, g, b = c[0], c[1], c[2]
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        n += 1
        if b > r + 0.03:
            navy += 1
            sr += r
            sb += b
        if luma > 0.75:
            bright += 1
        if luma < 0.20:
            dark += 1
    print('%-46s tris=%-9d navy %5.2f%% (mean R %.3f B %.3f, %s) bright %5.2f%% dark %5.2f%%'
          % (os.path.basename(path), n, 100.0 * navy / max(1, n),
             sr / max(1, navy), sb / max(1, navy), ca.data_type,
             100.0 * bright / max(1, n), 100.0 * dark / max(1, n)))
print('COLOR_CENSUS_OK')
