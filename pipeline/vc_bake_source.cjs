// violet_tri_colour.cjs — paint her from the atlas at SOURCE resolution, one colour per triangle.
//
// WHY THIS REPLACES THE DISC SAMPLER. `violet_vertex_colour.cjs` read the atlas through a UV
// neighbourhood, at a mip level chosen from each vertex's footprint, and it failed in a way that no
// amount of tuning can fix: on the build with the baked-shadow lift turned completely OFF, the sleeve
// band still came out warm grey (linear 0.281,0.261,0.232) where the atlas under the same vertices
// reads blue (sRGB 0.379,0.394,0.427, B>R for half of them, and 0% of the baked verts keep B>R). So
// the defect was never the lift — it is the premise. The delivered atlas is a per-triangle mosaic in
// which islands OVERLAP, which means a texel adjacent in UV is not adjacent on her body. Every rule
// of the form "look around this UV point and decide" is therefore averaging foreign surface: it can
// only ever produce a hue that is a blend of her whole costume. Four parameters (RAD, TOL, GAIN, INK)
// and two follow-up laws were spent discovering that.
//
// WHAT IS CORRECT BY CONSTRUCTION. A renderer never had this problem, because it samples the atlas
// per fragment INSIDE one triangle, and inside its own island a source triangle's texels are its own
// surface. At the delivered 1,468,424 triangles an island is ~11 texels of a 4096^2 map, so an
// interior sample is unambiguous. This script does exactly that and nothing else: for every source
// triangle, average a few strictly-interior barycentric samples, then give every one of its vertices
// that colour weighted by the triangle's 3D area. No radius, no tolerance, no level, no ink test.
//
// SMOOTHING IS THEN FREE. The flat per-triangle field is the correct field at 0.7 mm granularity; the
// 200 k collapse that follows it in Blender interpolates the attribute (measured: pipeline/dec_col_probe.py
// reproduces a known analytic ramp through a 20x collapse, and both directions of the glTF round trip
// are value-preserving — pipeline/imp_col_probe.py, F:\tmp_pwcheck\enc_probe.cjs). So a decimated
// vertex ends up holding the area mean of exactly the surface it stands for, which is the law this
// whole exercise was chasing, arrived at by geometry instead of by a sampling knob. It also means the
// illustrator's own shading stays where she painted it: nothing re-reads the atlas after the collapse,
// so there is no misplaced shadow left to lift.
//
// Colour travels as LINEAR float COLOR_0 because three.js does not decode vertex colours; the sRGB->
// linear step happens here, once, on the averaged painted value.
// node violet_tri_colour.cjs <in.glb> <out.glb> [atlas.png]
const fs = require('fs');
const sharp = require('sharp');
const { NodeIO } = require('@gltf-transform/core');

const IN = process.argv[2];
const OUT = process.argv[3];
const ATLAS = process.argv[4] || 'F:/tmp_pwcheck/dump_texture_pbr_20250901.png';
// Barycentric interiors of a triangle: the centroid plus the three edge midpoints. Corners are the
// one place a packed island can be clipped by its neighbour, and these are the four points that are
// never corners.
const SPTS = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
// Filled from the source's own bounds so the hue bands can be read in the shipped frame.
const FRAME = { cx: 0, cz: 0, s: 1, ymin: 0 };
const lum = (q) => 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];

