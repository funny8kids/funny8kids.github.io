"""Reshape the finale sprig's leaves from elliptic to cordate, in place.

Why this exists: `FinaleBloom` is authored as a real Viola odorata sprig — four growth stages on one
shared crown, each leaf a petiole plus a blade, five petals, five sepals, a stem. The anatomy is right
and the silhouette is wrong. Measured off the file, every one of its 16 leaf blades is widest at
u = 0.42-0.50 along its own length and narrows to a point at BOTH ends:

    [0.0226,0.0301,0.0355,0.0416,0.0458,0.0455,0.0458,0.0416,0.0353,0.0301,0.0226]

That is a lanceolate blade — grass, dandelion, willow. Sweet violet leaves are the opposite shape:
broadest just below the sinus (u ~ 0.15) where the two basal auricles flare, tapering gently to a
ROUNDED apex. So the finale's hero flower read as a weed standing in a typewriter, which is the exact
opposite of 「落园绽放」.

The fix is a remap rather than a rebuild, and that is deliberate. The arrangement — which way each
leaf points, how far it droops, its curl, its colour, its place in the rosette — was authored by hand
and is good; only the width law along the midrib is wrong. Rebuilding would throw the arrangement away,
and the .blend's newer orphan blade meshes have lost the transforms that placed them. So each blade
keeps its own frame and gets a new cross-section, which is the one thing that decides what species the
eye names at forty pixels.

Three rules the script holds itself to:

1. Blades are found by geometry, not by name — a join leaves no names. The family is the modal
   component size among components over 250 verts, and its count is asserted against the authored
   structure. A rule that quietly reshaped a petal would be worse than no rule at all.
2. Which end is the BASE is decided by which end sits nearer some other part (the petiole it grew out
   of), compared through component centroids. Getting this backwards would point every leaf inward.
3. Only the wider transverse axis is scaled. A leaf is cupped along its normal and scaling that too
   would flatten the curl — the curl is what makes it a leaf rather than a decal.

Run inside the live Blender session:
    exec(compile(open(r'F:\\GitHub_Like\\funny8kids.github.io\\world\\pipeline\\reshape_sprig_cordate.py').read(),
                 'reshape_sprig_cordate.py', 'exec'))
"""
import bpy
import json
from math import atan2, cos, pi, sin
from mathutils import Vector

# Viola odorata, read left to right from the petiole: the notch of the sinus, the auricle flare, the
# widest point a sixth of the way up the blade, then a long easy taper into a ROUNDED apex — which is
# what bins 10-12 are for. A pointed tip falls through 0.34 to nothing in two steps; this holds.
CLASSIC = [0.52, 0.88, 1.00, 0.99, 0.95, 0.89, 0.82, 0.75, 0.67, 0.58, 0.48, 0.34, 0.16]
# The young leaf nearest the heart: rounder, a shallower notch, and it holds its width right to the
# apex instead of tapering.
ROUND = [0.63, 0.92, 1.00, 0.98, 0.93, 0.88, 0.82, 0.76, 0.70, 0.63, 0.55, 0.44, 0.28]
# The mature outer leaf: the auricles flare harder and everything above them comes off faster, so the
# outline reads faintly triangular rather than heart-shaped. Its apex still has to be ROUNDED — a
# violet's is, however old the leaf — so bins 10-12 stay broad enough to clear the verdict.
BROAD = [0.44, 0.84, 1.00, 0.93, 0.83, 0.74, 0.65, 0.57, 0.49, 0.42, 0.35, 0.28, 0.15]
LAWS = (CLASSIC, ROUND, BROAD)
NB = len(CLASSIC)
MIN_SCALE, MAX_SCALE = 0.45, 2.10
# Sweet violet margins are crenate — a shallow scallop, not a smooth curve. At forty pixels it is the
# difference between an edge the eye calls organic and one it calls a sticker, and it costs nothing:
# the ripple is 5% of the local width, so it cannot fight the silhouette law or the verdict. Three
# lobes, because the law is read at 13 stations and a finer wave would be aliased by that sampling.
CRENATE_WAVES, CRENATE_AMP = 3.0, 0.05
ST = [k / float(len(CLASSIC) - 1) for k in range(len(CLASSIC))]   # the stations the laws are authored at
HALF = 0.5 / (len(CLASSIC) - 1)                                    # each station owns the band about it
# Only the desktop sprig. `FinaleBloom.001` is a decimated copy whose parts no longer share a vertex
# count, so no geometry rule can name its leaves reliably; the mobile asset is rebuilt from the
# corrected one by the exporter instead, which is also what guarantees the two agree.
OBJECTS = ('FinaleBloom',)


