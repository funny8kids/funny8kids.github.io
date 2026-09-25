import bpy, bmesh, os

SRC = os.environ.get('VN_SRC', r'F:\tmp_pwcheck\weld\VioletWelded_base.glb')
print('PROBE src=%s size=%d' % (SRC, os.path.getsize(SRC)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print('mesh objects=%d' % len(objs))
o = objs[0]
me = o.data
print('BASE tris=%d verts=%d loops=%d' % (len(me.polygons), len(me.vertices), len(me.loops)))

bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()
bm.faces.ensure_lookup_table()
visited = set()
islands = 0
sizes = []
for f in bm.faces:
    if f.index in visited:
        continue
    islands += 1
    stack = [f]
    n = 0
    seen = {f.index}
    while stack:
        cur = stack.pop()
        n += 1
        visited.add(cur.index)
        for e in cur.edges:
            for lf in e.link_faces:
                if lf.index not in seen:
                    seen.add(lf.index)
                    stack.append(lf)
    sizes.append(n)
sizes.sort(reverse=True)
print('ISLANDS=%d  largest=%s  faces>=100=%d  faces<=4=%d (%.1f%% of islands)'
      % (islands, sizes[:8], sum(1 for s in sizes if s >= 100),
         sum(1 for s in sizes if s <= 4), 100.0 * sum(1 for s in sizes if s <= 4) / islands))
bm.free()

# The decisive number: what is the *floor* of collapse decimation on this mesh? If the smallest
# achievable triangle count is above the panel's 30000 ceiling, then the ceiling is not a defect
# finding about her modelling at all - it is unreachable with this operator on this mesh, and the
# fix belongs in the island count (weld harder) or a different reduction, not in a smaller ratio.
for tri in (True, False):
    c = o.copy(); c.data = o.data.copy()
    bpy.context.scene.collection.objects.link(c)
    bpy.ops.object.select_all(action='DESELECT')
    c.select_set(True)
    bpy.context.view_layer.objects.active = c
    m = c.modifiers.new('floor', 'DECIMATE')
    m.ratio = 0.00002
    m.use_collapse_triangulate = tri
    bpy.ops.object.modifier_apply(modifier=m.name)
    print('FLOOR collapse_triangulate=%s -> tris=%d verts=%d verts/tris=%.2f'
          % (tri, len(c.data.polygons), len(c.data.vertices),
             len(c.data.vertices) / max(1, len(c.data.polygons))))
    bpy.data.objects.remove(c, do_unlink=True)
print('FLOOR_PROBE_OK')
