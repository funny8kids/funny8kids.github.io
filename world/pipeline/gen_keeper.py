"""gen_keeper.py — the Garden Keeper: a full-body original figure for the Violet Garden finale.

Authoring rules this file obeys (all learned the hard way in this project):
  * single mesh, one bmesh, built from lofted rings + tubes. No joined objects, no parenting
    (parenting without matrix_parent_inverse silently throws parts off screen).
  * Blender Z-up here; the preview's up direction is Blender Z (see the up-axis law).
  * vertex colours are the ONLY colour carrier: gltf-transform's join collapses multi-material
    assets into one grey PaletteMaterial, so nothing may depend on a second material.
  * colours are written as sRGB floats — the 5.2 exporter interprets the Color attribute as sRGB,
    and three.js linearises again on load.
  * the braid is the identity vector: it must survive a pure silhouette read from the FRONT,
    which is why it is draped over the shoulders and hangs in front of the chest, canon-wise.

Run headless:  E:/IDE/Blender/blender.exe --background --python world/pipeline/gen_keeper.py
Or from the live MCP session: exec(compile(open(path).read(), path, 'exec'))
"""
import bpy, bmesh, math, os
from mathutils import Vector

NAME = 'Keeper'
FIG = 'FIG'
OUT = r'F:\tmp_pwcheck\shots'
HEIGHT = 1.652          # metres, real-human scale (the desk is authored in real metres too)

# ---------------------------------------------------------------- palette (sRGB floats)
SKIN  = (0.860, 0.712, 0.628)  # the old value baked to ash: a face has to survive a violet night
SKIN_SH = (0.560, 0.400, 0.345)  # the nose and the hollows: skin one stop down, not a new hue
HAIR  = (0.78, 0.62, 0.34)   # the garden's single warm slot, 30-45 deg, same family as the lamp
HAIR_DK = (0.640, 0.478, 0.250)  # the fringe sits in the shell's own shadow; same hue, one stop down
DRESS = (0.225, 0.225, 0.45)  # navy translated into the violet law (250-285 deg)
BODICE = (0.250, 0.245, 0.49)
SASH  = (0.185, 0.180, 0.395)
PAPER = (0.855, 0.845, 0.900)  # collar, cuffs, gloves = the letter's paper white
BOOT  = (0.130, 0.125, 0.205)
RIBB  = (0.430, 0.320, 0.560)
EYE   = (0.085, 0.130, 0.330)   # canon: her eyes are the cold blue the dress is not
EYE_HI= (0.900, 0.910, 0.960)
EYE_PU = (0.028, 0.040, 0.115)  # without a pupil the iris oval reads as a painted-on hole
EYE_LO = (0.290, 0.400, 0.640)  # the lower iris catches the lamp off the desk
BROW  = (0.155, 0.105, 0.075)  # reads as the upper lash line, not a floating tan comma
MOUTH = (0.360, 0.185, 0.190)

scene = bpy.context.scene
coll = bpy.data.collections.get(FIG)
if coll is None:
    coll = bpy.data.collections.new(FIG)
    scene.collection.children.link(coll)


def drop(n):
    o = bpy.data.objects.get(n)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)


drop(NAME)
# The headless startup scene ships a 2 m default Cube centred on the origin, i.e. its top face sits
# at z=1.0 — exactly the plane the 3/4 preview camera looks down onto. Every full-body preview so far
# has been showing the skirt buried inside that cube, which is why the body could never be judged
# from it. Delete it, and say so, so the next reader does not trust a cropped silhouette again.
drop('Cube')
print('KEEPER scene objects: %r' % ([o.name for o in scene.objects],))
bm = bmesh.new()
PAINT = []


def rr(v):
    return (v, v) if isinstance(v, (int, float)) else v


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def prof(cz, rx, ry, n=20, cy=0.0, lobes=0, amp=0.0, phase=0.0, cx=0.0, tilt=0.0):
    """an elliptical ring; `lobes` pleats it, `tilt` lifts the FRONT (sin<0) when negative."""
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        s = math.sin(a)
        k = 1.0 + amp * math.cos(lobes * a + phase) if lobes else 1.0
        out.append((cx + rx * k * math.cos(a), cy + ry * k * s, cz + tilt * s))
    return out


def add_loft(rings, cap0=False, cap1=False):
    loops = []
    for r in rings:
        vs = []
        seen = set()
        for v in r:
            key = (round(v[0], 5), round(v[1], 5), round(v[2], 5))
            if key in seen:
                vs.append(vs[-1])
                continue
            seen.add(key)
            vs.append(bm.verts.new(v))
        loops.append(vs)
    for j in range(len(loops) - 1):
        A, B = loops[j], loops[j + 1]
        k = min(len(A), len(B))
        for i in range(k):
            i2 = (i + 1) % k
            try:
                bm.faces.new((A[i], A[i2], B[i2], B[i]))
            except ValueError:
                pass
    if cap0:
        try:
            bm.faces.new(list(reversed(loops[0])))
        except ValueError:
            pass
    if cap1:
        try:
            bm.faces.new(loops[-1])
        except ValueError:
            pass
    return loops


def frame(d, ref=Vector((0, 1, 0))):
    dv = Vector(d).normalized()
    s = dv.cross(ref)
    if s.length < 1e-5:
        s = dv.cross(Vector((1, 0, 0)))
    s.normalize()
    return s, s.cross(dv).normalized()


