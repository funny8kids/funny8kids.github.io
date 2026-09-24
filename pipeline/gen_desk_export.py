"""Export the finale hero set as ONE drawable GLB with baked vertex colours.

Why this exists: the finale's close-up used to ship `DollsDesk.glb`, a doll's-house bureau whose
top surface is 0.50 x 0.48 m while the letter laid on it is 0.62 m wide — the sheet hung past every
edge of the desk and the beat photographed a card standing in mid-air. The authored hero set in the
same .blend (a 1.16 x 0.58 m banded top, a 36-key typewriter, a chair with her coat over the back,
a dropped glove, three loose letters, an origami crane, a pocket watch and a wax seal) was never
exported.

Three hard constraints from the pipeline, all of which this script exists to satisfy:

1. The web loader builds ONE material for the whole prop (`deskMat`, vertex-coloured, moonified),
   and gltf-transform's `optimize` join collapses a multi-material GLB into one grey
   PaletteMaterial — the "unlit object punching a hole in a lit field" failure. So the colour has to
   live in the geometry: every material's base colour is baked into a COLOR_0 attribute here, in
   Blender, before the join.

2. three.js does NOT sRGB-decode vertex colours, so the values written must be scene-linear.
   That is a DECODE, not a passthrough: the .blend's Principled values were picked as sRGB numbers
   (0.42/0.26/0.16 is walnut on a swatch), and Blender stores them scene-linear. Writing
   `default_value` verbatim therefore shipped the swatch numbers as if they were light, one and a
   half stops hot and half a saturation pale. Measured off the finale frame, that is exactly the
   "flat tan card-cutout" and the coat that reads as a periwinkle inflatable — while every bloom in
   the same frame is authored `new T.Color('#8c78b8')` and decoded correctly. The desk was the only
   asset in the site skipping the decode, and the only one out of family.

3. A prop with one flat colour per material is an unpainted print, however correctly lit. At k 0.62
   the moon term is proportional to the vertex colour, so a flat bake cannot show grain, wear, a
   crease or a contact shadow: the close-up got 35,218 loops and 2,507 compressed bytes of colour,
   which is the numerical signature of a constant. `shade()` below authors per-loop material
   behaviour instead — growth rings and end grain on the boards, hammer-tone wrinkle on the enamel,
   turning marks on the platen, fibre and deckle on the paper, nap and fold shadow on the wool,
   pebble on the leather, patina on the brass — plus two geometric terms that no albedo can fake:
   self-occlusion under the top, and the dark seat each prop makes where it meets the desk.

   The bake is written as FLOAT_COLOR, not BYTE_COLOR. Walnut decodes to linear 0.144, which is byte
   37: an 8-bit attribute gives wood grain three code values to live in and posterises it into
   bands, while also dropping G and B to one step and turning the grain into a hue shift.

The .blend on disk is the source of truth and this script never writes to it. Everything below is
derived: it stages a COPY of each prop, so the authored placements survive every run, and the one
prop it does move in place (the top drawer) is guarded by a measurement instead of a blind delta.

Run inside the live Blender session:
    exec(compile(open(r'F:\\GitHub_Like\\funny8kids.github.io\\world\\pipeline\\gen_desk_export.py').read(),
                 'gen_desk_export.py', 'exec'))
Then compress with `bash world/pipeline/compress.sh`. That script compresses this file with
`meshopt --quantize-color 16`, NOT the generic `optimize --compress meshopt`: optimize's quantize
step defaults COLOR_* to 8 bits, which silently re-folds the float bake into the byte grid that
constraint 3 exists to escape (walnut's whole grain range lands in 26 code values) and the file
still loads, so nothing but a colour-entropy check catches it.
"""
import bpy
import json
from mathutils import Vector, Matrix
from math import pi, tan, floor, sqrt, cos

BLEND = r'F:\GitHub_Like\funny8kids.github.io\world\pipeline\FinaleDesk.blend'
GLB = r'F:\GitHub_Like\funny8kids.github.io\world\assets\models\WritingDesk.glb'

# Everything the finale camera is allowed to see standing on and around her desk.
PREFIX = ('Table_', 'Pedestal_', 'TW_', 'Chair_', 'Coat_', 'Glove_', 'Crane_', 'Blm_')
EXACT = ('Book_Stack', 'Watch_Case', 'Seal_On_Letter',
         'Loose_Letter_0', 'Loose_Letter_1', 'Loose_Letter_2',
         'Loose_Line_0', 'Loose_Line_1', 'Loose_Line_2', 'Loose_Line_3')
