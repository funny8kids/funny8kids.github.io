"""Cut the delivered hero to the panel's <=30k ceiling without turning her dress into confetti.

Why a second script: pipeline/violet_vc_convert.py collapses edges, and at 36,241 triangles the result
is shards (F:/tmp_pwcheck/shots/vc_t36241_f0.8_front.png). The reason is in its own print — 118,559
vertices for 36,241 triangles. Her source is a shell soup: the mesh conversion left many overlapping
layers over the same surface, so most of the vertex budget is duplicate geometry, and an edge-collapse
spends the triangle allowance merging layers instead of flattening the visible surface.

Two operations fix that in order:
  1. weld coincident vertices (remove doubles) — deletes the duplicate layers that cost bytes but
     paint no pixels (measured: 1,076,841 -> 728,705 verts for the same 1.47 M triangles);
  2. spend the remaining allowance where the artwork is. A plain proportional cut to 30 k gives a
     dress that finally reads as a dress (shots/weld_collapse_welded.png) and a BLANK FACE, because
     her eyes and lashes are baked vertex colour, not geometry — collapse averages the paint away.
     So each candidate keep-region (face / head / bust) is censused on the welded base, hard-held at
     weight 0 in the decimate vertex group, and the collapse rate is SOLVED from that census:
     ratio = (ceiling - kept) / (base - kept). The ceiling then bounds the body, not the face.

Colour is the thing to protect: her paint is CORNER-domain BYTE_COLOR baked one-value-per-triangle
(pipeline/vc_bake_source.cjs), and the atlas forbids any UV-neighbourhood read (Violet atlas mosaic
law). So every stage re-prints the band report from violet_vc_convert.py; a route that changes the
navy sleeve to warm grey is rejected here, not on the site.
"""
import bmesh, bpy, os
from mathutils import Vector

SRC = os.environ.get('VN_SRC', r'F:\tmp_pwcheck\VioletFull_vc.glb')
OUTDIR = os.environ.get('VN_OUTDIR', r'F:\tmp_pwcheck\weld')
SHOTS = os.environ.get('VN_SHOTS', r'F:\tmp_pwcheck\shots')
HEIGHT = float(os.environ.get('VN_HEIGHT', '1.652'))
# An empty VN_WELD means SRC is already welded, so the guard sweep below can iterate on the base file
# instead of re-running remove_doubles over 1.47 M triangles every time.
WELD = [float(x) for x in os.environ.get('VN_WELD', '0.0005').split(',') if x.strip()]
CEIL = int(os.environ.get('VN_CEIL', '30000'))


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(meshes) == 1, 'expected one mesh, got %d' % len(meshes)
obj = meshes[0]
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def stats(o):
    me = o.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    return tris, len(me.vertices)


def fit(o, scale_only=False):
    """Centre on her own body axis and re-scale to the shipped height, as violet_vc_convert does.

    `scale_only` exists because the band report below reads absolute z. Fitting a cut to its own
    bounding box re-origins it by whatever the cut's lowest vertex happens to be, and collapse leaves
    spikes below the sole, so every band slides onto different anatomy: the same "arm" band measured
    70% navy on one 30k cut and 31% on another whose jacket actually kept 4.39% of its triangles
    navy versus 4.61% on the shipped 200k (pipeline/violet_color_census.py). A cut therefore keeps the
    base's origin and only takes a uniform scale, so its numbers stay comparable to each other's.
    """
    me = o.data
    mn = [min(v.co[i] for v in me.vertices) for i in range(3)]
    mx = [max(v.co[i] for v in me.vertices) for i in range(3)]
    H = mx[2] - mn[2]
    s = HEIGHT / H
    if scale_only:
        for v in me.vertices:
            v.co.x *= s
            v.co.y *= s
            v.co.z *= s
    else:
        band = [v.co for v in me.vertices if v.co.z < mn[2] + 0.15 * H]
        cx = sum(c.x for c in band) / len(band)
        cy = sum(c.y for c in band) / len(band)
        for v in me.vertices:
            v.co.x = (v.co.x - cx) * s
            v.co.y = (v.co.y - cy) * s
            v.co.z = (v.co.z - mn[2]) * s
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = [min(c[i] for c in bb) for i in range(3)]
    hi = [max(c[i] for c in bb) for i in range(3)]
    return hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], lo[2]