def tube(pts, radii, n=12, caps=True):
    if len(pts) < 2:
        return []
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            d = Vector(pts[1]) - Vector(pts[0])
        elif i == len(pts) - 1:
            d = Vector(pts[-1]) - Vector(pts[-2])
        else:
            d = Vector(pts[i + 1]) - Vector(pts[i - 1])
        s, u = frame(d)
        c = Vector(p)
        r1, r2 = rr(radii[min(i, len(radii) - 1)])
        rings.append([tuple(c + s * (r1 * math.cos(2 * math.pi * j / n)) + u * (r2 * math.sin(2 * math.pi * j / n)))
                      for j in range(n)])
    return add_loft(rings, cap0=caps, cap1=caps)


def bez(p0, p1, p2, p3, n=14):
    out = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        out.append(tuple((m ** 3) * Vector(p0) + (3 * m * m * t) * Vector(p1)
                         + (3 * m * t * t) * Vector(p2) + (t ** 3) * Vector(p3)))
    return out


def P(col, fn, tag=''):
    """run a builder and remember which vertices it authored, so colour can be baked per part."""
    a = len(bm.verts)
    fn()
    PAINT.append((a, len(bm.verts), col, tag))


# ================================================================ DRESS
# The waist is the whole proportion argument. The old table only narrowed 31 % from shoulder to
# ribcage and then WIDENED to meet the skirt, so the bodice read as a tube with a cone glued under
# it: no cinch, no waist, and her legs looked short because the skirt started on a straight box.
# A fitted bodice narrows to the natural waist at 0.62 of torso height and only then lets the hips
# and the skirt take over again.
TORSO = [(1.402, 0.050, 0.054, 0.004), (1.390, 0.072, 0.066, 0.004), (1.376, 0.114, 0.082, 0.004),
         (1.364, 0.150, 0.094, 0.004), (1.348, 0.176, 0.103, 0.004), (1.320, 0.178, 0.112, -0.006),
         (1.284, 0.166, 0.118, -0.005), (1.248, 0.150, 0.113, 0.000), (1.190, 0.134, 0.101, 0.002),
         (1.130, 0.122, 0.095, 0.004), (1.075, 0.115, 0.091, 0.004), (1.020, 0.112, 0.089, 0.004),
         (0.965, 0.116, 0.094, 0.004), (0.910, 0.128, 0.105, 0.004), (0.868, 0.150, 0.122, 0.004)]
SKIRT = [(0.868, 0.185, 0.145), (0.790, 0.198, 0.157), (0.700, 0.214, 0.172), (0.600, 0.234, 0.188),
         (0.490, 0.256, 0.207), (0.380, 0.279, 0.226), (0.270, 0.301, 0.244), (0.170, 0.321, 0.259),
         (0.100, 0.334, 0.270), (0.062, 0.341, 0.276)]


def build_skirt():
    sk = []
    for z, rx, ry in SKIRT:
        t = (0.868 - z) / 0.813
        sk.append(prof(z - 0.028 * t * t, rx, ry, n=40, cy=0.006 + 0.040 * t * t,
                       lobes=8, amp=0.045 + 0.200 * t * t, phase=0.5, tilt=-0.055 * t))
    add_loft(sk)
    add_loft([prof(0.030, 0.326, 0.262, n=40, cy=0.046, lobes=8, amp=0.200, phase=0.5, tilt=-0.055),
              prof(0.012, 0.298, 0.238, n=40, cy=0.044, lobes=8, amp=0.180, phase=0.5, tilt=-0.048)],
             cap1=True)


# The waist is where a dress is BUILT. Without a band the skirt reads as a cone poured over her —
# but only across the NATURAL waist: a tall band becomes a shelf the skirt falls out of. The band now
# rides the cinch itself and sinks inside the skirt's flare at its hem, so its only visible edge is
# the clean rim at the top and bottom.
SASH_T = [(1.006, 0.114, 0.091), (0.984, 0.116, 0.093), (0.962, 0.119, 0.096), (0.940, 0.124, 0.101),
          (0.918, 0.132, 0.108), (0.896, 0.146, 0.119), (0.876, 0.166, 0.134)]


def build_sash():
    add_loft([prof(z, rx + 0.008, ry + 0.008, n=32, cy=0.006 + 0.040 * t * t,
                   lobes=8, amp=0.045 + 0.200 * t * t, phase=0.5, tilt=-0.055 * t)
              for z, rx, ry, t in [(a, b, c, max(0.0, (0.868 - a) / 0.813)) for a, b, c in SASH_T]],
             cap0=True, cap1=True)


def torso_front(z):
    """y of the bodice's front surface at height z, so a stud sits ON it instead of floating off it."""
    for (z0, rx0, ry0, cy0), (z1, rx1, ry1, cy1) in zip(TORSO, TORSO[1:]):
        if z0 >= z >= z1:
            t = (z0 - z) / max(1e-6, z0 - z1)
            return (cy0 + (cy1 - cy0) * t) - (ry0 + (ry1 - ry0) * t)
    return TORSO[-1][3] - TORSO[-1][2]


def build_bodice():
    add_loft([prof(z, rx, ry, n=26, cy=cy) for z, rx, ry, cy in TORSO], cap0=True)


