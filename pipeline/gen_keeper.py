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
SKIN_SH = (0.660, 0.528, 0.462)  # the nose and the hollows: skin one stop down, not a new hue.
                                  # At 0.56/0.40 it was a salmon bead sitting in the middle of a
                                  # pale face — a second feature, not the shadow of one.
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
SCLERA = (0.880, 0.872, 0.915)  # the eye's own white: a blue oval with no sclera is a painted hole
EYE_TOP = (0.038, 0.062, 0.185)  # the iris darkens under the upper lid; flat blue is a sticker
BROW  = (0.155, 0.105, 0.075)  # reads as the upper lash line, not a floating tan comma
LASH  = (0.042, 0.038, 0.058)  # the lash LINE, and it cannot share the brow's colour: at BROW's value
                                # the band above her eye read as a second, thicker eyebrow sitting on
                                # the lid. A lash is the darkest stroke on an anime face.
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


def prof(cz, rx, ry, n=20, cy=0.0, lobes=0, amp=0.0, phase=0.0, cx=0.0, tilt=0.0, hz=0.0):
    """an elliptical ring; `lobes` pleats it, `tilt` lifts the FRONT (sin<0) when negative.

    `hz` scallops the ring in z on the pleats' own phase, and only UPWARD: with the +1.0 the ring's
    lowest point stays exactly where `cz` puts it and the folds pull up to 2*hz above it. That is
    how a hanging hem behaves — the gores touch down and the pleat folds lift between them — and it
    is what keeps the shipped min-z, and therefore her standing height, untouched."""
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        s = math.sin(a)
        if lobes:
            c = math.cos(lobes * a + phase)
            k = 1.0 + amp * c
            dz = hz * (c + 1.0)
        else:
            k = 1.0
            dz = 0.0
        out.append((cx + rx * k * math.cos(a), cy + ry * k * s, cz + tilt * s + dz))
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
         # The chest rows carry a BUST: ry grows and cy falls by the same amount, so cy+ry (the back
         # surface) is identical row for row and only the front moves. A bodice that is a straight
         # vertical wall from collar to waist is the loudest thing in her profile.
         (1.284, 0.166, 0.126, -0.014), (1.248, 0.150, 0.124, -0.011), (1.190, 0.134, 0.104, -0.001),
         (1.130, 0.122, 0.095, 0.004), (1.075, 0.115, 0.091, 0.004), (1.020, 0.112, 0.089, 0.004),
         (0.965, 0.116, 0.094, 0.004), (0.910, 0.128, 0.105, 0.004), (0.868, 0.150, 0.122, 0.004)]
# The skirt used to begin at 0.868 with rx 0.185 — 57 mm wider than the bodice at that height, which
# is the horizontal shelf the 3/4 showed and the reason she looked poured into a cone. It now starts
# at the natural waist, enclosing the torso by under 10 mm, and spends its whole width below.
#
# Below the hip this table used to have a CONSTANT dr/dz of 0.196 from 0.790 all the way to the hem:
# a straight-sided cone, which is the single loudest "paper lampshade" note in her silhouette and the
# reason no amount of pleat colour made the skirt read as cloth. Cloth over a petticoat accelerates
# — it hangs close to the hip and only commits to its full sweep in the last third. The rows below
# swing dr/dz monotonically from 0.06 at the hip to 0.40 at the hem while landing on the SAME
# 0.341 hem radius, so her projected width, and every silhouette bar hung off it, is unchanged.
SKIRT = [(0.946, 0.126, 0.104), (0.918, 0.140, 0.114), (0.894, 0.160, 0.128), (0.868, 0.185, 0.145),
         (0.790, 0.190, 0.151), (0.700, 0.200, 0.160), (0.600, 0.213, 0.171), (0.490, 0.231, 0.186),
         (0.380, 0.252, 0.204), (0.270, 0.278, 0.225), (0.170, 0.304, 0.246), (0.100, 0.326, 0.264),
         (0.062, 0.341, 0.276)]


def build_skirt():
    sk = []
    for z, rx, ry in SKIRT:
        # clamped: the three new waist rows sit ABOVE 0.868, and an unclamped t goes negative there,
        # which pushed cy forward and dropped z — the gather rode out in front of the bodice.
        t = max(0.0, (0.868 - z) / 0.813)
        # the pleat depth runs from 1.8 % just under the waistband to 24.6 % at the hem (it used to
        # start at 0.6 %): a gathered skirt is flatter where it is sewn, but a skirt whose folds do
        # not appear until forty percent of the way down is a cone with a ruffle on the end of it.
        # hz rides t**3 so the swing is all in the last 150 mm: 44 mm of hem scallop at the same
        # phase as the pleats. A dead-flat hem line is what made the bottom edge read as cut paper.
        sk.append(prof(z - 0.028 * t * t, rx, ry, n=40, cy=0.006 + 0.040 * t * t,
                       lobes=8, amp=0.018 + 0.228 * t * t, phase=0.5, tilt=-0.055 * t,
                       hz=0.022 * t ** 3))
    add_loft(sk)
    # The hem's own turn-under. Both rows carry the same hz as the surface above them and sit a
    # constant 4 mm / 18 mm below it, so the band stays attached at every angle and its lowest point
    # is still z 0.012 — the shipped min-z, and so her height after the export rescale, do not move.
    add_loft([prof(0.030, 0.326, 0.262, n=40, cy=0.046, lobes=8, amp=0.200, phase=0.5,
                   tilt=-0.055, hz=0.022),
              prof(0.012, 0.298, 0.238, n=40, cy=0.044, lobes=8, amp=0.180, phase=0.5,
                   tilt=-0.048, hz=0.022)],
             cap1=True)


# A sash is a BAND sewn to the waist; it is not where the skirt flares. The old table opened from
# rx 0.114 to 0.166 over 130 mm while the body behind it stayed straight, so she wore a hopper
# around her midsection and the profile showed a black slit where its hem left the skirt. These rows
# are the bodice/skirt envelope + 8 mm at every height, so the only edge that shows is the top rim,
# and the lower rim meets the skirt within 5 mm — near-tangent, no channel for the sky to show in.
SASH_T = [(1.008, 0.121, 0.098, 0.004), (0.990, 0.122, 0.100, 0.004), (0.970, 0.124, 0.102, 0.004),
          (0.950, 0.136, 0.112, 0.005), (0.930, 0.143, 0.118, 0.006)]


