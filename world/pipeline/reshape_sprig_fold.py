"""Remove the fold from the violet sprig's blades -- nothing else.

Two earlier diagnoses about FinaleBloom's remaining faults, corrected by measurement:

* "canopy cover of disc = 0.31, ground shows through" was an artifact. Both sprig_measure.py and
  reshape_sprig_canopy.py divided the rasterised mask by ``pi * (rmax * 1.05 * sc)**2`` where the
  plane units and the radius units disagreed, inflating the denominator about 3.4x. Measured
  against its own bounding square the plan mask fills 90.5% of it, which is more than a complete
  disc. The rosette is dense. No fix wanted.
* The one real fault is out-of-plane fold: on seven blades the vertices sit 8-35% of the blade's
  own width off the blade's best-fit plane, which reads as a party hat rather than a leaf.

So this script scales each blade's out-of-plane offsets down by one uniform factor per blade.
Uniform per blade, not clipped per vertex: clipping at a threshold creases the margin into a
straight fold line, while scaling keeps the natural undulation and only lowers its amplitude.
Blades that are already flat are left exactly alone.
"""
import math
import bpy
from mathutils import Vector

OBJECTS = ('FinaleBloom',)
CUP_LIMIT = 0.075          # max p95 out-of-plane offset, as a fraction of the blade's width
FLAT_ENOUGH = 0.09         # above this the fold still visibly reads; report it
DRY = bool(globals().get('FOLD_DRY', False))


def pctl(vals, q):
    s = sorted(vals)
    if not s:
        return 0.0
    i = min(len(s) - 1, max(0, int(round(q * (len(s) - 1)))))
    return s[i]


def jacobi(a, sweeps=48):
    r = [[a[i][j] for j in range(3)] for i in range(3)]
    v = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _ in range(sweeps):
        off = [(i, j) for i in range(3) for j in range(i + 1, 3)]
        i, j = max(off, key=lambda k: abs(r[k[0]][k[1]]))
        if abs(r[i][j]) < 1e-15:
            break
        app, aqq, apq = r[i][i], r[j][j], r[i][j]
        th = math.pi / 4.0 if abs(app - aqq) < 1e-18 else math.atan2(2.0 * apq, app - aqq) / 2.0
        c, s = math.cos(th), math.sin(th)
        for k in range(3):
            ik, jk = r[k][i], r[k][j]
            r[k][i] = c * ik - s * jk
            r[k][j] = s * ik + c * jk
        for k in range(3):
            ki, kj = r[i][k], r[j][k]
            r[i][k] = c * ki - s * kj
            r[j][k] = s * ki + c * kj
        for k in range(3):
            vi, vj = v[k][i], v[k][j]
            v[k][i] = c * vi - s * vj
            v[k][j] = s * vi + c * vj
    return sorted(((r[i][i], Vector((v[0][i], v[1][i], v[2][i]))) for i in range(3)),
                  key=lambda t: -t[0])


def components(me):
    parent = list(range(len(me.vertices)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for p in me.polygons:
        vs = p.vertices
        for vtx in vs[1:]:
            root_a, root_b = find(vs[0]), find(vtx)
            if root_a != root_b:
                parent[root_b] = root_a
    comps = {}
    for idx in range(len(me.vertices)):
        comps.setdefault(find(idx), []).append(idx)
    return comps


report = {}
for name in OBJECTS:
    ob = bpy.data.objects.get(name)
    if ob is None or ob.type != 'MESH':
        continue
    me = ob.data
    comps = components(me)
    blades = [k for k, v in comps.items() if len(v) > 250]
    rows, touched = [], 0
    for k in sorted(blades, key=lambda kk: -len(comps[kk])):
        sel = comps[k]
        pts = [me.vertices[i].co for i in sel]
        n = float(len(pts))
        c = Vector((sum(p.x for p in pts) / n, sum(p.y for p in pts) / n,
                    sum(p.z for p in pts) / n))
        cov = [[0.0] * 3 for _ in range(3)]
        for p in pts:
            d = p - c
            for i in range(3):
                for j in range(3):
                    cov[i][j] += d[i] * d[j]
        cov = [[cov[i][j] / n for j in range(3)] for i in range(3)]
        pr = jacobi(cov)
        axis2, axis1, normal = pr[1][1], pr[0][1], pr[2][1]
        off = [abs((p - c).dot(normal)) for p in pts]
        wdt = max((p - c).dot(axis2) for p in pts) - min((p - c).dot(axis2) for p in pts)
        cup = pctl(off, 0.95)
        over = cup > CUP_LIMIT * wdt and cup > 1e-6
        if over:
            f = (CUP_LIMIT * wdt) / cup
            if not DRY:
                for i in sel:
                    p = me.vertices[i].co
                    d = (p - c).dot(normal)
                    me.vertices[i].co = p - normal * (d * (1.0 - f))
                touched += 1
        off2 = off
        if over and not DRY:
            q = [abs((me.vertices[i].co - c).dot(normal)) for i in sel]
            off2 = q
        rows.append({'verts': len(sel), 'W_mm': round(wdt * 1000, 1),
                     'cup_over_W': round(cup / wdt, 3) if wdt > 1e-9 else None,
                     'cup_after': round(pctl(off2, 0.95) / wdt, 3) if wdt > 1e-9 else None,
                     'shrank': round(pctl(off2, 0.95) / cup, 2) if (over and cup > 1e-9) else 1.0})
    worst = max((r['cup_after'] if r['cup_after'] is not None else 0.0) for r in rows)
    report[name] = {'dry_run': DRY, 'blades': len(rows), 'folded_before': sum(
        1 for r in rows if r['cup_over_W'] > CUP_LIMIT),
        'cup_p95_over_W': [r['cup_after'] for r in rows],
        'worst_cup': round(worst, 3), 'still_over': sum(1 for r in rows if r['cup_after'] > FLAT_ENOUGH),
        'touched': touched, 'rows': rows}
    if not DRY:
        me.update()

print(report)
