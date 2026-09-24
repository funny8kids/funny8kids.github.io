#!/usr/bin/env bash
# Meshopt-compress pipeline GLBs (run from repo root, Git Bash).
# NOTE: re-running world/pipeline/gen_*.py overwrites these with uncompressed GLBs,
# so compression is part of the generation step, not a one-time cleanup.
# NOTE: quantization bakes scale into the glTF node transform — loaders that
# grab mesh.geometry directly must apply matrixWorld (see world/slice.js).
set -e
for f in Violet_A Violet_B Violet_field Leaf_A Type_Garden Grass_Tuft Grass_field Seed_Head Petal_Fall Violet_far Grass_field_far; do
  npx --yes @gltf-transform/cli optimize "world/assets/models/$f.glb" "world/assets/models/$f.glb" --compress meshopt
done

# WritingDesk is NOT in that loop. `optimize` runs quantize with COLOR_* at its 8-bit default, and
# the desk's whole point is a per-loop float bake: walnut lives in linear 0.10..0.20, which is 26
# byte codes, so grain posterises into bands and G/B collapse to one step (a hue shift). Measured
# by node F:/tmp_pwcheck/desk_colour_gate.js: 26 levels at 8-bit, 1764 at 16. Run meshopt directly
# and name the colour precision.
npx --yes @gltf-transform/cli meshopt world/assets/models/WritingDesk.glb world/assets/models/WritingDesk.glb --quantize-color 16
# FinaleCrown (the hero violet that blooms from the keeper's signature) is in the same boat: its
# per-vertex throat/eye gradient bands at 8-bit, so it too runs meshopt directly with 16-bit colour.
# Regenerate its uncompressed build first with `blender --background --python world/pipeline/gen_crown.py`.
npx --yes @gltf-transform/cli meshopt world/assets/models/FinaleCrown.glb world/assets/models/FinaleCrown.glb --quantize-color 16
# GardenKeeper (the full-body figure) too: the face's skin-to-lash transitions, the hair's fluting
# shading and the dress's pleat gradient all band at 8-bit. Regenerate the uncompressed build with
# `blender --background --python world/pipeline/gen_keeper.py` (it self-asserts 1 node + VEC4/5123).
# Measured: 241.5 KB → 49.3 KB, 5516 verts / 10666 tris, node scale 0.826 so the loader MUST apply
# matrixWorld (same law as WritingDesk — POSITION lives in a [-1,1] quantised cube).
npx --yes @gltf-transform/cli meshopt world/assets/models/GardenKeeper.glb world/assets/models/GardenKeeper.glb --quantize-color 16
# Decoder: assets/vendor/meshopt-decoder.js (esbuild of three examples/jsm/libs/meshopt_decoder.module.js, global VNMESH)