def build_sash():
    add_loft([prof(z, rx, ry, n=32, cy=cy) for z, rx, ry, cy in SASH_T], cap0=True, cap1=True)


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
    height, so the only intersection is the clean rim she is meant to show.

    The third failure was the one in the shipped frame: its top row stood at 1.426 on a neck that
    ends at 1.444, so 18 mm of skin showed and her head appeared to grow out of a white stalk. The
    rim is down at 1.410 and the band is wider, so a third of the neck reads as NECK and the collar
    is a collar.

    The fourth failure was not a hole but a line: the band's outer rows were authored at almost
    exactly the bodice's own radius (0.057 at 1.398 against a torso at 0.0573 there), so the two
    surfaces ran tangent for 20 mm and a camera ray that skimmed the shoulder passed between them
    and out the far side of her — a 5x6-px hole with ZERO triangle hits. The rows are now the torso
    envelope plus 9-12 mm, so the collar OVERHANGS the shoulder it is supposed to sit on, and they
    cross it at 27 deg instead of at 3."""
    add_loft([prof(1.410, 0.049, 0.051, n=20, cy=0.008), prof(1.398, 0.066, 0.062, n=20, cy=0.007),
              prof(1.388, 0.078, 0.076, n=20, cy=0.007), prof(1.376, 0.092, 0.084, n=20, cy=0.006)],
             cap0=True, cap1=True)


def build_brooch():
    """The collar's pin. It was authored with `face_disc`, which places a feature on the HEAD's own
    surface — at z 1.380 that function returns the clamped jaw ellipse, so the brooch sat at y -0.025
    while her chest front is at -0.075. It has never once appeared in a render: it is inside her.
    A lens lofted on the bodice's own front is the same three rings at the right depth."""
    add_loft([prof(1.391, 0.0080, 0.0062, n=12, cy=-0.0700),
              prof(1.380, 0.0122, 0.0096, n=12, cy=-0.0730),
              prof(1.369, 0.0080, 0.0062, n=12, cy=-0.0700)], cap0=True, cap1=True)


# ================================================================ HEAD
# The three lowest rows are the jaw. They narrow in x for the chin but they must FLATTEN in y at the
# same time: a round cross-section down there is a muzzle, and the face render proved it — the old
# table gave her a horse's snout with the nose and mouth riding the end of it.
#
# The cheekband rows are now 6-7 % narrower than they were. At 138 mm across the zygomatics, with the
# hair shell adding 10 mm to that, the head measured 158 x 176 mm — a 0.90 width-to-height egg, and an
# egg has no face to put features on: the eyes, nose and mouth all landed on one flat wall. 128 mm at
# the cheekbones puts the front of the skull back into a face proportion, and because the hair shell is
# authored as an OFFSET of this table it narrows with it, so the helmet cannot stay wide while the head
# gets small.
#
# The egg survived that pass because only the CHEEKBONES were narrowed. The chin row still stood at
# 36 mm against a 64.5 mm cheek — 0.56 — and a jaw that barely tapers is a muzzle: the shipped face
# render shows exactly that, a wide flat lower storey with the nose and mouth riding down the middle
# of it like decals on a door. The jaw rows are cut to 0.35 of the cheek now and the taper starts a
# full row earlier, so the lower face comes to a point instead of ending in a wall.
HEAD = [(1.436, 0.0225, 0.0215), (1.452, 0.0330, 0.0330), (1.472, 0.0455, 0.0465), (1.500, 0.0590, 0.0760),
        (1.528, 0.0645, 0.0810), (1.554, 0.0620, 0.0795), (1.578, 0.0575, 0.0710), (1.598, 0.0470, 0.0590),
        (1.611, 0.0300, 0.0380), (1.618, 0.0120, 0.0150)]


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


def _g1(v, c, w):
    t = (v - c) / w
    return math.exp(-t * t) if abs(t) < 2.8 else 0.0


def relief(x, z):
    """How far the face stands out from the lofted ellipsoid, in metres, at (x, z).

    The head was 10 rows x 18 columns — 180 vertices for a face whose eye socket is 25 mm across.
    Ring spacing along the front arc was ~22 mm, so a socket could not be SAMPLED, let alone shaded:
    every feature was a flat disc painted on an unbroken balloon, which is the physical reason she
    read as a sticker face rather than a face. The loft is now 26 x 44 and this field displaces it,
    so the features sit in bone: a frontal plane that wraps, a brow ridge, two sockets, a bridge
    running to a tip, cheekbones, a chin, and the hollow under them.

    Positive is outward (toward -y, which is the face side per `face_y`). Every term is a gaussian
    so the field is C1 and no ridge in it can show as a crease once the scene's own moon term
    grazes it."""
    ax = abs(x)
    r = 0.0
    r += 0.0060 * _g1(z, 1.5230, 0.0340) * (1.0 - 0.85 * _g1(ax, 0.0550, 0.0300))  # frontal plane
    r += 0.0046 * _g1(z, 1.5492, 0.0072) * (1.0 - 0.90 * _g1(ax, 0.0600, 0.0340))  # brow ridge
    r -= 0.0052 * _g1(z, 1.5315, 0.0100) * _g1(ax, 0.0335, 0.0125)                 # sockets
    r += 0.0030 * _g1(z, 1.5360, 0.0180) * _g1(ax, 0.0000, 0.0070)                 # nose bridge
    r += 0.0062 * _g1(z, 1.5045, 0.0075) * _g1(ax, 0.0000, 0.0085)                 # nose tip
    r += 0.0038 * _g1(z, 1.5130, 0.0125) * _g1(ax, 0.0430, 0.0130)                 # cheekbone
    r += 0.0048 * _g1(z, 1.4520, 0.0105) * _g1(ax, 0.0000, 0.0170)                 # chin
    r += 0.0024 * _g1(z, 1.4880, 0.0085) * _g1(ax, 0.0000, 0.0160)                 # mouth mound
    r -= 0.0020 * _g1(z, 1.4700, 0.0075) * _g1(ax, 0.0320, 0.0120)                 # cheek hollow
    return r


def build_head():
    # the neck is set BACK and made thinner than the new, flatter jaw: a chin narrower in y than the
    # neck it hangs off pushes that neck through her jawline as a skin-coloured bulge
    tube([(0, 0.012, z) for z in (1.406, 1.424, 1.444)], [0.0315, 0.0340, 0.0365], n=16)
    # the jaw rows also push forward: narrowing alone gives a flat, featureless lower face. Only a
    # nudge — the old 12 mm jut on a round section is what turned it into a snout.
    NR, NC = 26, 44
    z0, z1 = HEAD[0][0], HEAD[-1][0]
    jut = lambda z: 0.007 * smooth((1.480 - z) / 0.038) if z < 1.480 else 0.0
    rings = []
    for i in range(NR):
        z = z0 + (z1 - z0) * i / float(NR - 1)
        rx, ry = skull(z)
        cy = 0.004 - jut(z)
        row = []
        for j in range(NC):
            a = 2 * math.pi * j / float(NC)
            ca, sa = math.cos(a), math.sin(a)
            wf = smooth(sa) if sa > 0.0 else 0.0        # the field lives on the face, not the scalp
            row.append((rx * ca, cy - ry * sa - relief(rx * ca, z) * wf, z))
        rings.append(row)
    add_loft(rings, cap0=True, cap1=True)


