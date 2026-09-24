# 字体挤出成茎 — extruded letterforms standing on curved stems rooted in soil.
# headless: blender --background --python gen_type_stems.py -- GARDEN out.glb
import bpy, bmesh, math, sys, random
from mathutils import Vector

args = [a for a in sys.argv[sys.argv.index('--') + 1:]] if '--' in sys.argv else []
WORD = (args[0] if args else "VIOLET GARDEN").upper()
OUT = args[1] if len(args) > 1 else r"F:\GitHub_Like\funny8kids.github.io\world\assets\models\Type_Garden.glb"
TTF = r"F:\tmp_pwcheck\ClashDisplay-600.ttf"
random.seed(7)

# palette authored in sRGB floats, converted to linear on the way out (see s2l below).
# The exporter writes a "Color" corner attribute as raw bytes — round(v * 255), no transfer
# function — and three.js reads vertex colour as linear with no decode. So an sRGB float authored
# here arrives in the shader as a linear value that is up to eight times too bright, and an
# ink-black flank lands in the same mid-tone band as a paper face. That is the whole reason the
# headline kept rendering as bronze: not the lamp, the transfer function.
IVORY   = (0.970, 0.952, 0.932)   # near-neutral paper: the cool key puts the cream in it
IVORY_D = (0.075, 0.055, 0.105)   # the extruded flank of a glyph: ink-violet shadow, not dirt
MOSS    = (0.180, 0.330, 0.200)
VIOLET  = (0.420, 0.230, 0.500)   # petiole plum, not a flower petal
LEAF    = (0.230, 0.450, 0.250)
LEAF_T  = (0.520, 0.660, 0.340)
SOIL    = (0.150, 0.115, 0.110)   # the tilth in shadow: warm, and a shade under the turf line
SOIL_HI = (0.440, 0.340, 0.330)   # its crest catches the lamp — earth, not the rubble it read as
BUD     = (0.610, 0.310, 0.750)   # a violet that has not opened yet

coll = bpy.context.collection


def s2l(c):
    """sRGB -> linear per channel. Blending stays in sRGB above (no muddy midpoints); this is the
    last thing before the byte, so the value that reaches the shader is the value that was meant."""
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mix(a, b, t):
    return tuple(x * t + y * (1 - t) for x, y in zip(a, b))


def paint(ob, top, side, z0, z1):
    """corner colours: blend side->top by world height"""
    me = ob.data
    ca = me.color_attributes.get("Color") or me.color_attributes.new("Color", 'FLOAT_COLOR', 'CORNER')
    mw = ob.matrix_world
    for poly in me.polygons:
        zs = [(mw @ me.vertices[li].co).z for li in poly.vertices]
        t = max(0.0, min(1.0, (sum(zs) / len(zs) - z0) / max(1e-6, z1 - z0)))
        c = s2l(mix(top, side, t))
        for li in poly.loop_indices:
            ca.data[li].color = (c[0], c[1], c[2], 1.0)


def paint_glyph(ob, face, flank):
    """a glyph's face catches the sun and its extruded flank stays in shadow: paper, not concrete.
    Painted per letter, before the join, so each glyph shades against its own baseline."""
    me = ob.data
    ca = me.color_attributes.get("Color") or me.color_attributes.new("Color", 'FLOAT_COLOR', 'CORNER')
    mw = ob.matrix_world
    zs = [(mw @ v.co).z for v in me.vertices]
    z0, z1 = min(zs), max(min(zs) + 1e-6, max(zs))
    for poly in me.polygons:
        h = max(0.0, min(1.0, (sum(zs[li] for li in poly.vertices) / len(poly.vertices) - z0) / (z1 - z0)))
        # after the +90 deg X turn the pen extrudes along world Y, so |n.y| picks out the printed face.
        # The ramp is a FACE weight, not a shadow weight: mix(a, b, t) resolves to b at t = 0, so
        # blending toward `flank` by (1 - height) paints the top of every glyph with its own shadow —
        # which is how a sheet of ivory card came out looking like a slab of wet coal.
        w = 1.0 - 0.18 * (1.0 - h) ** 1.1
        c = mix(face, flank, w) if abs((mw.to_3x3() @ poly.normal).y) > 0.55 else mix(flank, face, 0.06 * h)
        c = s2l(c)
        for li in poly.loop_indices:
            ca.data[li].color = (c[0], c[1], c[2], 1.0)


