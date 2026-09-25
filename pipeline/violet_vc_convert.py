"""Collapse the colour-baked source to the hero budget, letting the mesh do the smoothing.

Input is F:\\tmp_pwcheck\\VioletFull_vc.glb, produced by violet_tri_colour.cjs: her paint already sits
on the 1.47 M-triangle source, one area-weighted colour per triangle, sampled strictly inside each
triangle's own UV island. That is the only read the delivered atlas permits — its islands overlap, so
any UV neighbourhood averages foreign surface, which is what turned her navy jacket warm grey in the
disc sampler.

What this script adds is the part that makes the bake survive: Blender's collapse INTERPOLATES the
colour attribute (pipeline/dec_col_probe.py reproduces a known analytic ramp through a 20x collapse,
and pipeline/imp_col_probe.py + F:/tmp_pwcheck/enc_probe.cjs show both directions of the glTF round
trip are value-preserving). So a surviving vertex ends up painted with the mean of exactly the surface
area it stands for, and the illustrator's shading stays where she painted it because nothing re-reads
the atlas after the collapse.

Same head guard as pipeline/violet_convert.py, same body axis, same re-fit. Colour is reported in the
frame the costume lives in: Blender z is her height and -y is her front.
"""
import bpy, os
from mathutils import Vector

SRC = os.environ.get('VN_SRC', r'F:\tmp_pwcheck\VioletFull_vc.glb')
OUTDIR = os.environ.get('VN_OUTDIR', r'F:\tmp_pwcheck')
TARGETS = [int(x) for x in os.environ.get('VN_TRIS', '200000').split(',')]
HEIGHT = float(os.environ.get('VN_HEIGHT', '1.652'))
SHOTS = os.environ.get('VN_SHOTS', r'F:\tmp_pwcheck\shots')
GUARD_FS = [float(x) for x in os.environ.get('VN_GUARD_F', '0.8').split(',')]
GUARD_Z = float(os.environ.get('VN_GUARD_Z', '0.76'))
SHOOT = os.environ.get('VN_SHOOT', '1') != '0'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(meshes) == 1, 'expected one mesh, got %d' % len(meshes)
obj = meshes[0]
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

me = obj.data
print('IMPORTED', obj.name, 'verts', len(me.vertices),
      'tris', sum(len(p.vertices) - 2 for p in me.polygons))
print('COLOR attrs', [(a.name, a.data_type, a.domain) for a in me.color_attributes])
assert len(me.color_attributes) == 1, 'the bake did not survive the import'
CA = me.color_attributes[0]
vals = [d.color[:] for d in CA.data]
print('colour distinct', len(set(tuple(round(c, 3) for c in v) for v in vals[:200000])),
      'of', len(vals), 'sampled')

mn = [min(v.co[i] for v in me.vertices) for i in range(3)]
mx = [max(v.co[i] for v in me.vertices) for i in range(3)]
size = [mx[i] - mn[i] for i in range(3)]
H = size[2]
band = [v.co for v in me.vertices if v.co.z < mn[2] + 0.15 * H]
cx = sum(c.x for c in band) / len(band)
cy = sum(c.y for c in band) / len(band)
s = HEIGHT / H
for v in me.vertices:
    v.co.x = (v.co.x - cx) * s
    v.co.y = (v.co.y - cy) * s
    v.co.z = (v.co.z - mn[2]) * s
print('BODY AXIS x=%.3f y=%.3f scale %.4f -> height %.3f' % (cx, cy, s, HEIGHT))

vg = obj.vertex_groups.new(name='keep')
vg.add([v.index for v in me.vertices], 1.0, 'REPLACE')
head_idx = [v.index for v in me.vertices if v.co.z > HEIGHT * GUARD_Z]
vg.add(head_idx, 0.0, 'REPLACE')
print('GUARD %d verts above z=%.2f at factor %s' % (len(head_idx), HEIGHT * GUARD_Z, GUARD_FS))

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'          # the site brings its own light; studio shading would
sc.display.shading.color_type = 'VERTEX'   # contaminate a hue reading, as cavity shading did before
sc.display.shading.show_cavity = False
sc.view_settings.view_transform = 'Standard'
sc.render.film_transparent = True
os.makedirs(SHOTS, exist_ok=True)
os.makedirs(OUTDIR, exist_ok=True)