def components(me):
    n = len(me.vertices)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for p in me.polygons:
        vs = p.vertices
        for i in range(1, len(vs)):
            ra, rb = find(vs[0]), find(vs[i])
            if ra != rb:
                parent[ra] = rb
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def axes(pts, c):
    """Jacobi eigen-decomposition of the 3x3 covariance; three orthonormal vectors, largest first."""
    cv = [[0.0] * 3 for _ in range(3)]
    for p in pts:
        d = (p.x - c.x, p.y - c.y, p.z - c.z)
        for a in range(3):
            for b in range(3):
                cv[a][b] += d[a] * d[b]
    m = [row[:] for row in cv]
    v = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _ in range(64):
        p, q = (0, 1) if abs(m[0][1]) >= max(abs(m[0][2]), abs(m[1][2])) else \
               ((0, 2) if abs(m[0][2]) >= abs(m[1][2]) else (1, 2))
        if abs(m[p][q]) < 1e-15:
            break
        th = 0.5 * atan2(2.0 * m[p][q], m[p][p] - m[q][q])
        ct, st = cos(th), sin(th)
        for k in range(3):
            a1, a2 = m[k][p], m[k][q]
            m[k][p], m[k][q] = ct * a1 - st * a2, st * a1 + ct * a2
        for k in range(3):
            b1, b2 = v[k][p], v[k][q]
            v[k][p], v[k][q] = ct * b1 - st * b2, st * b1 + ct * b2
    cols = [Vector((v[0][k], v[1][k], v[2][k])) for k in range(3)]
    lam = [sum(cv[a][b] * cols[k][a] * cols[k][b] for a in range(3) for b in range(3)) for k in range(3)]
    return [cols[k] for k in sorted(range(3), key=lambda k: -lam[k])]


def cent(pts):
    n = len(pts)
    return Vector((sum(p.x for p in pts) / n, sum(p.y for p in pts) / n, sum(p.z for p in pts) / n))


def want_at(law, phi, t):
    """The width this blade should have at station t: its own law, scalloped along the margin."""
    s = t * (NB - 1)
    k = min(NB - 2, int(s))
    f = s - k
    base = law[k] * (1 - f) + law[k + 1] * f
    return base * (1.0 + CRENATE_AMP * sin(2.0 * pi * (CRENATE_WAVES * t + phi)))


def blend_laws(a, b, f):
    return [round(a[i] * (1 - f) + b[i] * f, 4) for i in range(NB)]


def law_at(phase, maturity):
    """One of three silhouette laws per leaf, chosen so no two leaves in the rosette match.

    Sixteen copies of one profile is exactly what makes a sprig read as stamped rather than grown, and
    a real Viola rosette genuinely does not have that: the leaves nearest the heart are young and
    round, the outer ones are old and flare harder at the auricles. `phase` walks the closed loop of
    the three laws once around the crown, so neighbouring leaves are similar and opposite leaves are
    not; `maturity` biases a large leaf toward the classic outline and a small one toward the round one.
    """
    x = (phase % 1.0) * len(LAWS)
    k = int(x) % len(LAWS)
    f = x - int(x)
    f = f * f * (3.0 - 2.0 * f)                      # smoothstep: no seam where the loop closes
    law = blend_laws(LAWS[k], LAWS[(k + 1) % len(LAWS)], f)
    return blend_laws(ROUND, law, min(1.0, 0.35 + 0.65 * maturity))