def face_y(x, z):
    """y of the skull surface at (x,z) — features must conform to it or they sink into the face.
    This includes `relief`, and it has to: the paint is placed against this function, so if the loft
    carries the bone and the decals do not, every feature floats off the surface by exactly the
    depth of its own socket."""
    rx, ry = skull(z)
    k = max(0.0, 1.0 - (x / max(1e-6, rx)) ** 2)
    return 0.004 - ry * math.sqrt(k) - relief(x, z)


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


def face_band(sgn, cx, cz, rx, rz, lift=0.0030, n=14, a0=0.06, a1=0.94, k0a=0.80, k1a=1.08,
              k0b=0.80, k1b=1.00):
    """A ribbon that rides the SAME ellipse a face_disc is drawn on: angles are in units of pi from
    the eye's outer corner (a=0) over the top (a=0.5) to the inner corner (a=1), and k scales the
    radius. Negative a sweeps the lower arc.

    This exists because a lash line authored as a second disc cannot work. A disc's centre is on the
    outline and its top edge is rz above it, so an ellipse laid above the eye meets it at one point
    and floats away at the corners — the measured defect was a brown arch touching her iris over the
    nose and hovering 13 mm above both outer corners, which reads as two wings rather than a lash.

    `cx` is an unsigned DISTANCE from the centreline and the sign mirrors the whole point set, not
    just the radius: `cx + sgn*rx*cos` leaves both sides sitting on the same eye, which is how she
    ended up with a heavy lash and brow over one socket and bare skin over the other."""
    def pt(a, k):
        u = cx + rx * k * math.cos(a)
        x = sgn * u
        z = cz + rz * k * math.sin(a)
        return bm.verts.new((x, face_y(x, z) - lift, z))

    A, B = [], []
    for i in range(n + 1):
        t = i / float(n)
        a = math.pi * (a0 + (a1 - a0) * t)
        A.append(pt(a, k0a + (k0b - k0a) * t))
        B.append(pt(a, k1a + (k1b - k1a) * t))
    made = []
    for i in range(n):
        try:
            made.append(bm.faces.new((A[i], A[i + 1], B[i + 1], B[i])))
        except ValueError:
            pass
    tot = Vector((0.0, 0.0, 0.0))
    for fc in made:
        tot += fc.normal
    if tot.y > 0.0 and made:
        bmesh.ops.reverse_faces(bm, faces=made)


# The eye is authored in its OWN coordinates and every layer is a band or a disc on that one
# ellipse, so the layers can only ever be concentric. That is the whole point: the previous stack
# was seven independent discs at seven centres, and the two loudest defects it produced — a brown
# arch hovering over both outer corners and a pale ellipse lying BELOW the eye like a bruise —
# are what happens when the layers are not tied to a shared outline.
EX, EZ = 0.0336, 1.5296        # lens centre, mirrored in x by the side
ERX, ERZ = 0.0166, 0.0160      # 33.2 x 32.0 mm against a 129 mm head is 0.257 of its width. The
                               # previous lens was 0.239, and at jury size that is the difference
                               # between an anime face and a doll with its eyes painted too small.
IX, IZ = 0.0344, 1.5290        # the iris sits low and a hair outward, under the lid
IRX, IRZ = 0.0140, 0.0152      # sized to the OPENING, not floated inside it. At 12.2 x 14.2 mm the
                               # lens left 2.4 mm of white at the sides and 1.4 mm over the top, and
                               # the jury frame reads that as four white crescents around a marble —
                               # the eye looking up rather than looking out. This leaves 1.4 mm under
                               # the upper lid (the lash covers it) and meets the lower lid at 0.2 mm.


def build_sclera():
    """the white. Without it a blue oval on a skin face is a painted-on hole, which is what she had."""
    for sgn in (1, -1):
        face_disc(sgn * EX, EZ, ERX, ERZ, lift=0.0026, n=16)


def build_iris():
    for sgn in (1, -1):
        face_disc(sgn * IX, IZ, IRX, IRZ, lift=0.0032, n=14)


def build_iris_top():
    """the upper third of the iris goes dark under the lid. An iris with no top shade is a flat
    sticker; with it, the same disc reads as a sphere behind an opening."""
    for sgn in (1, -1):
        face_band(sgn, IX, IZ, IRX, IRZ, lift=0.0036, n=12, a0=0.05, a1=0.95,
                  k0a=0.55, k1a=1.0, k0b=0.55, k1b=1.0)


def build_pupils():
    for sgn in (1, -1):
        face_disc(sgn * 0.0346, 1.5276, 0.0066, 0.0086, lift=0.0046, n=12)


def build_eye_lo():
    """the lamp catch on the LOWER iris, drawn as a band inside the iris's own outline. As a disc it
    was wider than the eye at that height and spilled onto the skin — the pale crescent that read as
    a bag. THE LIFT LAW: it draws on the pupil (0.0046), so it has to clear it."""
    for sgn in (1, -1):
        face_band(sgn, IX, IZ, IRX, IRZ, lift=0.0050, n=12, a0=-0.10, a1=-0.90,
                  k0a=0.36, k1a=0.97, k0b=0.36, k1b=0.93)


def build_eye_hi():
    """one pale dot, upper-INNER, where the keeper's lamp at her right shoulder actually catches.
    5.2 x 6.0 mm: the old 9.6 x 12.4 mm catchlight was a second sclera."""
    for sgn in (1, -1):
        face_disc(sgn * 0.0276, 1.5366, 0.0028, 0.0033, lift=0.0054, n=8)


def build_lash():
    """the dark stroke riding the TOP EDGE of the eye. It is a band on the lens ellipse with its
    outer end flared, so it thickens toward the temple the way a lash does and cannot detach at the
    corners the way a disc above the eye did.

    `k0` is the band's INNER edge, and it has to tuck under the iris. It used to sit at 0.70/0.88 of
    the lens, which cleared the top of the iris by 1.6 mm and drew a sliver of white between the two
    — and a white sliver over a blue lens is not an eyelid, it is a bruise. `k1` is its OUTER edge and
    it has to REACH the lens rim: at 0.94/0.84 it stopped 1 mm short, and that 1 mm of white above a
    brown line is the same bruise one layer out. So the band is now pinned to the rim at the top
    (k 1.00) and lifted to 0.74-0.76 inside, which is 3.7 mm deep over the iris's own crown — the
    iris having been raised 2 mm to meet it. An earlier pass took k1 to 1.04/1.00 with k0 still at
    0.56/0.72 and drew a 6 mm brown lid across the eye instead of a lash: the two edges have to move
    together, because it is the SPAN that is the lash."""
    for sgn in (1, -1):
        face_band(sgn, EX, EZ, ERX * 1.02, ERZ * 1.04, lift=0.0038, n=16,
                  a0=0.02, a1=0.98, k0a=0.86, k1a=1.03, k0b=0.90, k1b=1.01)


