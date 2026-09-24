"""Make the sprig read as a plant, not as lollipops on wire.

The cordate pass fixed each leaf's *outline*; looking at the whole sprig from a camera-like angle
then showed two faults an outline cannot cause.

- Seven blades sit 8-35% of their own width out of their best-fit plane. That is a fold, not the
  gentle wave a violet leaf has, and it is what makes them read as paper party hats.
- The blades cover 0.31 of the disc they stand on, so two thirds of the ground shows through the
  canopy. A real Viola odorata rosette shingles; this one is splayed on long petioles.

Two rejected ways to close the canopy, recorded so nobody retries them:

- inflating the leaves: the first search picked grow = 1.75, which would make the largest blade
  87 mm across a species that tops out near 55 mm.
- contracting the splay radially: any map r -> k*r is a squash, and it shortens each blade along
  its own length by up to a third, quietly undoing the width law the previous pass established.

So the leaves are swung instead of stretched. Each blade owns the small components that touch its
base (its petiole), and the pair rotates rigidly about the tangential axis through the base itself
- which is where the petiole meets the blade, so the joint cannot tear - leaning it more upright.
Rigid motion preserves the outline exactly; only the splay angle changes.

The cup clamp is deliberately restricted to blade vertices. A petiole sits far below the blade's
own plane, so clamping it by that plane's normal would drag it up into the leaf.
"""
import math
from collections import Counter, defaultdict

import bpy
from mathutils import Matrix, Vector

TARGET_COVER = 0.62
MAX_BLADE_L = 0.055          # metres; Viola odorata tops out around here
CUP_LIMIT = 0.075            # out-of-plane deviation as a fraction of blade width
UPRIGHT_DEG = 62.0           # where a leaf ends up when the swing is taken all the way
TOUCH_MM = 0.008             # how close a component must come to a blade base to belong to it
RES = 300
OBJECTS = ('FinaleBloom',)
DRY_RUN = bool(globals().get('CANOPY_DRY', False))


def jacobi(a, sweeps=60):
    r = [[a[i][j] for j in range(3)] for i in range(3)]
    v = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _ in range(sweeps):
        i, j = max(((i, j) for i in range(3) for j in range(i + 1, 3)),
                   key=lambda k: abs(r[k[0]][k[1]]))
        if abs(r[i][j]) < 1e-16:
            break
        th = 0.5 * math.atan2(2.0 * r[i][j], r[i][i] - r[j][j])
        c, s = math.cos(th), math.sin(th)
        for k in range(3):
            rik, rjk = r[k][i], r[k][j]
            r[k][i] = c * rik - s * rjk
            r[k][j] = s * rik + c * rjk
        for k in range(3):
            rki, rkj = r[i][k], r[j][k]
            r[i][k] = c * rki - s * rkj
            r[j][k] = s * rki + c * rkj
        for k in range(3):
            vki, vkj = v[k][i], v[k][j]
            v[k][i] = c * vki - s * vkj
            v[k][j] = s * vki + c * vkj
    return [(r[k][k], Vector((v[0][k], v[1][k], v[2][k])).normalized()) for k in range(3)]


def components(me):
    n = len(me.vertices)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for p in me.polygons:
        vs = list(p.vertices)
        for v in vs[1:]:
            ra, rb = find(vs[0]), find(v)
            if ra != rb:
                parent[rb] = ra
    comps = defaultdict(list)
    for i in range(n):
        comps[find(i)].append(i)
    return comps


def fit(pts):
    c = Vector((0.0, 0.0, 0.0))
    for p in pts:
        c += p
    c /= len(pts)
    cov = [[0.0] * 3 for _ in range(3)]
    for p in pts:
        d = p - c
        for a in range(3):
            for b in range(3):
                cov[a][b] += d[a] * d[b]
    pr = jacobi(cov)
    pr.sort(key=lambda t: -t[0])
    return c, pr


def lean_of(disp, axis):
    """Angle of a leaf's own outward direction above the rosette plane, radians."""
    rad = disp - axis * disp.dot(axis)
    return math.atan2(disp.dot(axis), max(rad.length, 1e-9))