def report(tag, me):
    """Band colours in sRGB — the frame the costume lives in (see violet_vc_convert.report)."""
    inv = lambda q: q * 12.92 if q <= 0.0031308 else 1.055 * q ** (1 / 2.4) - 0.055
    ca = me.color_attributes[0]
    items = [(me.vertices[me.loops[li].vertex_index].co, tuple(ca.data[li].color))
             for li in range(len(me.loops))]
    B = {'head': lambda z, ax: z > 1.42,
         'arm': lambda z, ax: 1.02 < z < 1.36 and ax > 0.16,
         'torso': lambda z, ax: 1.02 < z < 1.36 and ax <= 0.16,
         'hem': lambda z, ax: z < 0.30}
    acc = {k: [0.0, 0.0, 0.0, 0, 0] for k in B}
    for co, c in items:
        sr, sg, sb = inv(c[0]), inv(c[1]), inv(c[2])
        for k, f in B.items():
            if f(co.z, abs(co.x)):
                t = acc[k]
                t[0] += sr; t[1] += sg; t[2] += sb; t[3] += 1
                if sb > sr + 0.02:
                    t[4] += 1
    print('== band report %s (%d loops)' % (tag, len(items)))
    # Whole-mesh colour shares, which no re-origining can move. The bands above are read in absolute z
    # and are only comparable between meshes that share a frame; this line is the one that survives a
    # cut that changes her bounding box. Reference (pipeline/violet_color_census.py): the welded base
    # 1.75% navy, the shipped 200k 4.61%, the head-6k/body-24k cut 4.39%.
    gn = gb = gd = 0
    for p in me.polygons:
        c = ca.data[p.loop_start].color
        r, g, b = c[0], c[1], c[2]
        lu = 0.2126 * r + 0.7152 * g + 0.0722 * b
        gn += b > r + 0.03
        gb += lu > 0.75
        gd += lu < 0.20
    np_ = max(1, len(me.polygons))
    print('   census %-14s tris=%-9d navy %5.2f%%  bright %5.2f%%  dark %5.2f%%'
          % (tag, np_, 100.0 * gn / np_, 100.0 * gb / np_, 100.0 * gd / np_))
    for k in B:
        t = acc[k]
        if not t[3]:
            print('   band %-6s EMPTY' % k)
            continue
        print('   band %-6s n=%-8d sRGB %.3f,%.3f,%.3f  navy(B>R) %d%%' %
              (k, t[3], t[0] / t[3], t[1] / t[3], t[2] / t[3], 100 * t[4] / t[3]))
    hd, ar = acc['head'], acc['arm']
    print('   ASSERT head warm (R>B):', hd[0] > hd[2] if hd[3] else 'EMPTY')
    print('   ASSERT sleeve navy (B>R):', ar[2] > ar[0] if ar[3] else 'EMPTY')
    print('   ASSERT sleeve mostly navy:', 'PASS' if ar[3] and 100.0 * ar[4] / ar[3] > 50 else 'FAIL')


sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
sc.display.shading.color_type = 'VERTEX'
sc.display.shading.show_cavity = False
sc.view_settings.view_transform = 'Standard'
sc.render.film_transparent = True
os.makedirs(SHOTS, exist_ok=True)
os.makedirs(OUTDIR, exist_ok=True)


def shoot(name, rx=900, ry=1200, close=False):
    cd = bpy.data.cameras.new(name)
    cd.lens = 90 if close else 55
    cam = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    if close:
        loc = Vector((0, -HEIGHT * 0.52, HEIGHT * 0.925))
        look = Vector((0, 0, HEIGHT * 0.915))
        rx = ry = 800
    else:
        loc = Vector((0, -HEIGHT * 1.85, HEIGHT * 0.50))
        look = Vector((0, 0, HEIGHT * 0.48))
    cam.location = loc
    cam.rotation_euler = (look - loc).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = rx
    sc.render.resolution_y = ry
    p = os.path.join(SHOTS, 'weld_%s.png' % name)
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('SHOT', p)


def dup(src):
    o = src.copy()
    o.data = src.data.copy()
    sc.collection.objects.link(o)
    o.hide_render = False
    o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    return o


def hide(o):
    o.hide_render = True
    o.hide_set(True)


t0, v0 = stats(obj)
print('SOURCE tris=%d verts=%d  verts/tris=%.2f' % (t0, v0, v0 / t0))
report('SOURCE', obj.data)

