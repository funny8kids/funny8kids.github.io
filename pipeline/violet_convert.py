"""Turn the delivered 92 MB / 1.47 M-tri conversion file into a hero asset the garden can carry.

Three hard facts make "drop the file in" impossible, and this script answers each one:
  * 1,468,424 tris against a scene whose worst measured build is 1,331,856.
  * three 4096^2 PNGs (20.9 + 16.2 + 1.5 MB) inside one GLB.
  * POSITION/NORMAL/TEXCOORD only — no COLOR_0, and `vertexColors:true` on a mesh with no colour
    attribute renders black (slice.js:1635).

So: decimate to a named tri budget, rescale to the figure height the reveal shader already assumes,
and put her on her own body axis with feet on z=0.

THIS SCRIPT IS THE GEOMETRY-STAGE PREDECESSOR, NOT THE SHIPPED ROUTE. It used to hand her colour to
F:\tmp_pwcheck\violet_vertex_colour.cjs, which read the atlas through a UV neighbourhood — a law that
cannot hold, because the delivered atlas is a per-triangle mosaic whose islands OVERLAP, so a texel
adjacent in UV is not adjacent on her body (measured: on the build with the baked-shadow lift switched
completely off, the sleeve band still came out warm grey where the atlas reads navy). The shipped
three-stage route is
    node pipeline/vc_bake_source.cjs violet.glb VioletFull_vc.glb   # paint, at source resolution
    blender --background --python pipeline/violet_vc_convert.py     # collapse, head guard, refit
    npx --yes @gltf-transform/cli meshopt out.glb out.glb --quantize-color 16
and it is the one that produced assets/models/VioletHero.glb. What this file still owns is the body
axis, the height re-fit and the head-guard recipe that violet_vc_convert.py copies.

VN_TRIS is a comma list: the head that reads fine at 300 k is a shard mask at 80 k, and the only way
to find the knee is to render several budgets in one import. VN_GUARD_W is a comma list for the same
reason — the head's share of a fixed budget is a free parameter, and the face is the whole verdict.
"""
import bpy, os
from mathutils import Vector

SRC = os.environ.get('VN_SRC', r'F:\GitHub_Like\funny8kids.github.io\violet.glb')
OUTDIR = os.environ.get('VN_OUTDIR', r'F:\GitHub_Like\funny8kids.github.io\assets\models')
TEX = os.environ.get('VN_TEX', r'F:\tmp_pwcheck\violet_col_src.png')
TEXW = int(os.environ.get('VN_TEXW', '2048'))
TARGETS = [int(x) for x in os.environ.get('VN_TRIS', '200000').split(',')]
HEIGHT = float(os.environ.get('VN_HEIGHT', '1.652'))
SHOTS = os.environ.get('VN_SHOTS', r'F:\tmp_pwcheck\shots')
HEAD_GUARD = os.environ.get('VN_GUARD', '1') != '0'
GUARD_FS = [float(x) for x in os.environ.get('VN_GUARD_F', '0.9').split(',')]
GUARD_Z = float(os.environ.get('VN_GUARD_Z', '0.76'))
# A budget sweep wants numbers, not nine renders; the frames are for the one build that wins.
SHOOT = os.environ.get('VN_SHOOT', '1') != '0'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(meshes) == 1, 'expected one mesh, got %d' % len(meshes)
obj = meshes[0]
print('IMPORTED', obj.name)

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

me = obj.data
mn = [min(v.co[i] for v in me.vertices) for i in range(3)]
mx = [max(v.co[i] for v in me.vertices) for i in range(3)]
size = [mx[i] - mn[i] for i in range(3)]
print('RAW size x=%.3f y=%.3f z=%.3f feet z=%.3f  tris=%d verts=%d' %
      (*size, mn[2], sum(len(p.vertices) - 2 for p in me.polygons), len(me.vertices)))

# Blender space: +Z up, and her front is -Y (the -Y camera of violet_inspect.py landed on the face,
# the brooch and the letter). Export is Y-up, so three.js sees (x, z, -y) and she faces +Z — which is
# the same convention the procedural keeper ships under, so FIG_AT.yaw carries over unchanged.
H = size[2]
band = [v.co for v in me.vertices if v.co.z < mn[2] + 0.15 * H]
cx = sum(c.x for c in band) / len(band)
cy = sum(c.y for c in band) / len(band)
s = HEIGHT / H
for v in me.vertices:
    v.co.x = (v.co.x - cx) * s
    v.co.y = (v.co.y - cy) * s
    v.co.z = (v.co.z - mn[2]) * s