def link(ob):
    coll.objects.link(ob)
    return ob


_FONT = []


def font():
    if not _FONT:
        _FONT.append(bpy.data.fonts.load(TTF))
    return _FONT[0]


def advances(word):
    """Advance widths read off the font by measuring successive prefixes.
    A glyph's bounding box is not its advance: spacing by ink width opens a moat after every wide
    letter and collides every narrow one, which is why 'VIOLET' set as 'VI OLET'."""
    out, prev = [], 0.0
    for i in range(len(word)):
        cu = bpy.data.curves.new("adv", 'FONT')
        cu.body, cu.font, cu.size = word[:i + 1], font(), 1.0
        ob = link(bpy.data.objects.new("adv", cu))
        bpy.context.view_layer.update()
        w = ob.dimensions.x
        out.append(max(0.18, w - prev))
        prev = w
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.curves.remove(cu)
    return out


def letter_obj(ch, x):
    cu = bpy.data.curves.new("t_" + ch, 'FONT')
    cu.body, cu.font, cu.size = ch, font(), 1.0
    # A sheet of inked card, not a billet: at 0.135 the extrusion is 37% of cap height and the
    # bevelled flanks out-argue the printed face for pixel area, which is the whole difference
    # between a headline and a stone carving. The round-over is then deep enough to catch a line.
    cu.extrude, cu.bevel_depth, cu.bevel_resolution = 0.088, 0.026, 4
    # left-aligned: the sidebearings are the kerning, so the pen must start where the type sits
    cu.align_x, cu.align_y = 'LEFT', 'CENTER'
    ob = link(bpy.data.objects.new("L_" + ch, cu))
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    # stand the letter up: extruded type grows vertically, not on its back
    ob.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    # dried ink is never perfectly flat - a whisper of cloud displacement
    tex = bpy.data.textures.new("ink_" + ch, 'CLOUDS'); tex.noise_scale = 0.20
    dm = ob.modifiers.new("ink", 'DISPLACE'); dm.texture = tex; dm.strength = 0.020
    bpy.ops.object.modifier_apply(modifier=dm.name)
    ob.location = (x, 0, 0)
    bpy.context.view_layer.update()
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    # the stalk roots under the ink, not under the advance box
    return ob, (min(v.x for v in bb) + max(v.x for v in bb)) / 2.0, min(v.z for v in bb)


def tube(name, centers, radii, segs=9):
    vs, fc, rings = [], [], []
    up = Vector((0, 0, 1))
    for i, c in enumerate(centers):
        t = (centers[min(i + 1, len(centers) - 1)] - centers[max(i - 1, 0)]).normalized()
        ref = Vector((1, 0, 0)) if abs(t.dot(up)) > 0.98 else up
        n = (ref - t * ref.dot(t)).normalized()
        b = t.cross(n)
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            vs.append(c + (n * math.cos(a) + b * math.sin(a)) * radii[i])
            ring.append(len(vs) - 1)
        rings.append(ring)
    for i in range(len(rings) - 1):
        a0, a1 = rings[i], rings[i + 1]
        for k in range(len(a0)):
            kk = (k + 1) % len(a0)
            fc.append((a0[k], a1[k], a1[kk], a0[kk]))
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        ctr = sum((Vector(vs[i]) for i in ring), Vector()) / len(ring)
        ci = len(vs); vs.append(ctr)
        for k in range(len(ring)):
            kk = (k + 1) % len(ring)
            fc.append((ci, ring[kk], ring[k]) if rev else (ci, ring[k], ring[kk]))
    return mesh_obj(name, vs, fc)


def ridge(name, stations, half_w, height, across=9):
    """A tilled ridge: a low dome swept along x, flat where it meets the lawn.
    A circular tube reads as a raised platform with its own horizon; soil is pushed up, not piped in.
    Each station carries its own scale so the ridge can run out at the ends like thrown soil."""
    vs, fc, rows = [], [], []
    for (x, y, z, sc) in stations:
        # A swept dome with a constant half-width keeps a clean ellipse as its silhouette, and a
        # clean ellipse on grass is a rug. Soil is thrown: the bed varies station to station and the
        # crest is uneven, so the eye finds no outline to read as a manufactured edge.
        wsc = sc * (0.84 + 0.32 * random.random())
        ring = []
        for k in range(across + 1):
            u = k / float(across) * 2.0 - 1.0
            jit = (random.random() - 0.5) * height * 0.62 * (1.0 - abs(u) * 0.55)
            vs.append(Vector((x, y + u * half_w * wsc, z + height * sc * math.sqrt(max(0.0, 1.0 - u * u)) - 0.03 + jit)))
            ring.append(len(vs) - 1)
        rows.append(ring)
    for i in range(len(rows) - 1):
        for k in range(across):
            fc.append((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))
    return mesh_obj(name, vs, fc)


