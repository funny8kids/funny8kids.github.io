#!/usr/bin/env bash
# Meshopt-compress pipeline GLBs (run from repo root, Git Bash).
# NOTE: re-running pipeline/gen_*.py overwrites these with uncompressed GLBs,
# so compression is part of the generation step, not a one-time cleanup.
# NOTE: quantization bakes scale into the glTF node transform — loaders that
# grab mesh.geometry directly must apply matrixWorld (see slice.js).
set -e
for f in Violet_A Violet_B Violet_field Leaf_A Type_Garden Grass_Tuft Grass_field Seed_Head Petal_Fall Violet_far Grass_field_far; do
  npx --yes @gltf-transform/cli optimize "assets/models/$f.glb" "assets/models/$f.glb" --compress meshopt
done

# WritingDesk is NOT in that loop. `optimize` runs quantize with COLOR_* at its 8-bit default, and
# the desk's whole point is a per-loop float bake: walnut lives in linear 0.10..0.20, which is 26
# byte codes, so grain posterises into bands and G/B collapse to one step (a hue shift). Measured
# by node F:/tmp_pwcheck/desk_colour_gate.js: 26 levels at 8-bit, 1764 at 16. Run meshopt directly
# and name the colour precision.
npx --yes @gltf-transform/cli meshopt assets/models/WritingDesk.glb assets/models/WritingDesk.glb --quantize-color 16
# FinaleCrown (the hero violet that blooms from the keeper's signature) is in the same boat: its
# per-vertex throat/eye gradient bands at 8-bit, so it too runs meshopt directly with 16-bit colour.
# Regenerate its uncompressed build first with `blender --background --python pipeline/gen_crown.py`.
npx --yes @gltf-transform/cli meshopt assets/models/FinaleCrown.glb assets/models/FinaleCrown.glb --quantize-color 16
# GardenKeeper (the full-body figure) too: the face's skin-to-lash transitions, the hair's fluting
# shading and the dress's pleat gradient all band at 8-bit. Regenerate the uncompressed build with
# `blender --background --python pipeline/gen_keeper.py` (it self-asserts 1 node + VEC4/5123).
# Measured: 241.5 KB → 49.3 KB, 5516 verts / 10666 tris, node scale 0.826 so the loader MUST apply
# matrixWorld (same law as WritingDesk — POSITION lives in a [-1,1] quantised cube).
npx --yes @gltf-transform/cli meshopt assets/models/GardenKeeper.glb assets/models/GardenKeeper.glb --quantize-color 16
# VioletHero (the delivered figure who replaced that keeper) is the shipped finale subject, so her
# chain belongs in this script as much as the desk's does. Full regeneration, in order:
#   node pipeline/vc_bake_source.cjs <violet.glb> F:/tmp_pwcheck/VioletFull_vc.glb
#   blender --background --python pipeline/violet_vc_convert.py     # VN_TRIS=200000, head guard f=0.8
#   npx --yes @gltf-transform/cli meshopt VioletVCfull_200000_f0.8.glb VioletHero_vcfull_m.glb --quantize-color 16
# Measured on disk: 65.00 MB colour-baked source -> 10.68 MB collapsed to 200,000 triangles ->
# 2.91 MB. That 2.91 MB is NOT what ships: it breaks the single-asset ceiling outright, and the re-cut
# ladder (AWWWARDS-PANEL-FULLBODY-v145.md §7.14-7.15) fixed 90,000 triangles as her art floor, so
# assets/models/VioletHero.glb is the 90k rung (md5 467f97b9..., 1,443,160 B, 111,512 verts).
# Reproduce it by re-running the convert with VN_TRIS=90000 and meshopting the result here.
# 16-bit colour is not optional here: her bake is what carries the illustrator's shading after the
# collapse interpolated it (pipeline/dec_col_probe.py), and 8 bits bands the skin-to-lash ramp.
# Her node carries scale 0.826 for the same reason the desk's does, which is why slice.js runs the
# geometry through bakeQuantized() rather than handing the loader a raw mesh.
npx --yes @gltf-transform/cli meshopt assets/models/VioletHero.glb assets/models/VioletHero.glb --quantize-color 16
# Decoder: assets/vendor/meshopt-decoder.js (esbuild of three examples/jsm/libs/meshopt_decoder.module.js, global VNMESH)