def build_studs():
    """the bodice's closure. The old front panel was a cylinder up to 50 mm proud of a waist that is
    now cinched — a breastplate; five paper studs on the surface do the same job with no volume."""
    for z in (1.318, 1.252, 1.186, 1.120, 1.054):
        y = torso_front(z) - 0.004
        add_loft([prof(z + 0.009, 0.0085, 0.0085, n=10, cy=y), prof(z, 0.0115, 0.0115, n=10, cy=y),
                  prof(z - 0.009, 0.0085, 0.0085, n=10, cy=y)], cap0=True, cap1=True)


def build_collar():
    """A band that CLOSES around the neck and sits on the shoulders. Two earlier versions failed
    differently: a cone flaring above the jaw read as an ice-cream collar, and a band whose lower
    rows were nearly the same radius as the torso's neck rows grazed it at a shallow angle, which
    tore a jagged seam across her chest. The bottom row now deliberately ENCLOSES the torso at that
    height, so the only intersection is the clean rim she is meant to show."""
    add_loft([prof(1.426, 0.047, 0.049, n=20, cy=0.008), prof(1.414, 0.052, 0.055, n=20, cy=0.008),
              prof(1.400, 0.061, 0.065, n=20, cy=0.007), prof(1.390, 0.082, 0.078, n=20, cy=0.006)],
             cap0=True, cap1=True)


def build_brooch():
    face_disc(0.0, 1.380, 0.013, 0.015)


# ================================================================ HEAD
# The three lowest rows are the jaw. They narrow in x for the chin but they must FLATTEN in y at the
# same time: a round cross-section down there is a muzzle, and the face render proved it — the old
# table gave her a horse's snout with the nose and mouth riding the end of it.
HEAD = [(1.442, 0.036, 0.029), (1.458, 0.050, 0.041), (1.478, 0.062, 0.056), (1.504, 0.068, 0.079),
        (1.530, 0.069, 0.082), (1.556, 0.066, 0.080), (1.580, 0.061, 0.072), (1.598, 0.048, 0.059),
        (1.611, 0.030, 0.038), (1.618, 0.012, 0.015)]


def skull(z):
    """cross-section radii of the skull at height z. Clamped at both ends: the shell lofts past the
    head table, and an unclamped fall-through shrank it into a pot standing on the crown."""
    if z <= HEAD[0][0]:
        return HEAD[0][1], HEAD[0][2]
    if z >= HEAD[-1][0]:
        return HEAD[-1][1], HEAD[-1][2]
    for i in range(len(HEAD) - 1):
        z0, rx0, ry0 = HEAD[i]
        z1, rx1, ry1 = HEAD[i + 1]
        if z0 <= z <= z1:
            t = (z - z0) / max(1e-6, (z1 - z0))
            return rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
    return 0.01, 0.01


def build_head():
    # the neck is set BACK and made thinner than the new, flatter jaw: a chin narrower in y than the
    # neck it hangs off pushes that neck through her jawline as a skin-coloured bulge
    tube([(0, 0.012, z) for z in (1.406, 1.424, 1.444)], [0.040, 0.042, 0.044], n=14)
    # the jaw rows also push forward: narrowing alone gives a flat, featureless lower face. Only a
    # nudge — the old 12 mm jut on a round section is what turned it into a snout.
    jut = (0.007, 0.004, 0.001)
    tube([(0, 0.004 - (jut[i] if i < len(jut) else 0.0), z) for i, (z, _, _) in enumerate(HEAD)],
         [(rx, ry) for _, rx, ry in HEAD], n=18)


def face_y(x, z):
    """y of the skull surface at (x,z) — features must conform to it or they sink into the face."""
    rx, ry = skull(z)
    k = max(0.0, 1.0 - (x / max(1e-6, rx)) ** 2)
    return 0.004 - ry * math.sqrt(k)


def face_disc(cx, cz, rx, rz, lift=0.0026, n=12):
    """a lens curved across the face but level in z: conforming in z too tilts it into a wedge.
    Capped with a triangle FAN, not an n-gon — Workbench shades a non-planar n-gon with one averaged
    normal, which is the bright streak that appeared down the middle of both eyes."""
    y0 = face_y(cx - rx, cz)
    y1 = face_y(cx + rx, cz)

    def ring(f):
        row = []
        for i in range(n):
            a = 2 * math.pi * i / n
            x = cx + rx * math.cos(a)
            z = cz + rz * math.sin(a)
            y = y0 + (y1 - y0) * (0.5 + 0.5 * math.cos(a)) if abs(y1 - y0) > 1e-9 else y0
            row.append(bm.verts.new((x, y - lift * (1.0 - 0.7 * f), z)))
        return row

    A, B = ring(0.0), ring(1.0)
    made = []
    for i in range(n):
        i2 = (i + 1) % n
        try:
            made.append(bm.faces.new((A[i], A[i2], B[i2], B[i])))
        except ValueError:
            pass
    for L, f in ((A, 0.0), (B, 1.0)):
        yc = (y0 + y1) * 0.5 - lift * (1.0 - 0.7 * f)
        c = bm.verts.new((cx, yc, cz))
        for i in range(n):
            try:
                made.append(bm.faces.new((L[(i + 1) % n], L[i], c) if f else (L[i], L[(i + 1) % n], c)))
            except ValueError:
                pass
    tot = Vector((0.0, 0.0, 0.0))
    for fc in made:
        tot += fc.normal
    if tot.y > 0.0 and made:                 # outward on the face side is -Y
        bmesh.ops.reverse_faces(bm, faces=made)