def blade_frame(me, sel, base_near):
    """Length / width axes for one blade, oriented so that u = 0 is its base.

    The frame is built once and never re-derived, and the length axis is the blade's own diameter —
    double sweep, the farthest vertex from the centroid and then the farthest vertex from that one —
    rather than the top principal direction. PCA was what deformed the last run: a blade that is
    nearly as broad as it is long has λ1 ≈ λ2, so the top eigenvector is free to rotate (or swap with
    the second axis) between two almost-equivalent candidates, and re-measuring it every iteration
    pass is enough to hit that. The pass after a jump scales the leaf along its length and the next
    profile is nonsense. The diameter has no such ambiguity: it is a distance, not an eigenvector.
    Only the width is re-measured each pass, against these stored axes.
    """
    co = me.vertices
    pts = [co[i].co for i in sel]
    n = len(pts)
    c = cent(pts)
    ax = axes(pts, c)
    normal = ax[2]                       # least spread = the sheet's normal; well separated, so stable
    a = max(pts, key=lambda p: (p - c).length_squared)
    b = max(pts, key=lambda p: (p - a).length_squared)
    ln = b - a
    ln = ln - normal * ln.dot(normal)    # project into the blade plane
    if ln.length < 1e-6:
        ln = ax[0] - normal * ax[0].dot(normal)
    ln.normalize()
    wa = normal.cross(ln)
    wa.normalize()
    us = [(p - c).dot(ln) for p in pts]
    ws = [(p - c).dot(wa) for p in pts]
    # the tip end is the one farther from the neighbouring part; flip so u runs base -> tip
    order = sorted(us)
    k = max(1, n // 10)
    low = cent([p for p, u in zip(pts, us) if u <= order[k]])
    high = cent([p for p, u in zip(pts, us) if u >= order[-1 - k]])
    if (low - base_near).length_squared > (high - base_near).length_squared:
        us = [-u for u in us]
    lo, hi = min(us), max(us)
    L = (hi - lo) or 1e-9
    fr = {'sel': sel, 'near': base_near, 'c': c, 'ln': ln, 'wa': wa, 'L': L,
          't': [(u - lo) / L for u in us], 'off': ws}
    half_widths(fr)
    # The leaf keeps the width it was authored with; only its distribution along the midrib changes.
    # This matters, and it is the second version of the same mistake: a profile is a shape, so driving
    # a normalised shape leaves every pass free to inflate the whole blade — an earlier run of this
    # script grew leaves to 1.4x their own length while reporting a perfect profile. Measured, the
    # authored blades are already W/L ~ 0.90, a violet's proportions, so the defect was never the size.
    fr['W0'] = max(fr['hw']) or 1e-9
    return fr


def half_widths(fr):
    """Half-width at each authored station: how far the blade reaches sideways within its band.

    A half-width per band, not an extent across all the vertices that happen to share a bin, because
    the two are not the same quantity. Comparing a per-vertex target against a whole-band extent lets
    the extreme vertex on one side be scaled by the target at its own station and the extreme on the
    other by the target at its own — which are different numbers wherever the law is steep — and the
    band therefore widens by more than either asked. That is how the previous run ballooned.
    """
    hw = []
    for k, s in enumerate(ST):
        lo, hi = max(0.0, s - HALF), min(1.0, s + HALF)
        band = [abs(o) for t, o in zip(fr['t'], fr['off']) if lo <= t <= hi]
        hw.append(max(band) if band else 0.0)
    fr['hw'] = hw
    return hw


def measure(me, fr):
    """Re-read the widths against the fixed axes; `t` cannot move, width can."""
    c, wa = fr['c'], fr['wa']
    fr['off'] = [(me.vertices[i].co - c).dot(wa) for i in fr['sel']]
    return half_widths(fr)


def band_of(t):
    """Which authored station a point along the blade belongs to — the inverse of half_widths' bands."""
    return min(NB - 1, max(0, int(round(t * (NB - 1)))))


def profile(fr):
    """The blade's half-width at each station, in units of its own authored width."""
    return [round(v / fr['W0'], 3) for v in fr['hw']]


def remap(me, fr):
    """Move each vertex across the blade by target/measured at its own station along the length.

    Assigned back through `co[i].co = ...` rather than by mutating the Vector each vertex hands out:
    that one is a copy, and a silent no-op here would report a perfect profile on an unchanged mesh.

    Iterated only because a station may need more than MIN_SCALE or MAX_SCALE in one step — with one
    shared factor per band the target is reached exactly, so further passes change nothing. What is NOT
    re-derived per pass is the frame: see `blade_frame`.
    """
    hw = measure(me, fr)
    W0 = fr['W0']
    bands = [band_of(t) for t in fr['t']]
    worst = 1.0
    for _ in range(8):
        if worst < 0.02:
            break
        c, wa = fr['c'], fr['wa']
        R = [max(MIN_SCALE, min(MAX_SCALE,
                                (W0 * want_at(fr['law'], fr['phi'], s)) / max(hw[k], 0.05 * W0)))
             for k, s in enumerate(ST)]
        for i, b in zip(fr['sel'], bands):
            p = me.vertices[i].co
            off = (p - c).dot(wa)
            me.vertices[i].co = p + wa * (off * (R[b] - 1.0))
        hw = measure(me, fr)
        worst = max(abs(want_at(fr['law'], fr['phi'], s) - hw[k] / W0) for k, s in enumerate(ST))
    fr['W1'] = max(hw)
    fr['residual'] = round(worst, 3)
    return profile(fr)


report = []
for name in OBJECTS:
    ob = bpy.data.objects.get(name)
    if not ob:
        report.append({'object': name, 'error': 'absent'})
        continue
    me = ob.data
    comps = components(me)
    big = [g for g in comps if len(g) > 250]
    hist = {}
    for g in big:
        hist[len(g)] = hist.get(len(g), 0) + 1
    if not hist:
        raise RuntimeError('%s: no component over 250 verts — nothing to reshape' % name)
    size, count = max(hist.items(), key=lambda kv: (kv[1], kv[0]))
    blades = [g for g in big if len(g) == size]
    if count not in (16, 20):
        raise RuntimeError('%s: %d components of %d verts, expected 16 or 20 leaf blades (families: %s)'
                           % (name, count, size, sorted(hist.items(), key=lambda kv: -kv[1])[:4]))
    centroids = []
    for g in comps:
        pts = [me.vertices[i].co for i in g]
        centroids.append((g, Vector((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts),
                                     sum(p.z for p in pts) / len(pts)))))
    frames = []
    for g in blades:
        gs = set(g)
        cen = cent([me.vertices[i].co for i in g])
        near = min((c for gg, c in centroids if gg is not g and not (gs & set(gg))),
                   key=lambda c: (c - cen).length_squared)
        frames.append(blade_frame(me, g, near))
    # Walk the rosette in azimuth so neighbours receive neighbouring laws, and read each leaf's age off
    # its own length: the youngest leaf of a real sprig is the small one at the heart.
    ctr = cent([fr['c'] for fr in frames])
    order = sorted(frames, key=lambda fr: atan2(fr['c'].y - ctr.y, fr['c'].x - ctr.x))
    lmin = min(fr['L'] for fr in order)
    lmax = max(fr['L'] for fr in order)
    rows = []
    for i, fr in enumerate(order):
        fr['phase'] = i / float(len(order))
        fr['maturity'] = 0.5 if lmax <= lmin else (fr['L'] - lmin) / (lmax - lmin)
        fr['law'] = law_at(fr['phase'], fr['maturity'])
        fr['phi'] = fr['phase'] * 3.0
        before = profile(fr)
        after = remap(me, fr)
        rows.append([before, after, round(fr['W1'] / fr['W0'], 3), round(fr['L'], 4),
                     round(fr['W1'] / fr['L'], 2), round(fr['maturity'], 2), fr['residual']])
    me.update()
    report.append({'object': name, 'comps': len(comps), 'blade_verts': size, 'blades': count,
                   'before': [r[0] for r in rows], 'after': [r[1] for r in rows],
                   'grow': [r[2] for r in rows], 'long': [r[3] for r in rows],
                   'wide_over_long': [r[4] for r in rows], 'maturity': [r[5] for r in rows],
                   'residual': [r[6] for r in rows]})