# the superseded placeholder and the sprig (which ships as its own asset) must never ride along
#
# TW_Paper and TW_Paper_Curl join that list because the finale's sheet is not an asset at all: it is
# the live letter, a 3.4 x 2.12 plane on `letterSeat` at desk-local (0.083, 1.036, 0.179) with its own
# ink shader. The authored quad it was meant to stand in for is still in the file, and a flat 16 mm
# offset cannot hide it — the two sheets LEAN at different rates, so the authored one's crown (bl
# y -0.249 at z 1.124) trails the live one by 18 mm while its foot leads by 39 mm. Both ends punch
# through, which is the grey blade crossing 「Dear visitor」 in shots/v2_0.png. A prop that only ever
# exists to be covered is not a prop; it is an artefact of the mock-up.
#
# TW_Glyph_01..35 leave with it for the same reason: they are the 35 typed marks laid on THAT
# placeholder sheet (each sits 2-13 mm behind the live letter's own plane, following it up the rake),
# and the live letter already carries its ink in a shader. So they are either 1,540 triangles of
# invisible weight or a second line of ghost type peeking past the edge of the first. Both are
# artefacts of the mock-up, and the bake has no family that could tell them from real print.
EXCLUDE = ('DollsDesk', 'FinaleBloom', 'FinaleBloom.001', 'Camera', 'EXP_', 'WritingDesk',
           'TW_Paper', 'TW_Glyph_')


def all_meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH']


def partition(meshes):
    """Split into included / excluded / UNACKNOWLEDGED. The third bucket is the point: a prop that
    matches no rule used to vanish from the asset silently, and an asset missing its coat is not
    detectable from the JS side."""
    inc, exc, stray = [], [], []
    for o in meshes:
        if any(o.name.startswith(e) or o.name == e for e in EXCLUDE):
            exc.append(o)
        elif o.name.startswith(PREFIX) or o.name in EXACT:
            inc.append(o)
        else:
            stray.append(o)
    return sorted(inc, key=lambda o: o.name), sorted(exc, key=lambda o: o.name), \
        sorted(stray, key=lambda o: o.name)


def bbox(o):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [min(p.x for p in pts), max(p.x for p in pts),
            min(p.y for p in pts), max(p.y for p in pts),
            min(p.z for p in pts), max(p.z for p in pts)]


def centre(b):
    return Vector(((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2))


def s2l(c):
    """sRGB swatch value -> scene-linear. The decode every other asset in the site gets from
    `new T.Color('#8c78b8')` and the bake used to skip."""
    c = max(0.0, min(1.0, c))
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luma(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


# The .blend's material names are the authoring intent; the family is what the bake has to behave
# like. Two props can share a shader node and want completely different surface laws.
FAMILY = {'VN_Walnut': 'wood', 'VN_Walnut_Pale': 'wood', 'VN_Iron': 'enamel',
          'VN_Nickel': 'nickel', 'VN_Laid_Paper': 'paper', 'VN_Ink': 'ink',
          'VN_Ink_Violet': 'ink', 'VN_Leather': 'leather', 'VN_Wool_Navy': 'wool'}

# Per-name overrides, in the swatch space the rest of the palette is authored in. These are props
# that inherited a neighbour's shader as a modelling shortcut and so have no surface law at all:
# the drawer and pedestal knobs are turned brass, not more walnut; a pocket watch is a metal case,
# not a leather pouch; and a wax seal is sealing wax, which is not the same black as ink.
OVERRIDE = {
    'Table_Knob': ('brass', (0.55, 0.40, 0.17)),
    'Pedestal_Knob_0': ('brass', (0.55, 0.40, 0.17)),
    'Pedestal_Knob_1': ('brass', (0.55, 0.40, 0.17)),
    'Watch_Case': ('brass', (0.62, 0.53, 0.32)),
    'Seal_On_Letter': ('wax', (0.44, 0.075, 0.085)),
}

# Worn and polished highs blend toward these rather than simply getting brighter: a chipped
# hammer-tone case shows the metal under the enamel, and a brass knob's high points are yellowed
# metal, not a lighter brown paint.
NICKEL_L = [s2l(c) for c in (0.60, 0.615, 0.66)]
BRASS_HI = [s2l(c) for c in (0.78, 0.64, 0.34)]


def material_of(o):
    """(family, swatch-rgb) for a prop, falling back to the material's own base colour."""
    if o.name in OVERRIDE:
        return OVERRIDE[o.name]
    if not o.material_slots or not o.material_slots[0].material:
        return ('unknown', (0.5, 0.5, 0.5))
    m = o.material_slots[0].material
    bsdf = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    rgba = tuple(bsdf.inputs['Base Color'].default_value if bsdf else m.diffuse_color)
    return (FAMILY.get(m.name, 'unknown'), rgba[:3])


# --- deterministic value noise -------------------------------------------------------------
# The bake needs its own hash rather than Blender's noise textures because it has to be a pure
# function of (prop, position): the same asset rebuilt on another machine has to land on the same
# grain, or every screenshot diff after this becomes a coin toss.

def _h3(i, j, k):
    n = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791)
    n &= 0xffffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffffff) / 4294967295.0


