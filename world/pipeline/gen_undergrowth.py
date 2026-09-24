# -*- coding: utf-8 -*-
"""
Violet Garden — the undergrowth pass: the species a bed is actually made of.
Same authored palette and mesh idiom as gen_violet_hf.py (copied helpers, so
this script never re-exports or un-compresses the hero GLBs).

Outputs (world/assets/models/):
  Grass_Tuft.glb  13 tapered, folded, leaning blades + 2 dried amber ones
  Seed_Head.glb   a gone-to-bloom stem carrying three ripe valves
  Petal_Fall.glb  one shed petal, curled, for the ground layer
"""
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "models")
os.makedirs(OUT, exist_ok=True)

# ---------- palette authored in sRGB floats (shared with the hero flowers) ----------
CORE = (0.24, 0.16, 0.42)
MID  = (0.50, 0.40, 0.70)
RIM  = (0.72, 0.65, 0.88)
VEIN = (0.30, 0.18, 0.45)
STEM = (0.35, 0.48, 0.30)
STEM_HI = (0.50, 0.62, 0.42)
LEAF = (0.35, 0.50, 0.35)
LEAF_TIP = (0.50, 0.65, 0.45)
GRASS_DK = (0.16, 0.26, 0.17)
GRASS_LT = (0.42, 0.55, 0.30)
STRaw = (0.62, 0.52, 0.30)
POD_DK = (0.28, 0.34, 0.20)
POD_LT = (0.66, 0.58, 0.36)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def grad3(u):
    return mix(CORE, MID, u / 0.45) if u < 0.45 else mix(MID, RIM, (u - 0.45) / 0.55)


def bez4(vals, t):
    mt = 1 - t
    return mt * mt * mt * vals[0] + 3 * mt * mt * t * vals[1] + 3 * mt * t * t * vals[2] + t * t * t * vals[3]


def samples(arr, u):
    for i in range(len(arr) - 1):
        if arr[i][0] <= u <= arr[i + 1][0]:
            a, b = arr[i], arr[i + 1]
            t = 0 if b[0] == a[0] else (u - a[0]) / (b[0] - a[0])
            return a[1] + (b[1] - a[1]) * t
    return arr[-1][1]