def leaf(name, origin, direction, length, width, droop, twist):
    d = direction.normalized()
    side = d.cross(Vector((0, 0, 1)))
    side = Vector((1, 0, 0)) if side.length < 1e-4 else side.normalized()
    nu, nv, vs, fc = 9, 5, [], []
    for i in range(nu):
        u = i / (nu - 1)
        w = math.sin(math.pi * min(1.0, u ** 0.80)) * width * (1.0 - 0.30 * u * u)
        along = origin + d * (u * length)
        for j in range(nv):
            v = (j / (nv - 1) - 0.5) * 2.0
            fold = abs(v) ** 1.5 * 0.30 * width
            vs.append(along + side * (v * w) + Vector((0, 0, -droop * u * u + fold)) + d * (twist * v * u * width))
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = i * nv + j
            fc.append((a, a + nv, a + nv + 1, a + 1))
    return mesh_obj(name, vs, fc)


def mesh_obj(name, vs, fc):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in vs], [], fc)
    me.validate()
    me.update()
    ob = link(bpy.data.objects.new(name, me))
    for p in me.polygons:
        p.use_smooth = True
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


# ---------- lay the words out as a tiered planting ----------
# One word per line: the first stands on tall stems behind the last, so the name reads as a
# two-line headline. A single wide line is 5% of a portrait frame's height, which is not a headline.
LINES = [w for w in WORD.split() if w] or [WORD]
# A letter pushed up out of its own bed, not a balloon on a stick. Two metres of bare petiole
# reads as a fence; the height that matters is the glyph's own, so the stalk stays under it.
STEM_HI, STEM_LO = 1.45, 0.46
# Blender +Y becomes glTF -Z, so the tall line must be authored at +depth to stand BEHIND the short one.
DEPTH_HI, DEPTH_LO = 0.95, -0.45
tracking = 0.05
letters, stems, leaves, soil, buds, berms = [], [], [], [], [], []
placed = []
for li, word in enumerate(LINES):
    advs = advances(word)
    x = -(sum(advs) + tracking * (len(word) - 1)) / 2.0
    row = []
    for i, ch in enumerate(word):
        ob, ink, zmin = letter_obj(ch, x)
        row.append([ob, ink, zmin, advs[i]])
        x += advs[i] + tracking
    f = li / max(1, len(LINES) - 1)
    stem_h = STEM_HI + (STEM_LO - STEM_HI) * f
    depth = DEPTH_HI + (DEPTH_LO - DEPTH_HI) * f
    for p in row:
        p += [stem_h, depth]
        placed.append(p)

