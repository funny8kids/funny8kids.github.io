import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Color

# ============================================================
#  VIOLET GARDEN - procedural flower/prop generator (original)
#  Hero asset: the violet (Viola) - 5 petals, cupped, nodding.
#  Petal gradient baked to vertex color (deep violet core -> lavender rim).
# ============================================================

# palette (matches site tokens: violet is "memory", not the whole world)
C_CORE   = (0.29, 0.16, 0.42)   # deep violet at petal throat
C_MID    = (0.55, 0.47, 0.72)   # violet
C_RIM    = (0.78, 0.72, 0.90)   # pale lavender edge
C_CENTER = (0.86, 0.74, 0.30)   # warm gold eye
C_STEM   = (0.30, 0.42, 0.28)   # muted green
C_LEAF   = (0.33, 0.46, 0.33)
C_BUD    = (0.48, 0.40, 0.66)

def petal_mesh(name, L=1.0, W=0.62, drop=0.55, cup=0.34, lift=0.15,
               su=10, sv=8, curl=0.25):
    """One petal in local frame: radial=+Y, across=X, up=+Z.
    u:0 base ->1 tip ; v:-1..1 across."""
    bm = bmesh.new()
    grid = []
    for i in range(su+1):
        u = i/su
        row = []
        hw = W * math.sin(math.pi*(0.48*u + 0.03))  # narrow base claw -> wide rounded fan at tip
        for j in range(sv+1):
            v = -1 + 2*j/sv
            x = v*hw
            y = u*L
            # droop outward, edges cup upward, tip curls back
            z = -drop*(u**1.6) + lift*L*u + cup*(1 - v*v)*(0.35+0.65*u) - curl*(u**3)*(v*v)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(su):
        for j in range(sv):
            a=grid[i][j]; b=grid[i][j+1]; c=grid[i+1][j+1]; d=grid[i+1][j]
            bm.faces.new((a,b,c,d))
    # vertex colors: gradient by u (radial) + slight rim darkening veins
    col = bm.loops.layers.color.new("Color")
    for f in bm.faces:
        for lp in f.loops:
            u = lp.vert.co.y / L
            t = min(1.0, max(0.0, u))
            k = t**0.8
            r = C_CORE[0] + (C_RIM[0]-C_CORE[0])*k
            g = C_CORE[1] + (C_RIM[1]-C_CORE[1])*k
            b = C_CORE[2] + (C_RIM[2]-C_CORE[2])*k
            # faint dark veins radiating (by across position, near base)
            vein = 1.0 - 0.18*math.exp(-((lp.vert.co.x/ (W*0.16))**2)) * (1-t)
            lp[col] = (r*vein, g*vein, b*vein, 1.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return me

def place_petal(obj, azim_deg, tilt_deg, scale=1.0):
    # petal built along +Y (radial), face +Z (up). tilt raises tip, azim distributes around Z.
    obj.rotation_euler = (math.radians(tilt_deg), 0, math.radians(azim_deg))
    obj.scale = (scale, scale, scale)

def new_obj(me, coll):
    o = bpy.data.objects.new(me.name, me); coll.objects.link(o); return o

def join(objs, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name; ob.data.name = name
    return ob

def set_mat(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)

def make_mat(name, base, rough=0.55):
    m = bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value=(*base,1)
    b.inputs["Roughness"].default_value=rough
    try: b.inputs["Sheen Weight"].default_value=0.3
    except: pass
    return m

def flower(open=1.0, spur=True, name="Violet"):
    coll = bpy.context.scene.collection
    parts=[]
    petals=[]
    # Viola arrangement: 2 upper, 2 side, 1 lower(largest). azim, tilt, scale
    arr = [ (90, 34, 0.92), (162, 30, 0.95),          # upper pair
            (18, 20, 1.0),  (234, 20, 1.0),           # side pair
            (270, -6, 1.18) ]                          # lower petal (nods forward)
    for i,(az,tilt,sc) in enumerate(arr):
        eff = tilt*open + 78*(1-open)   # closed bud: petals fold upright
        me = petal_mesh(f"{name}_p{i}", L=1.0*sc, W=0.60*sc,
                        drop=0.5*open, lift=0.2+ (1-open)*0.6, cup=0.34)
        o = new_obj(me, coll)
        # lift petals to sit atop stem
        o.location=(0,0,0)
        place_petal(o, az, eff, 1.0)
        parts.append(o); petals.append(o)
    # center eye
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, segments=12, ring_count=8, location=(0,0,0.05))
    eye=bpy.context.active_object; eye.name=f"{name}_eye"; set_mat(eye, make_mat(name+"_eyeM", C_CENTER, 0.4))
    parts.append(eye)
    # spur (lower petal back tube)
    if spur and open>0.5:
        bpy.ops.mesh.primitive_cone_add(radius1=0.08, radius2=0.03, depth=0.4, location=(0,0.12,-0.18))
        sp=bpy.context.active_object; sp.name=f"{name}_spur"
        sp.rotation_euler=(math.radians(150),0,0); set_mat(sp, make_mat(name+"_spurM", C_MID,0.6))
        parts.append(sp)
    # stem
    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=1.4, location=(0,0,-0.78))
    st=bpy.context.active_object; st.name=f"{name}_stem"; set_mat(st, make_mat(name+"_stemM", C_STEM,0.6))
    parts.append(st)
    # unify petal material (vertex colors carry the gradient)
    pm = make_mat(name+"_petalM", (1,1,1), 0.5)
    for o in petals:
        set_mat(o, pm)
    root = join(parts, name)
    return root

