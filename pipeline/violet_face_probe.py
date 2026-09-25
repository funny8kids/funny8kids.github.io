"""Where are her painted features, in her own metres? Measured, not guessed.

The first face-guard region (z > 1.40 and y < -0.02, pipeline/violet_weld_cut.py) protected 17,063
triangles and still produced a blank mask: the loops in front of the face at that height are her
BANGS, and the eyes sit behind them. Since her eyes and lashes are baked vertex colour rather than
geometry, a keep-region has to be derived from the paint itself.

So this probe reads the welded base and answers three questions with numbers:
  - which way is her front (the sign of y the face features live on);
  - the bounding box of the blue-dominant loops (iris colour) above the jaw;
  - the bounding box of the dark loops (lashes, pupils, mouth line) in the same band.
Those boxes become GUARDS['face'] in the cut script.
"""
import bpy, os

SRC = os.environ.get('VN_SRC', r'F:\tmp_pwcheck\weld\VioletWelded_base.glb')
Z_JAW = float(os.environ.get('VN_ZJAW', '1.30'))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(meshes) == 1, 'expected one mesh, got %d' % len(meshes)
me = meshes[0].data
ca = me.color_attributes[0]
print('BASE tris=%d verts=%d colour=%s' %
      (sum(len(p.vertices) - 2 for p in me.polygons), len(me.vertices),
       [(a.name, a.data_type, a.domain) for a in me.color_attributes]))

inv = lambda q: q * 12.92 if q <= 0.0031308 else 1.055 * q ** (1 / 2.4) - 0.055
loops = [(me.vertices[me.loops[li].vertex_index].co,
          tuple(inv(c) for c in ca.data[li].color)) for li in range(len(me.loops))]
print('LOOPS %d' % len(loops))


def box(tag, sel):
    if not sel:
        print('BOX %-10s EMPTY' % tag)
        return None
    xs = [c[0] for c in sel]; ys = [c[1] for c in sel]; zs = [c[2] for c in sel]
    print('BOX %-10s n=%-7d x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f' %
          (tag, len(sel), min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


head = [co for co, c in loops if co.z > Z_JAW]
box('head', head)
blue = [co for co, c in loops if co.z > Z_JAW and c[2] > c[0] + 0.10 and c[2] > 0.30]
box('blue-eye', blue)
dark = [co for co, c in loops if co.z > Z_JAW and (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) < 0.22]
box('dark-line', dark)
warm = [co for co, c in loops if co.z > Z_JAW and c[0] > c[2] + 0.06 and c[0] > 0.55]
box('skin', warm)
red = [co for co, c in loops if c[0] > c[1] + 0.25 and c[0] > c[2] + 0.25]
box('red-ornament', red)

# The front is whichever side of y the eye paint is skewed to; report both halves of the head too,
# because a symmetric answer here would mean the box cannot tell front from back.
for sgn, nm in ((-1, 'y<0'), (1, 'y>0')):
    box('head-' + nm, [co for co in head if sgn * co.y > 0.02])
print('FACE_PROBE_OK')