for idx, (ob, cx, zmin, adv, stem_h, depth) in enumerate(placed):
    letters.append(ob)
    # hand-set type: per-letter lift, lean and a shallow depth arc so the row is a planting, not a ruler.
    # The lean is a whisper: past ~2 degrees a word stops reading as one word and the gaps go ragged.
    ob.location.z = stem_h + random.uniform(-0.055, 0.055)
    ob.location.y = depth + 0.13 * math.sin(math.pi * (idx % 7) / 6.0) - 0.06 + random.uniform(-0.03, 0.03)
    ob.rotation_euler.z = math.radians(random.uniform(-1.3, 1.3))
    ob.rotation_euler.y = math.radians(random.uniform(-1.6, 1.6))   # turned to the light, like every real leaf
    bpy.context.view_layer.update()
    bottom = min((ob.matrix_world @ Vector(v.co)).z for v in ob.data.vertices)
    top = bottom + 0.12                          # the petiole runs up into the letter
    rx = cx + random.uniform(-0.05, 0.05)
    ry = random.uniform(-0.07, 0.07)
    bend = random.uniform(0.05, 0.13) * (1 if idx % 2 else -1) * (0.55 + 0.45 * stem_h)
    th = random.uniform(0.86, 1.14)              # no two stems are the same girth
    # A petiole, not a beanpole: at 0.078 the stalk is a quarter of the glyph's cap height and it
    # competes with the letter for the same pixels. Half that reads as a stem you look past.
    girth = 0.046 + 0.020 * max(0.0, stem_h - 1.2)   # a tall stem needs a taller stalk
    ctrs, radii, N = [], [], 16
    for i in range(N):
        t = i / (N - 1)
        e = t * t * (3 - 2 * t)
        ctrs.append(Vector((rx + (cx - rx) * t + math.sin(math.pi * t) * bend,
                            ob.location.y + (ry - ob.location.y) * (1 - e),
                            top * e)))
        radii.append((girth - (girth - 0.026) * t + 0.009 * (1 - t) ** 3) * th)
    stems.append(tube("stem%d" % idx, ctrs, radii, segs=10))
    # Root flare: a stalk that meets the earth at a point is a line drawing. Displaced soil at the
    # join is what tells the eye the letter was pushed up out of the ground rather than stuck there.
    # It is centred on the foot of the stalk, not on the glyph: the petiole leans, and a mound that
    # sits under the ink rather than under the root reads as a second object standing beside it.
    # And it is a saucer, not a stump: 0.075 tall over a 0.155 radius is a cone with its own silhouette,
    # and fourteen cones in a row is a row of furniture legs. The top ring closes inside the stalk's
    # own girth so the mound wraps the root and the cap is never seen.
    soil.append(tube("flare%d" % idx, [Vector((rx, ry, -0.150)),
                                       Vector((rx, ry, -0.030)),
                                       Vector((rx, ry, 0.014))],
                     [0.235 * th, 0.148 * th, 0.050 * th], segs=12))
    # A stalk carries leaves all the way up and thins them as it goes; a bare pole reads as a fence.
    nl = 4 + int(round(stem_h * 3.0))
    for k in range(nl):
        t = 0.10 + 0.83 * k / max(1, nl - 1) + random.uniform(-0.03, 0.03)
        si = max(0, min(len(ctrs) - 1, int(round(t * (len(ctrs) - 1)))))
        o = ctrs[si]
        ang = (0 if k % 2 == 0 else math.pi) + random.uniform(-0.55, 0.55) + 0.35 * k
        # Foliage stays in the plane of the row. A leaf thrown toward the camera arrives as a dark
        # blade across a glyph, which is the one thing a headline cannot survive.
        dirv = Vector((math.cos(ang) * 0.92, math.sin(ang) * 0.26, 0.34 + 0.34 * t + random.uniform(-0.08, 0.10)))
        sc = (1.0 - 0.50 * t) * th
        leaves.append(leaf("leaf%d_%d" % (idx, k), o + dirv.normalized() * radii[si] * 0.92, dirv,
                           (0.395 + random.uniform(-0.05, 0.10)) * sc, 0.150 * sc, 0.15, random.uniform(-0.22, 0.22)))
    # A stalk that only grows leaves never delivers the concept: the name has to be on the point of
    # flowering. The bud hangs off the NEAR side of the petiole, in front of the glyph's own face —
    # pushed sideways it lands in the gap between two letters, which is where nothing on this row
    # is ever seen, and a bud nobody sees is a bud that was not modelled.
    if idx % 3 != 2:
        si = len(ctrs) // 2
        o = ctrs[si]
        py = o.y - (radii[si] + 0.105)
        buds.append(tube("pedicel%d" % idx, [o, Vector((o.x, py + 0.02, o.z - 0.02))],
                         [radii[si] * 0.5, 0.016], segs=6))
        buds.append(tube("bud%d" % idx, [Vector((o.x, py, o.z - 0.075)),
                                         Vector((o.x, py, o.z - 0.010)),
                                         Vector((o.x, py, o.z + 0.062)),
                                         Vector((o.x, py, o.z + 0.130))],
                         [0.020, 0.085, 0.074, 0.016], segs=9))