def _sm(t):
    return t * t * (3.0 - 2.0 * t)


def _n3(x, y, z):
    i, j, k = floor(x), floor(y), floor(z)
    fx, fy, fz = _sm(x - i), _sm(y - j), _sm(z - k)
    x0 = _h3(i, j, k) + (_h3(i + 1, j, k) - _h3(i, j, k)) * fx
    x1 = _h3(i, j + 1, k) + (_h3(i + 1, j + 1, k) - _h3(i, j + 1, k)) * fx
    x2 = _h3(i, j, k + 1) + (_h3(i + 1, j, k + 1) - _h3(i, j, k + 1)) * fx
    x3 = _h3(i, j + 1, k + 1) + (_h3(i + 1, j + 1, k + 1) - _h3(i, j + 1, k + 1)) * fx
    y0 = x0 + (x1 - x0) * fy
    y1 = x2 + (x3 - x2) * fy
    return y0 + (y1 - y0) * fz


def _seed(name):
    return (sum((i + 1) * ord(c) for i, c in enumerate(name)) % 977) * 0.618


def _edge(p, ctx, k):
    """Distance to the k-th nearest bounding plane, over axes that carry real thickness.

    k=2 is an arris — the line where two faces meet, which is where a worn edge shows bright metal
    or a scuffed corner. k=1 is a boundary in the plane, which is where a sheet's deckle edge and a
    seal's rim live.

    The thin axis has to be filtered out rather than thresholded around: a letter is 4 mm thick, so
    every one of its loops sits within a millimetre of a bounding plane, and an unfiltered metric
    declares the whole page to be an edge. That is not a shading nuance — it measured as a flat
    0.026 bake on the one surface the finale's close-up resolves largest.
    """
    d = sorted(abs(ctx['half'][a] - abs(p[a])) for a in range(3) if ctx['dims'][a] > 0.012)
    return d[k - 1] if len(d) >= k else 9.0


def _rim(p, ctx):
    d = sorted(abs(ctx['half'][a] - abs(p[a])) for a in range(3) if ctx['dims'][a] > 0.030)
    return d[0] if d else 9.0


def _ctx(o):
    """Everything a prop's surface law needs, measured once. Local space, because grain follows the
    board it was sawn from and the board does not care where the set stands."""
    lmin = [min(c[i] for c in o.bound_box) for i in range(3)]
    lmax = [max(c[i] for c in o.bound_box) for i in range(3)]
    dims = [max(lmax[i] - lmin[i], 1e-4) for i in range(3)]
    axis = max(range(3), key=lambda a: dims[a])
    perp = [a for a in range(3) if a != axis]
    b = bbox(o)
    long = dims[axis]
    pitch = 0.050 if o.name == 'Table_Top' else (0.028 if long > 0.30 else 0.011)
    return {'dims': dims, 'axis': axis, 'perp': perp, 'half': [d / 2 for d in dims],
            'seed': _seed(o.name), 'pitch': pitch, 'long': long,
            'zmin_l': lmin[2], 'span': dims[2], 'field': o.name == 'Table_Top',
            'turned': long > 2.6 * max(dims[perp[0]], dims[perp[1]]),
            # The two axes a sheet actually spans. `perp` cannot stand in for this: a letter's long
            # axis is one in-plane direction and its thickness is the other, so a pattern written
            # against `perp` samples a coordinate that never changes and bakes the page flat.
            'ip': sorted(range(3), key=lambda i: -dims[i])[:2],
            'zmin_w': b[4], 'seats': b[4] > DESK_TOP_Z - 0.012, 'name': o.name}


DESK_TOP_Z = 0.751        # m, the authored writing surface (Table_Top's own crown)
DESK_X, DESK_Y = 0.580, 0.290


def _ao(wp, ctx, n):
    """The two terms an albedo cannot fake: no sky under the top, and a dark seat where a prop
    meets it. The finale's close-up had neither, which is why the set read as cut-outs standing in
    front of the desk rather than resting on it."""
    m = 1.0
    x, y, z = wp[0], wp[1], wp[2]
    if ctx['name'] == 'Table_Top' and n[2] < -0.5:
        m *= 0.46                                    # the underside of a top never sees sky
    elif abs(x) < DESK_X and abs(y) < DESK_Y and z < DESK_TOP_Z - 0.004:
        m *= 1.0 - 0.34 * max(0.0, min(1.0, (DESK_TOP_Z - z) / 0.30))
        m *= 0.58 + 0.42 * min(1.0, z / 0.34)
    if ctx['seats'] and ctx['name'] != 'Table_Top':
        m *= 0.52 + 0.48 * min(1.0, (z - ctx['zmin_w']) / 0.045)
    return m