def build_brows():
    """the brow proper. It used to run a0=0.10..a1=0.90 — the whole top arc — and because a band's
    radial thickness lies HORIZONTALLY at the arc's ends, that made two fat blobs at her temples with
    a hairline between them: a dash with thick ends, not a brow. Restricting the sweep to the top
    60 % keeps the thickness vertical where a brow has it, and the taper is then real: 1.6 mm at the
    temple tail, 3.3 mm at the inner head. It also drops 4 mm, so it sits 11 mm over the lid instead
    of 20 — a brow that high is a surprised face."""
    for sgn in (1, -1):
        face_band(sgn, 0.0340, 1.5508, 0.0158, 0.0080, lift=0.0034, n=14,
                  a0=0.18, a1=0.82, k0a=0.44, k1a=0.74, k0b=0.22, k1b=0.78)


def build_nose():
    """ONE shadow, under a tip that relief() already stands 6 mm proud of the face. The bridge disc
    this used to carry — 4.2 x 13.6 mm of SKIN_SH running up the middle of her face — is the second
    loudest cheap tell in the jury frame after the fringe: a nose is the shadow the tip casts, and a
    darker stripe down the centreline is a scratch. The two flanks are now modelled in `_shade`,
    where they are a fall of light and not a mark."""
    face_disc(0.0, 1.5032, 0.0052, 0.0023, lift=0.0022, n=10)