def leaf(name="Leaf"):
    coll=bpy.context.scene.collection
    bm=bmesh.new(); su=8; sv=8; grid=[]
    for i in range(su+1):
        u=i/su; row=[]
        # heart shape: wide near base, notch at top
        w = 0.9*math.sin(math.pi*(0.25+0.7*u))
        if u>0.85: w*= (1-(u-0.85)/0.15*0.5)  # taper to tip
        for j in range(sv+1):
            v=-1+2*j/sv; x=v*w
            y=u*1.0
            z=0.12*math.sin(math.pi*u)*(v*v) - 0.05  # cup
            row.append(bm.verts.new((x,y,z)))
        grid.append(row)
    for i in range(su):
        for j in range(sv):
            bm.faces.new((grid[i][j],grid[i][j+1],grid[i+1][j+1],grid[i+1][j]))
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o=new_obj(me,coll); o.data.materials.append(make_mat(name+"M", C_LEAF,0.6)); return o

def grass(name="Grass", h=1.0, bend=0.5):
    bm=bmesh.new(); n=6; grid=[]
    for i in range(n+1):
        u=i/n
        w=0.06*(1-u*0.9)
        y=u*h; z=bend*(u**2)
        grid.append((bm.verts.new((-w,y,z)), bm.verts.new((w,y,z))))
    for i in range(n):
        bm.faces.new((grid[i][0],grid[i][1],grid[i+1][1],grid[i+1][0]))
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o=new_obj(me,bpy.context.scene.collection); o.data.materials.append(make_mat(name+"M", C_STEM,0.6)); return o

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def export(obj, path):
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    print("EXPORTED", path, os.path.getsize(path))

if __name__=="__main__":
    outdir = sys.argv[-1]
    reset(); f=flower(open=1.0, spur=True, name="Violet_A"); export(f, outdir+"/Violet_A.glb")
    reset(); f=flower(open=0.35, spur=True, name="Violet_B"); export(f, outdir+"/Violet_B.glb")
    reset(); f=flower(open=0.7, spur=False, name="Violet_C"); export(f, outdir+"/Violet_C.glb")
    reset(); l=leaf(name="Leaf_A"); export(l, outdir+"/Leaf_A.glb")
    reset(); g=grass(name="Grass_A"); export(g, outdir+"/Grass_A.glb")
    print("DONE")