def build_eyes():
    for sgn in (1, -1):
        face_disc(sgn * 0.031, 1.535, 0.0138, 0.0195)


def build_pupils():
    """the eye is a STACK, not an oval: iris, pupil, a lit lower rim, a catchlight. One flat blue
    lens at jury size reads as a sticker pasted on a mannequin."""
    for sgn in (1, -1):
        face_disc(sgn * 0.0315, 1.5315, 0.0064, 0.0104, lift=0.0044, n=10)


def build_eye_lo():
    for sgn in (1, -1):
        face_disc(sgn * 0.0300, 1.5185, 0.0104, 0.0050, lift=0.0037, n=10)


def build_eye_hi():
    """the catchlight: one pale dot per eye is what stops a blue oval reading as a painted-on hole.
    Slightly inward of the pupil line, which is where a lamp-lit eye actually catches."""
    for sgn in (1, -1):
        face_disc(sgn * 0.0262, 1.5442, 0.0048, 0.0062, lift=0.0056, n=8)


def build_brows():
    """the lash line: a dark stroke riding the TOP EDGE of the eye. Floating above it, the same
    stroke reads as a worried brow detached from the face."""
    for sgn in (1, -1):
        face_disc(sgn * 0.0305, 1.5520, 0.0150, 0.0040, lift=0.0039)


def build_nose():
    """the nose is a SHADOW, not a feature with its own hue: painted mouth-pink it read as a beauty
    mark dropped into the middle of her face."""
    face_disc(0.0, 1.512, 0.0042, 0.0035)


def build_mouth():
    face_disc(0.0, 1.4885, 0.0068, 0.0026, lift=0.0022)


def hair_pt(a, z, f):
    """a point on the skull cross-section scaled by f, front-centred at a=0 — the same ellipse the
    hair shell is lofted on, so a strand rooted at a low f is buried IN the mass, not in front of it."""
    rx, ry = skull(z)
    return (f * rx * math.sin(a), 0.004 - f * ry * math.cos(a), z)


def build_bangs():
    """TWO sheets, and the second one is the whole fix. A scalloped curtain on its own leaves the
    forehead showing in the triangles between the locks, which is what made the fringe read as a row
    of separate icicles; an unscallopied under-sheet fills exactly those triangles, so the locks stop
    being objects and become a MASS cut into points. The over-sheet's mid row is now phase-locked to
    its own hem — the old sin(a*7) waved on a different beat to the hem's locks, and two beats across
    one sheet is a crumple, not a fringe. The root row is buried inside the shell in both sheets, so
    the curtain EMERGES from the hair rather than floating on it."""
    NA, LOCK = 48, 7

    def dip_at(i):
        return 0.5 + 0.5 * math.cos(2 * math.pi * (i % LOCK) / float(LOCK))

    def over(k, scallop):
        rows = []
        for tag in ('root', 'mid', 'hem'):
            row = []
            for i in range(NA + 1):
                a = -1.62 + 3.24 * i / NA
                d = dip_at(i) if scallop else 1.0
                side = 0.014 * smooth((abs(a) - 0.95) / 0.70)
                if tag == 'root':
                    z, f = 1.604, k * (1.18 + 0.04 * d)
                elif tag == 'mid':
                    z, f = 1.588, k * (1.30 + 0.075 * d)
                else:
                    z, f = 1.590 - 0.026 * (d ** 1.3) - side, k * (1.10 + 0.075 * d)
                row.append(hair_pt(a, z, f))
            rows.append(row)
        return rows

    def under(k):
        rows = []
        for z, fz in ((1.602, 1.14), (1.586, 1.10), (1.570, 1.05)):
            row = []
            for i in range(NA + 1):
                a = -1.62 + 3.24 * i / NA
                row.append(hair_pt(a, z - 0.012 * smooth((abs(a) - 0.95) / 0.70), k * fz))
            rows.append(row)
        return rows

    uo, ui = under(0.995), under(0.958)
    add_loft(uo + ui[::-1], cap0=True, cap1=True)
    out, inn = over(1.0, True), over(0.968, True)
    add_loft(out + inn[::-1], cap0=True, cap1=True)