print('BODY AXIS x=%.3f y=%.3f   scale %.4f -> height %.3f' % (cx, cy, s, HEIGHT))

# The head is 1.9 % of her triangles but 100 % of her identity. Uniform collapse spends the budget
# where the triangles already are — the skirt — and pays for it by turning a face into a blank mask,
# which is the exact defect that got the procedural keeper the verdict "太丑了".
#
# Two things about Blender's Decimate vertex group had to be measured before this could work, and both
# contradict the obvious reading:
#   * weights are CLAMPED to 0..1, so "give the head density 6.0" silently means 1.0 — a 6/20/50 sweep
#     printed three byte-identical GLBs.
#   * the weight is a multiplier on the collapse COST, not on the local ratio, and only through
#     `vertex_group_factor`, whose default of 0 disables the group entirely. So the head goes to 0.0
#     (cost stays whole) and the dress to 1.0 (cost drops to 1-factor and it collapses first).
vg = None
if HEAD_GUARD:
    vg = obj.vertex_groups.new(name='keep')
    # Every vertex has to be named, because an unnamed vertex reads as weight 0 — which is exactly the
    # protected value, so a group that lists only the dress leaves the head alone AND the head's own
    # triangles intact while the modifier still "succeeds" at the requested total.
    vg.add([v.index for v in me.vertices], 1.0, 'REPLACE')
    head_idx = [v.index for v in me.vertices if v.co.z > HEIGHT * GUARD_Z]
    vg.add(head_idx, 0.0, 'REPLACE')
    zc = HEIGHT * GUARD_Z
    src_head = sum(1 for p in me.polygons if all(me.vertices[v].co.z > zc for v in p.vertices))
    print('GUARD %d verts above z=%.2f protected at factor %s; rest at 1.0' %
          (len(head_idx), zc, GUARD_FS))
    # The ceiling on what any guard can buy: the head's own share of the source. An eye that spans
    # four source triangles cannot be carried by three, whatever factor the group is given.
    print('SOURCE head-band tris=%d (%.1f%% of %d)' %
          (src_head, 100.0 * src_head / sum(len(p.vertices) - 2 for p in me.polygons),
           sum(len(p.vertices) - 2 for p in me.polygons)))

img = None
for mat in me.materials:
    if not mat or not mat.node_tree:
        continue
    for nd in mat.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image:
            im = nd.image
            low = im.name.lower()
            if 'normal' in low or 'roughness' in low or 'metallic' in low:
                continue
            if img is None or im.size[0] > img.size[0]:
                img = im
assert img, 'no base colour image found'
print('TEX source %s %dx%d' % (img.name, img.size[0], img.size[1]))
if not img.has_data:
    img.pack()
img.scale(TEXW, TEXW)
img.filepath_raw = TEX
img.file_format = 'PNG'
img.save()
print('TEX written %s %dx%d' % (TEX, img.size[0], img.size[1]))

# ---- render rig: Workbench + TEXTURE, so the face is graded as the shipped thing, not as clay
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.view_settings.view_transform = 'Standard'
sc.render.film_transparent = True
os.makedirs(SHOTS, exist_ok=True)
os.makedirs(OUTDIR, exist_ok=True)
ctr = Vector((0, 0, HEIGHT * 0.5))


def shoot(name, loc, look, lens=55, rx=900, ry=1200):
    loc = Vector(loc); look = Vector(look)
    cd = bpy.data.cameras.new(name); cd.lens = lens
    cam = bpy.data.objects.new(name, cd); sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = loc
    d = look - loc
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = rx; sc.render.resolution_y = ry
    p = os.path.join(SHOTS, 'violet_%s.png' % name)
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('SHOT', p)


def render_all(tag):
    shoot('%s_front' % tag, (0, -HEIGHT * 1.85, HEIGHT * 0.50), Vector((0, 0, HEIGHT * 0.48)))
    shoot('%s_head' % tag, (0, -HEIGHT * 0.52, HEIGHT * 0.925), Vector((0, 0, HEIGHT * 0.915)), lens=90, rx=800, ry=800)
    shoot('%s_three' % tag, (HEIGHT * 1.05, -HEIGHT * 1.25, HEIGHT * 0.55), Vector((0, 0, HEIGHT * 0.46)))