def shoot(name, loc, look, lens=55, rx=900, ry=1200):
    loc = Vector(loc); look = Vector(look)
    cd = bpy.data.cameras.new(name); cd.lens = lens
    cam = bpy.data.objects.new(name, cd); sc.collection.objects.link(cam)
    sc.camera = cam; cam.location = loc
    d = look - loc
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = rx; sc.render.resolution_y = ry
    p = os.path.join(SHOTS, 'vc_%s.png' % name)
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('SHOT', p)


def report(tag, mesh, loops_or_points=True):
    """The hue report, in the frame the costume lives in. Statistics are on the PAINTED (sRGB)
    values: s2l is convex, so a few bright highlights dominate a linear mean and the same navy cloth
    reads B>R in sRGB and R>B in linear. Asserting on the linear mean is what made a correct bake
    print `sleeve is navy: false`."""
    lin = lambda q: q / 12.92 if q <= 0.04045 else ((q + 0.055) / 1.055) ** 2.4
    inv = lambda q: q * 12.92 if q <= 0.0031308 else 1.055 * q ** (1 / 2.4) - 0.055
    # CORNER domain -> one entry per loop; take the loop's own vertex for the position.
    items = [(mesh.vertices[mesh.loops[li].vertex_index].co, tuple(mesh.color_attributes[0].data[li].color))
             for li in range(len(mesh.loops))]
    B = {'head': lambda z, ax: z > 1.42,
         'arm': lambda z, ax: 1.02 < z < 1.36 and ax > 0.16,
         'torso': lambda z, ax: 1.02 < z < 1.36 and ax <= 0.16,
         'hem': lambda z, ax: z < 0.30}
    acc = {k: [0.0, 0.0, 0.0, 0, 0] for k in B}
    dash = [0, 0, 0]      # front skirt: near-black count, total, and the back panel for contrast
    dashb = [0, 0, 0]
    for co, c in items:
        z = co.z; ax = abs(co.x)
        sr, sg, sb = inv(c[0]), inv(c[1]), inv(c[2])
        luma = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb
        for k, f in B.items():
            if f(z, ax):
                t = acc[k]; t[0] += sr; t[1] += sg; t[2] += sb; t[3] += 1
                if sb > sr + 0.02: t[4] += 1
        if 0.15 < z < 0.95 and ax < 0.40:
            if co.y < -0.05:
                dash[1] += 1
                if luma < 0.12: dash[0] += 1
            elif co.y > 0.05:
                dashb[1] += 1
                if luma < 0.12: dashb[0] += 1
    print('== band report %s (%d loops)' % (tag, len(items)))
    for k in B:
        t = acc[k]
        if not t[3]:
            print('   band %-6s EMPTY' % k); continue
        print('   band %-6s n=%-8d sRGB %.3f,%.3f,%.3f  navy(B>R) %d%%' %
              (k, t[3], t[0] / t[3], t[1] / t[3], t[2] / t[3], 100 * t[4] / t[3]))
    print('   skirt front near-black %d/%d = %.2f%%   back %d/%d = %.2f%%' %
          (dash[0], dash[1], 100.0 * dash[0] / max(1, dash[1]),
           dashb[0], dashb[1], 100.0 * dashb[0] / max(1, dashb[1])))
    hd, ar = acc['head'], acc['arm']
    print('   ASSERT head warm (R>B):', hd[0] > hd[2] if hd[3] else 'EMPTY')
    print('   ASSERT sleeve navy (B>R):', ar[2] > ar[0] if ar[3] else 'EMPTY')
    print('   ASSERT sleeve mostly navy:', 'PASS' if ar[3] and 100.0 * ar[4] / ar[3] > 50 else 'FAIL')
    print('   ASSERT skirt bright (sRGB luma > 0.40):',
          'PASS' if acc['hem'][3] and (0.2126 * acc['hem'][0] + 0.7152 * acc['hem'][1] +
                                        0.0722 * acc['hem'][2]) / acc['hem'][3] > 0.40 else 'FAIL')