def build_hair():
    """a two-surface shell: a single-sided one shows its pale inner face along the cut edge, which
    is exactly the sawtooth that read across her forehead."""
    NB = 44

    # crown: the hair is an OFFSET of the skull's dome, not a shrunken copy of it. The skull rounds on
    # an ellipse (semi-width 0.069 at z=1.530, pole at 1.620); the surface t millimetres out along its
    # normal is the same ellipse with BOTH semi-axes grown by t. Sampling skull()+thick instead makes
    # the shell collapse on the skull's own pole, so its last 50 mm of radius had 15 mm of height to
    # spend — a straight line in silhouette, and at jury size a party hat. A separate dome sitting on
    # top was worse: it read as a skullcap with a slot under it.
    ZA, ZB, YB, ZC = 0.069, 0.090, 0.082, 1.530
    CROWN_T = ((1.428, 0.95), (1.500, 0.99), (1.556, 1.00))
    Z_ROWS = (1.428, 1.446, 1.464, 1.482, 1.500, 1.518, 1.536, 1.554,
              1.570, 1.584, 1.594, 1.604, 1.612, 1.618, 1.623, 1.627, 1.630, 1.6318)

    def crown(z):
        if z <= CROWN_T[0][0]:
            return CROWN_T[0][1]
        for (z0, k0), (z1, k1) in zip(CROWN_T, CROWN_T[1:]):
            if z <= z1:
                return k0 + (k1 - k0) * (z - z0) / (z1 - z0)
        return CROWN_T[-1][1]

    def dome(z, t):
        q = (z - ZC) / (ZB + t)
        if q >= 1.0:
            return 0.0, 0.0
        s = math.sqrt(1.0 - q * q)
        return (ZA + t) * s, (YB + t) * s

    def ring_set(scale):
        rows = []
        for z in Z_ROWS:
            rx, ry = skull(z)
            up = smooth((z - 1.448) / (1.608 - 1.448))
            # the helmet stays off the forehead, but it must CLOSE over the front while the arc's
            # tips are still behind the scalp: add_loft always bridges consecutive rows' first and
            # last vertices, so a row that is still open at the front gets a quad across it. Buried
            # inside the skull that bridge is invisible; grazing the scalp at 1.60-1.63 it is the
            # bright triangular notch that sat on top of her head.
            bmax = math.pi * (0.50 + 0.16 * up + 0.34 * smooth((z - 1.572) / 0.030))
            ck = crown(z)
            thick = (0.007 + 0.010 * (1 - up) + 0.006 * max(0.0, (z - 1.50) / 0.12)) * scale
            hx, hy = rx + thick, ry + thick
            on_dome = z > 1.556
            if on_dome:
                ox, oy = dome(z, thick)
                hx, hy = max(0.0012, ox), max(0.0012, oy)
            row = []
            for j in range(NB + 1):
                b = -bmax + 2 * bmax * j / float(NB)
                # fluting: hair is a bundle of locks, so the outer surface waves around the head.
                # Twelve shallow waves read as a head of hair; nine deep ones read as the seams of a
                # beanie. On the dome the wave scales the whole offset, so it has to be shallower.
                fl = 1.0 + 0.155 * math.cos(12.0 * b + 0.35)
                if on_dome:
                    fl = 1.0 + 0.055 * (fl - 1.0) / 0.155
                row.append((hx * fl * ck * math.sin(b), 0.010 + hy * fl * ck * math.cos(b),
                            z + 0.006 * ck * math.cos(b)))
            rows.append(row)
        return rows

    outer, inner = ring_set(1.0), ring_set(0.42)
    add_loft(outer + inner[::-1], cap0=True, cap1=True)
    tube(bez((0, 0.060, 1.474), (0, 0.100, 1.456), (0, 0.108, 1.424), (0, 0.088, 1.404), 8),
         [0.026, 0.037, 0.045, 0.048, 0.046, 0.038, 0.028, 0.016, 0.008], n=12)


def braid_pts(sgn):
    """draped OVER the shoulder and down the front of the chest: the silhouette has to carry her.
    The root is buried inside the shell — starting on the jaw is what made the plait read as a
    scarf — and the whole rope swings, because a dead-straight one reads as a strap."""
    a = bez((sgn * 0.044, 0.048, 1.478), (sgn * 0.098, 0.034, 1.412), (sgn * 0.126, -0.052, 1.340),
            (sgn * 0.112, -0.100, 1.236), 12)
    b = bez((sgn * 0.112, -0.100, 1.236), (sgn * 0.104, -0.078, 1.136), (sgn * 0.092, -0.098, 1.090),
            (sgn * 0.083, -0.114, 1.036), 12)
    pts = a + b[1:]
    n = len(pts)
    return [(p[0] + sgn * 0.011 * math.sin(i / float(n - 1) * math.pi * 2.0), p[1], p[2])
            for i, p in enumerate(pts)]


def build_braids():
    for sgn in (1, -1):
        pts = braid_pts(sgn)
        radii = []
        for i in range(len(pts)):
            t = i / float(len(pts) - 1)
            # a plait is a rope of overlapped locks: the scallop has to be legible, not 8 %
            base = (0.030 * (1.0 - 0.62 * t) + 0.006) * (1.0 + 0.17 * math.cos(t * math.pi * 11.0))
            radii.append((base, base * 0.90))
        tube(pts, radii, n=10)
        tube(bez((sgn * 0.083, -0.114, 1.036), (sgn * 0.081, -0.110, 1.006), (sgn * 0.078, -0.106, 0.986),
                 (sgn * 0.076, -0.110, 0.962), 5), [0.007] * 6, n=8)


def build_braid_ties():
    """a plait has to be TIED. Without a band and two tails the braid simply stops, which read as a
    hook jutting out of the front of her dress. The tie sits ABOVE the folded hands: the old ends
    finished at hand height two inches either side of the clasped gloves, and from the reveal stance
    the two ribbons and six gloved finger-rods merged into one dark-and-white knot with two horns."""
    for sgn in (1, -1):
        add_loft([prof(0.998, 0.015, 0.012, n=10, cy=-0.108, cx=sgn * 0.080),
                  prof(0.984, 0.021, 0.016, n=10, cy=-0.108, cx=sgn * 0.080),
                  prof(0.970, 0.015, 0.012, n=10, cy=-0.108, cx=sgn * 0.080)], cap0=True, cap1=True)
        for w in (1, -1):
            tube(bez((sgn * 0.080, -0.108, 0.984), (sgn * (0.080 - 0.006 * w), -0.104, 0.962),
                     (sgn * (0.080 - 0.013 * w), -0.101, 0.946), (sgn * (0.080 - 0.017 * w), -0.099, 0.934), 5),
                 [0.0068, 0.0072, 0.0062, 0.0048, 0.0034, 0.0020], n=6)