for T, W in [(t, w) for t in TARGETS for w in GUARD_FS]:
    dupe = obj.copy()
    dupe.data = obj.data.copy()
    sc.collection.objects.link(dupe)
    # obj.copy() carries hide_render with it, and the previous pass switched the source off for the
    # render. Without this the second budget exports 19 MB of correct geometry and renders a blank
    # frame, which reads as "400 k looks worse than 200 k".
    dupe.hide_render = False
    dupe.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    dupe.select_set(True)
    bpy.context.view_layer.objects.active = dupe
    ntri = sum(len(p.vertices) - 2 for p in dupe.data.polygons)
    ratio = min(1.0, T / ntri)
    mod = dupe.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    if vg:
        # Stamp the weight on the DUPE's group, not the source's. Vertex weights live in the mesh data
        # and `dupe.data = obj.data.copy()` gave it its own copy, so writing through `vg` leaves the
        # modifier reading the weight that was set before the copy existed — which is why a 6/20/50
        # sweep printed three identical 3,124-tri heads and three byte-identical GLBs.
        dupe.vertex_groups[vg.name].add(head_idx, 0.0, 'REPLACE')
        mod.vertex_group_factor = W
        mod.vertex_group = vg.name
        mod.invert_vertex_group = False
    bpy.ops.object.modifier_apply(modifier=mod.name)
    got = sum(len(p.vertices) - 2 for p in dupe.data.polygons)
    # Did the guard actually spend the budget where it was aimed? "tris=200000" says nothing about
    # whether the head got its share, and the head is the whole verdict.
    zc = HEIGHT * GUARD_Z
    head = sum(1 for p in dupe.data.polygons if all(dupe.data.vertices[v].co.z > zc for v in p.vertices))
    print('BUDGET %d F %.2f -> tris=%d  head-band %d (%.1f%% of budget, %.1f%% of source)' %
          (T, W, got, head, 100.0 * head / got, 100.0 * head / ntri))
    # Collapse deletes the extreme vertices, so the silhouette shrinks by a few millimetres on every
    # budget — 1.649 against the 1.652 the reveal shader divides the ink-rise by. Re-fit after
    # decimating, on the same body axis, or the two budgets are not even the same height.
    dmn = [min(v.co[i] for v in dupe.data.vertices) for i in range(3)]
    dmx = [max(v.co[i] for v in dupe.data.vertices) for i in range(3)]
    dband = [v.co for v in dupe.data.vertices if v.co.z < dmn[2] + 0.15 * (dmx[2] - dmn[2])]
    bcx = sum(c.x for c in dband) / len(dband)
    bcy = sum(c.y for c in dband) / len(dband)
    fs = HEIGHT / (dmx[2] - dmn[2])
    for v in dupe.data.vertices:
        v.co.x = (v.co.x - bcx) * fs
        v.co.y = (v.co.y - bcy) * fs
        v.co.z = v.co.z * fs - dmn[2] * fs
    bb = [dupe.matrix_world @ Vector(c) for c in dupe.bound_box]
    lo = [min(c[i] for c in bb) for i in range(3)]
    hi = [max(c[i] for c in bb) for i in range(3)]
    print('TARGET %d F %.2f -> tris=%d verts=%d  w=%.3f d=%.3f h=%.3f zmin=%.4f' %
          (T, W, got, len(dupe.data.vertices), hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], lo[2]))
    for o in [x for x in sc.collection.objects if x.type == 'MESH' and x is not dupe]:
        o.hide_render = True; o.hide_set(True)
    if SHOOT:
        render_all('t%d_f%s' % (got, ('%g'%W)))
        # geometry-only pass too: the texture hides a broken silhouette, and the silhouette is what the
        # composition gates measure.
        sc.display.shading.color_type = 'SINGLE'
        shoot('t%d_f%s_clay' % (got, ('%g'%W)), (0, -HEIGHT * 1.85, HEIGHT * 0.50), Vector((0, 0, HEIGHT * 0.48)))
        sc.display.shading.color_type = 'TEXTURE'
    for slot in range(len(dupe.data.materials)):
        dupe.data.materials[slot] = None
    out = os.path.join(OUTDIR, 'VioletFigure_%d_f%s.glb' % (got, ('%g'%W)))
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_extras=False,
                              export_animations=False)
    print('WROTE', out, os.path.getsize(out), 'bytes')
    bpy.data.objects.remove(dupe, do_unlink=True)
    obj.hide_set(False)

print('CONVERT_OK')
