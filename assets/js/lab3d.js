/* =========================================================
   F8K® — 实验室 3D（借鉴 ciaoenergy.com 的金属罐 WebGL 质感）
   MeshPhysicalMaterial：metalness/roughness/sheen/clearcoat，
   明亮影棚三点布光（键光 + 薄荷轮廓 + 暖阳补光）；
   交互：按住拖动旋转（带惯性滑行，学 jiejoe.com 的"甩"手感），
   悬停视差倾斜，离屏/后台暂停，30fps 隔帧渲染省一半 GPU。
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('labCanvas');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  document.addEventListener('f8k-idle', () => {
    // 与 hero3d.js 共享同一次 three.js 加载（避免双实例）
    window.__f8kThree = window.__f8kThree || loadScript('assets/vendor/three.min.js');
    window.__f8kThree.then(init).catch(() => { /* 静默放弃 3D */ });
  }, { once: true });

  function init() {
    if (!window.THREE) return;
    const T = window.THREE;
    try {
      const doc = document.documentElement;
      const readVars = () => {
        const s = getComputedStyle(doc);
        const hex = (v, fb) => { const t = s.getPropertyValue(v).trim(); return t.startsWith('#') ? parseInt(t.slice(1), 16) : fb; };
        return {
          accent: hex('--accent', 0x2c43f5),
          mint: hex('--accent-mint', 0x12b77e),
          sun: hex('--accent-sun', 0xf2a93b)
        };
      };
      let V = readVars();

      const renderer = new T.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = T.SRGBColorSpace;

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(40, 1, 0.1, 60);
      camera.position.set(0, 0.35, 6.6);
      camera.lookAt(0, 0, 0);

      /* ---------- 明亮影棚布光 ---------- */
      scene.add(new T.AmbientLight(0xffffff, 0.85));
      const key = new T.DirectionalLight(0xffffff, 2.4);
      key.position.set(5, 6, 4);
      scene.add(key);
      const rim = new T.DirectionalLight(V.mint, 1.7);
      rim.position.set(-4, 2, -3);
      scene.add(rim);
      const fill = new T.DirectionalLight(V.sun, 1.2);
      fill.position.set(0, -3, 2);
      scene.add(fill);

      /* ---------- 金属罐（ciao 罐体思路：主体 + 顶底环 + 标签带） ---------- */
      const root = new T.Group();
      const can = new T.Group();

      const metal = (c, extra) => new T.MeshPhysicalMaterial(Object.assign({
        color: c,
        metalness: 0.92,
        roughness: 0.28,
        sheen: 0.6,
        sheenColor: 0xffffff,
        sheenRoughness: 0.35,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        reflectivity: 1
      }, extra || {}));

      const bodyMat = metal(V.accent);
      can.add(new T.Mesh(new T.CylinderGeometry(1, 1, 2.5, 48), bodyMat));
      const bandMat = metal(V.mint, { sheen: 0.2, clearcoat: 0.3, emissive: V.mint, emissiveIntensity: 0.12 });
      can.add(new T.Mesh(new T.CylinderGeometry(1.045, 1.045, 1.05, 48), bandMat));
      const rimGeo = new T.TorusGeometry(1, 0.055, 12, 48);
      const rimMat = metal(V.sun, { roughness: 0.18, sheen: 0.9 });
      const rimTop = new T.Mesh(rimGeo, rimMat);
      rimTop.position.y = 1.25;
      const rimBottom = rimTop.clone();
      rimBottom.position.y = -1.25;
      can.add(rimTop, rimBottom);

      root.add(can);

      /* ---------- 轨道环 + 三颗卫星（呼应站点三色） ---------- */
      const ringMat = metal(V.sun, { roughness: 0.15, sheen: 0.9, clearcoat: 0.8 });
      const ring = new T.Mesh(new T.TorusGeometry(1.75, 0.045, 10, 64), ringMat);
      ring.rotation.x = Math.PI / 2.6;
      root.add(ring);

      const satColors = [V.mint, V.sun, 0xffffff];
      const sats = [];
      const satGeo = new T.SphereGeometry(0.11, 20, 14);
      for (let i = 0; i < 3; i++) {
        const m = new T.Mesh(satGeo, metal(satColors[i], { roughness: 0.2 }));
        const holder = new T.Group();
        m.position.x = 2.15;
        holder.rotation.y = (i / 3) * Math.PI * 2;
        holder.add(m);
        root.add(holder);
        sats.push(holder);
      }

      scene.add(root);

      document.addEventListener('f8k-theme', () => {
        V = readVars();
        bodyMat.color.setHex(V.accent);
        bandMat.color.setHex(V.mint);
        bandMat.emissive.setHex(V.mint);
        rimMat.color.setHex(V.sun);
        ringMat.color.setHex(V.sun);
        rim.color.setHex(V.mint);
        fill.color.setHex(V.sun);
        sats.forEach((h, i) => { h.children[0].material.color.setHex(satColors[i]); });
        satColors[1] = V.sun; satColors[0] = V.mint;
      });

      /* ---------- 交互：拖拽旋转（惯性）+ 悬停视差 ---------- */
      let vel = 0, dragging = false, lastX = 0, tx = 0, ty = 0;
      canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        lastX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (dragging) {
          vel += (e.clientX - lastX) * 0.0055;
          vel = Math.max(-0.5, Math.min(0.5, vel));
          lastX = e.clientX;
        } else {
          const r = canvas.getBoundingClientRect();
          tx = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
          ty = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
        }
      });
      const endDrag = () => { dragging = false; };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

      /* ---------- 循环：离屏/后台暂停 + 隔帧 30fps ---------- */
      let running = false, inView = false, rafId = 0, frame = 0, rendered = false;
      const tick = (t) => {
        if (!running) return;
        const idle = 0.005;
        if (dragging) {
          root.rotation.y += vel;
          vel *= 0.94;
        } else {
          vel += (idle - vel) * 0.02;
          root.rotation.y += vel;
        }
        const s = 1 + Math.sin(t * 0.0016) * 0.03;
        root.scale.setScalar(s);
        root.position.y = Math.sin(t * 0.0011) * 0.14;
        ring.rotation.z += 0.0035;
        sats.forEach((h) => { h.rotation.y += 0.004 + (h === sats[2] ? 0.002 : 0); });
        root.rotation.x += (ty * 0.6 - root.rotation.x) * 0.05;
        root.rotation.z += (tx * 0.3 - root.rotation.z) * 0.05;
        if ((frame++ & 1) === 0) {
          renderer.render(scene, camera);
          if (!rendered) { rendered = true; canvas.classList.add('is-on'); }
        }
        rafId = requestAnimationFrame(tick);
      };
      const setRunning = (on) => {
        const want = on && inView && !document.hidden;
        if (want === running) return;
        running = want;
        if (running) rafId = requestAnimationFrame(tick);
        else cancelAnimationFrame(rafId);
      };

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        running = false;
        cancelAnimationFrame(rafId);
        canvas.classList.remove('is-on');
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        resize();
        frame = 0;
        setRunning(true);
      }, false);

      const resize = () => {
        const w = canvas.clientWidth || 300;
        const h = canvas.clientHeight || 300;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', () => {
        clearTimeout(resize.t);
        resize.t = setTimeout(resize, 200);
      });

      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        setRunning(true);
      }, { rootMargin: '120px' }).observe(canvas);
      document.addEventListener('visibilitychange', () => setRunning(true));

      window.__f8kLab = true; // 调试验证标记
    } catch (e) { /* WebGL 不可用则静默跳过 */ }
  }
})();