# ================================================================ ARMS
# The sleeve is dress, the hand is paper-white: they must be separate builders so the vertex
# colour ranges stay contiguous (PAINT records a span, not a set).
# The hands are CLASPED in front of her, not hanging at her sides: two dead-straight tubes down the
# flanks of a bell skirt is what made the 3/4 read as a coat stand, and folded hands pull the widest
# part of her silhouette down into the skirt, which IS the period silhouette.
def ELBOW(sgn):
    return (sgn * 0.208, -0.062, 1.098)


def WRIST(sgn):
    return (sgn * 0.072, -0.206, 0.918)


def build_sleeve(sgn):
    ex, ey, ez = ELBOW(sgn)
    wx, wy, wz = WRIST(sgn)
    # ONE continuous loft shoulder->wrist. Two tubes meeting at the elbow left a ring crease across
    # the arm that read as an articulated doll joint; the forearm's first handle is the upper arm's
    # last handle mirrored through the elbow, so the centreline is tangent-continuous there.
    pts = bez((sgn * 0.148, -0.004, 1.352), (sgn * 0.194, -0.010, 1.338), (sgn * 0.216, -0.030, 1.246),
              (ex, ey, ez), 10)
    pts += bez((ex, ey, ez), (sgn * 0.200, -0.094, 0.950), (sgn * 0.130, -0.215, 0.945),
               (wx, wy, wz), 8)[1:]
    # a period leg-of-mutton, but the crest sits just BELOW the shoulder point: a ball on top of the
    # shoulder is what made her read bulky from the front.
    STOPS = ((0.00, 0.055), (0.13, 0.064), (0.36, 0.056), (0.62, 0.045), (1.00, 0.033))

    def ramp(t):
        for (a0, v0), (a1, v1) in zip(STOPS, STOPS[1:]):
            if t <= a1:
                return v0 + (v1 - v0) * (t - a0) / max(1e-6, a1 - a0)
        return STOPS[-1][1]

    tube(pts, [ramp(i / float(len(pts) - 1)) for i in range(len(pts))], n=14)


def build_glove(sgn):
    """cuff, palm, three fingers held together, a thumb. Everything is built along the forearm's own
    axis, because the wrist is now angled inward and a cuff lofted in the XZ plane would sit across
    it like a washer. The two hands fold over each other on the centre line, so their fingertips are
    offset 12 mm in y rather than sharing one space."""
    # the cuff is dress made visible: without a gathered band the white hand simply grows out of the
    # sleeve and the wrist reads as a broken stick
    tube([(sgn * 0.094, -0.190, 0.946), (sgn * 0.080, -0.202, 0.926), (sgn * 0.070, -0.208, 0.912)],
         [0.037, 0.048, 0.043], n=12)
    tube([(sgn * 0.070, -0.208, 0.912), (sgn * 0.046, -0.212, 0.894), (sgn * 0.028, -0.208, 0.876)],
         [0.034, 0.033, 0.028], n=12)
    for off in (-0.007, 0.000, 0.007):
        tube([(sgn * 0.026, -0.206 + off, 0.874), (sgn * 0.014, -0.202 + off * 0.8, 0.861),
              (sgn * 0.007, -0.198 + off * 0.5 - sgn * 0.005, 0.852)],
             [0.0095, 0.0085, 0.0050], n=7)
    tube([(sgn * 0.044, -0.222, 0.900), (sgn * 0.026, -0.234, 0.884), (sgn * 0.010, -0.228, 0.868)],
         [0.0085, 0.0075, 0.0055], n=6)


def build_boots():
    for sgn in (1, -1):
        tube(bez((sgn * 0.080, 0.010, 0.150), (sgn * 0.080, 0.002, 0.104), (sgn * 0.080, -0.028, 0.062),
                 (sgn * 0.080, -0.070, 0.034), 8), [0.044] + [0.042] * 8, n=12)
        tube([(sgn * 0.080, -0.070, 0.034), (sgn * 0.080, -0.116, 0.022), (sgn * 0.080, -0.132, 0.009)],
             [0.040, 0.032, 0.015], n=10)
        tube([(sgn * 0.080, 0.014, 0.056), (sgn * 0.080, 0.020, 0.026), (sgn * 0.080, 0.018, 0.008)],
             [0.022, 0.018, 0.011], n=8)


def pair(fn):
    return lambda: (fn(1), fn(-1))


P(DRESS, build_skirt, 'dress')
P(SASH, build_sash, 'sash')
P(BODICE, build_bodice, 'bodice')
P(PAPER, build_studs, 'paper')
P(BODICE, pair(build_sleeve), 'bodice')
P(PAPER, pair(build_glove), 'paper')
P(PAPER, build_collar, 'paper')
P(RIBB, build_brooch, 'paper')
P(SKIN, build_head, 'skin')
P(EYE, build_eyes, 'eye')
P(EYE_PU, build_pupils, 'eye')
P(EYE_LO, build_eye_lo, 'eye')
P(EYE_HI, build_eye_hi, 'eye')
P(BROW, build_brows, 'eye')
P(SKIN_SH, build_nose, 'skin')
P(MOUTH, build_mouth, 'eye')
P(HAIR, build_hair, 'hair')
P(HAIR_DK, build_bangs, 'hair')
P(HAIR, build_braids, 'hair')
P(RIBB, build_braid_ties, 'paper')
P(BOOT, build_boots, 'boot')