def shade(fam, base, ctx, p, n, wp):
    """Per-loop colour in scene-linear. Returns a triple; every branch keeps its own mean at the
    swatch value, so the bake adds structure without re-lighting the prop."""
    o1, o2 = ctx['perp']
    a, b = p[o1], p[o2]
    ax = ctx['axis']
    m = 1.0
    tint = None

    if fam == 'wood':
        # Flat-sawn figure: rings sweep across the face and tighten at the edges, so the ring
        # coordinate is a sheared pair of short axes wobbled by a low-frequency drift.
        ring = (a + 0.42 * b) / ctx['pitch'] + 1.15 * _n3(a * 3.1 + ctx['seed'], b * 3.1, p[ax] * 1.7)
        g = (0.5 + 0.5 * cos(ring * 2 * pi)) ** 2.6      # wide light, tight dark
        pore = _n3(p[ax] * 4.0, a * 26.0 + ctx['seed'], b * 9.0) - 0.5
        m *= 1.0 + (0.34 if not ctx['field'] else 0.24) * (g - 0.5) + 0.13 * pore
        if abs(n[ax]) > 0.62:                            # end grain: thirsty, concentric, darker
            e = 0.5 + 0.5 * cos(sqrt(a * a + b * b) / (ctx['pitch'] * 0.42) * 2 * pi)
            m = 0.78 + 0.30 * (e - 0.5)
        if _h3(floor(p[0] * 220), floor(p[1] * 220), floor(p[2] * 220)) > 0.986:
            m *= 0.72                                    # open pores
        if n[2] < -0.45:
            m *= 0.80                                    # dust and no key on the underside

    elif fam == 'enamel':
        # Hammer tone is a wrinkle, not confetti: a dark valley and a bright crest at ~1.5 mm.
        w = _n3(p[0] * 150 + ctx['seed'], p[1] * 150, p[2] * 150)
        crest = 1.0 - abs(2.0 * w - 1.0)
        m *= 0.84 + 0.34 * crest * crest
        m *= 1.0 + 0.10 * (_n3(p[0] * 15, p[1] * 15, p[2] * 15) - 0.5) * 2
        if n[2] > 0.55:
            m *= 1.14                                    # the case's top skin
        d = _edge(p, ctx, 2)
        if d < 0.0045:                                   # worn arrises show bright metal
            tint = (NICKEL_L, 0.70 * (1.0 - d / 0.0045))
            m *= 1.0 + 0.75 * (1.0 - d / 0.0045)

    elif fam == 'nickel':
        if ctx['turned']:                                # a roller keeps its tool marks
            rr = sqrt(a * a + b * b)
            m *= 1.0 + 0.20 * (0.5 + 0.5 * cos(rr / 0.0026 * 2 * pi) - 0.5) * 2
        m *= 1.0 + 0.26 * (_n3(p[0] * 7 + ctx['seed'], p[1] * 7, p[2] * 7) - 0.5)
        m *= 0.70 + 0.55 * max(0.0, n[2])                # bright crown, dark flank
        m *= 1.0 + 0.10 * (_n3(p[0] * 90, p[1] * 90, p[2] * 90) - 0.5) * 2

    elif fam == 'paper':
        # Laid paper: chain lines ribbing one axis, fibre at 2 mm, and a deckle edge that drinks.
        q0, q1 = p[ctx['ip'][0]], p[ctx['ip'][1]]
        laid = 0.5 + 0.5 * cos(q0 / 0.0082 * 2 * pi)
        m *= 1.0 + 0.030 * (laid - 0.5) * 2 + 0.085 * (_n3(p[0] * 190, p[1] * 190, p[2] * 190) - 0.5) * 2
        # A letter is folded before it is sent, and a fold is a permanent mark on the sheet: the
        # crease crushes its fibres and stands a shade lighter than the field either side of it.
        # Without this the loose pages measured 0.025 contrast — fibre alone cannot carry a sheet
        # that only has a couple of dozen vertices to spread it over.
        fold = 0.5 + 0.5 * cos(q1 / 0.071 * 2 * pi)
        m *= 1.0 + 0.055 * (fold - 0.5) * 2
        d = _rim(p, ctx)
        if d < 0.009:
            m *= 0.88 + 0.12 * (d / 0.009)
        if ctx['name'].startswith('Crane_') and n[2] > 0.30:
            m *= 1.12                                    # a folded crane shows its inner face
        if ctx['name'].startswith('TW_Key_') and n[2] > 0.55:
            m *= 1.07                                    # ivory cap tops, blackened rims
        elif ctx['name'].startswith('TW_Key_'):
            m *= 0.62                                    # the cap's wall is a shadow line

    elif fam == 'wool':
        # A coat thrown over a chair back is mostly fold law, then nap, then fuzz. The pile reads
        # lighter facing up and much darker on the underside of a drape, which is the only thing
        # that keeps this from being the periwinkle inflatable the finale frame showed.
        m *= 1.0 + 0.22 * (_n3(p[0] * 230, p[1] * 230, p[2] * 230) - 0.5) * 2
        m *= 1.0 + 0.07 * (_n3(p[0] * 30, p[1] * 30, p[2] * 30) - 0.5) * 2
        m *= 0.52 + 0.72 * max(0.0, n[2])
        h = p[2] - ctx['zmin_l']
        m *= 0.66 + 0.34 * min(1.0, h / max(0.03, ctx['span'] * 0.55))

    elif fam == 'leather':
        peb = _n3(p[0] * 95 + ctx['seed'], p[1] * 95, p[2] * 95)
        m *= 0.86 + 0.30 * (1.0 - abs(2.0 * peb - 1.0)) ** 2
        d = _edge(p, ctx, 2)
        if d < 0.005:
            m *= 1.0 + 0.42 * (1.0 - d / 0.005)          # scuffed corners read lighter
        if n[2] < -0.4:
            m *= 0.78

    elif fam == 'brass':
        m *= 1.0 + 0.30 * (_n3(p[0] * 26 + ctx['seed'], p[1] * 26, p[2] * 26) - 0.5) * 2
        m *= 0.74 + 0.62 * max(0.0, n[2])                # patina darkens the flanks
        d = _edge(p, ctx, 2)
        if d < 0.0035:
            m *= 1.0 + 0.55 * (1.0 - d / 0.0035)         # polished high points
            tint = (BRASS_HI, 0.42 * (1.0 - d / 0.0035))

    elif fam == 'wax':
        m *= 1.0 + 0.13 * (_n3(p[0] * 130, p[1] * 130, p[2] * 130) - 0.5) * 2
        m *= 0.80 + 0.44 * max(0.0, n[2])                # a matte bloom on the face, not the rim
        r = sqrt(a * a + b * b)
        m *= 1.0 + 0.16 * (0.5 + 0.5 * cos(r / 0.004 * 2 * pi) - 0.5) * 2   # the press's ridged edge

    else:                                                # ink and anything unclassified
        m *= 1.0 + 0.10 * (_n3(p[0] * 60, p[1] * 60, p[2] * 60) - 0.5) * 2
        if n[2] > 0.6:
            m *= 1.18                                    # a wet sheen along the top of a stroke

    out = [base[i] * m * _ao(wp, ctx, n) for i in range(3)]
    if tint:
        rgb, w = tint
        out = [out[i] * (1.0 - w) + rgb[i] * w for i in range(3)]
    return out


