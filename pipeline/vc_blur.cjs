// vc_blur.cjs — soften the paint on the VERTEX GRAPH, never in UV again.
//
// WHY. The collapse is now correct: each surviving vertex carries the area mean of the source
// triangles it stands for, sampled strictly inside its own island (violet_tri_colour.cjs), so her
// jacket is navy (72 % of sleeve verts B>R at source, 55 % after the collapse) and the front skirt's
// near-black population fell from 17 % to 0.02 %. What is left is a different defect: the
// illustrator's line work is THINNER than the collapsed mesh. A stroke that owns one triangle in ten
// now owns one VERTEX in ten, and a single dark vertex among bright ones is not a line — on screen it
// is a dot, and a field of dots reads as dirt on the hem rather than as draughtsmanship.
//
// THE LAW. Extent has to be measured where extent exists: the vertex graph. Two vertices joined by an
// edge are adjacent on her body, which is more than can be said of two texels adjacent in this atlas
// (its islands overlap — that falsified the entire disc-sampler family). So the operator is a local
// average over the 1-ring, which is scale-free: one ring is ~3 mm on the guarded head and ~25 mm on
// the skirt, so it spreads a stroke by exactly the distance the mesh can resolve, and no more. The
// eye and the lash line are 3+ rings wide and keep their contrast; a one-vertex dot does not.
//
// Averaging happens in sRGB (the space the art was painted in) and the result is re-encoded to the
// linear COLOR_0 that three.js reads without decoding. The dark-outlier count printed below is the
// mesh-side twin of the pixel speck counter, so the fix is graded on its own quantity.
// node vc_blur.cjs <in.glb> <out.glb> [iters] [lambda]
const fs = require('fs');
const { NodeIO } = require('@gltf-transform/core');

const IN = process.argv[2], OUT = process.argv[3];
const IT = parseInt(process.argv[4] || '1', 10);
const LAM = parseFloat(process.argv[5] || '0.5');

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const lum = (q) => 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];

(async () => {
  if (!IN || !OUT) { console.error('usage: in.glb out.glb [iters] [lambda]'); process.exit(2); }
  const doc = await new NodeIO().read(IN);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const col = prim.getAttribute('COLOR_0'), pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  if (!idx) throw new Error('no index buffer: there is no vertex graph to average over');
  const n = col.getCount(), IA = idx.getArray(), PA = pos.getArray();
  const CA = col.getArray();
  console.log(IN, 'verts', n, 'indices', IA.length, 'COLOR_0', col.getType(), col.getComponentType(),
    '| iters', IT, 'lambda', LAM);

  // Adjacency as a flat CSR built from triangle edges (each edge listed once per direction).
  const deg = new Int32Array(n);
  const addEdge = (a, b) => { deg[a]++; };
  for (let t = 0; t < IA.length; t += 3) {
    const a = IA[t], b = IA[t + 1], c = IA[t + 2];
    addEdge(a, b); addEdge(b, a); addEdge(b, c); addEdge(c, b); addEdge(a, c); addEdge(c, a);
  }
  const off = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  const nb = new Int32Array(off[n]);
  const fill = new Int32Array(n);
  const push = (a, b) => { nb[off[a] + fill[a]++] = b; };
  for (let t = 0; t < IA.length; t += 3) {
    const a = IA[t], b = IA[t + 1], c = IA[t + 2];
    push(a, b); push(b, a); push(b, c); push(c, b); push(a, c); push(c, a);
  }
  let dmin = 1e9, dmax = 0;
  for (let i = 0; i < n; i++) { if (deg[i] < dmin) dmin = deg[i]; if (deg[i] > dmax) dmax = deg[i]; }
  console.log('1-ring degree: mean', (off[n] / n).toFixed(2), 'min', dmin, 'max', dmax);

  // sRGB working space, from the linear values the file carries.
  const W = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) W[i] = l2s(CA[i]);

  // The confetti metric: a vertex far below the median of its own ring, with a bright ring around it.
  const outliers = (arr) => {
    let k = 0, skirt = 0, dash = 0, navy = 0, head = 0;
    const ring = [];
    const p = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const own = lum([arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]]);
      pos.getElement(i, p);
      const z = p[1], ax = Math.abs(p[0]);
      if (z > 1.42) head++;
      if (z > 1.02 && z < 1.36 && ax > 0.16 && arr[i * 3 + 2] > arr[i * 3]) navy++;
      if (z > 0.15 && z < 0.95 && ax < 0.40 && p[2] > 0.05) {
        skirt++;
        if (own < 0.12) dash++;
      }
      const d = deg[i];
      if (!d) continue;
      ring.length = 0;
      for (let j = off[i]; j < off[i + 1]; j++) {
        const q = nb[j];
        ring.push(lum([arr[q * 3], arr[q * 3 + 1], arr[q * 3 + 2]]));
      }
      ring.sort((a2, b2) => a2 - b2);
      const med = ring[ring.length >> 1];
      const bright = ring.filter((q) => q > own + 0.25).length;
      if (med - own > 0.30 && bright >= ring.length * 0.7) k++;
    }
    return { k, skirt, dash, navy, head };
  };
  const before = outliers(W);
  console.log('BEFORE  isolated-dark verts', before.k, '=', (100 * before.k / n).toFixed(2) + '% of mesh',
    '| front-skirt near-black', before.dash, '/', before.skirt,
    '=', (100 * before.dash / Math.max(1, before.skirt)).toFixed(2) + '%',
    '| sleeve navy verts', (100 * before.navy / 7162).toFixed(0) + '%');

  const tmp = new Float32Array(n * 3);
  for (let it = 0; it < IT; it++) {
    for (let i = 0; i < n; i++) {
      let sr = 0, sg = 0, sb = 0;
      const d = deg[i];
      if (!d) { tmp[i * 3] = W[i * 3]; tmp[i * 3 + 1] = W[i * 3 + 1]; tmp[i * 3 + 2] = W[i * 3 + 2]; continue; }
      for (let j = off[i]; j < off[i + 1]; j++) {
        const q = nb[j];
        sr += W[q * 3]; sg += W[q * 3 + 1]; sb += W[q * 3 + 2];
      }
      tmp[i * 3] = W[i * 3] * (1 - LAM) + (sr / d) * LAM;
      tmp[i * 3 + 1] = W[i * 3 + 1] * (1 - LAM) + (sg / d) * LAM;
      tmp[i * 3 + 2] = W[i * 3 + 2] * (1 - LAM) + (sb / d) * LAM;
    }
    W.set(tmp);
    const a = outliers(W);
    console.log('AFTER it' + (it + 1) + ' isolated-dark verts', a.k, '=', (100 * a.k / n).toFixed(2) + '%',
      '| front-skirt near-black', a.dash, '=', (100 * a.dash / Math.max(1, a.skirt)).toFixed(2) + '%',
      '| sleeve navy verts', (100 * a.navy / 7162).toFixed(0) + '%');
  }
  for (let i = 0; i < n * 3; i++) CA[i] = s2l(Math.min(1, Math.max(0, W[i])));
  await new NodeIO().write(OUT, doc);
  console.log('WROTE', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB');
})().catch(e => { console.error('BLUR_FAIL', e); process.exit(1); });