# ---------- shared mesh helpers ----------
def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def apply_transforms(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.select_set(False)


def join(parts, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    for o in bpy.context.selected_objects:
        o.select_set(False)
    return ob


def export_glb(ob, path):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    print("EXPORTED", path, os.path.getsize(path))


# ---------- grass blade, written straight into a shared bmesh ----------
def add_blade(bm, cl, h, w, r0, lean, arch, twist, seed, dried=False, nU=14, nV=4):
    """A sedge blade: it leaves the crown at `r0`, climbs almost straight, and only
    the top third leans so the tip droops without ever touching the ground. The
    cross-section folds into a V around the midrib and rolls a little about the
    spine, so neighbouring blades catch different amounts of light."""
    rnd = random.Random(seed)

    def spine(u):
        out = r0 + lean * (u ** 1.9) + arch * h * 0.26 * (u ** 3.0)
        y = h * (u - 0.22 * u ** 2) - arch * h * 0.30 * max(0.0, (u - 0.66) / 0.34) ** 1.9
        return out, y

    grid, made = [], []
    for i in range(nU + 1):
        u = (i / nU) * 0.9955
        # broad just above the crown, then a long taper to a sharp point
        hw = w * 2.05 * ((u + 0.06) ** 0.45) * ((1.0 - u) ** 1.02)
        out, y = spine(u)
        e = 0.01
        ax, ay = spine(max(0.0, u - e))
        bx, by = spine(min(0.9955, u + e))
        tx, ty = bx - ax, by - ay
        tl = math.hypot(tx, ty) or 1.0
        nx, ny = ty / tl, -tx / tl                       # in-plane normal
        ca = twist * (u ** 1.25)
        row = []
        for j in range(nV + 1):
            v = -1 + 2 * j / nV
            # the crease always lifts both edges; the roll turns the ribbon over
            along_n = hw * (0.34 * abs(v) ** 1.35 * (1 - 0.30 * u) + v * math.sin(ca))
            along_z = hw * v * math.cos(ca)
            vert = bm.verts.new((out + along_n * nx, y + along_n * ny, along_z))
            row.append(vert)
            made.append(vert)
        grid.append(row)
    faces = []
    for i in range(nU):
        for j in range(nV):
            a, b = grid[i][j], grid[i][j + 1]
            c, d = grid[i + 1][j + 1], grid[i + 1][j]
            if a != b and c != d and a != d and b != c:
                faces.append(bm.faces.new((a, b, c, d)))
    vcol = {}
    for i in range(nU + 1):
        u = (i / nU) * 0.9955
        for j in range(nV + 1):
            v = -1 + 2 * j / nV
            if dried:
                col = mix((0.40, 0.32, 0.17), STRaw, 0.35 + 0.65 * u)
            else:
                col = mix(GRASS_DK, GRASS_LT, u ** 1.1 * 0.95 + 0.12)
                col = mix(col, (0.05, 0.11, 0.05), 0.34 * abs(v) ** 2.4)          # folded edges shade
                col = mix(col, (0.58, 0.68, 0.36), 0.22 * (1 - abs(v)) ** 3 * u)  # lit midrib
            col = mix(col, (col[0] * 0.55, col[1] * 0.52, col[2] * 0.5), rnd.uniform(0.0, 0.16))
            vcol[grid[i][j]] = col
    for f in faces:
        for lp in f.loops:
            lp[cl] = Vector((*vcol[lp.vert], 1.0))
    # swing the blade (built pointing along +X) out to its own azimuth
    m = Matrix.Rotation(rnd.uniform(0, 6.2832), 4, 'Y')
    for vert in made:
        vert.co = m @ vert.co


def add_crown(bm, cl, seed):
    """The pale sheaths a tuft actually grows out of: a short bundled collar that
    keeps the base from reading as a fan of blades sawn off at one point."""
    rnd = random.Random(seed)
    for k in range(9):
        a = rnd.uniform(0, 6.2832)
        h = rnd.uniform(0.055, 0.115)
        w = rnd.uniform(0.010, 0.017)
        r0 = rnd.uniform(0.004, 0.021)
        segs, nV = 5, 2
        grid = []
        for i in range(segs + 1):
            u = i / segs
            hw = w * (0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.25 + 0.8 * u))) * (1 - u ** 2.4)
            rad = r0 + 0.012 * (u ** 1.6)
            y = h * u
            row = []
            for j in range(nV + 1):
                v = -1 + 2 * j / nV
                ang = a + v * (hw / max(rad, 1e-5))
                row.append(bm.verts.new((math.cos(ang) * rad, y,
                                         math.sin(ang) * rad + 0.30 * hw * abs(v) ** 1.6)))
            grid.append(row)
        for i in range(segs):
            for j in range(nV):
                f = bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
                for lp in f.loops:
                    uu = sum(v.co.y for v in f.verts) / 4.0 / h
                    lp[cl] = Vector((*mix((0.40, 0.36, 0.22), (0.30, 0.40, 0.22), uu), 1.0))


def make_tuft(name, seed=4, N=31, nU=14, nV=4, crown=True):
    """A pure sedge sward: the gone-to-seed culms are their own species (Seed_Head),
    so the tuft silhouette stays a dense fountain instead of two sticks.
    `N/nU/nV` are the LOD dials — the meadow takes a cheap copy, the beds the hero."""
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    rnd = random.Random(seed)
    for k in range(N):
        t = k / (N - 1.0)
        # short blades skirt the outside of the crown, the tall ones stand in the middle
        h = 0.15 + 0.31 * math.sin(math.pi * (0.10 + 0.80 * t)) ** 0.7 * rnd.uniform(0.80, 1.16)
        add_blade(bm, cl, min(h, 0.46), rnd.uniform(0.020, 0.032),
                  rnd.uniform(0.005, 0.042), rnd.uniform(0.045, 0.150),
                  rnd.uniform(0.22, 0.58), rnd.uniform(-0.30, 0.30),
                  seed * 31 + k, dried=(k in (8, 17, 25)), nU=nU, nV=nV)
    if crown:
        add_crown(bm, cl, seed * 5 + 1)
    return new_obj(name, bm)


