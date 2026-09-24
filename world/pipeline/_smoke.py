import bpy, os, sys

# Headless pipeline smoke test: build a simple two-material mesh and export GLB.
print("BLENDER_VERSION:", bpy.app.version_string)

# Clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# One UV sphere as a stand-in "bloom"
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=16, ring_count=8, location=(0, 0, 0))
obj = bpy.context.active_object
obj.name = "SmokeBloom"

# A tiny cylinder stem to prove multi-object export
bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=1.0, location=(0, 0, -0.6))
stem = bpy.context.active_object
stem.name = "SmokeStem"

mat_p = bpy.data.materials.new("VioletPetal"); mat_p.use_nodes = True
mat_p.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.45, 0.75, 1)
mat_g = bpy.data.materials.new("StemGreen"); mat_g.use_nodes = True
mat_g.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.42, 0.30, 1)
obj.data.materials.append(mat_p)
stem.data.materials.append(mat_g)

out = sys.argv[-1]  # last arg = output path
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False)
print("EXPORTED_OK:", out, os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else -1)
