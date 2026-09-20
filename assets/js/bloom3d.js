/* LUMEN VIOLA — §05.6 Lumen Bloom · 3D 签名物体（借鉴 ciaoenergy：单一主物体 + 摄影棚光 + 视差）
   程序化玻璃紫罗兰：共享几何体（1 花瓣几何 ×11 实例、球芯、管茎、叶），
   MeshPhysicalMaterial 清漆透明花瓣 + 发光花芯 + 萤火粒子环。
   交互：指针视差（lerp）、拖拽甩动惯性（jiejoe 式玩法）、ScrollTrigger 入场。
   性能（gsap-performance 技能准则）：
     · 只动画 transform/rotation，无布局属性；
     · 离屏 / 后台 / reduced-motion 全部停 rAF（reduced 单帧）；
     · DPR clamp 1.75，粒子 1 次性 BufferGeometry，几何体复用；
     · 事件监听 passive，resize 防抖交给 ResizeObserver。 */
(function () {
  'use strict';
  const T = window.THREE;
  const host = document.getElementById('bloom3d');
  if (!T || !host) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new T.WebGLRenderer({ canvas: host, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.15, 7.6);
  camera.lookAt(0, -0.1, 0);

  const root = new T.Group();          // 视差层
  const flower = new T.Group();        // 花朵本体
  root.add(flower);
  scene.add(root);

  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

  /* ---------- 材质 ---------- */
  const petalMat = new T.MeshPhysicalMaterial({
    color: 0xa78bfa, roughness: 0.28, metalness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.18,
    transparent: true, opacity: 0.92, side: T.DoubleSide,
  });
  const petalMatIn = petalMat.clone(); petalMatIn.color.set(0xd8b4fe); petalMatIn.opacity = 0.95;
  const coreMat = new T.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.4, emissive: 0xe879f9, emissiveIntensity: 0.7 });
  const stemMat = new T.MeshStandardMaterial({ color: 0x3d2a66, roughness: 0.6 });
  const leafMat = new T.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.45, side: T.DoubleSide });

  /* ---------- 花瓣：单一 LatheGeometry 复用（扇形：中段最宽、尖端收拢） ---------- */
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new T.Vector2(Math.pow(Math.sin(t * Math.PI), 0.72) * 0.5 + 0.02, t * 1.35));
  }
  const petalGeo = new T.LatheGeometry(pts, 12);
  petalGeo.scale(1, 1, 0.2); // 压扁成花瓣

  function addRing(count, baseR, tilt, y, mat, scale, phase) {
    for (let i = 0; i < count; i++) {
      const m = new T.Mesh(petalGeo, mat);
      const a = (i / count) * Math.PI * 2 + phase;
      m.position.set(Math.sin(a) * baseR, y, Math.cos(a) * baseR);
      m.rotation.set(tilt, a, 0, 'YXZ');
      m.scale.setScalar(scale);
      flower.add(m);
    }
  }
  // 外环 5 瓣斜展（紫罗兰开放姿态），内环 3 瓣斜拢向芯
  addRing(5, 0.3, 1.32, 0.1, petalMat, 1, 0.4);
  addRing(3, 0.14, 0.85, 0.24, petalMatIn, 0.6, 0);

  /* ---------- 花芯 / 茎 / 叶 ---------- */
  const core = new T.Mesh(new T.IcosahedronGeometry(0.16, 1), coreMat);
  core.position.y = 0.28;
  flower.add(core);

  const curve = new T.CatmullRomCurve3([
    new T.Vector3(0, 0, 0), new T.Vector3(0.18, -1.05, 0.05),
    new T.Vector3(-0.14, -2, -0.08), new T.Vector3(0.05, -2.9, 0),
  ]);
  const stem = new T.Mesh(new T.TubeGeometry(curve, 24, 0.055, 6), stemMat);
  flower.add(stem);

  const leafGeo = new T.SphereGeometry(0.5, 10, 8);
  leafGeo.scale(1, 0.16, 0.55);
  const leaf1 = new T.Mesh(leafGeo, leafMat);
  leaf1.position.set(0.55, -1.5, 0.1); leaf1.rotation.z = 0.42;
  const leaf2 = new T.Mesh(leafGeo, leafMat);
  leaf2.position.set(-0.6, -2.2, -0.05); leaf2.rotation.z = -0.5; leaf2.scale.setScalar(0.8);
  flower.add(leaf1, leaf2);
  flower.position.y = 1.05;

  /* ---------- 萤火粒子环 ---------- */
  const N = 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.1 + Math.random() * 2.4;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (Math.random() - 0.45) * 3.4;
    pos[i * 3 + 2] = Math.sin(a) * r * 0.7;
  }
  const flyGeo = new T.BufferGeometry();
  flyGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const flyMat = new T.PointsMaterial({ color: 0x67e8f9, size: 0.045, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
  const flies = new T.Points(flyGeo, flyMat);
  root.add(flies);

  /* ---------- 摄影棚灯（r15x 物理光照单位） ---------- */
  const hemi = new T.HemisphereLight(0xc4b5fd, 0x14081f, isLight() ? 2.4 : 1.4);
  const key = new T.DirectionalLight(0xffffff, 3.6); key.position.set(3, 5, 4);
  const soft = new T.DirectionalLight(0xc4b5fd, 1.8); soft.position.set(-2.5, 2, 5);
  const rim = new T.PointLight(0xe879f9, 60, 24); rim.position.set(-3, 1.5, -3);
  const fill = new T.PointLight(0x67e8f9, 10, 18); fill.position.set(2.4, -1.5, 2.6);
  const coreLight = new T.PointLight(0xc084fc, 8, 6); coreLight.position.set(0, 1.32, 0);
  scene.add(hemi, key, soft, rim, fill);

  function applyTheme() {
    hemi.intensity = isLight() ? 2.4 : 1.4;
    hemi.color.set(isLight() ? 0xffffff : 0xc4b5fd);
    petalMat.opacity = isLight() ? 0.85 : 0.92;
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- 尺寸 ---------- */
  const section = document.getElementById('bloom3dSec');
  function fit() {
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduced) render();
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(host);
  fit();

  /* ---------- 交互：视差 + 拖拽甩动 ---------- */
  const pointer = { x: 0, y: 0 };
  let dragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0;
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    if (dragging) {
      velX += (e.clientX - lastX) * 0.00042;
      velY += (e.clientY - lastY) * 0.00028;
      lastX = e.clientX; lastY = e.clientY;
    }
  }, { passive: true });
  host.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    host.setPointerCapture && host.setPointerCapture(e.pointerId);
    host.style.cursor = 'grabbing';
  });
  addEventListener('pointerup', () => { dragging = false; host.style.cursor = ''; }, { passive: true });

  /* ---------- 渲染循环：离屏/后台暂停 ---------- */
  let running = false, inView = false, raf = 0, t0 = performance.now();
  const tilt = { x: 0, y: 0 };
  function render() {
    renderer.render(scene, camera);
  }
  function loop(now) {
    if (!running) return;
    const t = (now - t0) * 0.001;
    // 惯性
    flower.rotation.y += velX;
    flower.rotation.x = Math.max(-0.6, Math.min(0.6, flower.rotation.x + velY));
    velX *= dragging ? 0.9 : 0.955;
    velY *= dragging ? 0.9 : 0.955;
    if (!dragging) flower.rotation.y += 0.0016; // 怠速
    // 视差（lerp，官方 quickTo 思路的复用式写法）
    tilt.x += (pointer.y * 0.12 - tilt.x) * 0.05;
    tilt.y += (pointer.x * 0.18 - tilt.y) * 0.05;
    root.rotation.x = tilt.x;
    root.rotation.y = tilt.y;
    // 呼吸
    const s = 1 + Math.sin(t * 1.3) * 0.012;
    root.scale.set(s, s, s);
    core.rotation.y = t * 0.6;
    coreLight.intensity = 7 + Math.sin(t * 2.1) * 2.2;
    flies.rotation.y = t * 0.045;
    render();
    raf = requestAnimationFrame(loop);
  }
  function setRun(on) {
    const want = on && inView && !document.hidden;
    if (want === running) return;
    running = want;
    if (running) { t0 = performance.now(); raf = requestAnimationFrame(loop); }
    else cancelAnimationFrame(raf);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { inView = en[0].isIntersecting; setRun(true); }, { rootMargin: '120px' }).observe(section || host);
  } else inView = true;
  document.addEventListener('visibilitychange', () => setRun(true));

  /* ---------- ScrollTrigger 入场（transform/opacity only） ---------- */
  if (window.gsap && window.ScrollTrigger && !reduced) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.fromTo(section, { opacity: 0, y: 60 }, {
      opacity: 1, y: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: section, start: 'top 72%', once: true },
    });
    gsap.from(flower.scale, {
      x: 0.001, y: 0.001, z: 0.001, duration: 1.4, ease: 'elastic.out(1,0.6)', delay: 0.15,
      scrollTrigger: { trigger: section, start: 'top 72%', once: true },
    });
    gsap.to(flower.rotation, {
      y: Math.PI * 2, ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1 },
    });
  }

  if (reduced) { render(); } else { setRun(true); }
  window.__vnBloom = { renderer: () => renderer, running: () => running, scene, flower, root };
})();