# ---------- seed head: three ripe valves on a bent stem ----------
def add_valve(bm, cl, L, W, seed):
    """One ripe valve: a slim capsule with a pale seam, closing to a beak that
    throws a long awn — the bristle that says "this has gone to seed"."""
    rnd = random.Random(seed)
    segs, rings = 10, 8
    grid = []
    for i in range(segs + 1):
        u = i / segs
        # a capsule that swells then closes to a beak
        r = W * math.sin(math.pi * (0.12 + 0.88 * u)) ** 0.65 * (1 - u ** 3.2 * 0.92)
        y = u * L
        grid.append([bm.verts.new((math.cos(2 * math.pi * j / rings) * r, y,
                                  math.sin(2 * math.pi * j / rings) * r * 0.66)) for j in range(rings)])
    for i in range(segs):
        for j in range(rings):
            a, b = grid[i][j], grid[i][(j + 1) % rings]
            c, d = grid[i + 1][(j + 1) % rings], grid[i + 1][j]
            bm.faces.new((a, b, c, d))
    bm.faces.new(list(reversed(grid[-1])))
    bm.faces.new(grid[0])
    for f in bm.faces[len(bm.faces) - (segs * rings + 2):]:
        cy = sum(v.co.y for v in f.verts) / max(1, len(f.verts))
        ang = sum(math.atan2(v.co.z / 0.66, v.co.x) for v in f.verts) / max(1, len(f.verts))
        u = cy / L
        col = mix((0.50, 0.41, 0.22), POD_LT, 0.30 + 0.70 * u)
        col = mix(col, (0.86, 0.80, 0.56), 0.45 * max(0.0, math.cos(ang)) ** 6)   # the seam
        col = mix(col, (0.34, 0.26, 0.14), rnd.uniform(0, 0.14))
        for lp in f.loops:
            lp[cl] = Vector((*col, 1.0))
    # the awn: a tapered three-sided bristle off the beak
    tip = grid[-1][0].co
    awn = [(0.0, 0.0), (0.0022, 0.30), (0.0016, 0.62), (0.0007, 1.0)]
    prev = None
    for wr, au in awn:
        ring = [bm.verts.new((tip.x + math.cos(2 * math.pi * j / 3) * wr,
                             tip.y + au * L * 0.42,
                             tip.z + math.sin(2 * math.pi * j / 3) * wr * 0.7)) for j in range(3)]
        if prev:
            for j in range(3):
                f = bm.faces.new((prev[j], prev[(j + 1) % 3], ring[(j + 1) % 3], ring[j]))
                for lp in f.loops:
                    lp[cl] = Vector((*mix((0.72, 0.64, 0.40), (0.86, 0.82, 0.62), au), 1.0))
        prev = ring


def make_seedhead(name, seed=9):
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    # the stem: bent, tapered, still green at the base
    segs, rings = 12, 6
    H = 0.46
    grid = []
    for i in range(segs + 1):
        u = i / segs
        y = u * H
        x = 0.11 * (u ** 1.8)
        r = 0.014 * (1 - u * 0.55)
        grid.append([bm.verts.new((x + math.cos(2 * math.pi * j / rings) * r, y,
                                  math.sin(2 * math.pi * j / rings) * r)) for j in range(rings)])
    for i in range(segs):
        for j in range(rings):
            a, b = grid[i][j], grid[i][(j + 1) % rings]
            c, d = grid[i + 1][(j + 1) % rings], grid[i + 1][j]
            bm.faces.new((a, b, c, d))
    for f in bm.faces[:segs * rings]:
        cy = sum(v.co.y for v in f.verts) / 4
        u = cy / H
        col = mix(STEM, STEM_HI, u * 0.6)
        col = mix(col, POD_LT, max(0.0, u - 0.5) * 1.2)
        for lp in f.loops:
            lp[cl] = Vector((*col, 1.0))
    ob_stem = new_obj(name + "_stem", bm)
    parts = [ob_stem]
    # three valves at the top, 120 degrees apart, tilted out and up
    for k in range(3):
        vb = bmesh.new()
        vcl = vb.loops.layers.color.new("Color")
        add_valve(vb, vcl, 0.150, 0.0235, seed + k)
        vob = new_obj(name + "_v%d" % k, vb)
        a = k * 2.0944 + 0.3
        vob.rotation_euler = (math.radians(30) * math.cos(a), a, math.radians(-30) * math.sin(a))
        vob.location = (0.11 + math.cos(a) * 0.022, H - 0.01, math.sin(a) * 0.022)
        apply_transforms(vob)
        parts.append(vob)
    # the withered corolla it grew out of: a shrivelled cup at the fork
    cb = bmesh.new()
    ccl = cb.loops.layers.color.new("Color")
    ring0 = [cb.verts.new((math.cos(2 * math.pi * j / 8) * 0.030, 0.0, math.sin(2 * math.pi * j / 8) * 0.030)) for j in range(8)]
    ring1 = [cb.verts.new((math.cos(2 * math.pi * j / 8 + 0.4) * 0.016, 0.026, math.sin(2 * math.pi * j / 8 + 0.4) * 0.016)) for j in range(8)]
    for j in range(8):
        cb.faces.new((ring0[j], ring0[(j + 1) % 8], ring1[(j + 1) % 8], ring1[j]))
    for f in cb.faces:
        for lp in f.loops:
            lp[ccl] = Vector((*mix((0.20, 0.12, 0.26), (0.42, 0.36, 0.30), lp.vert.co.y / 0.026), 1.0))
    cob = new_obj(name + "_cup", cb)
    cob.location = (0.108, H - 0.03, 0)
    apply_transforms(cob)
    parts.append(cob)
    # a node of bracts halfway up: the stem is not a bare wire
    bb = bmesh.new()
    bcl = bb.loops.layers.color.new("Color")
    for k in range(3):
        add_blade(bb, bcl, 0.095 + k * 0.022, 0.0125, 0.005, 0.045, 0.34, 0.22, seed * 13 + k)
    bob = new_obj(name + "_bracts", bb)
    bob.location = (0.052, H * 0.44, 0)
    apply_transforms(bob)
    parts.append(bob)
    apply_transforms(ob_stem)
    return join(parts, name)