# Verdict, not vibes. Three things make a violet leaf, and a width profile can see all three: the
# widest point sits in the basal third (a dandelion's and a willow's sit at the middle), the sinus
# leaves a notch at u=0, and the apex is ROUNDED — which is not "the last station is small", because a
# point is small too. It is the second-to-last station staying broad: where a tip falls under 0.2, a
# violet holds a third of its width almost to the end.
def cordate(p):
    """None if this profile is a sweet violet leaf; the reason it is not, otherwise."""
    top = max(range(NB), key=lambda k: p[k])
    if ST[top] > 0.34:
        return 'widest at t=%.2f of its own length — that is a dandelion' % ST[top]
    if p[0] > 0.80:
        return 'no sinus: the petiole end is already %.2f of the full width' % p[0]
    if p[-2] < 0.26:
        return 'pointed apex: t=%.2f has fallen to %.2f' % (ST[-2], p[-2])
    return None


bad = []
for r in report:
    aft = r.get('after') or []
    for i, p in enumerate(aft):
        why = cordate(p)
        if why:
            bad.append('%s[%d] %s' % (r['object'], i, why))
    # The counterexample that proves this verdict is not decorative: the profiles this script started
    # from were the wrong species, so if the test passed them too it would be testing nothing. A guard
    # that cannot fail on its own input is not a guard — but two of sixteen passing is a leaf that
    # happens to be shaped right, not a blind test, so the bar is a majority failing.
    nfail = 0
    for i, p in enumerate(r.get('before') or []):
        if cordate(p) is not None:
            nfail += 1
    r['before_rejected'] = nfail
    if len(r.get('before') or []) > 1 and nfail < int(0.7 * len(r['before'])):
        bad.append('%s: the species test only rejects %d of %d authored blades — it has no teeth' %
                   (r['object'], nfail, len(r['before'])))
    # And individuality, also measured. A family that shares one silhouette to two decimals is a family
    # of stamps even when the silhouette is the right species, so the profiles have to differ from each
    # other by more than the remap's own residual. Rounded at 0.01, that residual is the noise floor;
    # anything below 12 distinct shapes out of 16 means the law is doing all the work and no leaf is.
    keys = set(tuple(round(v / 0.01) for v in p) for p in aft)
    r['distinct'] = len(keys)
    if len(aft) > 1 and len(keys) < max(2, int(0.7 * len(aft))):
        bad.append('%s: only %d distinct blade profiles across %d blades' %
                   (r['object'], len(keys), len(aft)))
    # and the size has to be the size it was authored at. Reshaping a silhouette by iterating a
    # normalised profile can inflate a leaf without ever violating the profile; this is the guard that
    # would have caught that the first time.
    for i, g in enumerate(r.get('grow') or []):
        if not 0.92 <= g <= 1.10:
            bad.append('%s[%d] width changed %.0f%% — a silhouette law does not license resizing' %
                       (r['object'], i, (g - 1) * 100))
    for i, e in enumerate(r.get('residual') or []):
        if e > 0.04:
            bad.append('%s[%d] stopped %.3f short of its own law' % (r['object'], i, e))
for r in report:
    for i, (b, a) in enumerate(zip(r.get('before') or [], r.get('after') or [])):
        print('blade %2d  L=%.4f  W/L %.2f  grow %.3f  was %s\n              now %s' %
              (i, r['long'][i], r['wide_over_long'][i], r['grow'][i], b, a))
print(json.dumps([{k: v for k, v in r.items() if k not in ('before', 'after')} for r in report]))
print('BLADES', sum(len(r.get('after') or []) for r in report), 'NOT_CORDATE', len(bad))
for b in bad[:8]:
    print('  ', b)