(async () => {
  if (!IN || !OUT) {
    console.error('usage: in.glb out.glb [atlas]'); process.exit(2);
  }
  const raw = await sharp(ATLAS).raw().toBuffer({ resolveWithObject: true });
  const A = raw.data, W = raw.info.width, H = raw.info.height, CH = raw.info.channels;
  if (CH < 3) throw new Error('atlas has ' + CH + ' channels');
  console.log('atlas', W + 'x' + H, 'ch', CH, 'samples/tri', SPTS.length);

  const doc = await new NodeIO().read(IN);
  const meshes = doc.getRoot().listMeshes();
  if (meshes.length !== 1) console.log('NOTE', meshes.length, 'meshes; using the first primitive of mesh 0');
  const prim = meshes[0].listPrimitives()[0];
  const uvA = prim.getAttribute('TEXCOORD_0');
  const posA = prim.getAttribute('POSITION');
  const idxA = prim.getIndices();
  const n = posA.getCount();
  const triN = idxA ? idxA.getCount() / 3 : n / 3;
  if (!idxA && n % 3) throw new Error('non-indexed mesh whose vertex count is not a multiple of 3');
  console.log('verts', n, 'tris', triN, 'indexed', !!idxA);
  if (idxA) { const ia = idxA.getArray(); for (let i = 0; i < ia.length; i++) if (ia[i] >= n) throw new Error('index out of range at ' + i); }

  const PA = posA.getArray(), UA = uvA.getArray(), IX = idxA ? idxA.getArray() : null;
  // Area-weighted accumulation in sRGB — the space the art was painted in. Averaging in linear would
  // pull a stroke's dark toward black and wash a hue out of the mix.
  const acc = new Float64Array(n * 3), wgt = new Float64Array(n);
  const q = [0, 0, 0];
  const tri = [0, 0, 0];
  let degenerate = 0, oob = 0;
  for (let t = 0; t < triN; t++) {
    tri[0] = IX ? IX[t * 3] : t * 3; tri[1] = IX ? IX[t * 3 + 1] : t * 3 + 1; tri[2] = IX ? IX[t * 3 + 2] : t * 3 + 2;
    const i0 = tri[0], i1 = tri[1], i2 = tri[2];
    let sr = 0, sg = 0, sb = 0, ok = 0;
    for (const b of SPTS) {
      const u = b[0] * UA[i0 * 2] + b[1] * UA[i1 * 2] + b[2] * UA[i2 * 2];
      const vv = b[0] * UA[i0 * 2 + 1] + b[1] * UA[i1 * 2 + 1] + b[2] * UA[i2 * 2 + 1];
      let cx = Math.round(u * (W - 1)), cy = Math.round(vv * (H - 1));
      if (!(cx >= 0 && cy >= 0 && cx < W && cy < H)) {
        // Clamp, but count it: UVs outside 0..1 mean the unwrap does not match this atlas, which would
        // silently paint her from the wrong part of the sheet.
        oob++;
        cx = Math.min(W - 1, Math.max(0, cx)); cy = Math.min(H - 1, Math.max(0, cy));
      }
      const o = (cy * W + cx) * CH;
      sr += A[o]; sg += A[o + 1]; sb += A[o + 2]; ok++;
    }
    if (!ok) continue;
    sr /= ok; sg /= ok; sb /= ok;
    // 3D area: the weight must be surface area, not UV area, because a collapsed vertex stands for a
    // piece of her body. (UV area would weight a stretched island far above its real extent.)
    const ax = PA[i0 * 3], ay = PA[i0 * 3 + 1], az = PA[i0 * 3 + 2];
    const ex = PA[i1 * 3] - ax, ey = PA[i1 * 3 + 1] - ay, ez = PA[i1 * 3 + 2] - az;
    const fx = PA[i2 * 3] - ax, fy = PA[i2 * 3 + 1] - ay, fz = PA[i2 * 3 + 2] - az;
    const cx2 = ey * fz - ez * fy, cy2 = ez * fx - ex * fz, cz2 = ex * fy - ey * fx;
    const ar = 0.5 * Math.sqrt(cx2 * cx2 + cy2 * cy2 + cz2 * cz2);
    if (ar <= 0) { degenerate++; continue; }
    for (const id of tri) {
      acc[id * 3] += sr * ar; acc[id * 3 + 1] += sg * ar; acc[id * 3 + 2] += sb * ar; wgt[id] += ar;
    }
  }
  console.log('degenerate tris', degenerate, '| uv samples out of 0..1 (clamped)', oob,
    '=', (100 * oob / (triN * SPTS.length)).toFixed(2) + '% of samples');

  const col = new Float32Array(n * 3);
  // The band constants below were written in the metres-high, feet-on-zero, front-+-Z frame that
  // pipeline/violet_convert.py leaves its output in. The delivered file is not in that frame twice
  // over: it is unscaled, off-centre, AND its mesh-local axes are rotated — node_0 carries quaternion
  // (0.7071,0,0,0.7071), a +90° turn about X, so mesh-local +Z points DOWN her body (feet at z=0, hair
  // at z=-1.157) and her depth is local Y. Reading bands off the raw accessor sliced her sideways and
  // printed "sleeve is cream" for a jacket the textured render shows as navy. Rotate first, then
  // re-derive the converter's frame: feet-band centre, height, uniform scale.
  const RX = (p) => [p[0], -p[2], p[1]];   // world = Rx(+90°) . local
  {
    let ymn = 1e30, ymx = -1e30;
    for (let i = 0; i < n; i++) {
      const y = RX([PA[i * 3], PA[i * 3 + 1], PA[i * 3 + 2]])[1];
      if (y < ymn) ymn = y; if (y > ymx) ymx = y;
    }
    const hh = ymx - ymn, fs = 1.652 / hh, cut = ymn + 0.15 * hh;
    let bx = 0, bz = 0, bn = 0;
    for (let i = 0; i < n; i++) {
      const p = RX([PA[i * 3], PA[i * 3 + 1], PA[i * 3 + 2]]);
      if (p[1] > cut) continue;
      bx += p[0]; bz += p[2]; bn++;
    }
    FRAME.cx = bx / bn; FRAME.cz = bz / bn; FRAME.s = fs; FRAME.ymin = ymn;
    console.log('source height', hh.toFixed(3), 'feet-band centre', FRAME.cx.toFixed(3), FRAME.cz.toFixed(3),
      '-> report frame scale', fs.toFixed(4));
  }
  const BANDS = {
    head: (z, ax) => z > 1.42,
    arm: (z, ax) => z > 1.02 && z < 1.36 && ax > 0.16,
    torso: (z, ax) => z > 1.02 && z < 1.36 && ax <= 0.16,
    hem: (z, ax) => z < 0.30,
  };
  const rep = {}; for (const k of Object.keys(BANDS)) rep[k] = [0, 0, 0, 0, 0, 0];  // sR sG sB linR linG linB? -> keep srgb+lum+lin
  const stats = { srgb: {}, lin: {} };
  for (const k of Object.keys(BANDS)) stats.srgb[k] = [0, 0, 0, 0];
  for (const k of Object.keys(BANDS)) stats.lin[k] = [0, 0, 0, 0, 0];   // r,g,b sums + n + navyCount
  let noW = 0, dashN = 0, skirtN = 0, dashB = 0, skirtB = 0;
  for (let i = 0; i < n; i++) {
    let sr = 200, sg = 200, sb = 200;
    if (wgt[i] > 0) { sr = acc[i * 3] / wgt[i]; sg = acc[i * 3 + 1] / wgt[i]; sb = acc[i * 3 + 2] / wgt[i]; }
    else noW++;
    const r = sr / 255, g = sg / 255, b = sb / 255;
    col[i * 3] = s2l(r); col[i * 3 + 1] = s2l(g); col[i * 3 + 2] = s2l(b);
    posA.getElement(i, q);
    const w = RX(q);
    const z = (w[1] - FRAME.ymin) * FRAME.s, ax = Math.abs((w[0] - FRAME.cx) * FRAME.s);
    const fz = (w[2] - FRAME.cz) * FRAME.s;   // signed depth: which panel carries the strokes names the front
    for (const k of Object.keys(BANDS)) {
      if (!BANDS[k](z, ax)) continue;
      const t = stats.lin[k];
      t[0] += col[i * 3]; t[1] += col[i * 3 + 1]; t[2] += col[i * 3 + 2]; t[3]++;
      if (col[i * 3 + 2] > col[i * 3] * 1.02) t[4]++;
      const s = stats.srgb[k]; s[0] += r; s[1] += g; s[2] += b; s[3]++;
    }
    if (z > 0.15 && z < 0.95 && ax < 0.40) {
      // Both panels, because the sign of the source's depth axis is not something to assume: the panel
      // that carries the strokes is the front, and printing the two counts proves which way she faces.
      if (fz > 0.05) { skirtN++; if (lum([r, g, b]) < 0.12) dashN++; }
      else if (fz < -0.05) { skirtB++; if (lum([r, g, b]) < 0.12) dashB++; }
    }
  }
  console.log('verts with no non-degenerate triangle:', noW);
  for (const k of Object.keys(BANDS)) {
    const s = stats.srgb[k], l = stats.lin[k];
    if (!s[3]) { console.log('band ' + k + ' EMPTY'); continue; }
    console.log('band ' + k.padEnd(6), 'n=' + String(s[3]).padEnd(8),
      'sRGB ' + [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(x => x.toFixed(3)).join(','),
      '| linear ' + [l[0] / l[3], l[1] / l[3], l[2] / l[3]].map(x => x.toFixed(3)).join(','),
      '| B>R', (100 * l[4] / l[3]).toFixed(0) + '%');
  }
  console.log('skirt(+z) verts', skirtN, 'near-black', dashN, '=',
    (100 * dashN / Math.max(1, skirtN)).toFixed(2) + '%  |  skirt(-z) verts', skirtB, 'near-black', dashB, '=',
    (100 * dashB / Math.max(1, skirtB)).toFixed(2) + '%');
  const arm = stats.lin.arm, head = stats.lin.head;
  console.log('ASSERT head warm (R>B):', head[3] > 0 && head[0] > head[2]);
  console.log('ASSERT sleeve navy (B>R):', arm[3] > 0 && arm[2] > arm[0]);
  // The identity counter-test: a "cleaner skirt" that bleaches the jacket must not ship.
  const armLum = (0.2126 * arm[0] + 0.7152 * arm[1] + 0.0722 * arm[2]) / Math.max(1, arm[3]);
  console.log('ASSERT sleeve still DARK (linear luma', armLum.toFixed(3), '< 0.30):', armLum < 0.30);

  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col));
  prim.setAttribute('TEXCOORD_0', null);
  // Drop the material and its three 4096^2 sheets. The first run left them embedded and wrote a
  // 100 MB file for 36 MB of geometry, which the next stage then has to import.
  prim.setMaterial(null);
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  await new NodeIO().write(OUT, doc);
  console.log('WROTE', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB verts=' + n);
})().catch(e => { console.error('TRI_BAKE_FAIL', e); process.exit(1); });