report = {}
for oname in OBJECTS:
    ob = bpy.data.objects[oname]
    me = ob.data
    co = me.vertices
    comps = components(me)
    sizes = {k: len(v) for k, v in comps.items()}
    big = [k for k, s in sizes.items() if s > 250]
    modal, howmany = Counter(sizes[k] for k in big).most_common(1)[0]
    if howmany not in (16, 20):
        raise RuntimeError('%s: expected 16 or 20 blades, found %d of size %d'
                           % (oname, howmany, modal))
    blade_keys = [k for k in big if sizes[k] == modal]

    blade_of = {}
    for k in blade_keys:
        for i in comps[k]:
            blade_of[i] = k
    me.calc_loop_triangles()
    tris_by = defaultdict(list)
    for t in me.loop_triangles:
        k = blade_of.get(t.vertices[0])
        if k is not None:
            tris_by[k].append(list(t.vertices))

    cen, apr = fit([co[i].co for i in [j for k in blade_keys for j in comps[k]]])
    U, V, axis = apr[0][1], apr[1][1], apr[2][1]

    groups = []
    # The base end of a blade is the one nearer its own petiole, not the one nearer the rosette
    # centre: for a steeply tilted leaf the centre is closer to the tip, and getting this backwards
    # is what made the first version of this script swing half the leaves downward.
    small_c = [(k, fit([co[i].co for i in comps[k]])[0]) for k in comps if sizes[k] <= 250]
    for k in blade_keys:
        bsel = comps[k]
        pts = [co[i].co for i in bsel]
        c, fpr = fit(pts)
        nrm = fpr[2][1]
        a = max(pts, key=lambda p: (p - c).length_squared)
        b = max(pts, key=lambda p: (p - a).length_squared)
        pk, pn = min(small_c, key=lambda t: (t[1] - c).length_squared)
        tip = b if (b - pn).length_squared > (a - pn).length_squared else a
        base = a if tip is b else b
        width = max((p - c).dot(fpr[1][1]) for p in pts) - min((p - c).dot(fpr[1][1]) for p in pts)
        groups.append({'k': k, 'bsel': list(bsel), 'sel': list(bsel), 'c': c, 'n': nrm,
                       'base': base, 'W': width, 'L': (tip - base).length,
                       'tris': tris_by[k], 'parts': [pk]})

    # ---- each petiole travels with exactly one blade ----
    for grp in groups:
        for pk in grp['parts']:
            grp['sel'] = sorted(set(grp['sel']) | set(comps[pk]))

    rmax = max((co[i].co - cen).length for grp in groups for i in grp['sel'])
    lmax = max(grp['L'] for grp in groups)
    gcap = max(1.0, min(1.25, MAX_BLADE_L / lmax))
    leans = [round(math.degrees(lean_of(grp['c'] - grp['base'], axis)), 1) for grp in groups]

    def rot_of(grp, f):
        disp = grp['c'] - grp['base']
        rad = disp - axis * disp.dot(axis)
        if rad.length < 1e-9:
            return Matrix.Identity(4)
        tang = axis.cross(rad).normalized()
        lean = lean_of(disp, axis)
        want = math.radians(UPRIGHT_DEG)
        d = f * max(0.0, want - lean)
        return (Matrix.Translation(grp['base']) @ Matrix.Rotation(d, 4, tang)
                @ Matrix.Translation(-grp['base']))

    def cover(f, grow):
        """Canopy fraction in the rosette plane under swing f and blade growth grow."""
        sc = (RES * 0.5) / (rmax * 1.05)
        mask = bytearray(RES * RES)
        for grp in groups:
            rot = rot_of(grp, f)
            for t in grp['tris']:
                poly = []
                for vi in t:
                    p = co[vi].co
                    if grow != 1.0:
                        p = grp['base'] + (p - grp['base']) * grow
                    q = rot @ p
                    d = q - cen
                    poly.append((d.dot(U) * sc + RES * 0.5, RES * 0.5 - d.dot(V) * sc))
                ys = [z[1] for z in poly]
                y0, y1 = int(math.floor(min(ys))), int(math.ceil(max(ys)))
                for y in range(max(0, y0), min(RES, y1 + 1)):
                    yc = y + 0.5
                    xs = []
                    for i in range(3):
                        ax, ay = poly[i]
                        bx, by = poly[(i + 1) % 3]
                        if (ay <= yc < by) or (by <= yc < ay):
                            xs.append(ax + (yc - ay) / (by - ay) * (bx - ax))
                    if len(xs) < 2:
                        continue
                    xs.sort()
                    for x in range(max(0, int(xs[0])), min(RES - 1, int(xs[-1]))):
                        mask[y * RES + x] = 1
        return round(sum(mask) / (math.pi * (rmax * 1.05 * sc) ** 2), 3)

    if cover(0.0, 1.0) >= TARGET_COVER:
        raise RuntimeError('%s: canopy already %.2f, refusing to run twice'
                           % (oname, cover(0.0, 1.0)))

    grid = [(round(f, 2), round(g, 3)) for f in (0.0, 0.25, 0.45, 0.65, 0.85, 1.0)
            for g in (1.0, 1.1, gcap)]
    scored = [(f, g, cover(f, g)) for f, g in grid]
    ok = [t for t in scored if t[2] >= TARGET_COVER]
    # least leaf inflation first, then the smallest swing that gets there
    f, grow, cov_pick = min(ok, key=lambda t: (t[1], -t[0])) if ok else (1.0, gcap, None)

    if DRY_RUN:
        report[oname] = {'dry_run': True, 'blades': len(groups), 'lmax': round(lmax, 4),
                         'gcap': round(gcap, 3), 'swing_f': f, 'grow': grow, 'cover': cov_pick,
                         'petioles_claimed': sum(len(g['parts']) for g in groups),
                         'parts_per_blade': [len(g['parts']) for g in groups],
                         'lean_deg': leans,
                         'cover_grid': {'f%.2f_g%.2f' % t[:2]: t[2] for t in scored}}
        print(report)
        continue

    # ---- apply ----
    for grp in groups:
        rot = rot_of(grp, f)
        lim = CUP_LIMIT * grp['W']
        bset = set(grp['bsel'])
        for i in grp['sel']:
            p = co[i].co
            if i in bset:                       # the fold clamp is a blade-only operation
                off = (p - grp['c']).dot(grp['n'])
                if abs(off) > lim:
                    p = p - grp['n'] * (off - math.copysign(lim, off))
            if grow != 1.0 and i in bset:
                p = grp['base'] + (p - grp['base']) * grow
            co[i].co = rot @ p

    # ---- verify on the live mesh ----
    rmax = max((co[i].co - cen).length for grp in groups for i in grp['sel'])
    cover_after = cover(0.0, 1.0)
    cup_after, L_after, not_cordate, moved = [], [], 0, 0
    NB = 13
    for grp in groups:
        pts = [co[i].co for i in grp['bsel']]
        c, fpr = fit(pts)
        d = sorted(abs((p - c).dot(fpr[2][1])) for p in pts)
        w = max((p - c).dot(fpr[1][1]) for p in pts) - min((p - c).dot(fpr[1][1]) for p in pts)
        cup_after.append(round(d[int(0.95 * len(d))] / w, 3))
        nrm, wa = fpr[2][1], fpr[1][1]
        a = max(pts, key=lambda p: (p - c).length_squared)
        b = max(pts, key=lambda p: (p - a).length_squared)
        ln = b - a
        ln = ln - nrm * ln.dot(nrm)
        ln.normalize()
        us = [(p - c).dot(ln) for p in pts]
        lo, hi = min(us), max(us)
        L = (hi - lo) or 1e-9
        L_after.append(round(L, 4))
        hw = [0.0] * NB
        for u, p in zip(us, pts):
            kk = min(NB - 1, max(0, int(round((u - lo) / L * (NB - 1)))))
            hw[kk] = max(hw[kk], abs((p - c).dot(wa)))
        mx = max(hw) or 1e-9
        pr = [v / mx for v in hw]
        top = max(range(NB), key=lambda x: pr[x])
        if not (pr[0] > 0.55 and pr[-1] < 0.34 and pr[-2] < 0.55 and pr[top] > 0.34 and top <= 3):
            not_cordate += 1
        moved += len(grp['sel'])

    report[oname] = {'blades': len(groups), 'swing_f': f, 'grow': grow,
                     'cover': cov_pick, 'cover_after': cover_after,
                     'petioles_claimed': sum(len(g['parts']) for g in groups),
                     'cup_p95_after': cup_after,
                     'folded_after': sum(1 for v in cup_after if v > CUP_LIMIT + 0.02),
                     'L_max_after': max(L_after), 'not_cordate': not_cordate,
                     'spread_m': round(2 * rmax, 4), 'verts_moved': moved}
    if cover_after < TARGET_COVER * 0.9:
        raise RuntimeError('%s: canopy still %.2f' % (oname, cover_after))
    if not_cordate:
        raise RuntimeError('%s: %d blades lost the cordate outline' % (oname, not_cordate))

print(report)
