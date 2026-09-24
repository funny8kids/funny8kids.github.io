# -*- coding: utf-8 -*-
"""
Violet Garden — high-fidelity procedural violet generator (original art).
Builds botanical geometry with bmesh: cubic-bezier petal outlines, lateral
arc + tip reflex curl, vein ridges, ink-violet gradient, bearded throat,
crested lower petal, tapered curvy stem, serrated basal leaves.
Exports GLBs (vertex colors) to world/assets/models/.
"""
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "models")
os.makedirs(OUT, exist_ok=True)

# ---------- palette authored in sRGB floats (exporter decodes Color attr sRGB->linear) ----------
CORE = (0.24, 0.16, 0.42)   # deep ink violet center
MID  = (0.50, 0.40, 0.70)   # violet
RIM  = (0.72, 0.65, 0.88)   # pale lavender rim
VEIN = (0.30, 0.18, 0.45)   # vein darkening
EYE  = (0.85, 0.72, 0.35)   # gold eye
BEARD= (0.95, 0.92, 0.85)   # ivory beard flecks
STEM = (0.35, 0.48, 0.30)
STEM_HI = (0.50, 0.62, 0.42)
LEAF = (0.35, 0.50, 0.35)
LEAF_TIP = (0.50, 0.65, 0.45)

def s2l(c):  # sRGB byte-ish floats -> linear
    return tuple(pow(v/255.0, 2.2) for v in c)

def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i]-a[i])*t for i in range(3))

def grad3(u):  # core->mid->rim
    return mix(CORE, MID, u/0.45) if u < 0.45 else mix(MID, RIM, (u-0.45)/0.55)

# ---------- curve helpers ----------
def bez(p0, p1, p2, p3, t):
    mt = 1-t
    return (mt*mt*mt*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t*t*t*p3[0],
            mt*mt*mt*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t*t*t*p3[1])

def bez4(vals, t):
    mt = 1-t
    return mt*mt*mt*vals[0] + 3*mt*mt*t*vals[1] + 3*mt*t*t*vals[2] + t*t*t*vals[3]

def samples(arr, u):  # piecewise-linear lookup over [(u, val)]
    for i in range(len(arr)-1):
        if arr[i][0] <= u <= arr[i+1][0]:
            a, b = arr[i], arr[i+1]
            t = 0 if b[0]==a[0] else (u-a[0])/(b[0]-a[0])
            return a[1] + (b[1]-a[1])*t
    return arr[-1][1]