# The tilled ridge the whole planting sits in: one low berm per line, so the row has a bed rather
# than fourteen separate dots. Without it the name floats over black lawn.
#
# The first cut of this was a plank, and the arithmetic says why: half-width 0.34 against height
# 0.082 is a 4:1 dome, so its top is flat enough to carry its own horizon; 17 stations under a
# sin^0.30 swell hold two thirds of full height from the second to the sixteenth, so the crest
# neither rises nor runs out; and the band overshoots the ink by 0.34 at both ends, which is where
# the two blunt caps came from. Soil is thrown, not extruded — round in section, humped along its
# length, and feathered out before the first and last letter.
for li, word in enumerate(LINES):
    f = li / max(1, len(LINES) - 1)
    dep = DEPTH_HI + (DEPTH_LO - DEPTH_HI) * f
    row = [p for p in placed if p[5] == dep]
    x0 = min(p[1] - p[3] / 2.0 for p in row) - 0.06
    x1 = max(p[1] + p[3] / 2.0 for p in row) + 0.06
    n = 33
    # two wavelengths of swell: one long, one short, so no two humps are the same size and the
    # crest has no period the eye can lock onto and call a moulding.
    w1, w2 = random.uniform(2.2, 3.1), random.uniform(4.6, 6.4)
    p1, p2 = random.uniform(0.0, 6.283), random.uniform(0.0, 6.283)
    st = []
    for i in range(n):
        t = i / float(n - 1)
        runout = math.sin(math.pi * t) ** 1.05
        hump = 1.0 + 0.21 * math.sin(w1 * math.pi * t + p1) + 0.13 * math.sin(w2 * math.pi * t + p2)
        st.append((x0 + (x1 - x0) * t, dep + random.uniform(-0.055, 0.055), 0.0,
                   max(0.07, (0.17 + 0.83 * runout) * hump)))
    berms.append(ridge("berm%d" % li, st, 0.235, 0.126, across=11))
    # Clods on the flanks. A ridge with one clean edge either side is still an extrusion: it is the
    # scatter thrown out beside the bed that gives it a width which varies, and a taper that ends
    # somewhere rather than at a cap. They are crumbs, not cones — the whole lump stays under 0.06
    # above the lawn, because a tipped-up ring of soil at 0.18 is a chess piece and twenty-six chess
    # pieces under a headline is a table, not a flowerbed.
    for i in range(13):
        cxp = x0 + (x1 - x0) * random.uniform(0.02, 0.98)
        cyp = dep + (1.0 if i % 2 else -1.0) * random.uniform(0.150, 0.330)
        r = random.uniform(0.038, 0.086)
        berms.append(tube("clod%d_%d" % (li, i),
                          [Vector((cxp, cyp, -0.120)),
                           Vector((cxp, cyp, r * 0.35)),
                           Vector((cxp + random.uniform(-0.02, 0.02), cyp, r * 0.62))],
                          [r * 1.30, r * 1.02, r * 0.15], segs=8))

for ob, _cx, _zmin, _adv, _sh, _dp in placed:
    paint_glyph(ob, IVORY, IVORY_D)
L = join(letters, "Type_letters")
S = join(stems, "Type_stems");     paint(S, VIOLET, MOSS, 0.02, 1.05)
F = join(leaves, "Type_leaves");   paint(F, LEAF_T, LEAF, 0.06, 1.35)
# Soil and buds join the greenery mesh: the runtime splits the row into printed type and everything
# that grows, and vertex colour — not the material — carries the difference between tilth and petal.
# The bed and the root flares take separate height bands because they are not the same object: a
# ridge is 0.15 tall and needs that whole range across its section to read as round, while a flare
# is a third of a unit and would land inside a single value if it shared the band.
D = join(soil, "Type_soil");        paint(D, SOIL_HI, SOIL, -0.145, 0.095)
E = join(berms, "Type_bed");        paint(E, SOIL_HI, SOIL, -0.034, 0.118)
B = join(buds, "Type_buds");        paint(B, BUD, VIOLET, 0.55, 1.45)
G = join([S, F, D, E, B], "Type_growth")

bpy.ops.object.select_all(action='DESELECT')
for ob in (L, G):
    ob.select_set(True)
bpy.context.view_layer.objects.active = L
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
_m = [1e9] * 3; _M = [-1e9] * 3
for _ob in (L, G):
    for _v in _ob.data.vertices:
        for _k in range(3):
            _m[_k] = min(_m[_k], _v.co[_k]); _M[_k] = max(_M[_k], _v.co[_k])
print("BBOX", [round(x, 3) for x in _m], [round(x, 3) for x in _M], "SIZE", [round(_M[_k] - _m[_k], 3) for _k in range(3)])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True)
print("WROTE", OUT, "| letters", len(L.data.polygons), "growth", len(G.data.polygons),
      "| verts", len(L.data.vertices), len(G.data.vertices))