def base_colour(o):
    """(family, scene-linear rgb) for a prop. The decode is the whole point of this function: see
    constraint 2 in the module docstring."""
    fam, rgb = material_of(o)
    return fam, [s2l(c) for c in rgb[:3]]



DRAWER_TRAVEL = 0.248   # m the top drawer was authored pulled out and a working desk keeps shut
DRAWER_OPEN_Y = 0.10    # face leading edge past this means the drawer is standing open

# The paper bail is authored as a 57 mm-deep slab sitting across y -0.220..-0.163, while the live
# letter's own plane at the bail's height (bl z 1.048) passes through y = -0.184. So the rod enters
# the sheet at its back and leaves at its front: that is the horizontal bar lying across
# 「becomes a flower」 in shots/v2_0.png. A bail is a wire and a small roller, so 8 mm is its real
# depth, and it belongs on the typist's side of the page, resting on it rather than through it.
BAIL_DEPTH = 0.008      # m, a wire and its roller
BAIL_CLEAR = 0.004      # m the rod stands in front of the sheet's own plane
# The live letter, from slice.js: letterSeat at desk-local (0.083, 1.036, 0.179) glTF, raked 0.43 rad
# about X after a half turn about Y, so in the Blender file's frame its centre is (0.083, -0.179,
# 1.036) and its crown falls away from the typist.
SHEET_Y0, SHEET_Z0, SHEET_RAKE = -0.179, 1.036, 0.43


def sheet_y_at(z):
    return SHEET_Y0 - (z - SHEET_Z0) * tan(SHEET_RAKE)