# feet on the floor, height pinned to the authored metre count (the loader's numbers mean "height")
_zs = [v.co.z for v in bm.verts]
_dz = -min(_zs)
for v in bm.verts:
    v.co.z += _dz
_scale = HEIGHT / max(v.co.z for v in bm.verts)
for v in bm.verts:
    v.co.x *= _scale
    v.co.y *= _scale
    v.co.z *= _scale

me = bpy.data.meshes.new(NAME)
bm.to_mesh(me)
bm.free()
obj = bpy.data.objects.new(NAME, me)
coll.objects.link(obj)
for p in me.polygons:
    p.use_smooth = True

# ------------------------------------------------------------------ authored light pass
# Vertex colour is the ONLY colour carrier this asset has, so the modelling file has to do the
# LITTING too. Under the scene's emissive term a flat part colour stays flat from every angle,
# which is exactly the paper-cut-out read; a per-vertex key/fill/rim plus contact ramps is what
# turns a silhouette into a body. The three directions are not invented: they are the scene's own
# lamp, sun and rim light, transformed from world into her authored frame (yaw 2.1 rad, face -Y).
KEY = Vector((0.16, -0.78, 0.60)).normalized()    # the keeper's lamp: her front, above
SUN = Vector((-0.75, 0.53, 0.40)).normalized()    # the low sun behind her left shoulder
FILL = Vector((-0.91, -0.29, 0.24)).normalized()  # the scene's rim light, front-left and low


def _ramp(x, a, b):
    return max(0.0, min(1.0, (x - a) / max(1e-6, b - a)))


def _shade(co, n, tag):
    k = max(0.0, n.dot(KEY))
    u = max(0.0, n.dot(SUN))
    f = max(0.0, n.dot(FILL))
    sky = 0.5 + 0.5 * n.z
    s = 0.300 + 0.520 * k + 0.200 * u + 0.160 * f + 0.100 * sky
    z = co.z
    if tag in ('dress', 'sash'):
        ang = math.atan2(co.y - 0.006, co.x)
        # the pleats are already in the geometry; only a colour that follows them will be SEEN
        s *= 0.820 + 0.240 * (0.5 + 0.5 * math.cos(8 * ang + 0.5))
        s *= 1.0 - 0.260 * (1.0 - _ramp(z, 0.02, 0.40))
    if tag == 'bodice':
        s *= 1.0 - 0.180 * (1.0 - _ramp(z, 0.87, 1.05))
    if tag == 'hair':
        s *= 0.800 + 0.260 * _ramp(z, 1.42, 1.66)
        if co.y > 0.030:
            s *= 0.740
        # the shell's own angular parameter (x on sin, y-0.010 on cos), so the colour's ridges land
        # on the geometry's ridges instead of drifting a quarter-wave across them
        ang = math.atan2(co.x, co.y - 0.010)
        s *= 0.880 + 0.160 * (0.5 + 0.5 * math.cos(12.0 * ang + 0.35))
    if tag == 'skin':
        # a face must never go as dark as a dress: skin keeps its own, shallower ramp
        s = 0.520 + 0.340 * k + 0.120 * u + 0.100 * sky
        # the front of a face is nearly one plane, so a normal-only ramp leaves it flat no matter how
        # much geometry is on it. The sides and the jaw are taken down by hand, which is what makes
        # the brow and the cheekbones come forward.
        s *= 1.0 - 0.200 * _ramp(abs(co.x), 0.028, 0.066)
        s *= 0.930 + 0.090 * _ramp(z, 1.440, 1.560)
        if z < 1.452 and math.hypot(co.x, co.y) < 0.075:
            s *= 0.700
        if z > 1.545:
            s *= 0.880
    if tag == 'boot':
        s *= 1.0 - 0.300 * (1.0 - _ramp(z, 0.00, 0.14))
    if tag == 'eye':
        s = max(0.860, min(1.100, 0.600 + 0.420 * k + 0.140 * u))
    s *= 1.0 - 0.260 * (1.0 - _ramp(z, 0.00, 0.13))   # contact shadow, every part
    return s


_sh = []
for _a, _b, _col, _tag in PAINT:
    for _i in range(_a, _b):
        _sh.append((_i, _col, _shade(me.vertices[_i].co, me.vertices[_i].normal, _tag)))
_mean = sum(v for _, _, v in _sh) / max(1, len(_sh))
# The raw ramp spans 6:1, which is a stage-lit doll once the scene multiplies its own lights in on
# top. Compress it with a curve and re-level to the same mean: the FORM survives, the BLOWN-out and
# the crushed-to-black do not.
_c = [(v / _mean) ** 0.55 for _, _, v in _sh]
_m2 = sum(_c) / max(1, len(_c))
print('KEEPER shade bake: raw mean=%.3f min=%.3f max=%.3f -> levelled min=%.3f max=%.3f' %
      (_mean, min(v for _, _, v in _sh), max(v for _, _, v in _sh),
       min(x / _m2 for x in _c), max(x / _m2 for x in _c)))