# --- stage 1: weld coincident layers, measured rather than assumed -------------------------------
if WELD:
    welded = {}
    for eps in WELD:
        o = dup(obj)
        before = stats(o)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=eps)
        bpy.ops.object.mode_set(mode='OBJECT')
        after = stats(o)
        w, d, h, zmin = fit(o)
        print('WELD eps=%.4f -> tris %d->%d verts %d->%d (%.1f%% of verts gone) w=%.3f d=%.3f h=%.3f zmin=%.4f'
              % (eps, before[0], after[0], before[1], after[1], 100.0 * (1 - after[1] / before[1]), w, d, h, zmin))
        report('WELD %.4f' % eps, o.data)
        welded[eps] = o
    best = min(welded.values(), key=lambda o: stats(o)[1])  # the weld that deleted the most duplicate skin
    hide(obj)
    for o in welded.values():
        if o is not best:
            hide(o)
    base = os.path.join(OUTDIR, 'VioletWelded_base.glb')
    bpy.ops.object.select_all(action='DESELECT')
    best.select_set(True)
    bpy.context.view_layer.objects.active = best
    bpy.ops.export_scene.gltf(filepath=base, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_extras=False,
                              export_animations=False)
    print('BASE WELD -> tris=%d verts=%d  saved %s (%d bytes)' % ((stats(best) + (base, os.path.getsize(base)))))
else:
    fit(obj)
    best = obj
    print('BASE given (VN_WELD empty) -> tris=%d verts=%d' % stats(best))

bt, bv = stats(best)


def emit(o, tag):
    # One subject per exposure: an emitted cut from a previous allowance is still in the scene, and a
    # render that quietly contains two of her grades the wrong mesh.
    for x in sc.collection.objects:
        if x.type == 'MESH' and x is not o and not x.hide_render:
            hide(x)
    t, v = stats(o)
    # A 0-triangle subject used to flow through here and still print WELD_CUT_OK at the end of the
    # run: the whole sweep wrote four 176-byte GLBs and "succeeded". An empty mesh is not a gradeable
    # cut, so stop the run rather than let the sentinel vouch for nothing.
    if t == 0:
        raise RuntimeError('%s produced an empty mesh — the split or the decimation deleted her '
                           'entirely, so nothing downstream of this line can be trusted' % tag)
    head = sum(1 for p in o.data.polygons if HEAD_IS(p.center.z, p.center.y))
    print('%s -> tris=%d verts=%d head-band %d (%.1f%%) verts/tris=%.2f'
          % (tag, t, v, head, 100.0 * head / max(1, t), v / max(1, t)))
    shoot(tag)
    shoot(tag + '_head', close=True)
    report(tag, o.data)
    out = os.path.join(OUTDIR, 'VioletWeld_%s_%d.glb' % (tag, t))
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_extras=False,
                              export_animations=False)
    sz = os.path.getsize(out)
    if sz < 100000:
        raise RuntimeError('%s exported %d bytes for %d triangles: the exporter wrote a shell, not '
                           'the subject (an earlier run of this script exported 176-byte GLBs and '
                           'still reported OK)' % (tag, sz, t))
    print('WROTE', out, sz, 'bytes',
          'under-ceiling' if t <= CEIL else 'OVER-CEILING %d' % CEIL)
    return t, sz


# --- stage 2: give the head its own allowance, then cut the body to what is left -----------------
# A vertex-group guard cannot do this: protection only ever slows a region down, and the head is
# 24,867 triangles of a 1,467,115 base, so any proportional rate that leaves the face readable takes
# the total over the ceiling. So split by polygon centre, cut each part against its own allowance,
# join, and weld the seam back.
Z_HEAD = float(os.environ.get('VN_ZHEAD', '1.30'))
HEAD_IS = lambda z, y: z > Z_HEAD
# (head allowance : total ceiling) pairs. A single ceiling is no longer enough to decide this: the
# 30 k cut graded green on every presence bar yet the site-camera crop shows the skirt collapsed into
# paper facets and the face gone muddy, so the ladder has to be shot and judged, not assumed. The head
# share stays at ~20 % of the total because that is the ratio the 30 k cut was built with.
PLAN = [tuple(int(y) for y in x.split(':')) for x in
        os.environ.get('VN_PLAN', '6000:%d' % CEIL).split(',')]