def stage_bail(b):
    """Rest the bail on the page instead of through it. Returns what it did, or why it refused."""
    o = bpy.data.objects.get('TW_Bail')
    if not o:
        return ['bail absent — nothing to rest'], b
    want_min = sheet_y_at((b['TW_Bail'][4] + b['TW_Bail'][5]) / 2) + BAIL_CLEAR
    cur = b['TW_Bail']
    cur_depth = cur[3] - cur[2]
    # Only a rod whose local Y is world Y can be thinned by scaling the object; anything else would
    # shear the page instead of clearing it, so say so and leave the asset alone.
    axis = (o.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
    if abs(axis.y) < 0.999:
        return ['bail NOT restaged: local Y is %s, not world Y' % [round(v, 3) for v in axis]], b
    if abs(cur_depth - BAIL_DEPTH) < 0.0005 and abs(cur[2] - want_min) < 0.0005:
        return ['bail already rests on the page'], b
    k = BAIL_DEPTH / cur_depth
    o.scale.y *= k
    bpy.context.view_layer.update()
    after = bbox(o)
    o.location.y += want_min - after[2]
    bpy.context.view_layer.update()
    return ['bailed: depth %.3f -> %.3f m, rear %.3f -> %.3f (page at %.3f)' %
            (cur_depth, BAIL_DEPTH, cur[2], want_min, sheet_y_at((cur[4] + cur[5]) / 2))], bbox_map()


def bbox_map():
    return {o.name: bbox(o) for o in all_meshes()}


def stage_set():
    """Close the one prop that stages by measurement; assert the rest rather than re-applying deltas.

    The chair, coat, book, crane, loose letters and watch were positioned in the authored file, so a
    relative nudge here would walk them off the desk on the second run. Their placements are checked
    against the values they were measured at instead.
    """
    b = {o.name: bbox(o) for o in all_meshes()}
    acts = []
    d = bpy.data.objects.get('Table_Drawer')
    if d and d.location.y > -0.1:
        for n in ('Table_Drawer', 'Table_Drawer_Face', 'Table_Knob'):
            o = bpy.data.objects[n]
            o.location.y -= DRAWER_TRAVEL
        acts.append('closed top drawer (-%.3f m)' % DRAWER_TRAVEL)
        b = {o.name: bbox(o) for o in all_meshes()}
    # (prop: [x0,x1,y0,y1,z0,z1]) as authored; 6 mm tolerance catches a real move, not float noise
    expect = {
        'Table_Top':      [-0.580, 0.580, -0.290, 0.290, 0.719, 0.751],
        'Chair_Seat':     [-0.635, -0.205, 0.419, 0.821, 0.388, 0.412],
        'Loose_Letter_0': [-0.439, -0.281, -0.179, 0.039, 0.752, 0.756],
        'Watch_Case':     [-0.191, -0.117, 0.009, 0.082, 0.752, 0.781],
        'Book_Stack':     [0.357, 0.517, 0.006, 0.130, 0.751, 0.811],
        'Crane_Keel':     [0.411, 0.473, -0.140, -0.094, 0.751, 0.767],
    }
    drift = {}
    for n, want in expect.items():
        got = b.get(n)
        if got is None:
            drift[n] = 'missing'
            continue
        worst = max(abs(got[i] - want[i]) for i in range(6))
        if worst > 0.006:
            drift[n] = [round(v, 3) for v in got]
    return acts, drift, b


# Per-prop bake telemetry, filled by bake_copies and read by report().
BAKE_STATS = []

# The surfaces the finale's close-up actually holds at ~300 px: if one of these comes out flat, the
# shot is an unpainted print whatever the rest of the set does. Small hardware and ink are allowed
# to be flat — a screw head is not where grain earns its keep.
HEROES = ('Table_Top', 'Table_Drawer_Face', 'Pedestal_Case', 'Chair_Seat', 'TW_Case',
          'TW_Carriage_Frame', 'Coat_Back', 'Coat_Sleeve_0', 'Book_Stack', 'Crane_Keel',
          'Loose_Letter_0', 'Watch_Case')
HERO_CONTRAST = 0.030      # sd/mean; the old flat bake measured 0.000 on every one of these


def bake_copies(objs):
    """Per-prop duplicate carrying an ART-DIRECTED surface as CORNER vertex colours.

    Purge inherited paint first: a leftover POINT-domain `Col` on the source sorts before the bake
    in the attribute list, so it lands as COLOR_0 and the loader reads THAT — the desk would ship
    the four ink blots' stale violet flat and lose every other colour silently.

    Positions are taken in the prop's LOCAL space, because grain follows the board it was sawn from
    and the board does not care where the set stands. Normals are taken in WORLD space, because
    every facing test here ("is this an underside", "does this crown catch the moon") is about the
    set's lighting, and the platen is authored turned 90 degrees about Y — its local Z points
    sideways, so a local-facing test would light the wrong half of the machine.
    """
    copies, unknown = [], []
    BAKE_STATS.clear()
    for o in objs:
        d = o.copy()
        d.data = o.data.copy()
        d.name = 'EXP_' + o.name
        bpy.context.collection.objects.link(d)
        me = d.data
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        col = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = col
        fam, base = base_colour(o)
        if fam == 'unknown':
            unknown.append('%s[%s]' % (o.name, o.material_slots[0].material.name
                                       if o.material_slots and o.material_slots[0].material else '-'))
            continue
        ctx = _ctx(o)
        mw, m3 = o.matrix_world, o.matrix_world.to_3x3()
        verts = [v.co for v in me.vertices]
        flat, lum = [], []
        for lp in me.loops:
            p = verts[lp.vertex_index]
            rgb = shade(fam, base, ctx, p, (m3 @ lp.normal).normalized(), mw @ p)
            flat.append(rgb[0]); flat.append(rgb[1]); flat.append(rgb[2]); flat.append(1.0)
            lum.append(luma(rgb))
        col.data.foreach_set('color', flat)
        mean = sum(lum) / len(lum)
        sd = sqrt(sum((v - mean) ** 2 for v in lum) / len(lum))
        BAKE_STATS.append({'prop': o.name, 'family': fam, 'loops': len(lum),
                           'mean_luma': round(mean, 5), 'sd': round(sd, 5),
                           'contrast': round(sd / mean, 3) if mean > 1e-6 else 0.0,
                           'min': round(min(lum), 5), 'max': round(max(lum), 5)})
        copies.append(d)
    if unknown:
        raise RuntimeError('no surface law for %s — add the material to FAMILY or the prop to '
                           'OVERRIDE; a flat bake is the defect this function exists to remove'
                           % ', '.join(unknown))
    return copies


def join(copies):
    bpy.ops.object.select_all(action='DESELECT')
    for d in copies:
        d.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = 'WritingDesk'
    for s in list(joined.material_slots):
        s.material = None
    # The join inherits every prop's UV map, and this object ships 193 KB of it: float TEXCOORD_0
    # that gltf-transform refuses to quantize ("out of [0,1] range"), for a web material that
    # samples no map at all — deskMat is vertex-coloured. Dropping the layer buys back more than the
    # 16-bit COLOR_0 constraint 3 demands costs, so the file shrinks against the old flat bake
    # instead of growing. Nothing downstream reads mesh.attributes.uv on this asset.
    for uv in list(joined.data.uv_layers):
        joined.data.uv_layers.remove(uv)
    # The web layer authors its anchors (platen, soil, front edge) in this object's local frame, and
    # the join inherits whichever prop happened to be first. Pin the origin to world zero so those
    # constants mean the same thing on every run and glTF-local maps (x, z, -y) straight off the file.
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    names = [a.name for a in joined.data.color_attributes]
    if names != ['Color']:
        raise RuntimeError('colour shadowing: joined mesh carries %s' % names)
    return joined


def report(joined, b):
    me = joined.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    col = me.color_attributes.get('Color')
    uniq = {}
    if col:
        for i in range(len(col.data)):
            c = tuple(round(v, 3) for v in col.data[i].color)
            uniq[c] = uniq.get(c, 0) + 1
    top = b['Table_Top']
    paper = b.get('TW_Paper')
    pc = centre(paper) if paper else None
    # glTF is Y-up: a Blender point (x, y, z) lands at (x, z, -y). Emit the anchors in THAT frame so
    # the JS constants can be pasted without a hand conversion, which is how the last asset ended up
    # with its letter authored at the platen while the code read it as a spot on the desktop.
    def to_gltf(v):
        return [round(v.x, 3), round(v.z, 3), -round(v.y, 3)]
    return {
        'blend': bpy.data.filepath,
        'tris': tris, 'verts': len(me.vertices),
        'attrs': [a.name for a in me.attributes],
        'aabb': [round(v, 3) for v in bbox(joined)],
        'floor_z': round(bbox(joined)[4], 3),
        'surface_top': round(top[5], 3),
        'surface_xy': [round(top[0], 3), round(top[1], 3), round(top[2], 3), round(top[3], 3)],
        'distinct_colours': len(uniq),
        'colours': [{'rgba': list(k), 'looptri': v} for k, v in
                    sorted(uniq.items(), key=lambda kv: -kv[1])],
        # The bake's own telemetry. `mean_luma` is what `deskMat`'s moonify k has to be re-tuned
        # against: the term multiplies through vColor, so a correctly decoded (darker) bake lifts
        # less self-light than the flat one did, and shipping it without moving k is how the set
        # becomes the hole in the field the previous sentence was written to avoid.
        'bake_mean_luma': round(sum(s['mean_luma'] * s['loops'] for s in BAKE_STATS) /
                                max(1, sum(s['loops'] for s in BAKE_STATS)), 5),
        'bake': sorted(BAKE_STATS, key=lambda s: s['contrast']),
        'anchors_gltf_local': {
            'desk_centre': [0, 0, 0],
            'surface_top_gltf_y': round(top[5], 3),
            'paper_centre': to_gltf(pc) if pc else None,
            'paper_size': [round(paper[1] - paper[0], 3), round(paper[5] - paper[4], 3),
                           round(paper[3] - paper[2], 3)] if paper else None,
            'front_edge': to_gltf(Vector((0, top[3], 0))),
        },
        'placed': {n: [round(v, 3) for v in bb] for n, bb in sorted(b.items())},
    }


def y_front(top):
    return top[2] if top[2] > 0 else top[3]


def bare_props(objs):
    """Props with no material would bake to the fallback grey, and a grey chair leg in a moonlit
    close-up is not a shading nuance but a wrong object. Name them and stop instead of shipping."""
    return [o.name for o in objs if not o.material_slots or not o.material_slots[0].material]


acts, drift, b = stage_set()
bacts, b = stage_bail(b)
acts += bacts
# The guard, not the gesture: above the roller the sheet stands free, and anything straddling its
# plane there ships as a bar drawn through the page. Below the roller the sheet is gripped and wraps
# the platen, so the platen, the case and the typebars are SUPPOSED to overlap that plane and are
# outside this window by design — a guard that flags them is not a guard, it is a false alarm that
# gets disabled on the second run.
FREE_BELOW = 1.050      # m, a hair above the platen's own crown (1.0458) so the roller the sheet
                        # wraps cannot trip this on float noise; the bail at 1.043..1.053 still falls
                        # inside the window, which is the whole point of the margin.
FREE_ABOVE = 1.161      # m, the live letter's crown at the finale's authored scale
plane = [(n, bb) for n, bb in b.items()
         if n.startswith('TW_') and not n.startswith(('TW_Paper', 'TW_Glyph_'))
         and bb[4] < FREE_ABOVE and bb[5] > FREE_BELOW
         and bb[2] < sheet_y_at(bb[5]) and bb[3] > sheet_y_at(bb[4])]
if plane:
    raise RuntimeError('parts piercing the free span of the live sheet: %s' %
                       ', '.join('%s[y %.3f..%.3f z %.3f..%.3f]' %
                                 ((n,) + tuple(bb[i] for i in (2, 3, 4, 5))) for n, bb in plane))
inc, exc, stray = partition(all_meshes())
bare = bare_props(inc)
if bare:
    raise RuntimeError('no material assigned in the .blend: %s' % ', '.join(bare))
joined = join(bake_copies(inc))
out = report(joined, b)
# The guard the old build would have failed: 2,507 compressed bytes of colour for 35,218 loops is a
# constant, and nothing in the pipeline noticed, because a flat bake is still a valid GLB. Only the
# surfaces the close-up actually resolves are held to this — a screw head is allowed to be one value.
flat_heroes = [s['prop'] for s in BAKE_STATS if s['prop'] in HEROES and s['contrast'] < HERO_CONTRAST]
missing_heroes = [h for h in HEROES if h not in {s['prop'] for s in BAKE_STATS}]
if flat_heroes or missing_heroes:
    raise RuntimeError('flat or absent hero surfaces (contrast < %.3f): %s%s' %
                       (HERO_CONTRAST, ', '.join(flat_heroes) or '-',
                        ' | never baked: ' + ', '.join(missing_heroes) if missing_heroes else ''))
out['stage_actions'] = acts
out['stage_drift'] = drift
out['stray_not_exported'] = [o.name for o in stray]
out['excluded'] = [o.name for o in exc]
out['included'] = [o.name.replace('EXP_', '') for o in inc]

bpy.ops.object.select_all(action='DESELECT')
joined.select_set(True)
bpy.context.view_layer.objects.active = joined
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_materials='NONE',
                          export_vertex_color='NAME', export_vertex_color_name='Color',
                          export_all_vertex_colors=False)

# the joined copy is a build artefact, not part of the authored set
me, ob = joined.data, joined
bpy.data.objects.remove(ob, do_unlink=True)
bpy.data.meshes.remove(me)

import os
out['glb_bytes'] = os.path.getsize(GLB) if os.path.exists(GLB) else None
print(json.dumps(out))