# vertex colour layer: per-part ranges, last writer wins where parts overlap
cl = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
for i in range(len(me.vertices)):
    cl.data[i].color = (0.5, 0.5, 0.5, 1.0)
for (_i, _col, _v), _g0 in zip(_sh, _c):
    g = _g0 / _m2
    cl.data[_i].color = (min(1.0, _col[0] * g), min(1.0, _col[1] * g), min(1.0, _col[2] * g), 1.0)

# ------------------------------------------------------------------ preview renders
def mkcam(name, loc, tgt, lens):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
    o = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    coll.objects.link(o)
    o.location = loc
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y')
    o.data.lens = lens
    return o


def shoot():
    for n in ('FigCam34', 'FigCamSil', 'FigCamBack', 'FigCamFace'):
        drop(n)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 680
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    # FLAT, not STUDIO: the browser owns the lighting, so the preview's only job is to show the
    # ALBEDO the authored light pass baked. Studio shading on top of a baked ramp double-shades her
    # and let the first flat-face verdict look lit when it was not.
    try:
        scene.display.shading.light = 'FLAT'
        scene.display.shading.color_type = 'VERTEX'
        scene.display.shading.show_shadows = False
    except Exception as e:
        print('SHADE_WARN', e)
    # the reveal stance itself, not a convenience angle: 5.6 m at the finale's 40 deg vertical fov
    # is lens 18/tan(20) = 49.5 mm, so this frame is the one the jury will see.
    scene.camera = mkcam('FigCam34', (1.60, -5.30, 1.30), (0.0, 0.0, 1.05), 49.5)
    scene.render.filepath = os.path.join(OUT, 'keeper_34.png')
    bpy.ops.render.render(write_still=True)
    # the face is the whole argument at jury size: shoot it as the finale will see it
    scene.camera = mkcam('FigCamFace', (0.16, -1.02, 1.49), (0.0, 0.00, 1.475), 92.0)
    scene.render.filepath = os.path.join(OUT, 'keeper_face.png')
    bpy.ops.render.render(write_still=True)
    try:
        scene.display.shading.light = 'FLAT'
        scene.display.shading.color_type = 'SINGLE'
        scene.display.shading.single_color = (0.02, 0.02, 0.02)
    except Exception as e:
        print('SHADE_WARN', e)
    scene.camera = mkcam('FigCamSil', (0.22, -3.62, 0.92), (0.0, 0.01, 0.84), 72.0)
    scene.render.filepath = os.path.join(OUT, 'keeper_sil.png')
    bpy.ops.render.render(write_still=True)
    scene.camera = mkcam('FigCamBack', (-0.30, 3.62, 0.98), (0.0, 0.01, 0.86), 72.0)
    scene.render.filepath = os.path.join(OUT, 'keeper_back.png')
    bpy.ops.render.render(write_still=True)


shoot()

bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
xs = [v.x for v in bb]
ys = [v.y for v in bb]
zs = [v.z for v in bb]
print('KEEPER tris=%d verts=%d w=%.3f d=%.3f h=%.3f zmin=%.3f' %
      (len(me.polygons), len(me.vertices), max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs), min(zs)))

# ------------------------------------------------------------------ export
# Blender Z-up in this file; export_yup converts to glTF Y-up on the way out like every other asset
# in world/assets/models. The face is authored toward Blender -Y, which becomes glTF +Z — she looks
# at the camera. Compress with `meshopt --quantize-color 16`, never `optimize`: the face, the hair
# gradient and the dress all band at 8-bit (same law as WritingDesk / FinaleCrown).
import json as _json, struct as _struct

_here = os.path.dirname(os.path.abspath(globals().get('__file__', os.getcwd() + '/gen_keeper.py')))
GLB = os.path.normpath(os.path.join(_here, '..', 'assets', 'models', 'GardenKeeper.glb'))
# Deselect at the data level, not with bpy.ops.object.select_all: that operator polls for a window
# and can silently no-op under a headless / MCP context override, which left a previously-selected
# FinaleCrown in the first export so that use_selection had nothing to filter.
for _o in bpy.data.objects:
    try:
        _o.select_set(False)
    except RuntimeError:
        pass
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
if os.path.exists(GLB):
    os.remove(GLB)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True)

# Verify the written container rather than trusting the exporter's log: one node, one primitive,
# 16-bit colour (componentType 5123 = UNSIGNED_SHORT; 5121 would be the banding 8-bit).
_d = open(GLB, 'rb').read()
_j = _json.loads(_d[20:20 + _struct.unpack('<I', _d[12:16])[0]])
_nodes = [n.get('name') for n in _j.get('nodes', [])]
_cols = [(_a['type'], _a['componentType'])
         for _m in _j.get('meshes', []) for _p in _m['primitives']
         for _k, _i in _p['attributes'].items() if _k == 'COLOR_0'
         for _a in [_j['accessors'][_i]]]
assert _nodes == ['Keeper'], 'KEEPER EXPORT NODES %r' % (_nodes,)
assert _cols and all(c == ('VEC4', 5123) for c in _cols), 'KEEPER EXPORT COLOR %r' % (_cols,)
print('KEEPER glb wrote %s (%d bytes) nodes=%s color=%s' %
      (GLB, os.path.getsize(GLB), _nodes, _cols))