def build_mouth():
    """a mouth is a LINE with two corners. The old pill (13.6 x 5.2 mm, uniform MOUTH hue) read as a
    wound; this draws the lip mass and then rides a darker stroke across it, so the closure of the
    lips is what the eye finds first. The stroke's lift has to be LARGER than the lip's by a hair —
    at 0.0046 it was authored to clear the old flat skull and now that the mouth mound stands 2.4 mm
    proud, it sank inside the lip and never drew."""
    face_disc(0.0, 1.4885, 0.0064, 0.0032, lift=0.0022, n=12)
    face_disc(0.0, 1.4880, 0.0058, 0.0011, lift=0.0031, n=10)


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
    the curtain EMERGES from the hair rather than floating on it.

    Third pass, at model resolution: pale triangles sat at both temples above the fringe, and the
    colour of those triangles is SKIN — so it is the forehead showing through the seam between the
    shell's leading edge and the curtain's root, not a gap between the locks. Three changes, all
    aimed at the seam: the root and mid rows rise 10 mm so they overlap the shell rather than meet it
    edge to edge, the under-sheet's lowest row drops 14 mm so it is always below the notch it fills,
    and the arc widens past the shell's own front limit so the curtain, not the scalp, is the last
    surface at the temple.

    Fourth pass is the shape, not the seam. 48 columns / 5 was a CLEAN repeat: nine identical locks of
    identical depth, each 37 mm wide and 30 mm long, which is a row of triangles and the single
    loudest cheap tell in the jury frame. Real hair is cut in locks of different widths and different
    lengths, so the phase now accumulates over an irregular width table (4-6 columns) and each lock
    carries its own length from a second table. The depth drops 30 -> 15.5 mm with it: a lock is
    pointed because of its WIDTH-to-length ratio, and halving the length while varying the width is
    what turns icicles into a fringe.

    Fifth pass: the depth goes back UP, because 15.5 mm of scallop on a head that stands 90 px in the
    terminal frame is 8 px of edge — the locks were varied and still did not read. 26 mm, with the
    tables moved to module scope so `_shade` can key the hair's colour to the SAME phase. A fringe
    whose locks are only a silhouette is a paper chain; the notches have to be darker than the
    crowns, which means the geometry and the paint have to agree about where each lock is."""


NA = 48
A0 = 1.845
WID = (5, 4, 6, 4, 5, 6, 4, 5, 4, 6, 5, 4)               # columns per lock; does not divide 48
TIP = (1.16, 0.86, 1.04, 0.92, 1.20, 0.90, 1.10, 0.84, 1.00, 1.18, 0.88, 0.96)
_ph, _acc, _lk = [], 0.0, 0
for _i in range(NA + 1):
    _ph.append((_acc, _lk))
    _acc += 1.0 / WID[_lk]
    if _acc >= 1.0:
        _acc -= 1.0
        _lk += 1


def bang_a(co):
    """the fringe's own arc parameter recovered from a point: hair_pt puts x on sin(a) and 0.004-y on
    cos(a), so this is the same angle the curtain is lofted with, to within the scale factor f."""
    return math.atan2(co.x, 0.004 - co.y)


def bang_phase(a):
    """phase-within-lock at any arc angle, not just at the NA columns the loft is built from — the
    shade bake samples vertices that are not on that grid."""
    i = (a + A0) / (2 * A0) * NA
    if i <= 0:
        return _ph[0][0]
    if i >= NA:
        return _ph[NA][0]
    i0 = int(i)
    return _ph[i0][0] + (_ph[i0 + 1][0] - _ph[i0][0]) * (i - i0)


def dip_at(i):
    return 0.5 + 0.5 * math.cos(2 * math.pi * _ph[i][0])


def tip_len(i):
    return TIP[_ph[i][1] % len(TIP)]


def build_bangs():
    def over(k, scallop):
        rows = []
        for tag in ('root', 'mid', 'hem'):
            row = []
            for i in range(NA + 1):
                a = -A0 + 2 * A0 * i / NA
                d = dip_at(i) if scallop else 1.0
                side = 0.014 * smooth((abs(a) - 0.95) / 0.70)
                if tag == 'root':
                    z, f = 1.614, k * (1.18 + 0.04 * d)
                elif tag == 'mid':
                    z, f = 1.600, k * (1.30 + 0.075 * d)
                else:
                    z = 1.592 - 0.0260 * (d ** 2.0) * tip_len(i) - side
                    f = k * (1.10 + 0.075 * d)
                row.append(hair_pt(a, z, f))
            rows.append(row)
        return rows

    def under(k):
        """A flat under-sheet was the whole reason the fringe still read as a row of separate icicles
        with forehead between them: the over-sheet's notch reaches 1.592, a flat hem at 1.5855 plugs
        6.5 mm of that, and the remaining 20+ mm of the V showed skin. So the plug is the SAME scallop
        shifted half a lock out of phase — its tips fall exactly into the over-sheet's notches and its
        own notches sit behind the over-sheet's tips. Nothing here is a new silhouette; it is the old
        shape used as a plug instead of a band, and at every arc angle the lower of the two hems is the
        over-sheet's, which is the only edge the camera can reach.
        """
        rows = []
        for tag, (z0, fz) in enumerate(((1.612, 1.14), (1.600, 1.10), (1.588, 1.05))):
            row = []
            for i in range(NA + 1):
                a = -A0 + 2 * A0 * i / NA
                if tag == 2:
                    d = 1.0 - dip_at(i)                          # half a lock out of phase
                    z = z0 - 0.0225 * (d ** 2.0) * tip_len(i)
                else:
                    z = z0
                row.append(hair_pt(a, z - 0.012 * smooth((abs(a) - 0.95) / 0.70), k * fz))
            rows.append(row)
        return rows

    uo, ui = under(0.995), under(0.958)
    add_loft(uo + ui[::-1], cap0=True, cap1=True)
    out, inn = over(1.0, True), over(0.968, True)
    add_loft(out + inn[::-1], cap0=True, cap1=True)


def build_side_locks():
    """The two black holes punched through her neck, measured rather than guessed: flood-filling the
    portrait render's background leaves two ~980-px ENCLOSED components, and a ray down each one's
    centre hits no triangle at all. The channel runs z 1.43-1.45, x +-0.05, y -0.06..+0.04 — the
    shell stops at the ear (its lowest ring's tips are at y=+0.010) and the braid starts BEHIND the
    ear, so nothing at all hangs in front of it. From the reveal stance that is sky through her hair
    on both sides of her face.
    A real head closes this with the lock that falls in front of the ear. Its root is buried inside
    the skull at 1.512 and its point dies inside the bodice at 1.352, so neither end shows a seam,
    and it is authored INSIDE the shell's own widest x so the silhouette the composition gates
    measure does not move by a millimetre.

    The last 16-px hole was the same channel one row lower, and the lock used to be what let it
    through: the path fell straight IN as it descended (x 0.053 -> 0.040), so its outer edge at the
    shoulder height was x 0.056 — 4 mm inside the ray that escaped at x 0.060. Hair does not fall
    into the body at the shoulder; it is the shoulder's outline. The path now swings OUT to x 0.058
    at z 1.412 and its tip still dies 120 mm inside the torso's own envelope.

    That alone traded one channel for two, and the new pair is on the other side of the same strand:
    pushed out to x 0.084, the lock's INNER edge lifted off to 0.039, which is 7 mm clear of a 31.5 mm
    neck — so the camera could look down the gap between hair and neck and out through the collar's
    hollow. A lock that only reaches outward is a paint-brush handle, not hair. It is now elliptical
    across the whole shoulder band (r1 0.0295-0.032 against the old 0.019) so it overlaps the neck by
    7 mm and the shoulder by 6 mm at once."""
    # (t, half-width). Piecewise-linear on purpose: the path has 11 points, so anything
    # with a finer period than that cannot resolve — the deleted gather sine learned this the hard way.
    STOPS = ((0.00, 0.0180), (0.22, 0.0290), (0.45, 0.0320), (0.68, 0.0295), (0.86, 0.0210), (1.00, 0.0140))

    def ramp(t):
        for (a0, v0), (a1, v1) in zip(STOPS, STOPS[1:]):
            if t <= a1:
                return v0 + (v1 - v0) * (t - a0) / max(1e-6, a1 - a0)
        return STOPS[-1][1]

    for sgn in (1, -1):
        pts = bez((sgn * 0.0430, 0.0060, 1.5120), (sgn * 0.0545, 0.0060, 1.4620),
                  (sgn * 0.0580, 0.0140, 1.4120), (sgn * 0.0500, 0.0260, 1.3520), 10)
        radii = [(w, w * 0.62) for w in (ramp(i / float(len(pts) - 1)) for i in range(len(pts)))]
        tube(pts, radii, n=12)


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
    # The nape mass closes the shell's open bottom rim, but it was a BALL: its path reached y 0.108
    # with a 45 mm radius, so 90 mm of hair stood out behind her neck and the profile read as a bun
    # glued to a head. It is now a ROLL — wide in x so it is as broad as the shell's own tips
    # (~57 mm), shallow in y-z so it breaks only 30 mm behind the shell's back surface at 0.070.
    tube(bez((0, 0.055, 1.470), (0, 0.070, 1.452), (0, 0.074, 1.428), (0, 0.062, 1.408), 8),
         [(0.020, 0.012), (0.040, 0.020), (0.052, 0.025), (0.056, 0.026), (0.056, 0.026),
          (0.051, 0.023), (0.041, 0.018), (0.026, 0.011), (0.011, 0.005)], n=12)


def braid_pts(sgn):
    """The plait's AXIS. It must stay a smooth curve: two earlier versions put the weave into the
    centreline itself (a radius ripple, then a helical swing) and both failed — a tube whose axis
    zigzags by more than a third of its own radius kinks, and from the front she wore two flat
    sawtooth ribbons instead of hair. The weave comes from the strands in build_braids."""
    a = bez((sgn * 0.044, 0.048, 1.478), (sgn * 0.098, 0.034, 1.412), (sgn * 0.130, -0.062, 1.340),
            (sgn * 0.116, -0.122, 1.230), 12)
    b = bez((sgn * 0.116, -0.122, 1.230), (sgn * 0.108, -0.110, 1.150), (sgn * 0.096, -0.106, 1.092),
            (sgn * 0.084, -0.102, 1.036), 12)
    return a + b[1:]


def build_braids():
    """TWO strands wound about the axis, plus a core to fill the waist between them. That is the
    cheapest construction that actually reads as a plait: the crossings are real geometry, they
    catch the rim light, and they survive a pure silhouette read — which is the whole reason she
    wears it in front of her chest. A single tube can only ever imitate this with a ripple, and the
    ripple either vanished at jury size or (at 5.5 turns) turned her hair into flat pasta."""
    for sgn in (1, -1):
        pts = braid_pts(sgn)
        n = len(pts)
        for ph in (0.0, math.pi):
            strand = []
            radii = []
            for i in range(n):
                t = i / float(n - 1)
                w = t * math.pi * 11.0 + ph
                # the lay tightens as the rope thins, so the two strands stay in contact
                wind = 0.0165 * (1.0 - 0.55 * t)
                d = Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])
                sv, uv = frame(d)
                off = sv * wind * math.cos(w) + uv * wind * math.sin(w)
                strand.append(tuple(Vector(pts[i]) + off))
                r = 0.0190 * (1.0 - 0.66 * t ** 1.1) + 0.0035
                radii.append((r, r))
            tube(strand, radii, n=8)
        core = []
        crad = []
        for i in range(n):
            t = i / float(n - 1)
            core.append(pts[i])
            crad.append(0.0150 * (1.0 - 0.66 * t ** 1.1) + 0.0030)
        tube(core, crad, n=8)
        tube(bez((sgn * 0.084, -0.102, 1.036), (sgn * 0.082, -0.099, 1.006), (sgn * 0.079, -0.097, 0.986),
                 (sgn * 0.077, -0.101, 0.962), 5), [0.007] * 6, n=8)


def build_braid_ties():
    """a plait has to be TIED. Without a band and two tails the braid simply stops, which read as a
    hook jutting out of the front of her dress. The tie sits ABOVE the folded hands: the old ends
    finished at hand height two inches either side of the clasped gloves, and from the reveal stance
    the two ribbons and six gloved finger-rods merged into one dark-and-white knot with two horns."""
    for sgn in (1, -1):
        add_loft([prof(0.998, 0.0115, 0.0095, n=10, cy=-0.108, cx=sgn * 0.080),
                  prof(0.984, 0.0155, 0.0125, n=10, cy=-0.108, cx=sgn * 0.080),
                  prof(0.970, 0.0115, 0.0095, n=10, cy=-0.108, cx=sgn * 0.080)], cap0=True, cap1=True)
        for w in (1, -1):
            tube(bez((sgn * 0.080, -0.108, 0.984), (sgn * (0.080 - 0.006 * w), -0.104, 0.962),
                     (sgn * (0.080 - 0.013 * w), -0.101, 0.946), (sgn * (0.080 - 0.017 * w), -0.099, 0.934), 5),
                 [0.0052, 0.0056, 0.0048, 0.0036, 0.0025, 0.0014], n=6)


# ================================================================ ARMS
# The sleeve is dress, the hand is paper-white: they must be separate builders so the vertex
# colour ranges stay contiguous (PAINT records a span, not a set).
# The hands are CLASPED in front of her, not hanging at her sides: two dead-straight tubes down the
# flanks of a bell skirt is what made the 3/4 read as a coat stand, and folded hands pull the widest
# part of her silhouette down into the skirt, which IS the period silhouette.
def ELBOW(sgn):
    return (sgn * 0.180, -0.058, 1.096)


def WRIST(sgn):
    return (sgn * 0.072, -0.206, 0.918)


def build_sleeve(sgn):
    """ONE loft that starts INSIDE the bodice, arcs over the shoulder, and ends inside the hand.

    Fourth failure, and the diagnosis is the ring rather than the curve. `tube` puts each ring in
    the plane normal to its own tangent, so an arm path that BEGINS at the shoulder point begins
    with a vertical disc: at 48 mm radius that disc reached z 1.400, forty millimetres above a
    bodice whose surface there is 70 mm wide. The shipped frame showed exactly that — a flat
    lavender cap standing proud of her shoulder with a dark V torn between it and the neck. The
    path now opens at x 0.062, z 1.352, where a 14 mm ring is entirely enclosed by the torso, and
    it arcs out over the shoulder the way a sleeve head is set in. Nothing is capped in the open.
    The arc's own apex matters as much as its start: at z 1.378 the top of the sleeve stood at
    1.403, which is the collar's height, so her shoulders were drawn level with the base of her
    neck and the front frame said square. The seam is down at 1.354 now.

    The second half of the same defect was the armpit. The old elbow stood at x 0.208, so the
    inner edge of the arm at 0.168 cleared a waist at 0.118 by fifty millimetres and the front
    frame drew a black lens the size of her torso. The elbow is at 0.180 now and the whole arm
    runs inboard of its old inner edge, which leaves a 20 mm crease — an arm resting against a
    body instead of a handle standing away from one.
    """
    ex, ey, ez = ELBOW(sgn)
    # the path's last point is deliberately PAST her wrist, inside the hand mass, so the wrist-end
    # disc is buried in the glove instead of presenting a flat cut face to the camera.
    pts = bez((sgn * 0.062, -0.010, 1.352), (sgn * 0.126, -0.012, 1.354), (sgn * 0.170, -0.016, 1.334),
              (sgn * 0.192, -0.028, 1.288), 6)
    pts += bez((sgn * 0.192, -0.028, 1.288), (sgn * 0.206, -0.040, 1.240), (sgn * 0.196, -0.052, 1.168),
               (ex, ey, ez), 7)[1:]
    pts += bez((ex, ey, ez), (sgn * 0.176, -0.096, 0.952), (sgn * 0.124, -0.214, 0.944),
               (sgn * 0.058, -0.212, 0.904), 8)[1:]
    # a period leg-of-mutton: the crest is the widest point of the whole arm and it sits just BELOW
    # the shoulder, because a ball on top of the shoulder is what made her read bulky from the
    # front. It then lies smooth down the forearm and FLARES for the last 6 % — a fitted cuff, the
    # one sleeve feature that still resolves at the reveal stance, where the arm is ~20 px wide.
    STOPS = ((0.00, 0.014), (0.14, 0.036), (0.29, 0.050), (0.45, 0.046), (0.62, 0.041), (0.81, 0.035),
             (0.94, 0.030), (1.00, 0.036))

    def ramp(t):
        for (a0, v0), (a1, v1) in zip(STOPS, STOPS[1:]):
            if t <= a1:
                return v0 + (v1 - v0) * (t - a0) / max(1e-6, a1 - a0)
        return STOPS[-1][1]

    radii = [ramp(i / float(len(pts) - 1)) for i in range(len(pts))]
    tube(pts, radii, n=14)


def build_glove(sgn):
    """ONE slabbed hand set into the sleeve's own cuff: a loft from a buried wrist ring down to a
    scalloped finger edge, plus a thumb.

    Third failure was about scale: the reveal stance puts her hands at about 55 x 35 px, and four
    finger-rods on 12 mm centres tapered to 3.2 mm left 5 mm of background between the tips, so
    each hand drew as a white brush with a fork below it. What resolves at that size is the
    OUTLINE of the hand and the seam where the two meet, so the fingers are one mass whose lower
    edge carries four shallow lobes — knuckles, not gaps.

    The fourth failure was that the two masses never met. They hung either side of the centreline
    with 32 mm of night between them, which read as two separate white objects, and the separate
    cuff tube standing on top of each had a flat cap disc at BOTH of its ends — one facing up out
    of the sleeve, one facing down onto the hand — so the wrist drew as two stacked parallelograms.
    So: the cuff tube is gone and the sleeve's flared end is the cuff, and each hand LEANS inward
    as it descends out of that cuff, wrists at her sides and fingers on the centreline. That is
    what clasped hands are, and it is the one pose that reads at 55 px without any finger being
    modelled at all. Her right hand crosses 10 mm further and comes 14 mm forward, so the pair
    overlaps with a seam instead of merging into one blob.
    """
    dy = -0.009 if sgn > 0 else 0.005
    cross = 0.030 if sgn > 0 else 0.020
    add_loft([prof(0.906, 0.0165, 0.0165, n=12, cx=sgn * (0.056 - 0.35 * cross), cy=-0.212 + dy),
              prof(0.890, 0.0285, 0.0165, n=12, cx=sgn * (0.046 - 0.70 * cross), cy=-0.210 + dy),
              prof(0.874, 0.0320, 0.0150, n=12, cx=sgn * (0.036 - 1.00 * cross), cy=-0.208 + dy),
              prof(0.858, 0.0285, 0.0100, n=12, cx=sgn * (0.030 - 1.10 * cross), cy=-0.204 + dy,
                   lobes=4, amp=0.085, phase=0.4),
              prof(0.848, 0.0235, 0.0070, n=12, cx=sgn * (0.026 - 1.15 * cross), cy=-0.200 + dy,
                   lobes=4, amp=0.100, phase=0.4)], cap0=True, cap1=True)
    tube([(sgn * (0.048 - 0.75 * cross), -0.196 + dy, 0.894),
          (sgn * (0.030 - 1.05 * cross), -0.202 + dy, 0.884),
          (sgn * (0.014 - 1.25 * cross), -0.206 + dy, 0.876)], [0.0075, 0.0070, 0.0045], n=8)


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
P(BODICE, pair(build_sleeve), 'sleeve')
P(PAPER, pair(build_glove), 'paper')
P(PAPER, build_collar, 'paper')
P(RIBB, build_brooch, 'paper')
P(SKIN, build_head, 'skin')
P(SCLERA, build_sclera, 'eye')
P(EYE, build_iris, 'eye')
P(EYE_TOP, build_iris_top, 'eye')
P(EYE_PU, build_pupils, 'eye')
P(EYE_LO, build_eye_lo, 'eye')
P(EYE_HI, build_eye_hi, 'eye')
P(LASH, build_lash, 'eye')
P(BROW, build_brows, 'eye')
P(SKIN_SH, build_nose, 'skin')
P(MOUTH, build_mouth, 'eye')
P(HAIR, build_hair, 'hair')
P(HAIR_DK, build_bangs, 'hair')
P(HAIR, build_side_locks, 'hair')
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
# The lamp's own compass bearing in her authored frame. The costume's broad fall has to be keyed to
# it, or the bake's lit side and the scene's lit side disagree and she reads as two objects.
LAMP_A = math.atan2(KEY.y, KEY.x)


def _ramp(x, a, b):
    return max(0.0, min(1.0, (x - a) / max(1e-6, b - a)))


def _shade(co, n, tag):
    k = max(0.0, n.dot(KEY))
    u = max(0.0, n.dot(SUN))
    f = max(0.0, n.dot(FILL))
    sky = 0.5 + 0.5 * n.z
    s = 0.300 + 0.520 * k + 0.200 * u + 0.160 * f + 0.100 * sky
    z = co.z
    # The costume arrived as ONE value, and the reason is in the material rather than the model:
    # moonify multiplies the vertex colour into an EMISSIVE term that no light touches, so about half
    # of her final pixel carries no normal at all. The scene's roll-off only models the other half,
    # and a 20 % pleat swing riding on top of that sits under the eye's threshold. What a jury reads
    # first is the BROAD fall across a body — one lit quarter, one shadow quarter — so that term is
    # authored here rather than hoped for from the rig. 1.56:1 raw, keyed to the lamp's own bearing.
    ang = math.atan2(co.y - 0.006, co.x)
    if tag in ('dress', 'bodice', 'sleeve'):
        s *= 0.800 + 0.450 * (0.5 + 0.5 * math.cos(ang - LAMP_A))
    if tag == 'dress':
        # first version of this ramp swung only +/-12 %, which is less than the scene's own light
        # variation, so the largest area of her body — two thirds of the hero frame — drew as one
        # flat lavender cone. It also has to survive the level curve below, which squares nothing
        # and compresses everything: 0.12 of raw swing lands as ~0.06 of colour. 0.58..1.28 is what
        # it takes for a fold to still be a fold after that curve and after the scene's own lights.
        s *= 0.580 + 0.700 * (0.5 + 0.5 * math.cos(8 * ang + 0.5))
        # a gathered skirt is never an 8-fold rosette: a second, slower harmonic across the whole
        # circumference breaks the repeat so the fall reads as cloth that found its own way down
        s *= 0.880 + 0.220 * (0.5 + 0.5 * math.cos(3 * ang + 1.9))
        s *= 1.0 - 0.420 * (1.0 - _ramp(z, 0.02, 0.46))
        # the bodice overhangs the waist, so the first 60 mm of skirt is in its shadow. Without this
        # the skirt was brightest exactly where it meets her, which is the opposite of weight.
        s *= 1.0 - 0.240 * _g1(z, 0.972, 0.055)
    if tag == 'sash':
        # a sash is a smooth band: pleat colour on it would contradict its own geometry
        s *= 0.930 + 0.150 * _ramp(z, 0.926, 1.010)
    if tag == 'bodice':
        s *= 1.0 - 0.180 * (1.0 - _ramp(z, 0.87, 1.05))
    if tag == 'sleeve':
        # the sleeve's own creases. Its axis runs down-and-in, so a band of constant z crosses the
        # forearm obliquely — which is exactly how a sleeve creases where the arm bends.
        s *= 1.0 - 0.170 * _g1(z, 1.048, 0.017)
        s *= 1.0 - 0.140 * _g1(z, 0.985, 0.015)
        # the elbow and the crown of the bicep catch the lamp; a sleeve that is only creased reads
        # as a tube with lines drawn on it, so the high points have to come forward too.
        s *= 1.0 + 0.110 * _g1(z, 1.108, 0.030)
        s *= 1.0 - 0.150 * (1.0 - _ramp(z, 0.87, 1.05))
    if tag == 'hair':
        s *= 0.800 + 0.260 * _ramp(z, 1.42, 1.66)
        if co.y > 0.030:
            s *= 0.740
        # the shell's own angular parameter (x on sin, y-0.010 on cos), so the colour's ridges land
        # on the geometry's ridges instead of drifting a quarter-wave across them
        ang = math.atan2(co.x, co.y - 0.010)
        s *= 0.880 + 0.160 * (0.5 + 0.5 * math.cos(12.0 * ang + 0.35))
        # THE FRINGE IS NOT A SILHOUETTE. Cutting the curtain into locks and leaving the colour flat
        # gave a paper chain: at the terminal frame's 90 px of head the locks were an edge and nothing
        # else, because what makes a lock read is the shadow in the notch beside it. So the hair's
        # value is keyed to bang_phase(), the SAME table build_bangs lofts the geometry with — crown
        # forward, notch back. It only runs across the curtain (|a| inside A0, in front, below the
        # shell's crown) because everywhere else there are no locks to shade.
        a2 = bang_a(co)
        if abs(a2) < A0 and z < 1.600 and co.y < 0.004:
            ph = 0.5 + 0.5 * math.cos(2 * math.pi * bang_phase(a2))
            s *= 0.660 + 0.520 * ph
            # and the locks have to be darker at their tips than at their roots or the curtain is a
            # flat band; the notch-to-crown swing above is across the fringe, this one is down it
            s *= 0.860 + 0.200 * _ramp(z, 1.548, 1.600)
    if tag == 'skin':
        # a face must never go as dark as a dress: skin keeps its own, shallower ramp
        s = 0.520 + 0.340 * k + 0.120 * u + 0.100 * sky
        # the front of a face is nearly one plane, so a normal-only ramp leaves it flat no matter how
        # much geometry is on it. The sides and the jaw are taken down by hand, which is what makes
        # the brow and the cheekbones come forward.
        ax = abs(co.x)
        # The turn of the head has to be the strongest thing on her face, because everything else in
        # this branch is a modulation on top of it. Measured on the shipped accessor, the first pass
        # of the falls below swung only 8 % across the front (L 0.642..0.694) — the ^0.55 level curve
        # halves authored swings, so a 12 % term is a 6 % term and six percent of a pale face is
        # nothing at all. The skirt learned this and was written at 58..128; the face now gets 2x.
        s *= 1.0 - 0.340 * _ramp(ax, 0.020, 0.062)
        s *= 0.900 + 0.120 * _ramp(z, 1.440, 1.560)
        # the under-jaw: a hard 0.700 step at z=1.452 drew a visible line across her throat, which is
        # a seam and not a shadow. It ramps over 18 mm now, so the neck falls away from the chin.
        if math.hypot(co.x, co.y) < 0.080:
            s *= 1.0 - 0.360 * _ramp(1.456 - z, 0.0, 0.020)
        # relief() gives the face its bone, and the bone is invisible: moonify multiplies vertex
        # colour into an EMISSIVE term that no light touches, so a feature that is only DISPLACED
        # never darkens and the shipped jury frame came back a porcelain mask with four decals on it.
        # The same topography is therefore painted a second time, as light. Every term here is 25-40 mm
        # across, because the level curve and the scene's own lights erase anything finer than that.
        s *= 1.0 + 0.230 * _g1(z, 1.5130, 0.0165) * _g1(ax, 0.0415, 0.0165)           # cheekbone
        s *= 1.0 - 0.280 * _g1(z, 1.4700, 0.0145) * _g1(ax, 0.0330, 0.0150)           # cheek hollow
        s *= 1.0 - 0.320 * _g1(z, 1.5290, 0.0185) * _g1(ax, 0.0336, 0.0205)           # socket
        s *= 1.0 - 0.230 * _g1(z, 1.5120, 0.0215) * _g1(ax - 0.0115, 0.0, 0.0065)     # nose flank
        s *= 1.0 - 0.270 * _g1(z, 1.5590, 0.0145)                                     # fringe's cast
        s *= 1.0 - 0.210 * _g1(z, 1.4790, 0.0080) * _g1(ax, 0.0, 0.0145)              # under the lip
        s *= 1.0 + 0.190 * _g1(z, 1.4560, 0.0115) * _g1(ax, 0.0, 0.0205)              # chin forward
        # the bridge is the one place a face catches the lamp along a LINE, and with the nose now
        # carrying no decal of its own this is what stops the centre of the face being a plain
        s *= 1.0 + 0.170 * _g1(z, 1.5230, 0.0230) * _g1(ax, 0.0, 0.0075)
    if tag == 'boot':
        s *= 1.0 - 0.300 * (1.0 - _ramp(z, 0.00, 0.14))
    if tag == 'eye':
        s = max(0.860, min(1.100, 0.600 + 0.420 * k + 0.140 * u))
    s *= 1.0 - 0.260 * (1.0 - _ramp(z, 0.00, 0.13))   # contact shadow, every part
    return s


_sh = []
for _a, _b, _col, _tag in PAINT:
    for _i in range(_a, _b):
        _sh.append((_i, _col, _shade(me.vertices[_i].co, me.vertices[_i].normal, _tag), _tag))
_mean = sum(v for _, _, v, _ in _sh) / max(1, len(_sh))
# The raw ramp spans 6:1, which is a stage-lit doll once the scene multiplies its own lights in on
# top. Compress it with a curve and re-level to the same mean: the FORM survives, the BLOWN-out and
# the crushed-to-black do not.
_c = [(v / _mean) ** 0.55 for _, _, v, _ in _sh]
_m2 = sum(_c) / max(1, len(_c))
# Per-tag headroom, because a vertex colour cannot be lit above itself. The level curve is
# mean-preserving across the WHOLE figure, so it spends the bright parts' entire range on a
# multiplier the dark parts would never need: the face's lit front reached g=1.35 against a 0.86
# base and the write clamped it. Every one of the seven broad falls painted into _shade for skin
# (cheekbone, hollow, socket, nose flank, fringe cast, lip, chin) sat stacked on that clipped
# plateau, so the shipped model carried the modelling and delivered none of it — a porcelain mask
# with four decals on it, which is the loudest single item in the "太丑了" verdict. Each tag is now
# scaled DOWN only, so its brightest vertex lands at CEIL times its own base: dark cloth keeps its
# full 1.5 swing, and skin, paper and hair stop being flattened at 1.0.
CEIL = 0.985
_head = {}
for (_i, _col, _v, _t), _g0 in zip(_sh, _c):
    m = max(_col) * _g0 / _m2
    if m > _head.get(_t, 0.0):
        _head[_t] = m
_scale = {t: min(1.0, CEIL / m) for t, m in _head.items()}
print('KEEPER shade bake: raw mean=%.3f min=%.3f max=%.3f -> levelled min=%.3f max=%.3f' %
      (_mean, min(v for _, _, v, _ in _sh), max(v for _, _, v, _ in _sh),
       min(x / _m2 for x in _c), max(x / _m2 for x in _c)))
print('KEEPER headroom per tag:', ', '.join('%s x%.3f (peak %.3f)' % (t, _scale[t], _head[t])
                                            for t in sorted(_head)))
_blown = sum(1 for (_i, _col, _v, _t), _g0 in zip(_sh, _c) if max(_col) * _g0 / _m2 > 1.0)
print('KEEPER clipped-before-headroom verts: %d / %d' % (_blown, len(_sh)))

# vertex colour layer: per-part ranges, last writer wins where parts overlap
cl = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
for i in range(len(me.vertices)):
    cl.data[i].color = (0.5, 0.5, 0.5, 1.0)
for (_i, _col, _v, _t), _g0 in zip(_sh, _c):
    g = _g0 / _m2 * _scale[_t]
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