if SHOOT:
    for o in [x for x in sc.collection.objects if x.type == 'MESH' and x is not obj]:
        o.hide_render = True
    obj.hide_render = False
    shoot('src_full_front', (0, -HEIGHT * 1.85, HEIGHT * 0.50), Vector((0, 0, HEIGHT * 0.48)))
    shoot('src_full_head', (0, -HEIGHT * 0.52, HEIGHT * 0.925), Vector((0, 0, HEIGHT * 0.915)),
          lens=90, rx=800, ry=800)
    report('SOURCE FULL RES', me)

for T, W in [(t, w) for t in TARGETS for w in GUARD_FS]:
    dupe = obj.copy(); dupe.data = obj.data.copy()
    sc.collection.objects.link(dupe)
    dupe.hide_render = False; dupe.hide_set(False)
    obj.hide_render = True; obj.hide_set(True)
    bpy.ops.object.select_all(action='DESELECT')
    dupe.select_set(True); bpy.context.view_layer.objects.active = dupe
    ntri = sum(len(p.vertices) - 2 for p in dupe.data.polygons)
    mod = dupe.modifiers.new('dec', 'DECIMATE')
    mod.ratio = min(1.0, T / ntri)
    mod.use_collapse_triangulate = True
    dupe.vertex_groups['keep'].add(head_idx, 0.0, 'REPLACE')
    mod.vertex_group_factor = W
    mod.vertex_group = 'keep'
    mod.invert_vertex_group = False
    bpy.ops.object.modifier_apply(modifier=mod.name)
    got = sum(len(p.vertices) - 2 for p in dupe.data.polygons)
    zc = HEIGHT * GUARD_Z
    head = sum(1 for p in dupe.data.polygons if all(dupe.data.vertices[v].co.z > zc for v in p.vertices))
    print('BUDGET %d F %.2f -> tris=%d head-band %d (%.1f%%)' % (T, W, got, head, 100.0 * head / got))
    dmn = [min(v.co[i] for v in dupe.data.vertices) for i in range(3)]
    dmx = [max(v.co[i] for v in dupe.data.vertices) for i in range(3)]
    dband = [v.co for v in dupe.data.vertices if v.co.z < dmn[2] + 0.15 * (dmx[2] - dmn[2])]
    bcx = sum(c.x for c in dband) / len(dband); bcy = sum(c.y for c in dband) / len(dband)
    fs = HEIGHT / (dmx[2] - dmn[2])
    for v in dupe.data.vertices:
        v.co.x = (v.co.x - bcx) * fs; v.co.y = (v.co.y - bcy) * fs
        v.co.z = v.co.z * fs - dmn[2] * fs
    bb = [dupe.matrix_world @ Vector(c) for c in dupe.bound_box]
    lo = [min(c[i] for c in bb) for i in range(3)]; hi = [max(c[i] for c in bb) for i in range(3)]
    print('TARGET %d F %.2f -> tris=%d verts=%d w=%.3f d=%.3f h=%.3f zmin=%.4f' %
          (T, W, got, len(dupe.data.vertices), hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], lo[2]))
    print('COLOR attrs after collapse', [(a.name, a.data_type, a.domain) for a in dupe.data.color_attributes])
    assert len(dupe.data.color_attributes) == 1, 'the collapse dropped the paint'
    if SHOOT:
        shoot('t%d_f%s_front' % (got, ('%g' % W)), (0, -HEIGHT * 1.85, HEIGHT * 0.50), Vector((0, 0, HEIGHT * 0.48)))
        shoot('t%d_f%s_head' % (got, ('%g' % W)), (0, -HEIGHT * 0.52, HEIGHT * 0.925),
              Vector((0, 0, HEIGHT * 0.915)), lens=90, rx=800, ry=800)
    report('COLLAPSED %d' % got, dupe.data)
    out = os.path.join(OUTDIR, 'VioletVCfull_%d_f%s.glb' % (got, ('%g' % W)))
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_extras=False,
                              export_animations=False)
    print('WROTE', out, os.path.getsize(out), 'bytes')
    bpy.data.objects.remove(dupe, do_unlink=True)

print('VC_CONVERT_OK')