def part(src, keep_fn, name):
    """One half of the figure as its own object. bmesh rather than edit-mode ops: an object-mode
    polygon.select followed by mesh.delete came back deleting every face (and leaving 1.45 M loose
    vertices behind), which is the kind of failure that reads as "the split produced nothing"."""
    me = src.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    # Test bmesh's own face centres rather than assuming bm.faces[i] lines up with me.polygons[i]:
    # the two orders agreeing is an unverified import detail, and if they ever disagree the "head half"
    # silently becomes a random slice of her. The kept count is printed against the polygon-centre
    # census above so a mismatch shows up as two different numbers, not as a plausible-looking mesh.
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if not keep_fn(c.z, c.y):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES_ONLY')
    print('   part %s kept %d faces of %d' % (name, len(bm.faces), len(bm.faces) + len(kill)))
    # FACES leaves the deleted faces' vertices behind as loose geometry; a half with 700 k unused
    # vertices costs bytes and paints nothing, which is the whole thing this script is trying to remove.
    # (Blender 5.x BMVert has no `.link` — an unlinked vert is one with no faces on it.)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.hide_render = False
    o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    return o


def cut(o, allow):
    """Collapse `o` down to `allow` triangles, and prove it got there.

    Two measured reasons this cannot be one blind operator call:
      - modifier_apply acts on the ACTIVE object and looks the modifier up by name, so leaving the
        body active while cutting the head applies the wrong mesh. The previous sweep printed
        `head 24851->24851` for all three allowances: the head was never cut and every "head
        allowance" in that log is really a body-only cut.
      - collapse on a part with an open boundary at the split seam cannot reach its ratio. Measured:
        the body asked for 24000 and delivered 33009 (1.375x), because the boundary ring has no
        edges to collapse. So keep passing until the allowance is met, and report the overshoot
        instead of quietly shipping the overage.
    """
    t = stats(o)[0]
    passes = 0
    first_after = None
    while passes < 4:
        cur = stats(o)[0]
        if cur <= allow:
            break
        ratio = max(0.0, min(1.0, allow / max(1, cur)))
        mod = o.modifiers.new('cut', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        after = stats(o)[0]
        if passes == 0:
            first_after = after
        passes += 1
        if after == cur:
            raise RuntimeError('cut on %s stalled at %d tris under allowance %d (ratio %.4f): '
                               'the mesh cannot be collapsed further, so the ceiling is not '
                               'reachable for this part' % (o.name, cur, allow, ratio))
    after = stats(o)[0]
    print('   cut %s %d->%d (allow %d, %d pass%s%s)'
          % (o.name, t, after, allow, passes, '' if passes == 1 else 'es',
             '' if first_after is None else ', single pass would leave %d (%.3fx the allowance)'
             % (first_after, first_after / max(1, allow))))
    return t


head_tris = sum(1 for p in best.data.polygons if HEAD_IS(p.center.z, p.center.y))
print('SPLIT census: head(z>%.2f)=%d of base=%d (%.1f%%)' % (Z_HEAD, head_tris, bt, 100.0 * head_tris / bt))

LANDED = []
for ha, ceil in PLAN:
    tag = 'h%dc%d' % (ha, ceil)
    body_allow = ceil - ha
    if ha >= ceil or head_tris == 0:
        print('ALLOW %d impossible under ceiling %d' % (ha, ceil))
        continue
    h = part(best, HEAD_IS, 'head_half')
    b = part(best, lambda z, y: not HEAD_IS(z, y), 'body_half')
    ht0 = cut(h, ha)
    bt0 = cut(b, body_allow)
    ht1, hv1 = stats(h)
    bt1 = stats(b)[0]          # before the join, so this number is really the body alone
    bpy.ops.object.select_all(action='DESELECT')
    h.select_set(True); b.select_set(True)
    bpy.context.view_layer.objects.active = b
    bpy.ops.object.join()
    fit(b, scale_only=True)
    print('   parts: head %d->%d (allow %d), body %d->%d (allow %d), joined %d'
          % (ht0, ht1, ha, bt0, bt1, body_allow, stats(b)[0]))
    if stats(b)[0] > ceil:
        print('   SKIP %s: joined %d tris is over ceiling %d (the body floors at %d, so this '
              'head allowance cannot be paid for)' % (tag, stats(b)[0], ceil, bt1))
        continue
    LANDED.append((tag, emit(b, tag)))
    # Each plan copies the whole 1.47 M-triangle base twice (head half + body half). Left in the scene,
    # a four-plan ladder holds four of those copies live and the run dies in memory rather than
    # printing a verdict — and a crash mid-sweep is how a half-populated ladder gets read as a
    # complete one. The base itself stays; it is what the next plan splits.
    for ob in [o for o in sc.collection.objects if o is not best]:
        bpy.data.objects.remove(ob, do_unlink=True)

print('WELD_CUT_OK' if LANDED else 'NO_CUT_LANDED under ceiling %d: every allowance failed' % CEIL)
if not LANDED:
    raise RuntimeError('no allowance produced a non-empty cut within the ceiling')