# ---------- petal builder ----------
def build_petal(name, L, W, outline, arc, curl, nU, nV, tilt, azim,
                crest=False, vein_freq=7.0, vein_amp=0.010, base_col=CORE):
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    grid = []
    for i in range(nU+1):
        u = i/nU
        row = []
        hw = W * bez4([o[1][0] for o in outline], u)
        arch = samples(arc, u)
        curlv = samples(curl, u)
        for j in range(nV+1):
            v = -1 + 2*j/nV
            lx = v*hw
            ly = u*L
            lz = arch*(1 - v*v) + curlv*(v*v)          # lateral arc -> rolled edges
            if crest and u < 0.30:                      # lower petal side folds
                lz += (0.30-u)*1.15*abs(v)**1.5*0.35
            vn = math.cos(v*vein_freq)*(u**1.5)*vein_amp*(hw/max(W,1e-6))
            lz += vn
            col = grad3(u)
            col = mix(col, VEIN, 0.30*max(0.0, math.cos(v*vein_freq))**4*(1-u))
            if u < 0.14:
                col = mix(base_col, col, u/0.14)
            row.append(bm.verts.new((lx, ly, lz)))
        grid.append(row)
    for i in range(nU):
        for j in range(nV):
            a, b, c, d = grid[i][j], grid[i][j+1], grid[i+1][j+1], grid[i+1][j]
            try: f = bm.faces.new((a, b, c, d))
            except ValueError: continue
    # paint vertex colors per loop by matching stored values
    colmap = {}
    for i in range(nU+1):
        for j in range(nV+1):
            colmap[grid[i][j]] = None
    # (recompute colors in deterministic order)
    def face_color(f, center):
        return None
    # simpler: assign colors by iterating grid again — store dict vert->col
    # bmesh verts are hashable
    vcol = {}
    for i in range(nU+1):
        u = i/nU
        for j in range(nV+1):
            v = -1 + 2*j/nV
            col = grad3(u)
            col = mix(col, VEIN, 0.30*max(0.0, math.cos(v*vein_freq))**4*(1-u))
            if u < 0.14: col = mix(base_col, col, u/0.14)
            vcol[grid[i][j]] = col
    for f in bm.faces:
        for lp in f.loops:
            lp[cl] = Vector((*(vcol.get(lp.vert, MID)), 1.0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = (math.radians(tilt), 0, math.radians(azim))
    bpy.context.collection.objects.link(ob)
    return ob

def add_beard(parent_ob, L, n=26, seed=7):
    random.seed(seed)
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    for k in range(n):
        u = 0.06 + random.random()*0.30
        v = (random.random()*2-1) * (0.28 + u*0.8)
        s = 0.008 + random.random()*0.012
        bmx = v*samples(BEARD_W, u)*0.9
        loc = Vector((bmx, u*L, samples(BEARD_Z, u)+0.006))
        mat = Matrix.Translation(loc) @ Matrix.Diagonal((s, s*1.6, s*0.6, 1))
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1, matrix=mat)
    me = bpy.data.meshes.new("beard")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("beard", me)
    ob.parent = parent_ob
    ob.matrix_parent_inverse = parent_ob.matrix_world.inverted()
    bpy.context.collection.objects.link(ob)
    return ob

# outline: (u, halfwidth) bezier control points; normalized shape
OUTLINE = [(0,(0.10)), (1,(0.62)), (2,(0.98)), (3,(0.86))]
def _mk_outline(w0, w1, w2, w3):
    return [(0,(w0,)),(1,(w1,)),(2,(w2,)),(3,(w3,))]

# beard helpers use width/at-z of the lower petal; set per flower via globals
BEARD_W = [(0,0.0),(1,0.5),(2,0.95),(3,0.8)]
BEARD_Z = [(0,0.0),(0.15,0.02),(0.3,0.05),(1,0.10)]

def samples2(arr, u):
    return samples([(a[0], a[1][0]) for a in arr], u)

# ---------- stem / leaf / eye ----------
def build_stem(name, height, bend=0.16, r0=0.020, r1=0.009, segs=20, rings=8, seed=3):
    random.seed(seed)
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    rings_v = []
    for i in range(segs+1):
        t = i/segs
        y = t*height
        z = math.sin(t*math.pi*0.8)*bend*height*0.25 + random.uniform(-0.0015,0.0015)
        x = (t**2)*bend*0.35 + random.uniform(-0.0015,0.0015)
        r = r0 + (r1-r0)*t + (0.004 if abs(t-0.45)<0.06 else 0)  # node swelling
        ring = [bm.verts.new((x + math.cos(2*math.pi*j/rings)*r,
                              y,
                              z + math.sin(2*math.pi*j/rings)*r)) for j in range(rings)]
        rings_v.append(ring)
    for i in range(segs):
        for j in range(rings):
            a,b = rings_v[i][j], rings_v[i][(j+1)%rings]
            c,d = rings_v[i+1][(j+1)%rings], rings_v[i+1][j]
            f = bm.faces.new((a,b,c,d))
    for f in bm.faces:
        cy = sum(v.co.y for v in f.verts)/4
        t = cy/height
        col = mix(STEM, STEM_HI, min(1.0, f.verts[0].co.z*2.0+0.15))
        col = mix(col, (0.22,0.09,0.30), max(0.0, 0.35-t)*0.5)  # violet blush at base
        for lp in f.loops: lp[cl] = Vector((*col, 1.0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

# The beds' foliage has to be the same species as the hero flower's own leaves. This file used to
# build them with sin(pi*(0.5u+0.02))**0.85, which grows monotonically to the tip -- an obovate weed
# leaf. These are the 13 authored stations of a Viola odorata blade: basal lobes at 0.52 of the
# widest point, shoulders just behind the base, then a long taper to a rounded apex. Same numbers
# world/pipeline/reshape_sprig_cordate.py fits the finale's sprig to, so the two cannot drift apart.
CORDATE = [0.52, 0.88, 1.00, 0.99, 0.95, 0.89, 0.82, 0.75, 0.67, 0.58, 0.48, 0.34, 0.16]
CRENATE_WAVES, CRENATE_AMP, NOTCH = 3.0, 0.05, 0.14


def cordate_hw(u, phi=0.0):
    x = min(max(u, 0.0), 1.0) * (len(CORDATE) - 1)
    i = int(math.floor(x))
    f = x - i
    a = CORDATE[i]
    b = CORDATE[min(i + 1, len(CORDATE) - 1)]
    base = a * (1.0 - f) + b * f
    return base * (1.0 + CRENATE_AMP * math.sin(2.0 * math.pi * (CRENATE_WAVES * u + phi)))


def build_leaf(name, L, W, tilt, azim, seed=5):
    random.seed(seed)
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    nU, nV = 16, 12
    phi = (seed % 7) / 7.0
    grid = []
    for i in range(nU+1):
        u = i/nU
        hw = W * cordate_hw(u, phi)
        row = []
        for j in range(nV+1):
            v = -1 + 2*j/nV
            edge = (abs(v) > 0.80) and (0.18 < u < 0.88) and ((i+j) % 3 == 0)
            hwm = hw*(0.94 if edge else 1.0)
            # The basal sinus is a plan feature: the lobes hang lower than the midrib, so the column
            # at v=0 has to start further up the leaf. Without this the outline is a rounded triangle.
            off = NOTCH*(1.0 - abs(v)**1.6)
            lx = v*hwm
            ly = L*(off + u*(1.0-off))
            lz = -0.055*(u**1.3) + 0.035*(1-v*v)*(0.25+0.75*u) + 0.02*math.sin(u*math.pi)
            vn = -0.012*abs(math.sin(v*math.pi*3.5))*(1-u)*0.6  # midchannel
            sn = -0.030*(1.0-min(1.0, u/0.30))*(1.0-min(1.0,(v/0.55)**2))  # hollow under the notch
            row.append((bm.verts.new((lx, ly, lz+vn+sn)), u, v))
        grid.append(row)
    for i in range(nU):
        for j in range(nV):
            a,b,c,d = grid[i][j][0], grid[i][j+1][0], grid[i+1][j+1][0], grid[i+1][j][0]
            bm.faces.new((a,b,c,d))
    # color by u/v stored on verts via dict
    uvmap = {}
    for i in range(nU+1):
        for j in range(nV+1):
            vtx, u, v = grid[i][j]
            uvmap[vtx] = (u, v)
    for f in bm.faces:
        for lp in f.loops:
            u, v = uvmap[lp.vert]
            col = mix(LEAF, LEAF_TIP, u)
            col = mix(col, (0.02,0.06,0.03), 0.5*math.exp(-(v*v)*6.0)*(1-u))  # darker midrib
            lp[cl] = Vector((*col, 1.0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = (math.radians(tilt), 0, math.radians(azim))
    bpy.context.collection.objects.link(ob)
    return ob

def build_eye(name, r=0.045, eS=10):
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    bmesh.ops.create_uvsphere(bm, u_segments=eS+4, v_segments=eS, radius=r)
    for f in bm.faces:
        for lp in f.loops:
            y = lp.vert.co.y
            lp[cl] = Vector((*mix(EYE, (0.85,0.78,0.55), max(0.0, y/r)*0.6), 1.0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

# ---------- assembly ----------
def apply_transforms(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.select_set(False)

def join(parts, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name; ob.data.name = name
    for o in bpy.context.selected_objects: o.select_set(False)
    return ob

# violet petal outlines (heart-shape for upper, rounder for laterals)
UP   = [(0,(0.16,)),(1,(0.78,)),(2,(1.06,)),(3,(0.34,))]  # notched via late dip
UP2  = [(0,(0.16,)),(1,(0.72,)),(2,(1.02,)),(3,(0.30,))]
LAT  = [(0,(0.13,)),(1,(0.66,)),(2,(0.95,)),(3,(0.45,))]
LOW  = [(0,(0.12,)),(1,(0.60,)),(2,(0.92,)),(3,(0.50,))]
ARC_UP   = [(0,0.01),(0.4,0.07),(0.8,0.11),(1,0.13)]
ARC_LAT  = [(0,0.01),(0.4,0.05),(0.8,0.09),(1,0.10)]
CURL_UP  = [(0,-0.01),(0.5,0.02),(1,0.07)]
CURL_LAT = [(0,-0.01),(0.5,0.00),(1,0.05)]

def make_flower(name, L=0.30, open_t=1.0, beard=True, stem_h=0.55, nU=24, nV=28, eS=10, stem_segs=20):
    parts = []
    # arrangement: 2 upper, 2 lateral, 1 lower(crested). Viola cornuta.
    arr = [ (UP,  ARC_UP,  CURL_UP,  90,  14, 0.92, False),
            (UP2, ARC_UP,  CURL_UP, 162,  11, 0.95, False),
            (LAT, ARC_LAT, CURL_LAT, 18,   5, 1.00, False),
            (LAT, ARC_LAT, CURL_LAT,234,   5, 1.00, False),
            (LOW, ARC_LAT, CURL_LAT,270,  -9, 1.18, True) ]
    for k,(ol, arc, curl, azim, tilt, ws, crest) in enumerate(arr):
        eff = tilt*open_t + 75*(1-open_t)   # bud: petals fold up along the face normal into an egg
        p = build_petal(name+"_p%d"%k, L*ws, 0.92*L*ws, ol, arc,
                        curl, nU, nV, eff, azim, crest=crest)
        parts.append(p)
    eye = build_eye(name+"_eye", r=0.05*L/0.30, eS=eS)
    eye.location = (0, 0, 0.045)
    apply_transforms(eye); parts.append(eye)
    if beard and open_t > 0.6:
        global BEARD_W, BEARD_Z
        BEARD_W = [(0,0.02),(0.3,0.20),(0.6,0.30),(1,0.34)]
        BEARD_Z = [(0,0.0),(0.15,0.03),(0.3,0.06),(1,0.12)]
        # beard sits on lower petal plane (azim 270, tilt -6 -> roughly -Y)
        bm = bmesh.new(); cl = bm.loops.layers.color.new("Color")
        random.seed(11)
        for i in range(30):
            u = 0.05 + random.random()*0.32
            v = (random.random()*2-1)*(0.30+u*0.7)
            s = 0.004 + random.random()*0.006
            px = v*0.92*L*1.18*u
            py = u*L*1.18
            pz = 0.05 + 0.06*u
            mat = Matrix.Translation((px, py, pz)) @ Matrix.Diagonal((s, s*1.7, s*0.7, 1))
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1, matrix=mat)
        for f in bm.faces:
            for lp in f.loops: lp[cl] = Vector((*BEARD, 1.0))
        me = bpy.data.meshes.new(name+"_beard"); bm.to_mesh(me); bm.free()
        bo = bpy.data.objects.new(name+"_beard", me)
        bpy.context.collection.objects.link(bo)
        # rotate beard group onto lower petal orientation (petal: tilt 0, azim 270)
        bo.rotation_euler = (0, 0, math.radians(270))
        apply_transforms(bo); parts.append(bo)
    stem = build_stem(name+"_stem", stem_h, segs=stem_segs)
    stem.rotation_euler = (math.pi, 0, 0)   # hang downward (-Y)
    stem.location = (0, 0.02, 0)
    apply_transforms(stem)
    # connector cone fusing flower head onto stem top
    bm = bmesh.new()
    cl = bm.loops.layers.color.new("Color")
    c0 = [bm.verts.new((math.cos(2*math.pi*j/8)*0.030, 0.012, math.sin(2*math.pi*j/8)*0.030)) for j in range(8)]
    c1 = [bm.verts.new((math.cos(2*math.pi*j/8)*0.018, -0.07, math.sin(2*math.pi*j/8)*0.018)) for j in range(8)]
    for j in range(8):
        bm.faces.new((c0[j], c0[(j+1)%8], c1[(j+1)%8], c1[j]))
    for f in bm.faces:
        for lp in f.loops: lp[cl] = Vector((0.30, 0.40, 0.24, 1.0))
    me = bpy.data.meshes.new(name+"_neck"); bm.to_mesh(me); bm.free()
    neck = bpy.data.objects.new(name+"_neck", me)
    bpy.context.collection.objects.link(neck)
    apply_transforms(neck); parts.append(neck)
    parts.append(stem)
    for p in parts: apply_transforms(p)
    ob = join(parts, name)
    return ob

def export_glb(ob, path):
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    print("EXPORTED", path)

# clean scene
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()

fA = make_flower("Violet_A", L=0.30, open_t=1.0, stem_h=0.55)
export_glb(fA, os.path.join(OUT, "Violet_A.glb"))
fB = make_flower("Violet_B", L=0.26, open_t=0.35, beard=False, stem_h=0.42)
export_glb(fB, os.path.join(OUT, "Violet_B.glb"))
fF = make_flower("Violet_field", L=0.30, open_t=1.0, beard=False, stem_h=0.50,
                 nU=10, nV=12, eS=6, stem_segs=8)
fF.data.transform(Matrix.Translation((0, 0.52, 0)))   # base sits on ground for field instancing
export_glb(fF, os.path.join(OUT, "Violet_field.glb"))
lf = build_leaf("Leaf_A", 0.42, 0.20, 70, 0)
export_glb(lf, os.path.join(OUT, "Leaf_A.glb"))
print("DONE")