# ---------- one shed petal for the ground ----------
def make_petal_fall(name, seed=3):
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    L, W = 0.135, 0.052
    nU, nV = 14, 16
    outline = [0.24, 0.80, 1.0, 0.58]
    grid = []
    for i in range(nU + 1):
        u = i / nU
        hw = W * bez4(outline, u)
        row = []
        for j in range(nV + 1):
            v = -1 + 2 * j / nV
            lx = v * hw
            ly = u * L
            # a shed petal is not flat: it cups and the edges dry upward
            lz = 0.020 * (1 - v * v) + 0.012 * (v * v) * u + 0.010 * math.sin(u * math.pi) + 0.016 * u ** 2
            row.append((bm.verts.new((lx, lz, ly)), u, v))
        grid.append(row)
    for i in range(nU):
        for j in range(nV):
            a, b, c, d = grid[i][j][0], grid[i][j + 1][0], grid[i + 1][j + 1][0], grid[i + 1][j][0]
            bm.faces.new((a, b, c, d))
    uv = {vt[0]: (vt[1], vt[2]) for row in grid for vt in row}
    for f in bm.faces:
        for lp in f.loops:
            u, v = uv[lp.vert]
            col = grad3(u * 0.85 + 0.15)
            col = mix(col, VEIN, 0.25 * max(0.0, math.cos(v * 6.0)) ** 4 * (1 - u))
            # a petal on the ground loses colour toward the tip
            col = mix(col, (0.30, 0.24, 0.34), max(0.0, u - 0.55) * 0.9)
            lp[cl] = Vector((*col, 1.0))
    return new_obj(name, bm)


# Everything above is authored with +Y as "up" because that reads better in the
# maths; Blender's native up is +Z, and only a Z-up object exports as a Y-up glTF
# that stands up in three.js without a corrective rotation.
def stand_up(ob):
    ob.rotation_euler = (math.radians(90), 0, 0)
    apply_transforms(ob)
    return ob


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

tuft = make_tuft("Grass_Tuft")
export_glb(stand_up(tuft), os.path.join(OUT, "Grass_Tuft.glb"))
# the meadow copy: same blade recipe, a tenth of the triangles, no crown to see at distance
sward = make_tuft("Grass_field", seed=11, N=11, nU=5, nV=2, crown=False)
export_glb(stand_up(sward), os.path.join(OUT, "Grass_field.glb"))
seed = make_seedhead("Seed_Head")
export_glb(stand_up(seed), os.path.join(OUT, "Seed_Head.glb"))
pf = make_petal_fall("Petal_Fall")
export_glb(stand_up(pf), os.path.join(OUT, "Petal_Fall.glb"))
print("DONE")
